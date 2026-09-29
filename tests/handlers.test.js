'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('./helpers');

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);
const denied = { returnValue: false, errorText: 'Denied method call "x" for category "/"' };

test('schedule rejects bad minutes without touching the bus', async () => {
  const { handlers, luna } = build();
  for (const m of [0, 721, 2.5, '30', undefined]) {
    const r = await handlers.schedule({ minutes: m });
    assert.equal(r.returnValue, false);
  }
  assert.equal(luna.calls.length, 0);
});

test('schedule creates shutdown + warning activities with replace and UTC start, writes state', async () => {
  const { handlers, luna, state } = build();
  const r = await handlers.schedule({ minutes: 30 });
  assert.equal(r.returnValue, true);
  const creates = luna.calls.filter((c) => c.uri.endsWith('/create'));
  assert.equal(creates.length, 2);
  assert.equal(creates[0].params.replace, true);
  assert.equal(creates[0].params.activity.schedule.start, '2026-01-01 12:30:00Z');
  assert.equal(creates[1].params.activity.name, 'com.designinnsaeit.vtvsleep.warning');
  assert.equal(state.read('state.json').shutdownAt, T0 + 30 * 60000);
});

test('replace semantics: 5-min timer replaces 30-min one and drops the old warning', async () => {
  const { handlers, luna, state } = build();
  await handlers.schedule({ minutes: 30 });
  luna.calls.length = 0;
  await handlers.schedule({ minutes: 5 });
  const create = luna.calls.filter((c) => c.uri.endsWith('/create'));
  assert.equal(create.length, 1);
  assert.equal(create[0].params.replace, true);
  assert.equal(create[0].params.activity.name, 'com.designinnsaeit.vtvsleep.shutdown');
  const cancels = luna.calls.filter((c) => c.uri.endsWith('/cancel'));
  assert.equal(cancels.length, 1);
  assert.equal(cancels[0].params.activityName, 'com.designinnsaeit.vtvsleep.warning');
  assert.equal(state.read('state.json').shutdownAt, T0 + 5 * 60000);
});

test('schedule failure does not write state', async () => {
  const { handlers, state } = build({ '/create': denied });
  const r = await handlers.schedule({ minutes: 10 });
  assert.equal(r.returnValue, false);
  assert.equal(state.read('state.json'), null);
});

test('cancel removes both activities and state', async () => {
  const { handlers, luna, state } = build();
  await handlers.schedule({ minutes: 30 });
  const r = await handlers.cancel();
  assert.equal(r.returnValue, true);
  const names = luna.calls.filter((c) => c.uri.endsWith('/cancel')).map((c) => c.params.activityName).sort();
  assert.deepEqual(names, ['com.designinnsaeit.vtvsleep.shutdown', 'com.designinnsaeit.vtvsleep.warning']);
  assert.equal(state.read('state.json'), null);
});

test('status reports remaining time and clears when stale', async () => {
  const { handlers, clock } = build();
  assert.equal((await handlers.status()).scheduled, false);
  await handlers.schedule({ minutes: 30 });
  clock.t = T0 + 10 * 60000;
  const s = await handlers.status();
  assert.equal(s.scheduled, true);
  assert.equal(s.remainingMs, 20 * 60000);
  clock.t = T0 + 30 * 60000 + 121000;
  assert.equal((await handlers.status()).scheduled, false);
});

test('fire at the deadline powers off, deletes state, and completes the activity', async () => {
  const { handlers, luna, clock, state } = build();
  await handlers.schedule({ minutes: 2 });
  clock.t = T0 + 2 * 60000 + 500;
  const r = await handlers.fire({ $activity: { activityId: 42 } });
  assert.equal(r.returnValue, true);
  assert.equal(luna.count('/power/turnOff'), 1);
  const done = luna.calls.filter((c) => c.uri.endsWith('/complete'));
  assert.equal(done.length, 1);
  assert.equal(done[0].params.activityId, 42);
  assert.equal(state.read('state.json'), null);
});

test('stale fire (TV was off past the deadline) skips power-off but still completes', async () => {
  const { handlers, luna, clock, state } = build();
  await handlers.schedule({ minutes: 2 });
  clock.t = T0 + 2 * 60000 + 121000; // 121 s late
  const r = await handlers.fire({ $activity: { activityId: 7 } });
  assert.equal(r.skipped, 'stale');
  assert.equal(luna.count('/power/turnOff'), 0);
  assert.equal(luna.count('/machineOff'), 0);
  assert.equal(luna.count('/complete'), 1);
  assert.equal(state.read('state.json'), null);
});

test('fire exactly at 120 s grace still powers off', async () => {
  const { handlers, luna, clock } = build();
  await handlers.schedule({ minutes: 2 });
  clock.t = T0 + 2 * 60000 + 120000;
  await handlers.fire({ $activity: { activityId: 1 } });
  assert.equal(luna.count('/power/turnOff'), 1);
});

test('fire with no state and no shutdownAt is treated as stale', async () => {
  const { handlers, luna } = build();
  const r = await handlers.fire({ $activity: { activityId: 3 } });
  assert.equal(r.skipped, 'stale');
  assert.equal(luna.count('/power/turnOff'), 0);
  assert.equal(luna.count('/complete'), 1);
});

test('early fire (direct call before the deadline) is ignored and keeps the timer', async () => {
  const { handlers, luna, state } = build();
  await handlers.schedule({ minutes: 30 });
  const r = await handlers.fire({ $activity: { activityId: 9 } });
  assert.equal(r.skipped, 'early');
  assert.equal(luna.count('/power/turnOff'), 0);
  assert.notEqual(state.read('state.json'), null);
});

