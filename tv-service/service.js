'use strict';
// Thin wiring. `webos-service` is provided by the TV runtime (not bundled); tests inject a fake for it.
const os = require('os');
const path = require('path');
const Service = require('webos-service');
const WebSocket = require('ws');
const timer = require('./lib/timer');
const { createState } = require('./lib/state');
const { createSsap } = require('./lib/ssap');
const { createPower } = require('./lib/power');
const { createHandlers } = require('./lib/handlers');

const service = new Service(timer.SERVICE_ID);
// Keep the service alive long enough for the bounded power-off retries (about 14 s).
if (service.activityManager) service.activityManager.idleTimeout = 30;

const LUNA_TIMEOUT_MS = 5000;

function luna(uri, params) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout calling ' + uri)), LUNA_TIMEOUT_MS); // RPC timeout only
    service.call(uri, params, (m) => { clearTimeout(t); resolve(m.payload); });
  });
}

const state = createState({
  dirs: [path.join(__dirname, 'data'), path.join(os.homedir(), '.vtvsleep'), '/media/developer/temp/vtvsleep', '/tmp/vtvsleep']
});
const ssap = createSsap({ WebSocket: WebSocket, state: state });
const power = createPower({ luna: luna, ssap: ssap });
const handlers = createHandlers({
  luna: luna, state: state, ssap: ssap, power: power,
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)) // short retry pause only; the timer itself is an Activity
});

// Responses must be JSON-safe: a raw Error/socket inside a result would make respond() throw and the caller hangs.
function safe(r) {
  try {
    return JSON.parse(JSON.stringify(r, (k, v) => (v instanceof Error ? { message: v.message, code: v.code } : v)));
  } catch (e) {
    return { returnValue: false, errorText: 'unserializable response: ' + String(e && e.message ? e.message : e) };
  }
}

['schedule', 'cancel', 'status', 'fire', 'warn', 'powerOff', 'diagnostics', 'capabilityTest', 'pairLocal'].forEach((name) => {
  service.register(name, (msg) => {
    handlers[name](msg.payload || {}).then(
      (r) => msg.respond(safe(r)),
      (e) => msg.respond({ returnValue: false, errorText: String(e && e.message ? e.message : e) }));
  });
});

// handleLaunch is reached from the TV app (bridge) with the app's launch params in `params`.
service.register('handleLaunch', (msg) => {
  handlers.handleLaunch((msg.payload || {}).params).then(
    (r) => msg.respond(safe(r)),
    (e) => msg.respond({ returnValue: false, errorText: String(e && e.message ? e.message : e) }));
});
