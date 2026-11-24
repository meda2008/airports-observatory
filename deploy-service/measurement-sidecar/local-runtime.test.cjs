'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { probe, workerReady } = require('./local-healthcheck.cjs');
test('proxy health only succeeds for a listening local socket', async () => {
  const server = net.createServer(socket => socket.end());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  assert.equal(await probe(port), true);
  await new Promise(resolve => server.close(resolve));
  assert.equal(await probe(port), false);
});
test('worker health rejects stale, stopped, and absent heartbeat', () => {
  const { DatabaseSync } = require('node:sqlite');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'measurement-health-'));
  const filename = path.join(directory, 'test.sqlite');
  const db = new DatabaseSync(filename);
  try {
    db.exec('CREATE TABLE measurement_worker_status(id INTEGER PRIMARY KEY,body TEXT,observed_at TEXT)');
    assert.equal(workerReady(filename, 200000), false);
    const set = (status, time) => db.prepare('INSERT OR REPLACE INTO measurement_worker_status VALUES(1,?,?)').run(JSON.stringify({ status }), new Date(time).toISOString());
    set('running', 190000); assert.equal(workerReady(filename, 200000), true);
    set('paused', 190000); assert.equal(workerReady(filename, 200000), true);
    set('running', 10000); assert.equal(workerReady(filename, 200000), false);
    set('stopped', 190000); assert.equal(workerReady(filename, 200000), false);
  } finally { db.close(); fs.rmSync(directory, { recursive: true }); }
});
