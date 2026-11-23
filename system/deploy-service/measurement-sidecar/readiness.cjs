'use strict';
// Read only the new readiness project's DB. Never opens host or collector data.
const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
// SQLite WAL readers can need local -shm/-wal metadata even in readOnly mode.
// Copy the stopped worker's files from the RO mount into this checker's tmpfs;
// preserve and recheck every original byte rather than remounting it writable.
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
fs.mkdirSync('/tmp/measurement-readiness');
const originals = [];
for (const name of ['measurements.sqlite', 'measurements.sqlite-wal', 'measurements.sqlite-shm']) {
  const source = '/measurement-data/' + name;
  if (!fs.existsSync(source)) continue;
  const sha256 = digest(source);
  fs.copyFileSync(source, '/tmp/measurement-readiness/' + name);
  assert.equal(digest('/tmp/measurement-readiness/' + name), sha256);
  originals.push({ name, sha256, bytes: fs.statSync(source).size });
}
const db = new DatabaseSync('/tmp/measurement-readiness/measurements.sqlite', { readOnly: true });
const enabled = db.prepare('SELECT enabled FROM measurement_control WHERE id=1').get().enabled;
const profiles = db.prepare('SELECT COUNT(*) n FROM measurement_profiles').get().n;
const observations = db.prepare('SELECT COUNT(*) n FROM measurement_observations').get().n;
const runs = db.prepare('SELECT COUNT(*) n FROM measurement_runs').get().n;
const worker = JSON.parse(db.prepare('SELECT body FROM measurement_worker_status WHERE id=1').get().body);
assert.equal(enabled, 0);
assert.equal(profiles, 0);
assert.equal(observations, 0);
assert.equal(runs, 0);
assert.equal(worker.status, 'stopped');
assert.equal(worker.automaticApproval, false);
for (const p of ['/app/deploy-service/.env', '/app/deploy-service/data', '/app/deploy-service/measurement-sidecar', '/data/collector.sqlite']) assert.equal(fs.existsSync(p), false, 'private deployment content must not be packaged');
const sourceFiles = ['deploy-service/measurement-worker.cjs', 'deploy-service/measurement-store.cjs', 'lib/proxy-route-observer.cjs', 'lib/local-network-observer.cjs'].map(file => ({ file, sha256: crypto.createHash('sha256').update(fs.readFileSync('/app/' + file)).digest('hex') }));
db.close();
for (const original of originals) assert.equal(digest('/measurement-data/' + original.name), original.sha256);
console.log(JSON.stringify({ productionImageReadiness: true, nodeVersion: process.version, realMeasurementStatus: 'NOT_CONFIGURED', enabled: false, configuredProfiles: profiles, rawObservationCount: observations, runCount: runs, workerStatus: worker.status, automaticApproval: false, realRouteVerified: false, readOnlySnapshotCopy: true, originalBytesUnchanged: true, originalFiles: originals, sourceFiles }));
