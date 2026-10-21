'use strict';
(function () {
  var SVC = 'luna://com.designinnsaeit.vtvsleep.service/';
  var AM = 'luna://com.palm.activitymanager/';
  var MIN_CUSTOM = 5, MAX_CUSTOM = 720, STEP = 5;
  // Apps that may ask to be reopened after a timer request. Launch params come from any paired LAN client, so this is a fixed list.
  var RETURN_IDS = ['com.designinnsaeit.vhome'], RETURN_MS = 1400;
  var POLL_MS = 30000, OVERLAY_MS = 4000, ENTRY_MS = 1500, DEV_TAPS = 5, DEV_WINDOW_MS = 3000;

  function $(id) { return document.getElementById(id); }
  var presets = $('presets'), customRow = $('custom'), customVal = $('custom-val');
  var stMain = $('st-main'), stSub = $('st-sub'), cancelBtn = $('b-cancel');
  var overlay = $('overlay'), dev = $('dev'), out = $('out');

  function call(method, params, cb) { window.VTVBridge.call(SVC + method, params || {}, cb); }

  // ---------- formatting ----------
  function clockTime(ms) { return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  function remainingText(ms) {
    if (ms < 60000) return '< 1 min';
    return Math.ceil(ms / 60000) + ' min';
  }

  // ---------- status ----------
  var hasTimer = false;
  function renderStatus(r) {
    if (r && r.returnValue && r.scheduled) {
      hasTimer = true;
      stMain.className = 'st-main';
      stMain.textContent = 'Off at ' + clockTime(r.shutdownAt);
      stSub.hidden = false;
      stSub.textContent = 'Remaining ' + remainingText(r.remainingMs);
    } else if (r && r.returnValue) {
      hasTimer = false;
      stMain.className = 'st-main none';
      stMain.textContent = 'No timer set';
      stSub.hidden = true;
    } else {
      hasTimer = false;
      stMain.className = 'st-main err';
      stMain.textContent = (r && r.errorText) || 'Timer service not answering';
      stSub.hidden = true;
    }
    cancelBtn.disabled = !hasTimer;
    ensureFocus();
  }
  function refresh() { call('status', {}, renderStatus); }

  var pollId = null;
  function startPolling() { if (pollId === null) pollId = setInterval(refresh, POLL_MS); }
  function stopPolling() { if (pollId !== null) { clearInterval(pollId); pollId = null; } }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stopPolling(); else { refresh(); startPolling(); }
  });

  // ---------- focus / navigation ----------
  function scopeEl() { return dev.hidden ? $('screen') : dev; }
  function focusables() {
    var list = scopeEl().querySelectorAll('[data-nav]');
    var res = [];
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el.disabled) continue;
      var p = el, hidden = false;
      while (p && p !== document.body) { if (p.hidden) { hidden = true; break; } p = p.parentNode; }
      if (!hidden) res.push(el);
    }
    return res;
  }
  function pos(el) { var s = el.getAttribute('data-nav').split(','); return { r: +s[0], c: +s[1] }; }
  function ensureFocus() {
    if (!overlay.hidden) return;
    var list = focusables();
    if (!list.length) return;
    if (list.indexOf(document.activeElement) === -1) list[0].focus();
  }
  function move(dx, dy) {
    var cur = document.activeElement;
    if (cur === out && dy) { out.scrollTop += dy * 240; return; }
    var list = focusables();
    if (list.indexOf(cur) === -1) { ensureFocus(); return; }
    var p = pos(cur), best = null, bestScore = 1e9;
    for (var i = 0; i < list.length; i++) {
      var q = pos(list[i]);
      var main = dx ? (q.c - p.c) * dx : (q.r - p.r) * dy;
      if (main <= 0) continue;
      var cross = dx ? Math.abs(q.r - p.r) : Math.abs(q.c - p.c);
      var score = main * 10 + cross;
      if (score < bestScore) { bestScore = score; best = list[i]; }
    }
    if (best) best.focus();
  }
  document.addEventListener('mouseover', function (e) {
    var el = e.target;
    while (el && el !== document.body && !(el.getAttribute && el.getAttribute('data-nav'))) el = el.parentNode;
    if (el && el.getAttribute && el.getAttribute('data-nav') && !el.disabled && focusables().indexOf(el) !== -1) el.focus();
  });

  // ---------- overlay ----------
  var overlayTimer = null;
  function showOverlay(kind, title, sub) {
    overlay.className = kind;
    $('ov-title').textContent = title;
    $('ov-sub').textContent = sub || '';
    overlay.hidden = false;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    clearTimeout(overlayTimer);
    overlayTimer = setTimeout(hideOverlay, OVERLAY_MS);
  }
  function hideOverlay() {
    clearTimeout(overlayTimer);
    if (overlay.hidden) return;
    overlay.hidden = true;
    ensureFocus();
  }

  // ---------- main actions ----------
  function schedule(minutes, done) {
    call('schedule', { minutes: minutes }, function (r) {
      if (!r || !r.returnValue) renderStatus(r); else refresh();
      if (done) done(r);
    });
  }
  presets.addEventListener('click', function (e) {
    var b = e.target;
    while (b && b !== presets && !b.getAttribute('data-min')) b = b.parentNode;
    if (b && b !== presets) schedule(parseInt(b.getAttribute('data-min'), 10));
  });
  cancelBtn.addEventListener('click', function () {
    if (cancelBtn.disabled) return;
    call('cancel', {}, function (r) { if (!r || !r.returnValue) renderStatus(r); else refresh(); });
  });

  // ---------- custom panel ----------
  var customMin = 45, entry = '', lastDigitAt = 0, entryTimer = null;
  function clampCustom(v) { return Math.max(MIN_CUSTOM, Math.min(MAX_CUSTOM, v)); }
  function paintCustom(v) { customVal.textContent = String(v); }
  function openCustom() {
    customMin = 45; entry = ''; paintCustom(customMin);
    presets.hidden = true; customRow.hidden = false;
    $('b-set').focus();
  }
  function closeCustom() {
    clearTimeout(entryTimer); entry = '';
    customRow.hidden = true; presets.hidden = false;
    $('b-custom').focus();
  }
  function customOpen() { return !customRow.hidden; }
  $('b-custom').addEventListener('click', openCustom);
  $('b-minus').addEventListener('click', function () { customMin = clampCustom(customMin - STEP); paintCustom(customMin); });
  $('b-plus').addEventListener('click', function () { customMin = clampCustom(customMin + STEP); paintCustom(customMin); });
  $('b-set').addEventListener('click', function () {
    customMin = clampCustom(customMin);
    var m = customMin;
    closeCustom();
    schedule(m);
  });
  function typeDigit(d) {
    var now = Date.now();
    if (now - lastDigitAt > ENTRY_MS || entry.length >= 3) entry = '';
    lastDigitAt = now;
    entry += d;
    customMin = parseInt(entry, 10);
    paintCustom(customMin);
    clearTimeout(entryTimer);
    entryTimer = setTimeout(function () { customMin = clampCustom(customMin); paintCustom(customMin); entry = ''; }, ENTRY_MS);
  }

  // ---------- launch params (iPhone / vtvctl) ----------
  var lastLaunch = { key: '', at: 0 };
  function handleLaunchParams(params) {
    if (!params || typeof params !== 'object' || !params.mode) { refresh(); return; }
    var key = JSON.stringify(params);
    var now = Date.now();
    if (key === lastLaunch.key && now - lastLaunch.at < 3000) return; // webOSLaunch + PalmSystem can both report it
    lastLaunch = { key: key, at: now };
    closeDev();
    if (customOpen()) closeCustom();
    var returnTo = (params.mode === 'schedule' || params.mode === 'cancel' || params.mode === 'status') && RETURN_IDS.indexOf(params.returnTo) !== -1 ? params.returnTo : null;
    call('handleLaunch', { params: params }, function (r) {
      refresh();
      var report = null; // what the caller gets back: only what this service confirmed
      if (!r || !r.returnValue) {
        var err = (r && r.errorText) || 'Timer service not answering';
        showOverlay('error', err, '');
        report = { op: 'error', error: String(err).slice(0, 120) };
      } else if (params.mode === 'schedule') {
        showOverlay('ok', 'TV OFF IN ' + r.minutes + ' MIN', clockTime(r.shutdownAt));
        report = { op: 'schedule', minutes: r.minutes, shutdownAt: r.shutdownAt };
      } else if (params.mode === 'cancel') {
        showOverlay('ok', 'TIMER CANCELLED', '');
        report = { op: 'cancel' };
      } else if (params.mode === 'off') {
        showOverlay('ok', 'TV TURNING OFF', '');
      } else if (params.mode === 'status') {
        if (r.scheduled) showOverlay('ok', 'TV OFF AT ' + clockTime(r.shutdownAt).toUpperCase(), 'Checking timer');
        else showOverlay('ok', 'NO TIMER SET', 'Checking timer');
        report = r.scheduled ? { op: 'status', scheduled: true, minutes: r.minutes, shutdownAt: r.shutdownAt } : { op: 'status', scheduled: false };
      }
      if (returnTo && report) setTimeout(function () { goBackTo(returnTo, report); }, RETURN_MS);
    });
  }
  // One-click flow: after the confirmation is on screen, reopen the app that asked and tell it what happened.
  function goBackTo(id, report) {
    report.at = Date.now();
    window.VTVBridge.call('luna://com.webos.applicationManager/launch', { id: id, params: { timer: report } }, function () {});
  }
  function parseLaunch(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') { try { return JSON.parse(raw); } catch (e) { return null; } }
    return raw;
  }
  document.addEventListener('webOSLaunch', function (e) { handleLaunchParams(parseLaunch(e.detail)); });
  document.addEventListener('webOSRelaunch', function (e) { handleLaunchParams(parseLaunch(e.detail)); });
  if (window.PalmSystem && window.PalmSystem.launchParams) handleLaunchParams(parseLaunch(window.PalmSystem.launchParams));
  if (window.VTVBridge.isStub) {
    var m = /[?&]launch=([^&]*)/.exec(location.search);
    if (m) { try { handleLaunchParams(JSON.parse(decodeURIComponent(m[1]))); } catch (e) { /* ignore bad test param */ } }
  }

  // ---------- dev panel ----------
  function show(title, obj) {
    out.scrollTop = 0;
    out.textContent = new Date().toISOString() + '  ' + title + '\n' + JSON.stringify(obj, null, 2);
  }
  function devCall(title, method, params) {
    out.textContent = title + ' ...';
    call(method, params, function (r) { show(title, r); });
  }
  function openDev() {
    dev.hidden = false;
    $('d-test2').focus();
  }
  function closeDev() {
    if (dev.hidden) return;
    disarmOff();
    dev.hidden = true;
    ensureFocus();
  }
  function toggleDev() { if (dev.hidden) openDev(); else closeDev(); }

  var offArmedAt = 0, offBtn = $('d-off');
  function disarmOff() { offArmedAt = 0; offBtn.textContent = 'TEST POWER OFF'; }
  offBtn.addEventListener('click', function () {
    if (offArmedAt && Date.now() - offArmedAt < 6000) {
      disarmOff();
      devCall('TEST POWER OFF', 'powerOff');
    } else {
      offArmedAt = Date.now();
      offBtn.textContent = 'PRESS OK AGAIN';
      out.textContent = 'This turns the TV off now. Press OK again.';
    }
  });
  offBtn.addEventListener('blur', disarmOff);
  $('d-test2').addEventListener('click', function () {
    out.textContent = 'TEST 2 MIN ...';
    call('schedule', { minutes: 2 }, function (r) { show('TEST 2 MIN', r); refresh(); });
  });
  $('d-pair').addEventListener('click', function () { devCall('PAIR LOCAL (accept the prompt on the TV)', 'pairLocal'); });
  $('d-diag').addEventListener('click', function () { devCall('DIAGNOSTICS', 'diagnostics'); });
  // Same probes the service runs, but issued from the app's own permissions.
  $('d-am').addEventListener('click', function () {
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
        call('capabilityTest', {}, function (s) { result.fromService = s; show('TEST ACTIVITY MANAGER', result); });
      });
    });
  });

  // ---------- keys ----------
  var zeroTaps = [];
  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    if (!overlay.hidden) {
      if (k === 461 || k === 27 || k === 13) { hideOverlay(); e.preventDefault(); }
      return;
    }
    if (k >= 37 && k <= 40) {
      move(k === 37 ? -1 : k === 39 ? 1 : 0, k === 38 ? -1 : k === 40 ? 1 : 0);
      e.preventDefault();
      return;
    }
    if (k === 461 || k === 27) {
      if (!dev.hidden) closeDev(); else if (customOpen()) closeCustom();
      e.preventDefault(); // at the root: do nothing, no exit popup
      return;
    }
    if (k === 403) { toggleDev(); e.preventDefault(); return; }
    var digit = (k >= 48 && k <= 57) ? k - 48 : (k >= 96 && k <= 105) ? k - 96 : -1;
    if (digit < 0) return;
    if (dev.hidden && customOpen()) { typeDigit(digit); return; }
    if (digit === 0) {
      var t = Date.now();
      zeroTaps.push(t);
      while (zeroTaps.length && t - zeroTaps[0] > DEV_WINDOW_MS) zeroTaps.shift();
      if (zeroTaps.length >= DEV_TAPS) { zeroTaps = []; toggleDev(); }
    } else {
      zeroTaps = [];
    }
  });

  refresh();
  startPolling();
  ensureFocus();
})();
