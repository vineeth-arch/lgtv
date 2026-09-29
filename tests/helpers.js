'use strict';
// Shared fakes: an in-memory state store and a scripted luna bus.
const { createHandlers } = require('../tv-service/lib/handlers');
const { createPower } = require('../tv-service/lib/power');

function memState() {
  const files = {};
  return {
    files,
    dir: () => '/mem',
    read: (n) => (n in files ? JSON.parse(JSON.stringify(files[n])) : null),
    write: (n, o) => { files[n] = JSON.parse(JSON.stringify(o)); },
    remove: (n) => { delete files[n]; },
    probeAll: () => [{ dir: '/mem', writable: true, marker: null }]
  };
}

// replies: { uriSuffix: payload | function(params) -> payload | Error }
function fakeLuna(replies) {
  const calls = [];
  async function luna(uri, params) {
    calls.push({ uri, params });
    for (const key of Object.keys(replies)) {
      if (uri.endsWith(key)) {
        let r = replies[key];
        if (typeof r === 'function') r = r(params, calls.filter((c) => c.uri === uri).length);
        if (r instanceof Error) throw r;
        return r;
      }
    }
    return { returnValue: true };
  }
  luna.calls = calls;
  luna.count = (suffix) => calls.filter((c) => c.uri.endsWith(suffix)).length;
  return luna;
}

function build(replies, opts) {
  opts = opts || {};
  const state = opts.state || memState();
  const luna = fakeLuna(replies || {});
  const ssap = opts.ssap || { turnOff: async () => { throw new Error('ECONNREFUSED'); }, pair: async () => ({ returnValue: true }), probe: async () => ({ returnValue: true }), hosts: () => ['127.0.0.1'] };
  const power = opts.power || createPower({ luna, ssap });
  const clock = { t: opts.now === undefined ? Date.UTC(2026, 0, 1, 12, 0, 0) : opts.now };
  const sleeps = [];
  const handlers = createHandlers({
    luna, state, ssap, power,
    powerOrder: opts.powerOrder,
    now: () => clock.t,
    sleep: async (ms) => { sleeps.push(ms); }
  });
  return { handlers, state, luna, clock, sleeps, ssap };
}

module.exports = { memState, fakeLuna, build };
