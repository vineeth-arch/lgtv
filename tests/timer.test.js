'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const t = require('../tv-service/lib/timer');

test('validateMinutes accepts integers 1..720', () => {
  for (const m of [1, 30, 720]) assert.equal(t.validateMinutes(m).ok, true);
});

test('validateMinutes rejects (does not clamp) junk', () => {
  for (const m of [0, -5, 721, 1000, 1.5, NaN, Infinity, '30', null, undefined, {}, [], true]) {
    assert.equal(t.validateMinutes(m).ok, false, String(m));
  }
});

test('toActivityStart formats UTC with trailing Z', () => {
  assert.equal(t.toActivityStart(new Date(Date.UTC(2026, 2, 5, 7, 4, 9))), '2026-03-05 07:04:09Z');
});

test('toActivityStart handles date rollover and year end', () => {
  const start = Date.UTC(2026, 11, 31, 23, 50, 0);
  assert.equal(t.toActivityStart(new Date(start + 30 * 60000)), '2027-01-01 00:20:00Z');
});

test('toActivityStart is unaffected by the process time zone (DST safe)', () => {
  // 2026-03-08 06:59 UTC is right before the US DST jump; UTC output must stay linear.
  const a = Date.UTC(2026, 2, 8, 6, 59, 0);
  assert.equal(t.toActivityStart(new Date(a)), '2026-03-08 06:59:00Z');
  assert.equal(t.toActivityStart(new Date(a + 2 * 60000)), '2026-03-08 07:01:00Z');
});

test('buildShutdownActivity shape', () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);
  const { activity, shutdownAt } = t.buildShutdownActivity(30, now);
  assert.equal(shutdownAt, now + 1800000);
  assert.equal(activity.name, 'com.designinnsaeit.vtvsleep.shutdown');
  assert.equal(activity.schedule.start, '2026-01-01 12:30:00Z');
  assert.equal(activity.schedule.precise, true);
  assert.equal(activity.type.persist, true);
  assert.equal(activity.callback.method, 'luna://com.designinnsaeit.vtvsleep.service/fire');
});

test('buildWarningActivity only when minutes > 5', () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);
  assert.equal(t.buildWarningActivity(5, now), null);
  assert.equal(t.buildWarningActivity(1, now), null);
  const w = t.buildWarningActivity(30, now);
  assert.equal(w.activity.schedule.start, '2026-01-01 12:25:00Z');
  assert.equal(w.activity.name, 'com.designinnsaeit.vtvsleep.warning');
});

test('isStale uses a 120 s grace', () => {
  const at = 1000000;
  assert.equal(t.isStale(at + 120000, at), false);
  assert.equal(t.isStale(at + 120001, at), true);
  assert.equal(t.isStale(at - 1, at), false);
  assert.equal(t.isStale(at, undefined), true);
  assert.equal(t.isStale(at, NaN), true);
});

test('backoffDelays', () => {
  assert.deepEqual(t.backoffDelays(), [2000, 4000, 8000]);
});
