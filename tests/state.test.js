'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createState } = require('../tv-service/lib/state');

test('picks first writable dir, atomic write/read/remove', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vtv-state-'));
  const blocker = path.join(base, 'file');
  fs.writeFileSync(blocker, 'x'); // a file where a dir is needed -> not writable
  const good = path.join(base, 'good');
  const s = createState({ dirs: [path.join(blocker, 'sub'), good] });
  assert.equal(s.dir(), good);
  assert.equal(s.read('state.json'), null);
  s.write('state.json', { a: 1 });
  assert.deepEqual(s.read('state.json'), { a: 1 });
  assert.equal(fs.existsSync(path.join(good, 'state.json.tmp')), false);
  s.remove('state.json');
  assert.equal(s.read('state.json'), null);
  s.remove('state.json'); // idempotent
  const probe = s.probeAll(Date.now());
  assert.equal(probe[0].writable, false);
  assert.equal(probe[1].writable, true);
  fs.rmSync(base, { recursive: true, force: true });
});

test('throws when nothing is writable', () => {
  const s = createState({ dirs: ['/proc/definitely/not/here'] });
  assert.throws(() => s.dir(), /no writable/);
});
