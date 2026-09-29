'use strict';
// Loads the real service.js with `webos-service` replaced by a fake via the require seam.
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');
const path = require('path');

test('service.js registers all methods against a fake webos-service', () => {
  const registered = {};
  let created = null;
  class FakeService {
    constructor(id) { created = id; this.activityManager = {}; FakeService.last = this; }
    register(name) { registered[name] = true; }
    call() {}
  }
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'webos-service') return FakeService;
    return origLoad.call(this, request, parent, isMain);
  };
  const file = path.join(__dirname, '../tv-service/service.js');
  try {
    delete require.cache[require.resolve(file)];
    require(file);
  } finally {
    Module._load = origLoad;
  }
  assert.equal(created, 'com.designinnsaeit.vtvsleep.service');
  assert.equal(FakeService.last.activityManager.idleTimeout, 30);
  for (const m of ['schedule', 'cancel', 'status', 'fire', 'warn', 'powerOff', 'diagnostics', 'capabilityTest', 'pairLocal', 'handleLaunch']) {
    assert.ok(registered[m], m);
  }
});
