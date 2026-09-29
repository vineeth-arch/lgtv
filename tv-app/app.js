'use strict';
(function () {
  var SVC = 'luna://com.designinnsaeit.vtvsleep.service/';
  var AM = 'luna://com.palm.activitymanager/';
  var out = document.getElementById('out');
  var confirmEl = document.getElementById('confirm');

  function show(title, obj) {
    out.textContent = new Date().toISOString() + '  ' + title + '\n' + JSON.stringify(obj, null, 2);
  }

  function callService(title, method, params) {
    out.textContent = title + ' ...';
    window.VTVBridge.call(SVC + method, params || {}, function (r) { show(title, r); });
  }

  // Same probes the service runs, but issued from the app's own permissions (failure point 16).
  function appActivityProbe() {
    var name = 'com.designinnsaeit.vtvsleep.appprobe';
    var start = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ') + 'Z';
    var spec = {
      name: name, description: 'app-side probe', type: { background: true, persist: true, explicit: true },
      schedule: { start: start }, callback: { method: SVC + 'status', params: {} }
    };
    var result = { fromApp: {}, fromService: null };
    out.textContent = 'TEST ACTIVITY MANAGER ...';
    window.VTVBridge.call(AM + 'create', { activity: spec, start: true, replace: true, subscribe: false }, function (c) {
      result.fromApp.create = c;
      window.VTVBridge.call(AM + 'cancel', { activityName: name }, function (x) {
        result.fromApp.cancel = x;
        window.VTVBridge.call(SVC + 'capabilityTest', {}, function (s) {
          result.fromService = s;
          show('TEST ACTIVITY MANAGER', result);
        });
      });
    });
  }

  function onClick(id, fn) {
    document.getElementById(id).addEventListener('click', fn);
  }
  onClick('b-test2', function () { callService('TEST 2 MIN', 'schedule', { minutes: 2 }); });
  onClick('b-poweroff', function () { callService('TEST POWER OFF', 'powerOff'); });
  onClick('b-am', appActivityProbe);
  onClick('b-pair', function () { callService('PAIR LOCAL (accept the prompt on the TV)', 'pairLocal'); });
  onClick('b-diag', function () { callService('DIAGNOSTICS', 'diagnostics'); });

  // Launch parameters: the service validates everything; the app only forwards them.
  var lastLaunch = { key: '', at: 0 };
  function handleLaunchParams(params) {
    if (!params || typeof params !== 'object' || !params.mode) return;
    var key = JSON.stringify(params);
    var now = Date.now();
    if (key === lastLaunch.key && now - lastLaunch.at < 3000) return; // webOSLaunch + PalmSystem can both report it
    lastLaunch = { key: key, at: now };
    window.VTVBridge.call(SVC + 'handleLaunch', { params: params }, function (r) {
      show('LAUNCH ' + key, r);
      if (r && r.returnValue && params.mode === 'schedule') {
        confirmEl.textContent = 'TV OFF IN ' + params.minutes + ' MIN';
        confirmEl.className = 'show';
      }
    });
  }
  function parseLaunch(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') { try { return JSON.parse(raw); } catch (e) { return null; } }
    return raw;
  }
  document.addEventListener('webOSLaunch', function (e) { handleLaunchParams(parseLaunch(e.detail)); });
  document.addEventListener('webOSRelaunch', function (e) { handleLaunchParams(parseLaunch(e.detail)); });
  if (window.PalmSystem && window.PalmSystem.launchParams) {
    handleLaunchParams(parseLaunch(window.PalmSystem.launchParams));
  }

  // Back (461) dismisses the confirmation overlay; otherwise leave it to the system.
  document.addEventListener('keydown', function (e) {
    if (e.keyCode === 461 && confirmEl.className === 'show') {
      confirmEl.className = '';
      e.preventDefault();
    }
  });
  var first = document.getElementById('b-test2');
  if (first) first.focus();
})();
