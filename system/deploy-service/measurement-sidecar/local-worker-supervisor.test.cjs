'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { supervise } = require('./local-worker-supervisor.cjs');
function setup(extra = {}) {
  const child = new EventEmitter(), signals = [], exits = [];
  child.kill = signal => { signals.push(signal); return true; };
  const supervisor = supervise({ child, intervalMs: 100000, exit: code => exits.push(code), ...extra });
  return { child, signals, exits, ...supervisor };
}
test('sustained local proxy failure drains child and exits 75 only after child exits', async () => {
  let time = 0;
  const s = setup({ check: async () => false, now: () => time });
  try {
    await s.tick(); time = 9999; await s.tick(); assert.deepEqual(s.signals, []);
    time = 10000; await s.tick(); assert.deepEqual(s.signals, ['SIGTERM']); assert.deepEqual(s.exits, []);
    s.child.emit('exit', 0, null); assert.deepEqual(s.exits, [75]);
  } finally { s.cleanup(); }
});
test('healthy local proxy resets failure window irrespective of external target health', async () => {
  let time = 0, healthy = false;
  const s = setup({ check: async () => healthy, now: () => time });
  try {
    await s.tick(); time = 9000; healthy = true; await s.tick();
    time = 10000; healthy = false; await s.tick(); time = 19000; await s.tick();
    assert.deepEqual(s.signals, []);
    healthy = true; time = 30000; await s.tick(); assert.deepEqual(s.signals, []);
  } finally { s.cleanup(); }
});
test('child exit code propagates; graceful stop waits and force kills bounded child', async () => {
  const natural = setup(); natural.child.emit('exit', 9, null); assert.deepEqual(natural.exits, [9]);
  const s = setup({ killMs: 10 });
  try {
    s.stop(0); s.stop(0); assert.deepEqual(s.signals, ['SIGTERM']); assert.deepEqual(s.exits, []);
    await new Promise(resolve => setTimeout(resolve, 30)); assert.deepEqual(s.signals, ['SIGTERM', 'SIGKILL']);
    s.child.emit('exit', null, 'SIGKILL'); assert.deepEqual(s.exits, [0]);
  } finally { s.cleanup(); }
});
