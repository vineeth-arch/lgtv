'use strict';
// Calls Luna services through the built-in PalmServiceBridge (no webOSTV.js needed).
// call(uri, params, cb): cb receives the parsed response object, or {returnValue:false, errorText}.
(function () {
  function call(uri, params, cb) {
    if (typeof window.PalmServiceBridge === 'undefined') {
      cb({ returnValue: false, errorText: 'PalmServiceBridge unavailable (not running on a webOS TV)' });
      return;
    }
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
  window.VTVBridge = { call: call };
})();
