'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { createSsap } = require('../tv-service/lib/ssap');
const { memState } = require('./helpers');

// Fake `ws`: answers register with a client-key and turnOff with returnValue true.
function fakeWs(log, opts) {
  return class FakeWs extends EventEmitter {
    constructor(url, o) {
      super();
      log.urls.push(url);
      log.opts.push(o);
      setImmediate(() => (opts.failHosts && opts.failHosts.some((h) => url.includes(h)) ? this.emit('error', new Error('ECONNREFUSED')) : this.emit('open')));
    }
    send(s) {
      const m = JSON.parse(s);
      log.sent.push(m);
      if (m.type === 'register') setImmediate(() => this.emit('message', JSON.stringify({ type: 'registered', id: m.id, payload: { 'client-key': 'KEY123' } })));
      else setImmediate(() => this.emit('message', JSON.stringify({ type: 'response', id: m.id, payload: { returnValue: true } })));
    }
    close() { log.closed++; }
  };
}

test('turnOff registers with unsigned manifest, saves key, sends system/turnOff', async () => {
  const log = { urls: [], opts: [], sent: [], closed: 0 };
  const state = memState();
  const ssap = createSsap({ WebSocket: fakeWs(log, {}), state, ownIp: '192.168.1.50' });
  const r = await ssap.turnOff();
  assert.equal(r.returnValue, true);
  assert.equal(log.urls[0], 'wss://127.0.0.1:3001');
  assert.equal(log.opts[0].rejectUnauthorized, false);
  const reg = log.sent.find((m) => m.type === 'register');
  assert.ok(reg.payload.manifest.permissions.includes('CONTROL_POWER'));
  assert.equal(reg.payload.manifest.signed, undefined);
  assert.equal(state.read('client-key.json').clientKey, 'KEY123');
  assert.equal(log.sent.find((m) => m.type === 'request').uri, 'ssap://system/turnOff');
  assert.equal(log.closed, 1);
});

test('falls back to own LAN IP when 127.0.0.1 fails, and reuses saved key', async () => {
  const log = { urls: [], opts: [], sent: [], closed: 0 };
  const state = memState();
  state.write('client-key.json', { clientKey: 'OLD' });
  const ssap = createSsap({ WebSocket: fakeWs(log, { failHosts: ['127.0.0.1'] }), state, ownIp: '192.168.1.50' });
  await ssap.turnOff();
  assert.deepEqual(log.urls, ['wss://127.0.0.1:3001', 'wss://192.168.1.50:3001']);
  assert.equal(log.sent.find((m) => m.type === 'register').payload['client-key'], 'OLD');
});

test('never connects to hosts outside loopback / own IP', async () => {
  const log = { urls: [], opts: [], sent: [], closed: 0 };
  const ssap = createSsap({ WebSocket: fakeWs(log, {}), state: memState(), ownIp: null });
  assert.deepEqual(ssap.hosts(), ['127.0.0.1']);
});
