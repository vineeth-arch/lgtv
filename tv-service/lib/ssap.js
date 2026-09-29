'use strict';
// Minimal SSAP client that talks to the TV's own secure socket (wss :3001) from inside the service.
// TLS verification is disabled ONLY for 127.0.0.1 and the TV's own LAN IP (self-signed TV cert).
const os = require('os');

// Unsigned manifest: a signed one is rejected by current firmware (403 blacklisted certificate).
const MANIFEST = {
  manifestVersion: 1,
  appVersion: '1.1',
  permissions: ['LAUNCH', 'CONTROL_POWER', 'READ_RUNNING_APPS', 'READ_APP_STATUS', 'READ_POWER_STATE', 'WRITE_NOTIFICATION_TOAST']
};
const KEY_FILE = 'client-key.json';

function ownIp(interfaces) {
  const all = (interfaces || os.networkInterfaces)();
  for (const name of Object.keys(all)) {
    for (const a of all[name]) {
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  return null;
}

function createSsap(deps) {
  const WebSocket = deps.WebSocket;
  const state = deps.state;
  const timeoutMs = deps.timeoutMs || 10000;
  const pairTimeoutMs = deps.pairTimeoutMs || 60000;
  const port = deps.port || 3001;

  function hosts() {
    const list = ['127.0.0.1'];
    const ip = deps.ownIp !== undefined ? deps.ownIp : ownIp();
    if (ip) list.push(ip);
    return list;
  }

  // Resolves { ws, registered } once the TV answers our register message.
  function open(host, waitMs) {
    return new Promise((resolve, reject) => {
      if (hosts().indexOf(host) === -1) return reject(new Error('refusing to connect to ' + host));
      const saved = state.read(KEY_FILE);
      const ws = new WebSocket('wss://' + host + ':' + port, { rejectUnauthorized: false });
      let settled = false;
      const timer = setTimeout(() => finish(new Error('timeout waiting for ' + host)), waitMs); // connection timeout, not the sleep timer
      function finish(err, value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) { try { ws.close(); } catch (e) { /* ignore */ } reject(err); } else resolve(value);
      }
      ws.on('error', (e) => finish(e));
      ws.on('close', () => finish(new Error('socket closed')));
      ws.on('open', () => {
        const payload = { forcePairing: false, pairingType: 'PROMPT', manifest: MANIFEST };
        if (saved && saved.clientKey) payload['client-key'] = saved.clientKey;
        ws.send(JSON.stringify({ type: 'register', id: 'register_0', payload: payload }));
      });
      ws.on('message', (data) => {
        let m;
        try { m = JSON.parse(String(data)); } catch (e) { return; }
        if (m.type === 'registered') {
          const key = m.payload && m.payload['client-key'];
          if (key) state.write(KEY_FILE, { clientKey: key });
          finish(null, { ws: ws, key: key || null });
        } else if (m.type === 'error') {
          finish(new Error('register error: ' + (m.error || 'unknown')));
        }
      });
    });
  }

  function connect(waitMs) {
    const list = hosts();
    return list.reduce((p, host) => p.catch(() => open(host, waitMs)), Promise.reject(new Error('start')));
  }

  function request(ws, uri, payload) {
    return new Promise((resolve, reject) => {
      const id = 'req_' + uri;
      const timer = setTimeout(() => { cleanup(); reject(new Error('timeout waiting for ' + uri)); }, timeoutMs);
      function onMsg(data) {
        let m;
        try { m = JSON.parse(String(data)); } catch (e) { return; }
        if (m.id !== id) return;
        cleanup();
        if (m.type === 'error') reject(new Error(m.error || 'ssap error'));
        else resolve(m.payload || { returnValue: true });
      }
      function cleanup() { clearTimeout(timer); ws.removeListener('message', onMsg); }
      ws.on('message', onMsg);
      ws.send(JSON.stringify({ type: 'request', id: id, uri: uri, payload: payload || {} }));
    });
  }

  function turnOff() {
    return connect(timeoutMs).then((c) => request(c.ws, 'ssap://system/turnOff').then(
      (r) => { c.ws.close(); return r; },
      (e) => { c.ws.close(); throw e; }));
  }

  // Shows the pairing prompt on the TV; the user must accept it with the remote.
  function pair() {
    return connect(pairTimeoutMs).then((c) => {
      c.ws.close();
      return { returnValue: true, paired: !!c.key };
    });
  }

  // Connection test only (no register side effects beyond pairing with a saved key).
  function probe() {
    return connect(timeoutMs).then((c) => { c.ws.close(); return { returnValue: true, keyPresent: !!c.key }; });
  }

  return { turnOff, pair, probe, hosts, MANIFEST };
}

module.exports = { createSsap, ownIp, MANIFEST };
