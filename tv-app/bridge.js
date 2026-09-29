'use strict';
// Calls Luna services through the built-in PalmServiceBridge (no webOSTV.js needed).
// call(uri, params, cb): cb receives the parsed response object, or {returnValue:false, errorText}.
// Outside a webOS TV (desktop browser) an in-memory stub answers instead, so the UI can be developed offline.
(function () {
  var SVC = 'luna://com.designinnsaeit.vtvsleep.service/';
  var hasBridge = typeof window.PalmServiceBridge !== 'undefined';

  function callReal(uri, params, cb) {
    var done = false;
    var bridge = new window.PalmServiceBridge();
    bridge.onservicecallback = function (msg) {
      if (done) return;
      done = true;
      var parsed;
      try { parsed = JSON.parse(msg); } catch (e) { parsed = { returnValue: false, errorText: 'bad response: ' + msg }; }
      cb(parsed);
    };
    try {
      bridge.call(uri, JSON.stringify(params || {}));
    } catch (e) {
      done = true;
      cb({ returnValue: false, errorText: 'call threw: ' + e });
    }
  }

  // Stub: same response shapes as tv-service/lib/handlers.js.
  var pending = null; // { minutes, shutdownAt }
  var stubLog = [];
  function note(event, data) { stubLog.push({ t: new Date().toISOString(), event: event, data: data === undefined ? null : data }); }

  function stubHandle(method, p) {
    var now = Date.now();
    if (method === 'status') {
      if (!pending) return { returnValue: true, scheduled: false };
      return { returnValue: true, scheduled: true, minutes: pending.minutes, shutdownAt: pending.shutdownAt,
        shutdownAtIso: new Date(pending.shutdownAt).toISOString(), remainingMs: Math.max(0, pending.shutdownAt - now) };
    }
    if (method === 'schedule') {
      var m = p && p.minutes;
      if (typeof m !== 'number' || m % 1 !== 0 || m < 1 || m > 720) return { returnValue: false, errorText: 'minutes must be an integer from 1 to 720' };
      pending = { minutes: m, shutdownAt: now + m * 60000 };
      note('scheduled', pending);
      return { returnValue: true, minutes: m, shutdownAt: pending.shutdownAt, shutdownAtIso: new Date(pending.shutdownAt).toISOString() };
    }
    if (method === 'cancel') { pending = null; note('cancelled'); return { returnValue: true, cancelled: true }; }
    if (method === 'handleLaunch') {
      var lp = p && p.params;
      if (!lp || typeof lp !== 'object') return { returnValue: false, errorText: 'launch params must be an object' };
      if (['schedule', 'cancel', 'off', 'status'].indexOf(lp.mode) === -1) return { returnValue: false, errorText: 'unknown mode' };
      if (lp.mode === 'off') return stubHandle('powerOff');
      return stubHandle(lp.mode === 'schedule' ? 'schedule' : lp.mode, { minutes: lp.minutes });
    }
    if (method === 'powerOff') { note('power-off', 'stub: nothing was switched off'); return { returnValue: true, attempts: [[{ method: 'stub', ok: true }]] }; }
    if (method === 'pairLocal') return { returnValue: true, paired: true, note: 'stub' };
    if (method === 'capabilityTest') {
      return { returnValue: true, at: new Date(now).toISOString(), node: 'stub', results: [
        { probe: 'activitymanager.create', ok: true }, { probe: 'activitymanager.cancel', ok: true },
        { probe: 'notification.createToast', ok: true }, { probe: 'ssap.connect', ok: true } ] };
    }
    if (method === 'diagnostics') {
      return { returnValue: true, now: new Date(now).toISOString(), node: 'stub', stateDir: '(memory)', pending: pending, log: stubLog.slice() };
    }
    return { returnValue: false, errorText: 'stub: unknown method ' + method };
  }

  function callStub(uri, params, cb) {
    var out;
    if (uri.indexOf(SVC) === 0) out = stubHandle(uri.slice(SVC.length), params);
    else out = { returnValue: true, stub: true };
    setTimeout(function () { cb(JSON.parse(JSON.stringify(out))); }, 30);
  }

  window.VTVBridge = { call: hasBridge ? callReal : callStub, isStub: !hasBridge };
})();
