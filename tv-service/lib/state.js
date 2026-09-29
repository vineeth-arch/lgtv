'use strict';
// Small JSON store in the first writable directory from a candidate list. Writes are atomic (tmp + rename).
const nodefs = require('fs');
const path = require('path');

function createState(opts) {
  const fs = opts.fs || nodefs;
  const dirs = opts.dirs;
  let chosen = null;

  function writable(dir) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const probe = path.join(dir, '.vtv-write-probe');
      fs.writeFileSync(probe, 'x');
      fs.unlinkSync(probe);
      return true;
    } catch (e) {
      return false;
    }
  }

  function dir() {
    if (chosen) return chosen;
    for (const d of dirs) {
      if (writable(d)) { chosen = d; return d; }
    }
    throw new Error('no writable state directory among: ' + dirs.join(', '));
  }

  function read(name) {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir(), name), 'utf8'));
    } catch (e) {
      return null;
    }
  }

  function write(name, obj) {
    const file = path.join(dir(), name);
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj));
    fs.renameSync(tmp, file);
  }

  function remove(name) {
    try { fs.unlinkSync(path.join(dir(), name)); } catch (e) { /* already gone */ }
  }

  // For diagnostics (gate G3): which candidates are writable, and does a marker written earlier survive a reboot?
  function probeAll(now) {
    return dirs.map((d) => {
      const ok = writable(d);
      let marker = null;
      if (ok) {
        const mfile = path.join(d, '.vtv-marker');
        try {
          marker = JSON.parse(fs.readFileSync(mfile, 'utf8'));
        } catch (e) {
          marker = { createdAt: new Date(now).toISOString(), fresh: true };
          try { fs.writeFileSync(mfile, JSON.stringify({ createdAt: marker.createdAt })); } catch (e2) { /* ignore */ }
        }
      }
      return { dir: d, writable: ok, marker: marker };
    });
  }

  return { dir, read, write, remove, probeAll };
}

module.exports = { createState };
