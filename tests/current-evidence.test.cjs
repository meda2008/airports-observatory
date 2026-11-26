'use strict';
const { historicalCaptureOptions } = require('./helpers/historical-capture.cjs');


const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { validateCurrentEvidence, loadCurrentEvidence } = require('../lib/current-evidence.cjs');
const { makeCatalogService } = require('../lib/catalog-service.cjs');

const root = path.resolve(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const originalCatalog = read('catalog/catalog.v1.json');
const catalogIds = new Set(originalCatalog.catalog.map(record => record.id));
const current = () => read('catalog/current-evidence.v1.json');
const record = (document, id) => {
  const item = document.items.find(row => row.recordId === id);
  assert.ok(item, 'Missing current evidence for ' + id);
  return item;
};

test('real refresh explicitly covers all 215 candidates and decorates both list and detail without inventing verification', () => {
  const document = current();
  const loaded = loadCurrentEvidence(root, catalogIds);
  assert.equal(loaded.records.size, 215);
  assert.equal(new Set(document.items.map(row => row.recordId)).size, catalogIds.size);
  assert.deepEqual(new Set(document.items.map(row => row.recordId)), catalogIds);
  const service = makeCatalogService({ baseDir: root });
  const seen = new Set();
  for (let offset = 0; offset < 215; offset += 100) {
    for (const brief of service.list({ offset: String(offset), limit: '100' }).items) {
      const detail = service.get(brief.id);
      assert.equal(brief.currentEvidence.recordId, brief.id);
      assert.deepEqual(brief.currentEvidence, detail.currentEvidence);
      assert.equal(detail.currentEvidence.offers.checkoutVerified, false);
      assert.equal(detail.currentEvidence.payment.transactionVerified, false);
      assert.ok(Number.isFinite(Date.parse(detail.currentEvidence.checkedAt)));
      seen.add(brief.id);
    }
  }
  assert.equal(seen.size, 215);
  assert.equal(service.stats().currentEvidenceSha256, loaded.sha256);
  assert.equal(service.stats().researchAsOf, document.researchAsOf);
  const oldSourceCount = read('catalog/source-provenance.json').sources.length;
  assert.equal(service.stats().sourceCount, oldSourceCount + loaded.sources.size + (fs.existsSync(path.join(root,'catalog/core-supplement.v1.json')) ? read('catalog/core-supplement.v1.json').sources.length : 0));
});

test('real original 245-entry forecast chain retains its frozen hash and every forecast remains an unscored abstention', () => {
  const ledgerBytes = fs.readFileSync(path.join(root, 'catalog/forecast-ledger.v1.ndjson'));
  // Frozen digest of the tracked, post-sanitization ledger (LF bytes).
  assert.equal(crypto.createHash('sha256').update(ledgerBytes).digest('hex'), '73a6c3f3d2ea6eab1b86e512d090ae5f9ada6f118a1c8753b5d6d411ad859f18');
  const service = makeCatalogService({ baseDir: root });
  const ledger = service.ledger();
  assert.equal(ledger.chainVerified, true);
  assert.equal(ledger.items.length, 245);
  assert.equal(ledger.brier, null);
  for (const entry of ledger.items) {
    assert.equal(entry.status.toLowerCase(), 'abstain');
    assert.equal(entry.point_probability, null);
    assert.equal(entry.probability_interval, null);
    assert.equal(entry.scorable, false);
  }
  for (const id of catalogIds) {
    const forecast = service.get(id).forecast;
    assert.equal(forecast.status, 'abstain');
    assert.equal(forecast.pointProbability, null);
    assert.equal(forecast.probabilityInterval, null);
  }
  assert.equal(service.stats().numericPredictions, 0);
});

test('real Nexitally prices preserve 31/186-day total amounts and G units instead of substituting displayed monthly averages', () => {
  const plans = record(current(), 'A002').offers.plans;
  assert.equal(plans.length, 8);
  const first = plans.find(plan => plan.name === 'Smart Access' && plan.billingPeriod === '31天');
  const longer = plans.find(plan => plan.name === 'Smart Access' && plan.billingPeriod === '186天');
  assert.equal(first.amount, 123.33);
  assert.equal(longer.amount, 623.7);
  assert.equal(first.currency, 'CNY');
  assert.equal(longer.currency, 'CNY');
  assert.equal(first.quota, '每31天500G');
  assert.equal(longer.quota, '每31天500G');
  assert.notEqual(longer.amount, 103.95);
  assert.equal(first.priceStatus, 'advertised_not_checkout_verified');
  assert.equal(longer.checkoutVerified, false);
  assert.ok(first.sourceIds.length && longer.sourceIds.length);
});

test('real oixCloud period-wide allowances, sold-out warnings and HTML option basis survive the backend projection', () => {
  const plans = record(current(), 'A015').offers.plans;
  const monthly = plans.find(plan => plan.name === 'Pass Iron' && plan.billingPeriod === '30天');
  const annual = plans.find(plan => plan.name === 'Pass Iron' && plan.billingPeriod === '365天');
  assert.equal(monthly.amount, 20);
  assert.equal(monthly.quota, '150GiB/整期');
  assert.equal(annual.amount, 192);
  assert.equal(annual.quota, '2000GiB/整期');
  assert.match(annual.quotaReset, /不按自然月/);
  assert.equal(monthly.displayBasis, 'server_html_period_option');
  assert.equal(annual.displayBasis, 'visible_html');
  assert.ok(monthly.restrictions.some(value => value.includes('中国大陆')));
  const soldOut = plans.filter(plan => plan.name === 'Pass Alu');
  assert.ok(soldOut.length > 0);
  assert.ok(soldOut.every(plan => plan.restrictions.some(value => value.includes('售罄'))));
  assert.equal(annual.currencyStatus, 'not_confirmed');
  assert.equal(annual.currency, null);
  assert.equal(annual.currencySymbol, '￥');
  assert.ok(annual.currencyReason);
});

test('real SS-ID landing configuration remains distinct from checkout and is not mistaken for a measured service claim', () => {
  for (const id of ['A059', 'A200']) {
    const plans = record(current(), id).offers.plans;
    assert.equal(plans.length, 6);
    assert.ok(plans.every(plan => plan.displayBasis === 'code_config_not_checkout'));
    assert.ok(plans.every(plan => plan.checkoutVerified === false && plan.currencyStatus === 'not_confirmed'));
    assert.ok(plans.every(plan => plan.currency === null && plan.currencySymbol === '¥' && plan.currencyReason));
    const first = plans.find(plan => plan.name === '100G 月流量');
    assert.equal(first.amount, 20);
    assert.equal(first.quota, '每月 100GB 流量，账单日重置');
    assert.ok(plans.find(plan => plan.name.includes('新疆')).restrictions.some(value => value.includes('新疆')));
  }
});

test('real Bitz Net currency ambiguity and promotional publisher performance limits remain explicit', () => {
  const plans = record(current(), 'A189').offers.plans;
  assert.ok(plans.length > 0);
  for (const plan of plans) {
    assert.equal(plan.currencyStatus, 'not_confirmed');
    assert.equal(plan.currency, null);
    assert.equal(plan.currencySymbol, '¥');
    assert.ok(plan.currencyReason);
    assert.equal(plan.terms.speedStatus, 'publisher_claim_not_measured');
    assert.equal(plan.terms.promotion.expiresAt, null);
    assert.equal(plan.terms.promotion.affiliateBinding, null);
  }
});

test('real unknown offers and payments expose gaps rather than zero-price products or confirmed processors', () => {
  const document = current();
  const unknown = document.items.filter(item => item.offers.status === 'not_confirmed');
  assert.ok(unknown.length > 0);
  for (const item of unknown) {
    assert.deepEqual(item.offers.plans, []);
    assert.equal(item.offers.observedAt, null);
    assert.ok(item.missing.length > 0);
  }
  const wget = record(document, 'A001');
  assert.deepEqual(wget.offers.plans, []);
  assert.equal(wget.payment.status, 'not_confirmed');
  assert.deepEqual(wget.payment.methods, []);
  const jms = record(document, 'A023');
  assert.equal(jms.payment.status, 'not_confirmed');
  assert.deepEqual(jms.payment.methods, []);
  assert.match(jms.payment.reason, /PayPal/);
  assert.equal(jms.payment.transactionVerified, false);
});

test('real recent community collection distinguishes unmatched discussion activity from zero complaints and retains unverified outcomes', () => {
  const document = current();
  const empty = document.items.find(item => item.community.matchedStatementCount === 0);
  const withClaims = document.items.find(item => item.community.unverifiedComplaintClueGroups > 0);
  assert.ok(empty && withClaims);
  assert.equal(empty.community.zeroMatchesMeansZeroComplaints, false);
  assert.equal(empty.community.complaintRate, null);
  assert.equal(empty.community.coverage.searchComplete, false);
  assert.ok(empty.community.sourceIds.length > 0);
  for (const item of document.items) {
    const community = item.community;
    assert.equal(community.claimsIndependentlyVerified, false);
    assert.equal(community.zeroMatchesMeansZeroComplaints, false);
    assert.equal(community.complaintRate, null);
    assert.ok(Date.parse(community.windowEnd) > Date.parse(community.windowStart));
    for (const event of community.events) {
      assert.ok(Number.isFinite(Date.parse(event.createdAt)));
      assert.ok(event.sourceId && event.url && event.rawLocator);
      assert.notEqual(event.independentlyVerified, true);
    }
  }
  assert.ok(withClaims.community.events.some(event => event.kind === 'complaint_claim'));
});

test('real community generation preserves both dimensions of a single eggtart statement without duplicating events or groups', historicalCaptureOptions('catalog/refresh/2026-10-26/community/community.json'), () => {
  const { projectCommunityEvent } = require('../scripts/build-current-evidence.cjs');
  const discussion = read('catalog/refresh/2026-10-26/community/community.json').items.find(item => item.recordId === 'A077');
  const events = discussion.events.map(projectCommunityEvent);
  const dual = events.filter(event => event.complaintClue && event.recoveryOrPartialUseClue);
  assert.equal(dual.length, 1);
  assert.equal(dual[0].id, 'GH-COMMENT-6296890854');
  assert.equal(dual[0].kind, 'recovery_claim');
  assert.equal(dual[0].sourceId, 'COMM-20261026-gh-comments-p2');
  assert.equal(dual[0].rawLocator, '/1');
  assert.equal(events.length, discussion.matchedStatementCount);
  assert.equal(new Set(events.map(event => event.id)).size, events.length);
  assert.equal(new Set(events.filter(event => event.complaintClue).map(event => event.sourceGroup)).size, discussion.unverifiedComplaintClueGroups);
  assert.equal(new Set(events.filter(event => event.recoveryOrPartialUseClue).map(event => event.sourceGroup)).size, discussion.recoveryOrPartialUseClueGroups);
});

test('real appended price and complaint references resolve through the same catalog evidence interface', () => {
  const service = makeCatalogService({ baseDir: root });
  const evidence = service.evidence('A002');
  const sourceIds = new Set(evidence.sources.map(source => source.source_id));
  const detail = service.get('A002').currentEvidence;
  for (const plan of detail.offers.plans) for (const id of plan.sourceIds) assert.ok(sourceIds.has(id), id);
  for (const id of detail.community.sourceIds) assert.ok(sourceIds.has(id), id);
  assert.ok(evidence.sources.every(source => source && source.archiveRef));
});

// The following mutations are explicitly SYNTHETIC validation fixtures, not
// observations or claims about a real service. They never write catalog files.
test('synthetic: a price with an invented source reference is rejected rather than silently accepted', () => {
  const document = structuredClone(current());
  record(document, 'A002').offers.plans[0].sourceIds.push('SYNTHETIC-MISSING-SOURCE');
  assert.throws(() => validateCurrentEvidence(document, catalogIds), /Unknown refresh source/);
});

test('synthetic: nonnumeric, missing, negative and nonfinite observed amounts are rejected', () => {
  for (const amount of [null, '123.33', -1, NaN, Infinity]) {
    const document = structuredClone(current());
    record(document, 'A002').offers.plans[0].amount = amount;
    assert.throws(() => validateCurrentEvidence(document, catalogIds), /Missing observed price/, String(amount));
  }
});

test('synthetic: incomplete coverage, false checkout verification and a fake verifiedPrice field fail closed', () => {
  const missing = structuredClone(current()); missing.items.pop();
  assert.throws(() => validateCurrentEvidence(missing, catalogIds), /complete catalog/);
  const checkout = structuredClone(current()); record(checkout, 'A002').offers.checkoutVerified = true;
  assert.throws(() => validateCurrentEvidence(checkout, catalogIds));
  const price = structuredClone(current()); record(price, 'A002').offers.plans[0].verifiedPrice = 123.33;
  assert.throws(() => validateCurrentEvidence(price, catalogIds), /No checkout verification/);
});
