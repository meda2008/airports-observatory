'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {measurementPollDelay} = require('../deploy-service/collector-runtime.cjs');
const {createThreeServiceApi} = require('../deploy-service/three-service-api.cjs');
const {openPublicationWorker} = require('../deploy-service/publication-worker.cjs');

test('measurementPollDelay backs off smoothly when idle and wakes immediately for due profiles', () => {
  const now = Date.parse('2026-11-27T00:00:00Z');
  const due = (ms, enabled = true) => ({profile: {enabled}, nextDueAt: new Date(now + ms).toISOString()});

  assert.equal(measurementPollDelay([], now), 1000);
  assert.equal(measurementPollDelay([], now, {idleStreak: 1}), 2000);
  assert.equal(measurementPollDelay([], now, {idleStreak: 2}), 4000);
  assert.equal(measurementPollDelay([], now, {idleStreak: 3}), 8000);
  assert.equal(measurementPollDelay([], now, {idleStreak: 4}), 10000);
  assert.equal(measurementPollDelay([], now, {idleStreak: 8}), 10000);

  // Even when backed off, a profile due sooner wakes on schedule.
  assert.equal(measurementPollDelay([due(600)], now, {idleStreak: 4}), 600);
  assert.equal(measurementPollDelay([due(-50)], now, {idleStreak: 4}), 250);
  // Disabled profiles do not cut idle backoff short.
  assert.equal(measurementPollDelay([due(300, false)], now, {idleStreak: 2}), 4000);
});

test('completeness endpoint serves repeated calls with reused read-only handle and releases on close', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-completeness-reuse-'));
  const adminToken = 'unit-admin-auth-9f8e7d6c5b4a3210-strong-key';
  const internalToken = 'unit-worker-rpc-1a2b3c4d5e6f7890-strong-key';
  const app = createThreeServiceApi({filename: path.join(dir, 'db.sqlite'), adminToken, internalToken});
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${app.server.address().port}/api/admin/collectors/completeness`;
  const headers = {authorization: 'Bearer ' + adminToken};

  try {
    const first = await fetch(url, {headers});
    assert.equal(first.status, 200);
    const body1 = await first.json();
    const second = await fetch(url, {headers});
    assert.equal(second.status, 200);
    const body2 = await second.json();
    assert.equal(body1.sourceProfileCount, body2.sourceProfileCount);
    assert.equal(body1.counts.primary, body2.counts.primary);
  } finally {
    await new Promise(resolve => app.server.close(resolve));
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

test('publication worker propagates sanitized error metadata without breaking failure contract', async () => {
  const badRoot = path.join(os.tmpdir(), 'nonexistent-publication-root-' + Date.now());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-pub-worker-'));
  const worker = openPublicationWorker({filename: path.join(dir, 'db.sqlite'), root: badRoot});
  try {
    await assert.rejects(
      () => worker.sync(),
      (err) => {
        assert.equal(err.message, 'publication_sync_failed');
        return true;
      }
    );
  } finally {
    await worker.close();
    fs.rmSync(dir, {recursive: true, force: true});
  }
});
