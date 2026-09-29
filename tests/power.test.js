'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPower, describe } = require('../tv-service/lib/power');
const { fakeLuna } = require('./helpers');

test('describe classifies retryable vs denied', () => {
  assert.equal(describe('m', { returnValue: false, errorText: 'Denied method call "x" for category "/"' }).retryable, false);
  assert.equal(describe('m', null, new Error('timeout calling x')).retryable, true);
  assert.equal(describe('m', null, new Error('ECONNREFUSED')).retryable, true);
  assert.equal(describe('m', { returnValue: true }).ok, true);
});

test('runChain stops at first success', async () => {
  const luna = fakeLuna({ '/power/turnOff': { returnValue: true } });
  const p = createPower({ luna, ssap: { turnOff: async () => { throw new Error('unused'); } } });
  const r = await p.runChain();
  assert.equal(r.ok, true);
  assert.equal(r.results.length, 1);
  assert.equal(r.results[0].method, 'lunaTvpowerTurnOff');
});

test('runChain falls through denials to the next method', async () => {
  const luna = fakeLuna({
    '/power/turnOff': { returnValue: false, errorText: 'Denied method call' },
    '/shutdown/machineOff': { returnValue: false, errorText: 'Denied method call' }
  });
  const p = createPower({ luna, ssap: { turnOff: async () => ({ returnValue: true }) } });
  const r = await p.runChain();
  assert.equal(r.ok, true);
  assert.deepEqual(r.results.map((x) => x.method), ['lunaTvpowerTurnOff', 'lunaMachineOff', 'localSsapTurnOff']);
});