test('retry is bounded to 3 attempts with 2 s / 4 s pauses on retryable errors', async () => {
  const { handlers, luna, clock, sleeps } = build({
    '/power/turnOff': new Error('timeout calling x'),
    '/machineOff': new Error('timeout calling y')
  });
  await handlers.schedule({ minutes: 2 });
  clock.t = T0 + 2 * 60000;
  const r = await handlers.fire({ $activity: { activityId: 5 } });
  assert.equal(r.returnValue, false);
  assert.equal(luna.count('/power/turnOff'), 3);
  assert.deepEqual(sleeps, [2000, 4000]);
  assert.equal(luna.count('/complete'), 1);
});

test('retry stops immediately when every method is non-retryable (ACG denial)', async () => {
  const { handlers, luna, clock, sleeps } = build({
    '/power/turnOff': denied, '/machineOff': denied
  }, { ssap: { turnOff: async () => { throw new Error('403 blacklisted certificate'); }, hosts: () => [] } });
  await handlers.schedule({ minutes: 2 });
  clock.t = T0 + 2 * 60000;
  const r = await handlers.fire({ $activity: { activityId: 5 } });
  assert.equal(r.returnValue, false);
  assert.equal(luna.count('/power/turnOff'), 1);
  assert.deepEqual(sleeps, []);
  assert.equal(luna.count('/complete'), 1);
});

test('retry succeeds on attempt 2', async () => {
  const { handlers, luna, clock, sleeps } = build({
    '/power/turnOff': (p, n) => (n === 1 ? new Error('timeout calling x') : { returnValue: true }),
    '/machineOff': denied
  });
  await handlers.schedule({ minutes: 2 });
  clock.t = T0 + 2 * 60000;
  const r = await handlers.fire({ $activity: { activityId: 5 } });
  assert.equal(r.returnValue, true);
  assert.deepEqual(sleeps, [2000]);
});

test('complete is called even if the power chain itself crashes', async () => {
  const power = { runChain: async () => { throw new Error('boom'); } };
  const { handlers, luna, clock, state } = build({}, { power });
  await handlers.schedule({ minutes: 2 });
  clock.t = T0 + 2 * 60000;
  const r = await handlers.fire({ $activity: { activityId: 11 } });
  assert.equal(r.returnValue, false);
  assert.equal(luna.count('/complete'), 1);
  assert.equal(state.read('state.json'), null);
});

test('fire without activityId logs and does not call complete', async () => {
  const { handlers, luna, clock } = build();
  await handlers.schedule({ minutes: 2 });
  clock.t = T0 + 2 * 60000;
  await handlers.fire({});
  assert.equal(luna.count('/complete'), 0);
});

test('warn toasts only while the timer is live', async () => {
  const { handlers, luna, clock } = build();
  await handlers.schedule({ minutes: 30 });
  luna.calls.length = 0;
  clock.t = T0 + 25 * 60000;
  const r = await handlers.warn({ $activity: { activityId: 2 } });
  assert.equal(r.warned, true);
  assert.equal(luna.count('/createToast'), 1);
  assert.equal(luna.count('/complete'), 1);
  await handlers.cancel();
  luna.calls.length = 0;
  const r2 = await handlers.warn({ $activity: { activityId: 2 } });
  assert.equal(r2.warned, false);
  assert.equal(luna.count('/createToast'), 0);
});

test('handleLaunch dispatches known modes and rejects junk', async () => {
  const { handlers, luna } = build();
  assert.equal((await handlers.handleLaunch({ mode: 'schedule', minutes: 30 })).returnValue, true);
  assert.equal((await handlers.handleLaunch({ mode: 'status' })).scheduled, true);
  assert.equal((await handlers.handleLaunch({ mode: 'cancel' })).cancelled, true);
  luna.calls.length = 0;
  for (const junk of [null, undefined, 'schedule', 5, [], {}, { mode: 'reboot' }, { mode: 'schedule' },
    { mode: 'schedule', minutes: 0 }, { mode: 'schedule', minutes: 9999 }, { mode: 'schedule', minutes: '30' }]) {
    const r = await handlers.handleLaunch(junk);
    assert.equal(r.returnValue, false, JSON.stringify(junk));
  }
  assert.equal(luna.calls.length, 0);
});

test('handleLaunch off runs the power chain', async () => {
  const { handlers, luna } = build();
  const r = await handlers.handleLaunch({ mode: 'off' });
  assert.equal(r.returnValue, true);
  assert.equal(luna.count('/power/turnOff'), 1);
});

test('diagnostics returns log ring capped at 100 and state info', async () => {
  const { handlers } = build();
  for (let i = 0; i < 120; i++) await handlers.schedule({ minutes: 10 });
  const d = await handlers.diagnostics();
  assert.equal(d.log.length, 100);
  assert.equal(d.stateDir, '/mem');
  assert.ok(d.pending);
});

test('capabilityTest never calls a power-off method', async () => {
  const { handlers, luna } = build();
  const r = await handlers.capabilityTest();
  assert.equal(r.returnValue, true);
  assert.ok(r.results.length >= 6);
  assert.equal(luna.count('/power/turnOff'), 0);
  assert.equal(luna.count('/machineOff'), 0);
});

test('log history survives a service restart (new handlers on the same state)', async () => {
  const first = build();
  await first.handlers.schedule({ minutes: 30 });
  const second = build(undefined, { state: first.state });
  await second.handlers.cancel();
  const events = (await second.handlers.diagnostics()).log.map((e) => e.event);
  assert.deepEqual(events.slice(0, 2), ['scheduled', 'cancelled']);
});
