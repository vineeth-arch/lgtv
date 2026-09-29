'use strict';
// All service behaviour. Every dependency is injected so tests can run without a TV.
// deps: luna(uri, params) -> Promise<payload>, state, ssap, power, now(), sleep(ms) -> Promise
const timer = require('./timer');

const STATE_FILE = 'state.json';
const LOG_FILE = 'log.json';
const LOG_MAX = 100;
const MAX_ATTEMPTS = 3;
const EARLY_TOLERANCE_MS = 30 * 1000;
const MODES = ['schedule', 'cancel', 'off', 'status'];

function createHandlers(deps) {
  const luna = deps.luna;
  const state = deps.state;
  const ssap = deps.ssap;
  const power = deps.power;
  const now = deps.now;
  const sleep = deps.sleep;
  // Keep history across service restarts (the service idle-exits between calls).
  let ring = [];
  try { const old = state.read(LOG_FILE); if (Array.isArray(old)) ring = old.slice(-LOG_MAX); } catch (e) { /* start empty */ }

  function log(event, data) {
    ring.push({ t: new Date(now()).toISOString(), event: event, data: data === undefined ? null : data });
    while (ring.length > LOG_MAX) ring.shift();
    try { state.write(LOG_FILE, ring); } catch (e) { /* logging must never break a timer */ }
  }

  function fail(text, extra) {
    return Object.assign({ returnValue: false, errorText: text }, extra || {});
  }

  function toast(message) {
    return luna('luna://com.webos.notification/createToast', { message: message }).catch(() => null);
  }

  function cancelActivity(name) {
    return luna('luna://com.palm.activitymanager/cancel', { activityName: name }).catch((e) => ({ returnValue: false, errorText: String(e) }));
  }

  function completeActivity(activityId) {
    if (!activityId) { log('complete-skipped', 'no activityId in callback'); return Promise.resolve(null); }
    return luna('luna://com.palm.activitymanager/complete', { activityId: activityId, restart: false })
      .catch((e) => ({ returnValue: false, errorText: String(e) }))
      .then((r) => { log('complete', r); return r; });
  }

  function schedule(p) {
    const v = timer.validateMinutes(p.minutes);
    if (!v.ok) return Promise.resolve(fail(v.errorText));
    const t = now();
    const sd = timer.buildShutdownActivity(v.minutes, t);
    const warn = timer.buildWarningActivity(v.minutes, t);
    return luna('luna://com.palm.activitymanager/create', { activity: sd.activity, start: true, replace: true, subscribe: false })
      .then((r) => {
        if (!r || !r.returnValue) {
          log('schedule-failed', r);
          return fail('activity create failed: ' + ((r && r.errorText) || 'unknown'), { activity: r || null });
        }
        // Replace semantics for the warning too: create it, or drop a stale one from an earlier longer timer.
        const warnStep = warn
          ? luna('luna://com.palm.activitymanager/create', { activity: warn.activity, start: true, replace: true, subscribe: false })
          : cancelActivity(timer.WARNING_ACTIVITY);
        return warnStep.then((wr) => {
          state.write(STATE_FILE, { minutes: v.minutes, createdAt: t, shutdownAt: sd.shutdownAt, warnAt: warn ? warn.warnAt : null });
          log('scheduled', { minutes: v.minutes, shutdownAt: sd.shutdownAt, warning: warn ? !!(wr && wr.returnValue) : 'none' });
          return toast('TV will turn off in ' + v.minutes + ' min').then(() => ({
            returnValue: true, minutes: v.minutes, shutdownAt: sd.shutdownAt, shutdownAtIso: new Date(sd.shutdownAt).toISOString()
          }));
        });
      }, (e) => fail('activity create error: ' + String(e && e.message ? e.message : e)));
  }

  function cancel() {
    return Promise.all([cancelActivity(timer.SHUTDOWN_ACTIVITY), cancelActivity(timer.WARNING_ACTIVITY)]).then((r) => {
      state.remove(STATE_FILE);
      log('cancelled', r);
      return { returnValue: true, cancelled: true };
    });
  }

  function status() {
    const s = state.read(STATE_FILE);
    const t = now();
    if (!s || typeof s.shutdownAt !== 'number') return Promise.resolve({ returnValue: true, scheduled: false });
    if (timer.isStale(t, s.shutdownAt)) return Promise.resolve({ returnValue: true, scheduled: false, stale: true, shutdownAt: s.shutdownAt });
    return Promise.resolve({
      returnValue: true, scheduled: true, minutes: s.minutes, shutdownAt: s.shutdownAt,
      shutdownAtIso: new Date(s.shutdownAt).toISOString(), remainingMs: Math.max(0, s.shutdownAt - t)
    });
  }

  // Bounded retry inside one invocation: MAX_ATTEMPTS passes over the power chain, 2 s / 4 s between them.
  function powerOffWithRetry() {
    const delays = timer.backoffDelays();
    const attempts = [];
    function attempt(n) {
      return power.runChain(deps.powerOrder).then((r) => {
        attempts.push(r.results);
        if (r.ok) return { ok: true, attempts: attempts };
        const retryable = r.results.some((x) => x.retryable);
        if (!retryable || n >= MAX_ATTEMPTS) return { ok: false, attempts: attempts };
        return sleep(delays[n - 1]).then(() => attempt(n + 1));
      });
    }
    return attempt(1);
  }

  function powerOff() {
    return powerOffWithRetry().then((r) => {
      log('power-off', { ok: r.ok, attempts: r.attempts.length, methods: [].concat.apply([], r.attempts).map((x) => ({ m: x.method, ok: x.ok, code: x.errorCode || null, text: x.errorText || null })) });
      return { returnValue: r.ok, attempts: r.attempts, errorText: r.ok ? undefined : 'all power-off methods failed' };
    });
  }

  function fire(p) {
    const activityId = p && p.$activity && p.$activity.activityId;
    const s = state.read(STATE_FILE);
    const shutdownAt = s && typeof s.shutdownAt === 'number' ? s.shutdownAt : (p && p.shutdownAt);
    let outcome;
    if (typeof shutdownAt === 'number' && now() < shutdownAt - EARLY_TOLERANCE_MS) {
      // Someone called fire directly before the deadline: ignore it and keep the real timer.
      log('early-fire-ignored', { shutdownAt: shutdownAt });
      return completeActivity(activityId).then(() => ({ returnValue: true, skipped: 'early' }));
    }
    if (timer.isStale(now(), shutdownAt)) {
      log('stale', { shutdownAt: shutdownAt === undefined ? null : shutdownAt });
      outcome = Promise.resolve({ returnValue: true, skipped: 'stale' });
    } else {
      outcome = powerOff();
    }
    // complete() must happen whether power-off worked, failed, or threw.
    return outcome.catch((e) => fail('fire error: ' + String(e && e.message ? e.message : e)))
      .then((res) => {
        state.remove(STATE_FILE);
        return cancelActivity(timer.WARNING_ACTIVITY).then(() => completeActivity(activityId)).then(() => res);
      });
  }

  function warn(p) {
    const activityId = p && p.$activity && p.$activity.activityId;
    const s = state.read(STATE_FILE);
    const live = s && !timer.isStale(now(), s.shutdownAt) && now() < s.shutdownAt;
    log('warn', { live: !!live });
    return (live ? toast('V/TV: TV turns off in 5 minutes') : Promise.resolve(null))
      .then(() => completeActivity(activityId))
      .then(() => ({ returnValue: true, warned: !!live }));
  }

  function probe(name, fn) {
    return Promise.resolve().then(fn).then(
      (raw) => ({ probe: name, ok: !!(raw && raw.returnValue), errorCode: (raw && raw.errorCode) || null, errorText: (raw && raw.errorText) || null, raw: raw }),
      (e) => ({ probe: name, ok: false, errorCode: e && e.code || null, errorText: String(e && e.message ? e.message : e), raw: null }));
  }

  // Side-effect-free probes only: never calls a power-off method.
  function capabilityTest() {
    const t = now();
    const dummy = timer.buildShutdownActivity(1440, t).activity;
    dummy.name = 'com.designinnsaeit.vtvsleep.probe';
    dummy.callback.method = 'luna://' + timer.SERVICE_ID + '/status';
    const probes = [
      probe('activitymanager.create', () => luna('luna://com.palm.activitymanager/create', { activity: dummy, start: true, replace: true, subscribe: false })),
      probe('activitymanager.cancel', () => cancelActivity(dummy.name)),
      probe('notification.createToast', () => luna('luna://com.webos.notification/createToast', { message: 'V/TV capability probe' })),
      probe('tvpower.getPowerState', () => luna('luna://com.webos.service.tvpower/power/getPowerState', {})),
      probe('systemproperty.getSystemInfo', () => luna('luna://com.webos.service.tv.systemproperty/getSystemInfo', { keys: ['modelName', 'firmwareVersion', 'sdkVersion'] })),
      probe('state.dir', () => ({ returnValue: true, dir: state.dir() })),
      probe('ssap.connect', () => ssap.probe())
    ];
    return Promise.all(probes).then((results) => {
      log('capabilityTest', results.map((r) => r.probe + ':' + r.ok + (r.ok ? '' : ':' + r.errorCode + ':' + r.errorText)));
      return { returnValue: true, at: new Date(t).toISOString(), node: process.version, results: results };
    });
  }

  function pairLocal() {
    return ssap.pair().then(
      (r) => { log('pairLocal', r); return r; },
      (e) => { log('pairLocal-failed', String(e)); return fail('pairing failed: ' + String(e && e.message ? e.message : e)); });
  }

  function diagnostics() {
    let dirs = null;
    let dir = null;
    try { dir = state.dir(); dirs = state.probeAll(now()); } catch (e) { dirs = String(e); }
    return Promise.resolve({
      returnValue: true, now: new Date(now()).toISOString(), node: process.version, stateDir: dir,
      stateDirs: dirs, pending: state.read(STATE_FILE), ssapHosts: ssap.hosts(), log: ring.slice()
    });
  }

  // Launch parameters come from any paired LAN client: accept only the known shapes.
  function handleLaunch(p) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return Promise.resolve(fail('launch params must be an object'));
    if (MODES.indexOf(p.mode) === -1) return Promise.resolve(fail('unknown mode'));
    if (p.mode === 'schedule') return schedule({ minutes: p.minutes });
    if (p.mode === 'cancel') return cancel();
    if (p.mode === 'off') return powerOff();
    return status();
  }

  return { schedule, cancel, status, fire, warn, powerOff, diagnostics, capabilityTest, pairLocal, handleLaunch };
}

module.exports = { createHandlers, STATE_FILE, MAX_ATTEMPTS, MODES };
