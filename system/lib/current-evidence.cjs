'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

function validateCurrentEvidence(document, catalogIds) {
  assert.equal(document.schemaVersion, 'airports-current-evidence.v1');
  assert.ok(Number.isFinite(Date.parse(document.researchAsOf)), 'Missing refresh cutoff');
  assert.equal(document.items.length, catalogIds.size, 'Refresh must expose gaps for the complete catalog');
  const sources = new Map();
  for (const source of document.sources) {
    assert.ok(source.source_id && !sources.has(source.source_id), 'Duplicate refresh source');
    assert.ok(source.sha256 === null || /^[a-f0-9]{64}$/.test(source.sha256), 'Invalid retained body hash');
    assert.ok(Number.isFinite(Date.parse(source.last_capture_at)), 'Source must retain actual capture time');
    sources.set(source.source_id, source);
  }
  const records = new Map();
  const checkReferences = value => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(checkReferences); return; }
    for (const [key, child] of Object.entries(value)) {
      if (key === 'sourceIds') { assert.ok(Array.isArray(child)); for (const id of child) assert.ok(sources.has(id), 'Unknown refresh source ' + id); }
      else if (key === 'sourceId' && child) assert.ok(sources.has(child), 'Unknown refresh source ' + child);
      else checkReferences(child);
    }
  };
  for (const record of document.items) {
    assert.ok(catalogIds.has(record.recordId) && !records.has(record.recordId), 'Refresh record coverage mismatch');
    assert.ok(Number.isFinite(Date.parse(record.checkedAt)), 'Each attempted record needs a check time');
    assert.ok(record.offers && record.payment && record.community, 'Explicit evidence/gap fields required');
    assert.equal(record.offers.checkoutVerified, false);
    assert.equal(record.payment.transactionVerified, false);
    for (const plan of record.offers.plans) {
      assert.ok(typeof plan.name === 'string' && plan.name);
      assert.ok(typeof plan.amount === 'number' && Number.isFinite(plan.amount) && plan.amount >= 0, 'Missing observed price');
      assert.ok((plan.currency || (plan.currency === null && plan.currencySymbol && plan.currencyStatus === 'not_confirmed')) && plan.billingPeriod, 'Currency evidence or explicit unknown and exact billing period must be retained');
      assert.ok(plan.sourceIds?.length, 'Each advertised price needs an original observation');
      assert.equal(plan.priceStatus, 'advertised_not_checkout_verified');
      assert.ok(!Object.hasOwn(plan, 'verifiedPrice'), 'No checkout verification was performed');
    }
    assert.equal(record.community.claimsIndependentlyVerified, false);
    assert.equal(record.community.zeroMatchesMeansZeroComplaints, false);
    checkReferences(record); records.set(record.recordId, record);
  }
  return { sources, records };
}

function loadCurrentEvidence(baseDir, catalogIds) {
  const file = path.join(baseDir, 'catalog/current-evidence.v1.json');
  if (!fs.existsSync(file)) return null;
  const bytes = fs.readFileSync(file);
  const document = JSON.parse(bytes.toString('utf8'));
  return { document, ...validateCurrentEvidence(document, catalogIds), sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}
module.exports = { validateCurrentEvidence, loadCurrentEvidence };
