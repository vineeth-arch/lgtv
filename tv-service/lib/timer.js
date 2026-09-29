'use strict';
// Pure helpers. No I/O, no clocks (callers pass `now`).

const SERVICE_ID = 'com.designinnsaeit.vtvsleep.service';
const SHUTDOWN_ACTIVITY = 'com.designinnsaeit.vtvsleep.shutdown';
const WARNING_ACTIVITY = 'com.designinnsaeit.vtvsleep.warning';
const MIN_MINUTES = 1;
const MAX_MINUTES = 720;
const WARN_LEAD_MIN = 5;
const STALE_GRACE_MS = 120 * 1000;

function validateMinutes(m) {
  if (typeof m !== 'number' || !Number.isInteger(m) || m < MIN_MINUTES || m > MAX_MINUTES) {
    return { ok: false, errorText: 'minutes must be an integer from ' + MIN_MINUTES + ' to ' + MAX_MINUTES };
  }
  return { ok: true, minutes: m };
}

// Activity Manager treats "YYYY-MM-DD HH:MM:SS" as local time; the trailing Z makes it UTC.
function toActivityStart(date) {
  const p = (n) => String(n).padStart(2, '0');
  return date.getUTCFullYear() + '-' + p(date.getUTCMonth() + 1) + '-' + p(date.getUTCDate()) + ' ' +
    p(date.getUTCHours()) + ':' + p(date.getUTCMinutes()) + ':' + p(date.getUTCSeconds()) + 'Z';
}

function buildActivity(name, description, when, method, params, metadata) {
  return {
    name: name,
    description: description,
    type: { background: true, persist: true, explicit: true },
    schedule: { start: toActivityStart(when), precise: true },
    callback: { method: 'luna://' + SERVICE_ID + '/' + method, params: params },
    metadata: metadata
  };
}

// now: ms since epoch. Returns { activity, shutdownAt } (shutdownAt in ms).
function buildShutdownActivity(minutes, now) {
  const shutdownAt = now + minutes * 60000;
  const activity = buildActivity(SHUTDOWN_ACTIVITY, 'V/TV scheduled power off', new Date(shutdownAt),
    'fire', { reason: 'timer', shutdownAt: shutdownAt },
    { minutes: minutes, createdAt: new Date(now).toISOString(), shutdownAt: new Date(shutdownAt).toISOString() });
  return { activity: activity, shutdownAt: shutdownAt };
}

// Only when there is more than WARN_LEAD_MIN minutes to go; otherwise null.
function buildWarningActivity(minutes, now) {
  if (minutes <= WARN_LEAD_MIN) return null;
  const warnAt = now + (minutes - WARN_LEAD_MIN) * 60000;
  const activity = buildActivity(WARNING_ACTIVITY, 'V/TV five-minute warning', new Date(warnAt),
    'warn', { reason: 'warning' }, { warnAt: new Date(warnAt).toISOString() });
  return { activity: activity, warnAt: warnAt };
}

// A fire long after the scheduled time (TV was off, activity fired at next boot) must not power off.
// An unknown shutdownAt is treated as stale: never power off on missing data.
function isStale(now, shutdownAt) {
  if (typeof shutdownAt !== 'number' || !isFinite(shutdownAt)) return true;
  return now > shutdownAt + STALE_GRACE_MS;
}

function backoffDelays() {
  return [2000, 4000, 8000];
}

module.exports = {
  SERVICE_ID, SHUTDOWN_ACTIVITY, WARNING_ACTIVITY, MIN_MINUTES, MAX_MINUTES, WARN_LEAD_MIN, STALE_GRACE_MS,
  validateMinutes, toActivityStart, buildShutdownActivity, buildWarningActivity, isStale, backoffDelays
};
