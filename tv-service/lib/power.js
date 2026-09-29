'use strict';
// Power-off methods. Each returns { method, ok, retryable, errorCode, errorText, raw }.

const RETRYABLE = /timeout|timed out|econn|ehostunreach|etimedout|enotfound|epipe|socket|closed|unavailable/i;

function describe(method, payload, err) {
  if (err) {
    const text = String(err && err.message ? err.message : err);
    return { method: method, ok: false, retryable: RETRYABLE.test(text), errorCode: err.code || null, errorText: text, raw: null };
  }
  const ok = !!(payload && payload.returnValue);
  const text = ok ? null : ((payload && payload.errorText) || 'unknown error');
  return {
    method: method,
    ok: ok,
    retryable: ok ? false : RETRYABLE.test(text),
    errorCode: ok ? null : ((payload && payload.errorCode) || null),
    errorText: text,
    raw: payload || null
  };
}

function createPower(deps) {
  const luna = deps.luna;
  const ssap = deps.ssap;

  const methods = {
    lunaTvpowerTurnOff: () => luna('luna://com.webos.service.tvpower/power/turnOff', {})
      .then((p) => describe('lunaTvpowerTurnOff', p), (e) => describe('lunaTvpowerTurnOff', null, e)),
    lunaMachineOff: () => luna('luna://com.webos.service.sleep/shutdown/machineOff', { reason: 'offTimer' })
      .then((p) => describe('lunaMachineOff', p), (e) => describe('lunaMachineOff', null, e)),
    localSsapTurnOff: () => Promise.resolve().then(() => ssap.turnOff())
      .then((p) => describe('localSsapTurnOff', p), (e) => describe('localSsapTurnOff', null, e))
  };
  const DEFAULT_ORDER = ['lunaTvpowerTurnOff', 'lunaMachineOff', 'localSsapTurnOff'];

  // One pass over the chain: stops at the first success. Returns all method results.
  function runChain(order) {
    const results = [];
    return (order || DEFAULT_ORDER).reduce((chain, name) => chain.then((done) => {
      if (done) return true;
      return methods[name]().then((r) => { results.push(r); return r.ok; });
    }), Promise.resolve(false)).then((ok) => ({ ok: ok, results: results }));
  }

  return { methods, runChain, DEFAULT_ORDER, describe };
}

module.exports = { createPower, describe };
