'use strict';
const fs = require('node:fs'), path = require('node:path');
function readDiscoveryStatus({ root = path.resolve(__dirname, '..'), siteIds, configFile = path.join(root, 'collection/performance-discovery-sources.json'), database = process.env.SINGLE_DATABASE==='true'&&process.env.STORE_FILE || path.join(root, 'deploy-service/data/performance-discovery.sqlite') } = {}) {
  const seeds = JSON.parse(fs.readFileSync(configFile)).seeds.filter(s => !siteIds || siteIds.includes(s.recordId));
  let runs = [];
  if (fs.existsSync(database)) {
    const { DatabaseSync } = require('node:sqlite'), db = new DatabaseSync(database, { readOnly: true });
    try { const table=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='discovery_collector_runs'").get()?'discovery_collector_runs':'collector_runs';runs = db.prepare('SELECT id,job_id,site_id,status,finished_at,outcome_json FROM '+table+' ORDER BY rowid DESC').all(); }
    finally { db.close(); }
  }
  return { discoveryOnly: true, automaticFactApproval: false, rows: seeds.map(s => {
    const run = runs.find(r => r.site_id === s.recordId && JSON.parse(r.outcome_json || '{}')?.seedId === s.id);
    return { seedId: s.id, siteId: s.recordId, field: s.field, url: s.url, disposition: s.reviewDisposition || { status: 'unreviewed', reason: 'Discovery completion does not qualify a business fact.' }, lastAttempt: run ? { jobId: run.job_id, runId: run.id, status: run.status, finishedAt: run.finished_at ? new Date(run.finished_at).toISOString() : null } : null, businessFieldAdmitted: false };
  }) };
}
module.exports = { readDiscoveryStatus };
