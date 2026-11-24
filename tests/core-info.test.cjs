'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeCoreInfo } = require('../lib/core-info.cjs');

const root = path.resolve(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const catalog = read('catalog/catalog.v1.json').catalog;
const current = new Map(read('catalog/current-evidence.v1.json').items.map(row => [row.recordId, row]));
const actual = id => ({ ...catalog.find(row => row.id === id), currentEvidence: current.get(id) });
const AS_OF = '2026-10-26T08:00:00.000Z';
test('synthetic: compatibility provenance retains all references including a seventh revision source',()=>{
 const ids=Array.from({length:8},(_,i)=>'SYNTHETIC-SOURCE-'+i);
 const info=makeCoreInfo({...actual('A002'),id:'SYNTHETIC-PROVENANCE',coreSupplement:{compatibility:{summary:'SYNTHETIC operator requirements',requirements:['SYNTHETIC retained context'],observedAt:AS_OF,sourceIds:ids,independentlyTested:false}}},{asOf:AS_OF});
 assert.deepEqual(info.compatibility.sourceIds,ids);assert.equal(info.compatibility.observedAt,AS_OF);assert.equal(info.compatibility.independentlyTested,false);
});

// All fixtures below named SYNTHETIC are generated solely to exercise boundary
// behavior. They are never written into the catalog or described as observations.
const synthetic = extra => ({ id: 'SYNTHETIC', name: 'Synthetic service', category: 'airport', ...extra });
const deepFreeze = value => {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(deepFreeze); }
  return value;
};

test('real: the core projection covers all 215 records with explicit gaps and no forecast/domain/hash payload', () => {
  assert.equal(catalog.length, 215);
  for (const raw of catalog) {
    const result = makeCoreInfo({ ...raw, currentEvidence: current.get(raw.id) }, { asOf: AS_OF });
    assert.equal(result.id, raw.id);
    assert.ok(result.name && result.category && result.lastChecked);
    assert.ok(result.website && result.pricing && result.payment && result.speed && result.stability && result.operatingHistory);
    assert.ok(result.refund && result.trial && result.privacy && result.compatibility && Array.isArray(result.promotions));
    assert.ok(result.gaps.length > 0);
    assert.ok(result.sourceIds.length <= 6);
    for (const field of ['forecast', 'domainObservations', 'pageObservations', 'provenanceIds', 'dataGaps', 'sha256', 'evidenceGrade', 'futureUsabilityGrade']) assert.equal(Object.hasOwn(result, field), false, raw.id + ':' + field);
    assert.equal(result.speed.measured.status, 'not_confirmed');
    assert.equal(result.stability.measured.status, 'not_confirmed');
    assert.equal(result.operatingHistory.startDate, null);
    assert.equal(result.operatingHistory.isEstablished, null);
    assert.equal(result.payment.transactionVerified, false);
  }
});

test('real: Nexitally original 31/186-day totals, quotas, device count and paid add-on distinction survive', () => {
  const result = makeCoreInfo(actual('A002'));
  const first = result.pricing.plans.find(plan => plan.name === 'Smart Access' && plan.billingPeriod === '31天');
  const longer = result.pricing.plans.find(plan => plan.name === 'Smart Access' && plan.billingPeriod === '186天');
  assert.equal(first.amount, 123.33);
  assert.equal(longer.amount, 623.7);
  assert.equal(longer.amountBasis, 'original_billing_period_total');
  assert.equal(longer.quota, '每31天500G');
  assert.equal(first.maxDevices, 2);
  assert.equal(first.currency, 'CNY');
  assert.equal(longer.checkoutVerified, false);
  assert.ok(result.pricing.plans.some(plan => plan.addon === true));
});

test('real: JMS numeric device strings and the unlimited symbol retain their sourced meanings', () => {
  const raw = actual('A023');
  const plans = makeCoreInfo(raw).pricing.plans;
  const stated = raw.currentEvidence.offers.plans;
  assert.equal(stated.filter(plan => typeof plan.maxDevices === 'string').length, 17);
  assert.ok(stated.some(plan => plan.maxDevices === '∞'));
  for (const [index, source] of stated.entries()) {
    const plan = plans[index];
    assert.deepEqual(plan.sourceIds, source.sourceIds);
    if (/^[1-9]\d*$/.test(source.maxDevices)) assert.equal(plan.maxDevices, Number(source.maxDevices));
    else {
      assert.equal(source.maxDevices, '∞');
      assert.equal(plan.maxDevices, null);
      assert.equal(plan.deviceLimit, source.maxDevices);
    }
  }
  assert.equal(makeCoreInfo(raw).gaps.includes('部分套餐设备限制未确认'), false);
});

test('real: oixCloud period-wide allowances, sold-out warnings, fees and currency ambiguity survive', () => {
  const result = makeCoreInfo(actual('A015'));
  const annual = result.pricing.plans.find(plan => plan.name === 'Pass Iron' && plan.billingPeriod === '365天');
  assert.equal(annual.amount, 192);
  assert.equal(annual.quota, '2000GiB/整期');
  assert.match(annual.quotaReset, /不按自然月/);
  assert.equal(annual.currency, null);
  assert.equal(annual.currencySymbol, '￥');
  assert.ok(annual.currencyReason);
  assert.ok(result.pricing.plans.filter(plan => plan.name === 'Pass Alu').every(plan => plan.soldOut === true));
  assert.ok(result.pricing.plans.some(plan => plan.additionalCharges?.perGiB === 0.8));
  assert.ok(result.promotions.some(promotion => promotion.label?.includes('10%')));
});

test('real: image, help and explicit payment text remain distinct evidence levels', () => {
  const logo = makeCoreInfo(actual('A002')).payment;
  const help = makeCoreInfo(actual('A015')).payment;
  const text = makeCoreInfo(actual('A189')).payment;
  assert.equal(logo.evidenceLevel, 'image_only');
  assert.equal(help.evidenceLevel, 'help_reference');
  assert.equal(text.evidenceLevel, 'public_text');
  for (const payment of [logo, help, text]) {
    assert.ok(payment.methods.length > 0);
    assert.equal(payment.transactionVerified, false);
    assert.equal(payment.checkoutObserved, false);
  }
  assert.equal(text.processorClaim, 'Stripe');
  assert.equal(makeCoreInfo(actual('A023')).payment.evidenceLevel, 'unknown');
  assert.deepEqual(makeCoreInfo(actual('A023')).payment.methods, []);
});

test('real: Bitz advertised Mbps and refund terms do not become measured speed or refund execution', () => {
  const result = makeCoreInfo(actual('A189'));
  assert.deepEqual(result.speed.advertised.map(value => value.advertisedSpeedMbps), [500, 100]);
  assert.ok(result.speed.advertised.every(value => value.status === 'publisher_claim_not_measured'));
  assert.deepEqual(result.speed.measured.observations, []);
  assert.match(result.refund.summary, /账户余额|帳戶餘額/);
  assert.equal(result.refund.executionVerified, false);
  assert.equal(result.trial.status, 'not_confirmed');
});

test('real: retained authenticated shop observations preserve ByWave starting prices and SpeedCAT payment limits', () => {
  const authRoot = 'catalog/refresh/2026-10-26/core-auth/';
  const claims = read(authRoot + 'claims.json').records;
  const authSources = new Map(read(authRoot + 'sources.json').sources.map(source => [source.source_id, source]));
  const sourceRecord = id => claims.find(row => row.recordId === id);
  const project = id => makeCoreInfo({ ...actual(id), coreSupplement: sourceRecord(id) });
  const retained = sourceId => read(authRoot + authSources.get(sourceId).originalContainers[0].archiveEntry);
  const bywave = project('A018'), speedcat = project('A006');
  const cards = retained('CORE-AUTH-BYWAVE-PLANS').cards;
  assert.equal(bywave.pricing.plans.length, 4);
  for (const [index, amount] of [30, 60, 110].entries()) {
    const plan = bywave.pricing.plans[index];
    assert.ok(cards[index].text.includes('¥' + amount.toFixed(2) + '/月起'));
    assert.equal(plan.amount, amount);
    assert.equal(plan.billingPeriod, '月起');
    assert.equal(plan.amountBasis, 'advertised_starting_price_not_period_total');
    assert.match(plan.displayBasis, /起价|起/);
    assert.deepEqual(plan.sourceIds, ['CORE-AUTH-BYWAVE-PLANS']);
    assert.equal(plan.checkoutVerified, false);
  }
  assert.equal(bywave.pricing.plans[3].amount, 140);
  assert.equal(bywave.pricing.plans[3].billingPeriod, '年');
  assert.equal(bywave.pricing.plans[3].amountBasis, 'original_billing_period_total');
  assert.equal(speedcat.pricing.plans.length, 11);
  assert.ok(speedcat.pricing.plans.every(plan => plan.currency === null && plan.currencySymbol === '¥' && plan.currencyStatus === 'not_confirmed'));
  assert.ok(speedcat.pricing.plans.every(plan => plan.currencyReason && plan.checkoutVerified === false));
  assert.match(retained('CORE-AUTH-SPEED-PAYMENT').paymentSectionText, /支付宝/);
  assert.equal(speedcat.payment.evidenceLevel, 'authenticated_checkout');
  assert.equal(speedcat.payment.checkoutObserved, true);
  assert.deepEqual(speedcat.payment.methods, ['支付宝']);
  assert.deepEqual(speedcat.payment.sourceIds, ['CORE-AUTH-SPEED-PAYMENT']);
  assert.equal(speedcat.payment.transactionVerified, false);
  assert.equal(bywave.payment.evidenceLevel, 'unknown');
  assert.equal(bywave.payment.transactionVerified, false);
  for (const result of [speedcat, bywave]) {
    assert.deepEqual(result.speed.measured.observations, []);
    assert.deepEqual(result.stability.measured.observations, []);
    assert.ok(result.speed.advertised.length > 0);
    assert.ok(result.speed.advertised.every(claim => claim.status === 'publisher_claim_not_measured'));
  }
});

test('real: Mesl retained terms expose access-metadata logging as a separate unaudited privacy policy', () => {
  const base = 'catalog/refresh/2026-10-26/core-auth-batch2/';
  const source = read(base + 'sources.json').sources.find(item => item.source_id === 'CORE-AUTH-MESL-B2-TERMS');
  assert.ok(source);
  const bytes = fs.readFileSync(path.join(root, base, source.originalContainers[0].archiveEntry));
  assert.equal(require('node:crypto').createHash('sha256').update(bytes).digest('hex'), source.sha256);
  const retained = bytes.toString('utf8');
  const claim = read(base + 'claims.json').records.find(item => item.recordId === 'A017');
  assert.ok(claim.privacy);
  const { summary, loggedData } = claim.privacy;
  assert.equal(loggedData.length, 4);
  for (const category of loggedData) assert.ok(retained.replace(/\s/g, '').includes(category.replace(/\s/g, '')));
  const result = makeCoreInfo({ ...actual('A017'), coreSupplement: claim });
  assert.equal(result.privacy.status, 'operator_policy_observed');
  assert.equal(result.privacy.summary, summary);
  assert.deepEqual(result.privacy.loggedData, loggedData);
  assert.equal(result.privacy.retentionPeriod, null);
  assert.equal(result.privacy.independentlyAudited, false);
  assert.equal(result.privacy.observedAt, source.last_capture_at);
  assert.deepEqual(result.privacy.sourceIds, [source.source_id]);
  assert.ok(result.sourceIds.includes(source.source_id));
  assert.notEqual(result.refund.summary, result.privacy.summary);
  assert.equal(result.payment.transactionVerified, false);
  assert.deepEqual(result.speed.measured.observations, []);
  assert.deepEqual(result.stability.measured.observations, []);
});

test('real: SNTP notice client/configuration requirements stay sourced and untested without inventing a year or operating start', () => {
  const base = 'catalog/refresh/2026-10-26/core-auth-batch3/';
  const source = read(base + 'sources.json').sources.find(item => item.source_id === 'CORE-AUTH-SHOU-B3-NOTICE');
  assert.ok(source);
  const bytes = fs.readFileSync(path.join(root, base, source.originalContainers[0].archiveEntry));
  assert.equal(require('node:crypto').createHash('sha256').update(bytes).digest('hex'), source.sha256);
  const notice = JSON.parse(bytes.toString('utf8')).text;
  for (const requirement of ['旧版本即将停止支持', '首选官方客户端', 'Mihomo / Clash Meta', '完整配置订阅', 'DNS 配置']) assert.ok(notice.includes(requirement));
  const requirements = notice.split(/\r?\n/).filter(line => /旧版本即将停止支持|首选官方客户端|Mihomo \/ Clash Meta|DNS 配置/.test(line));
  const compatibility = { summary: '站方要求升级旧版客户端，并建议官方客户端或Mihomo/Clash Meta完整配置及DNS设置。', requirements, observedAt: source.last_capture_at, sourceIds: [source.source_id] };
  const result = makeCoreInfo({ ...actual('A042'), coreSupplement: { compatibility } });
  assert.equal(result.compatibility.status, 'operator_requirements_observed');
  assert.deepEqual(result.compatibility.requirements, requirements);
  assert.equal(result.compatibility.observedAt, source.last_capture_at);
  assert.deepEqual(result.compatibility.sourceIds, [source.source_id]);
  assert.equal(result.compatibility.independentlyTested, false);
  assert.ok(result.sourceIds.includes(source.source_id));
  assert.deepEqual(result.speed.measured.observations, []);
  assert.deepEqual(result.stability.measured.observations, []);
  assert.equal(result.operatingHistory.startDate, null);
  assert.equal(result.operatingHistory.earliestEvidenceAt, null);
  assert.equal(result.operatingHistory.yearsSinceStart, null);
});

test('real: original-author speed reports retain node counts, dates and raw metric strings in an unverified DTO without domain admission', () => {
  const base = 'catalog/refresh/2026-10-26/core-speed-batch3/';
  const reports = read(base + 'reports.json').reports;
  const sources = new Map(read(base + 'sources.json').sources.map(source => [source.sourceId, source]));
  for (const [recordId, nodeCount] of [['A176',55],['A049',52]]) {
    const raw = reports.find(report => report.recordId === recordId);
    assert.ok(raw);
    for (const id of raw.sourceIds) {
      const source = sources.get(id);assert.ok(source);
      const bytes = fs.readFileSync(path.join(root, base, source.bodyPath));
      assert.equal(require('node:crypto').createHash('sha256').update(bytes).digest('hex'), source.sha256);
    }
    // Only project retained fields here. This fixture does not admit the report's
    // service identity; that binding belongs to the separately reviewed inputs.
    const input = { publisher: raw.author, summary: '原作者报告字段，未独立复现或裁定服务身份。', sourceIds: raw.sourceIds, observedAt: raw.capturedAtUtc,
      testedAt: raw.testTime.local, publisherDate: raw.publishedAt, region: raw.probe.region,
      network: [raw.probe.operator,raw.probe.accessLine].filter(Boolean).join(' / '), timeWindow: raw.testTime.raw,
      nodeCount: raw.sampleSize.totalNodes, methodology: raw.method.description,
      metrics: raw.metrics.map(metric => ({ label: [metric.name,metric.statistic,metric.scope].filter(Boolean).join(' / '), valueText: metric.rawDisplay })),
      affiliateBinding: raw.affiliation.referralObserved, limitations: [...raw.limitations,...raw.missingEvidence] };
    const result = makeCoreInfo(synthetic({ coreSupplement: { speed: { externalReports: [input] } } }));
    const report = result.speed.externalReports[0];
    assert.equal(report.status, 'unverified_third_party_report');assert.equal(report.nodeCount,nodeCount);assert.equal(report.sampleCount,null);
    assert.equal(report.testedAt,raw.testTime.local);assert.equal(report.publishedAt,raw.publishedAt);
    assert.deepEqual(report.metrics.map(metric=>metric.valueText),raw.metrics.map(metric=>metric.rawDisplay));
    assert.equal(report.affiliateBinding,raw.affiliation.referralObserved);assert.deepEqual(report.limitations,input.limitations);
    assert.equal(result.speed.status,'not_measured');assert.deepEqual(result.speed.measured.observations,[]);
    assert.deepEqual(result.speed.advertised,[]);assert.equal(result.operatingHistory.startDate,null);
    if(recordId==='A049') {
      assert.equal(report.publishedAt,'2025-10-06');assert.ok(report.testedAt.startsWith('2025-10-05'));
      assert.ok(report.metrics.some(metric=>metric.valueText==='122.11MB'));
      assert.ok(report.limitations.some(value=>/一年以上/.test(value)));
    }
  }
});

test('real: recent issue/recovery statements cannot become uptime, complaint rate or continuous operation', () => {
  const withEvents = [...current.values()].find(row => row.community.events.some(event => event.kind === 'complaint_claim'));
  const result = makeCoreInfo(actual(withEvents.recordId), { asOf: AS_OF });
  assert.ok(result.stability.recentIssues.length > 0);
  assert.ok(result.stability.recentIssues.every(event => event.independentlyVerified === false));
  assert.equal(result.stability.complaintRate, null);
  assert.equal(result.stability.zeroMatchesMeansZeroComplaints, false);
  assert.equal(result.stability.searchComplete, false);
  assert.deepEqual(result.stability.measured.observations, []);
  assert.equal(result.operatingHistory.continuousOperationVerified, false);
});

test('real: one eggtart statement with both clue labels appears once in each view without becoming independent complaints', () => {
  const { projectCommunityEvent } = require('../scripts/build-current-evidence.cjs');
  const discussion = read('catalog/refresh/2026-10-26/community/community.json').items.find(item => item.recordId === 'A077');
  const raw = actual('A077');
  const events = discussion.events.map(projectCommunityEvent);
  const result = makeCoreInfo({ ...raw, currentEvidence: { ...raw.currentEvidence, community: { ...raw.currentEvidence.community, events } } }, { asOf: AS_OF });
  const issue = result.stability.recentIssues;
  const recovery = result.stability.recoveryClues;
  assert.equal(issue.length, 1);
  assert.equal(recovery.length, 1);
  assert.equal(issue[0].id, 'GH-COMMENT-6296890854');
  assert.equal(issue[0].id, recovery[0].id);
  assert.equal(issue[0].sourceGroup, recovery[0].sourceGroup);
  assert.equal(issue[0].relation, 'same_thread_context_only');
  assert.equal(issue[0].independentlyVerified, false);
  assert.equal(recovery[0].independentlyVerified, false);
  assert.equal(result.stability.complaintRate, null);
  assert.deepEqual(result.stability.measured.observations, []);
});

test('real: retained Nexitally/JMS historical material and Bitz duration claim retain their original meanings', () => {
  const history = read('catalog/refresh/2026-10-26/core-history/claims.json');
  const lookup = id => makeCoreInfo({ ...actual(id), coreSupplement: { operatingHistory: history.claims.find(claim => claim.recordIds.includes(id)) } }, { asOf: AS_OF }).operatingHistory;
  const nx = lookup('A002'), jms = lookup('A023'), bitz = lookup('A189'), wget = lookup('A001');
  assert.equal(nx.earliestEvidenceAt, '2020-01-27T08:10:52+00:00');
  assert.equal(nx.elapsedSinceEarliestEvidence.fullYears, 6);
  assert.equal(jms.earliestEvidenceAt, '2018-11-25');
  assert.equal(jms.elapsedSinceEarliestEvidence.fullYears, 7);
  assert.match(bitz.claimText, /8/);
  assert.equal(bitz.earliestEvidenceAt, null);
  assert.ok(wget.basis);
  assert.equal(wget.startDate, null);
  for (const projected of [nx, jms, bitz, wget]) {
    assert.equal(projected.startDate, null);
    assert.equal(projected.claimedFoundedAt, null);
    assert.equal(projected.yearsSinceStart, null);
    assert.equal(projected.continuousOperationVerified, false);
    assert.equal(projected.isEstablished, null);
  }
});

test('synthetic: empty input makes unknowns explicit without zero-price or legacy-payment inventions', () => {
  const result = makeCoreInfo(synthetic({ legacyClaims: { price: '1/月', speed: '999MB/s', payments: ['SYNTHETIC_PAY'] } }));
  assert.equal(result.lastChecked, null);
  assert.equal(result.asOf, null);
  assert.deepEqual(result.pricing.plans, []);
  assert.deepEqual(result.payment.methods, []);
  assert.equal(result.speed.historicalClaims[0].status, 'unverified_legacy_claim_not_current_measurement');
  assert.deepEqual(result.speed.measured.observations, []);
  assert.ok(result.gaps.includes('当前套餐价格未确认'));
});

test('synthetic: privacy requires summary, source and observation time and publisher no-log claims never become independent audits', () => {
  const policy = { summary: 'SYNTHETIC publisher no-log statement', loggedData: [], retentionPeriod: null, independentlyAudited: true, observedAt: AS_OF, sourceIds: ['SYNTHETIC-PRIVACY'] };
  const project = extra => makeCoreInfo(synthetic({ coreSupplement: { privacy: { ...policy, ...extra } } })).privacy;
  assert.equal(project({}).status, 'operator_policy_observed');
  assert.equal(project({}).independentlyAudited, false);
  assert.deepEqual(project({}).loggedData, []);
  assert.equal(project({}).retentionPeriod, null);
  for (const incomplete of [{ summary: null }, { sourceIds: [] }, { observedAt: null }, { observedAt: 'SYNTHETIC-invalid-date' }]) {
    assert.deepEqual(project(incomplete), { status: 'not_confirmed', summary: null, loggedData: [], retentionPeriod: null, independentlyAudited: false, observedAt: null, sourceIds: [] });
  }
});

test('synthetic: compatibility needs dated sources and requirements never become independently tested performance', () => {
  const requirement = { summary: 'SYNTHETIC publisher client requirements', requirements: ['SYNTHETIC full configuration and DNS'], observedAt: AS_OF, sourceIds: ['SYNTHETIC-COMPAT'], independentlyTested: true };
  const project = extra => makeCoreInfo(synthetic({ coreSupplement: { compatibility: { ...requirement, ...extra } } }));
  const result = project({});
  assert.equal(result.compatibility.status, 'operator_requirements_observed');
  assert.deepEqual(result.compatibility.requirements, requirement.requirements);
  assert.equal(result.compatibility.independentlyTested, false);
  assert.ok(result.sourceIds.includes('SYNTHETIC-COMPAT'));
  assert.deepEqual(result.speed.measured.observations, []);
  assert.deepEqual(result.stability.measured.observations, []);
  for (const incomplete of [{ summary: null }, { sourceIds: [] }, { observedAt: null }, { observedAt: 'SYNTHETIC-invalid-time' }]) {
    assert.deepEqual(project(incomplete).compatibility, { status: 'not_confirmed', summary: null, requirements: [], observedAt: null, sourceIds: [], independentlyTested: false });
  }
});

test('real: retained compatibility conditions reach the public contract without recapture or measurement promotion', () => {
  const supplement = read('catalog/core-supplement.v1.json');
  const affected = supplement.records.filter(row => Array.isArray(row.compatibility?.conditions) && row.compatibility.conditions.length);
  assert.ok(affected.some(row => row.recordId === 'A164'));
  assert.ok(affected.some(row => row.recordId === 'A165'));
  for (const row of affected) {
    const before = structuredClone(row);
    const result = makeCoreInfo({ ...actual(row.recordId), coreSupplement: row });
    for (const condition of row.compatibility.conditions) assert.ok(result.compatibility.requirements.includes(condition));
    assert.equal(result.compatibility.observedAt, row.compatibility.observedAt);
    assert.deepEqual(result.compatibility.sourceIds, row.compatibility.sourceIds);
    assert.equal(result.compatibility.independentlyTested, false);
    assert.deepEqual(row, before);
  }
});

test('synthetic: compatibility aliases deduplicate and remain hidden without dated source evidence', () => {
  const value = { summary: 'SYNTHETIC terms', requirements: ['SYNTHETIC shared'], conditions: ['SYNTHETIC shared', 'SYNTHETIC legacy condition'], sourceIds: ['SYNTHETIC-SOURCE'], observedAt: AS_OF };
  const project = extra => makeCoreInfo(synthetic({ coreSupplement: { compatibility: { ...value, ...extra } } })).compatibility;
  assert.deepEqual(project({}).requirements, ['SYNTHETIC shared', 'SYNTHETIC legacy condition']);
  for (const incomplete of [{ sourceIds: [] }, { observedAt: null }, { summary: null }]) assert.deepEqual(project(incomplete).requirements, []);
});

test('synthetic: external speed reports preserve raw units, separate dates and node counts without creating measurements', () => {
  const input = { publisher: 'SYNTHETIC review author', summary: 'SYNTHETIC retained third-party report', observedAt: AS_OF, sourceIds: ['SYNTHETIC-REVIEW'],
    publishedAt: '2025-10-05', testedAt: null, region: 'SYNTHETIC region', network: 'SYNTHETIC 2Gbps access', timeWindow: null,
    nodeCount: 52, threads: 6, testCount: 52, methodology: null, metrics: [{ label: 'SYNTHETIC download', valueText: '123.45 原单位待确认' }],
    affiliateBinding: false, limitations: ['SYNTHETIC old report; sample protocol absent'], status: 'qualified_measurement', independentlyVerified: true };
  const record = synthetic({ coreSupplement: { speed: { externalReports: [input], advertised: [{ summary: 'SYNTHETIC publisher speed limit', sourceIds: ['SYNTHETIC-AD'] }] } } });
  const result = makeCoreInfo(record),report = result.speed.externalReports[0];
  assert.equal(report.status, 'unverified_third_party_report');
  for (const key of ['publisher','summary','publishedAt','testedAt','region','network','timeWindow','nodeCount','methodology','affiliateBinding']) assert.equal(report[key], input[key]);
  assert.deepEqual(report.metrics, input.metrics);assert.deepEqual(report.limitations, input.limitations);
  assert.equal(report.sampleCount, null);assert.equal(Object.hasOwn(report, 'independentlyVerified'), false);
  assert.equal(result.speed.status, 'not_measured');assert.deepEqual(result.speed.measured.observations, []);
  assert.equal(result.speed.advertised.length, 1);assert.ok(result.sourceIds.includes('SYNTHETIC-REVIEW'));
  const alias = makeCoreInfo(synthetic({ coreSupplement: { speed: { reports: [input] } } }));
  assert.deepEqual(alias.speed.externalReports, result.speed.externalReports);
});

test('synthetic: external reports need publisher, summary, sources and capture time and do not infer missing date/unit fields', () => {
  const base = { publisher: 'SYNTHETIC author', summary: 'SYNTHETIC report', sourceIds: ['SYNTHETIC-REVIEW'], observedAt: AS_OF };
  const project = extra => makeCoreInfo(synthetic({ coreSupplement: { speed: { externalReports: [{ ...base, ...extra }] } } })).speed.externalReports;
  for (const incomplete of [{ publisher: null }, { summary: null }, { sourceIds: [] }, { observedAt: null }, { observedAt: 'SYNTHETIC-invalid-time' }]) assert.deepEqual(project(incomplete), []);
  const report = project({ testedAt: '10-05', publishedAt: '2025', nodeCount: '55', metrics: [{ label: 'SYNTHETIC numeric only', valueText: 123 }], affiliateBinding: 'SYNTHETIC possible affiliate' })[0];
  assert.equal(report.testedAt, null);assert.equal(report.publishedAt, null);assert.equal(report.nodeCount, null);
  assert.equal(report.network, null);assert.equal(report.methodology, null);assert.deepEqual(report.metrics, []);
  assert.equal(report.affiliateBinding, 'SYNTHETIC possible affiliate');
  const explicit = project({ publisherDate: '2025-10-06', testedAt: '2025-10-05', sampleCount: 12 })[0];
  assert.equal(explicit.publishedAt, '2025-10-06');assert.equal(explicit.testedAt, '2025-10-05');assert.equal(explicit.sampleCount, 12);
});

test('synthetic: logged-in payment options upgrade observation only and require date, source and named methods', () => {
  const base = { methods: ['SYNTHETIC_PAY'], evidenceLevel: 'authenticated_checkout', observedAt: AS_OF, sourceIds: ['SYNTHETIC-PAY'], transactionVerified: true };
  const result = makeCoreInfo(synthetic({ coreSupplement: { checkedAt: AS_OF, payment: base } }));
  assert.equal(result.payment.evidenceLevel, 'authenticated_checkout');
  assert.equal(result.payment.checkoutObserved, true);
  assert.equal(result.payment.transactionVerified, false);
  for (const missing of ['sourceIds', 'observedAt', 'methods']) {
    const incomplete = { ...base }; delete incomplete[missing];
    const projected = makeCoreInfo(synthetic({ coreSupplement: { payment: incomplete } }));
    assert.equal(projected.payment.evidenceLevel, 'unknown');
    assert.deepEqual(projected.payment.methods, []);
  }
});

test('synthetic: invalid/unsourced price cannot become a known amount and supplemental fee/term details are whitelisted', () => {
  for (const amount of [-1, Infinity, NaN, '9.99', null]) {
    const result = makeCoreInfo(synthetic({ coreSupplement: { pricing: { plans: [{ name: 'SYNTHETIC', amount, billingPeriod: '186天', sourceIds: ['SYNTHETIC-PRICE'] }] } } }));
    assert.equal(result.pricing.plans[0].amount, null);
    assert.equal(result.pricing.status, 'not_confirmed');
  }
  const result = makeCoreInfo(synthetic({ coreSupplement: { pricing: { plans: [{ name: 'SYNTHETIC', amount: 0, billingPeriod: '1天', sourceIds: ['SYNTHETIC-PRICE'], checkoutVerified: true, additionalCharges: { perGiB: 2, cookie: 'SYNTHETIC_SECRET' } }] } } }));
  assert.equal(result.pricing.plans[0].amount, 0);
  assert.equal(result.pricing.plans[0].checkoutVerified, false);
  assert.equal(Object.hasOwn(result.pricing.plans[0].additionalCharges, 'cookie'), false);
  const unsourced = makeCoreInfo(synthetic({ coreSupplement: { pricing: { plans: [{ name: 'SYNTHETIC', amount: 9, billingPeriod: '月' }] } } }));
  assert.equal(unsourced.pricing.plans[0].amount, null);
});

test('synthetic: starting-price basis still needs amount, billing period and sources and cannot accept invented verification enums', () => {
  const base = { name: 'SYNTHETIC starting price', amount: 30, amountBasis: 'advertised_starting_price_not_period_total', billingPeriod: '月起', sourceIds: ['SYNTHETIC-PRICE'] };
  const project = extra => makeCoreInfo(synthetic({ coreSupplement: { pricing: { plans: [{ ...base, ...extra }] } } })).pricing.plans[0];
  assert.equal(project({}).amountBasis, base.amountBasis);
  for (const incomplete of [{ amount: -1 }, { billingPeriod: null }, { sourceIds: [] }]) {
    const plan = project(incomplete);
    assert.equal(plan.amount, null);
    assert.equal(plan.amountBasis, 'not_confirmed');
  }
  const invented = project({ amountBasis: 'checkout_verified' });
  assert.equal(invented.amountBasis, 'not_confirmed');
  assert.equal(invented.priceStatus, 'advertised_not_checkout_verified');
  assert.equal(invented.checkoutVerified, false);
});

test('synthetic: measurements need provenance, network/time/method/sample context and keep peak-window scope', () => {
  const measurement = { downloadMbps: 123, uploadMbps: 12, testedAt: '2026-10-25T13:00:00Z', network: 'SYNTHETIC ISP', region: 'SYNTHETIC REGION', methodology: 'SYNTHETIC method', sampleCount: 3, peakHours: 'SYNTHETIC 20:00–22:00 UTC+8', sourceIds: ['SYNTHETIC-MEASURE'] };
  const stability = { ...measurement, availabilityPct: 98, packetLossPct: 1, windowStart: '2026-10-24T00:00:00Z', windowEnd: '2026-10-25T23:00:00Z' };
  const result = makeCoreInfo(synthetic({ coreSupplement: { speed: { measurements: [measurement] }, stability: { measurements: [stability] } } }), { asOf: AS_OF });
  assert.equal(result.speed.measured.observations[0].downloadMbps, 123);
  assert.equal(result.stability.measured.observations[0].availabilityPct, 98);
  assert.equal(result.stability.measured.observations[0].peakHours, measurement.peakHours);
  for (const missing of ['sourceIds', 'testedAt', 'sampleCount', 'methodology', 'network']) {
    const incomplete = { ...measurement }; delete incomplete[missing]; if (missing === 'network') delete incomplete.region;
    const projected = makeCoreInfo(synthetic({ coreSupplement: { speed: { measurements: [incomplete] } } }), { asOf: AS_OF });
    assert.equal(projected.speed.measured.observations.length, 0, missing);
    assert.equal(projected.speed.measured.rejectedObservationCount, 1);
  }
  const future = makeCoreInfo(synthetic({ coreSupplement: { speed: { measurements: [{ ...measurement, testedAt: '2027-01-01' }] }, stability: { measurements: [{ ...stability, availabilityPct: 101, packetLossPct: -1 }] } } }), { asOf: AS_OF });
  assert.equal(future.speed.measured.observations.length, 0);
  assert.equal(future.stability.measured.observations.length, 0);
});

test('synthetic: recent-month inclusion uses statement creation, excludes older/future events and retains relation cautions', () => {
  const issue = { summary: 'SYNTHETIC issue statement', sourceIds: ['SYNTHETIC-ISSUE'], createdAt: '2026-10-25T00:00:00Z', relation: 'same_thread_context_only', independentlyVerified: false };
  const result = makeCoreInfo(synthetic({ coreSupplement: { stability: { recentIssues: [issue, { ...issue, createdAt: '2026-01-01', editedAt: AS_OF }, { ...issue, createdAt: '2027-01-01' }], recoveryClues: [{ ...issue, summary: 'SYNTHETIC recovery' }] } } }), { asOf: AS_OF });
  assert.equal(result.stability.recentIssues.length, 1);
  assert.equal(result.stability.recoveryClues.length, 1);
  assert.equal(result.stability.recentIssues[0].relation, 'same_thread_context_only');
  assert.equal(result.stability.recentIssues[0].independentlyVerified, false);
});

test('synthetic: operating-age calculation needs sourced business start and never uses domain creation', () => {
  const record = synthetic({ domainObservations: [{ registeredAt: '1999-01-01' }], coreSupplement: { operatingHistory: { startedAt: '2017-10-27', basis: 'SYNTHETIC opening announcement', claimType: 'operator_announcement', sourceIds: ['SYNTHETIC-HISTORY'] } } });
  const result = makeCoreInfo(record, { asOf: AS_OF }).operatingHistory;
  assert.equal(result.startDate, '2017-10-27');
  assert.equal(result.yearsSinceStart, 8);
  assert.equal(result.continuousOperationVerified, false);
  assert.equal(result.isEstablished, null);
  const domain = makeCoreInfo(synthetic({ coreSupplement: { operatingHistory: { startedAt: '1999-01-01', basis: 'SYNTHETIC domain registration', claimType: 'domain_registration', sourceIds: ['SYNTHETIC-RDAP'], continuousOperationVerified: true } } }), { asOf: AS_OF }).operatingHistory;
  assert.equal(domain.startDate, null);
  assert.equal(domain.yearsSinceStart, null);
  assert.equal(domain.isEstablished, null);
  assert.equal(makeCoreInfo(synthetic({ domainObservations: record.domainObservations }), { asOf: AS_OF }).operatingHistory.startDate, null);
});

test('synthetic: year-only history keeps date precision; established assessment requires independent continuity fields and a criterion', () => {
  const history = { startYear: 2017, basis: 'SYNTHETIC opening-year statement', sourceIds: ['SYNTHETIC-HISTORY'], continuousOperationVerified: true, establishedAssessment: { value: true, criterion: 'SYNTHETIC explicit criterion', sourceIds: ['SYNTHETIC-ASSESSMENT'] } };
  const result = makeCoreInfo(synthetic({ coreSupplement: { operatingHistory: history } }), { asOf: AS_OF }).operatingHistory;
  assert.equal(result.startDate, null);
  assert.equal(result.yearsSinceStart, null);
  assert.deepEqual(result.yearRange, [8, 9]);
  assert.equal(result.continuousOperationVerified, false);
  assert.equal(result.isEstablished, null);
  const complete = makeCoreInfo(synthetic({ coreSupplement: { operatingHistory: { ...history, continuityBasis: 'SYNTHETIC continuity record', continuitySourceIds: ['SYNTHETIC-CONTINUITY'] } } }), { asOf: AS_OF }).operatingHistory;
  assert.equal(complete.continuousOperationVerified, true);
  assert.equal(complete.isEstablished, true);
  assert.equal(complete.establishedCriterion, 'SYNTHETIC explicit criterion');
});

test('synthetic: retained historic announcement and duration claim do not become founded date or continuous operation', () => {
  const historical = { earliestRetainedOperationalEvidenceAt: '2018-11-25', earliestRetainedOperationalEvidenceAtPrecision: 'day', historicalEvidenceNature: 'SYNTHETIC current self-dated announcement', basis: 'SYNTHETIC retained public announcement', claimStatus: 'documented', sourceIds: ['SYNTHETIC-HISTORY'], claimedFoundedAt: null };
  const result = makeCoreInfo(synthetic({ coreSupplement: { operatingHistory: historical } }), { asOf: AS_OF }).operatingHistory;
  assert.equal(result.earliestEvidenceAt, '2018-11-25');
  assert.equal(result.evidenceDateBasis, historical.historicalEvidenceNature);
  assert.equal(result.elapsedSinceEarliestEvidence.fullYears, 7);
  assert.equal(result.startDate, null);
  assert.equal(result.claimedFoundedAt, null);
  assert.equal(result.yearsSinceStart, null);
  assert.equal(result.continuousOperationVerified, false);
  assert.equal(result.isEstablished, null);
  const duration = makeCoreInfo(synthetic({ coreSupplement: { operatingHistory: { basis: 'SYNTHETIC undated publisher claim', claimStatus: 'self_report', publicShortExcerpt: 'SYNTHETIC 8年运营经验', selfReportedDuration: { value: 8, unit: 'years', scope: '运营经验' }, sourceIds: ['SYNTHETIC-CLAIM'] } } }), { asOf: AS_OF }).operatingHistory;
  assert.match(duration.claimText, /8年运营经验/);
  assert.equal(duration.startYear, null);
  assert.equal(duration.yearsSinceStart, null);
  assert.equal(duration.isEstablished, null);
});

test('synthetic: impossible/partial dates are not promoted into precise historical dates', () => {
  for (const invalid of ['2017-02-30', '2017-13-01', '2017-02']) {
    const history = { startedAt: invalid, earliestRetainedOperationalEvidenceAt: invalid, claimedFoundedAt: invalid, sourceIds: ['SYNTHETIC-HISTORY'], basis: 'SYNTHETIC date boundary fixture' };
    const projected = makeCoreInfo(synthetic({ coreSupplement: { operatingHistory: history } }), { asOf: AS_OF }).operatingHistory;
    assert.equal(projected.startDate, null);
    assert.equal(projected.claimedFoundedAt, null);
    assert.equal(projected.earliestEvidenceAt, null);
  }
});

test('synthetic: URL projection removes query, fragments, login/invite endpoints and credential-bearing URLs', () => {
  const clean = makeCoreInfo(synthetic({ officialUrl: 'https://example.test/invite/SYNTHETIC?token=SYNTHETIC#SYNTHETIC' }));
  assert.equal(clean.website.url, 'https://example.test/');
  for (const url of ['javascript:alert(1)', 'https://SYNTHETIC:SECRET@example.test/']) assert.equal(makeCoreInfo(synthetic({ officialUrl: url })).website.url, null);
});

test('synthetic: projection is deterministic, does not mutate frozen inputs and does not copy session/technical fields', () => {
  const input = deepFreeze(synthetic({ observedAt: '2026-10-25T00:00:00Z', cookie: 'SYNTHETIC_SECRET', coreSupplement: { checkedAt: AS_OF, cookie: 'SYNTHETIC_SECRET', sourceIds: ['SYNTHETIC'], payment: { cookie: 'SYNTHETIC_SECRET' } }, forecast: { pointProbability: 0.9 }, sha256: 'SYNTHETIC_HASH' }));
  const first = makeCoreInfo(input);
  assert.deepEqual(first, makeCoreInfo(input));
  assert.equal(first.lastChecked, AS_OF);
  assert.equal(first.asOf, AS_OF);
  assert.equal(JSON.stringify(first).includes('SYNTHETIC_SECRET'), false);
  assert.equal(JSON.stringify(first).includes('SYNTHETIC_HASH'), false);
  assert.throws(() => makeCoreInfo(null), /catalog record/);
  assert.throws(() => makeCoreInfo(input, { asOf: 'SYNTHETIC-not-a-date' }), /asOf/);
});

// Regression: an advertised annual-plan monthly equivalent is not a period total.
test('synthetic: monthly equivalent preserves its basis without calculating an annual bill', () => {
  const p = { name: 'SYNTHETIC annual equivalent', amount: 38.25, amountBasis: 'advertised_monthly_equivalent_not_period_total', billingPeriod: '年付折算每月', sourceIds: ['SYNTHETIC-PRICE'] };
  const project = extra => makeCoreInfo(synthetic({ coreSupplement: { pricing: { plans: [{ ...p, ...extra }] } } })).pricing.plans[0];
  const result = project({});
  assert.equal(result.amount, 38.25);
  assert.equal(result.amountBasis, p.amountBasis);
  assert.equal(result.currency, null);
  assert.equal(result.checkoutVerified, false);
  assert.equal(project({ sourceIds: [] }).amountBasis, 'not_confirmed');
  assert.equal(project({ billingPeriod: null }).amount, null);
});

test('synthetic: recapturing a native reply revises wording without creating another complaint or upgrading verification', () => {
  const event = { id: 'SYNTHETIC-REPLY-1', summary: 'SYNTHETIC original generic clue', createdAt: '2026-10-23T02:22:32.000Z', url: 'https://example.org/topic/1', sourceIds: ['SYNTHETIC-original'], sourceGroup: 'SYNTHETIC-topic/1', relation: 'direct_text_match', matchType: 'name_only', complaintClue: true, independentlyVerified: false };
  const record = synthetic({ currentEvidence: { community: { events: [event] } }, coreSupplement: { stability: { recentIssues: [{ ...event, summary: 'SYNTHETIC specific recaptured claim', sourceIds: ['SYNTHETIC-recapture'], independentlyVerified: true }] } } });
  const out = makeCoreInfo(record, { asOf: '2026-10-27T12:00:00Z' });
  assert.equal(out.stability.recentIssues.length, 1);
  assert.equal(out.stability.recentIssues[0].summary, 'SYNTHETIC specific recaptured claim');
  assert.deepEqual(out.stability.recentIssues[0].sourceIds, ['SYNTHETIC-original', 'SYNTHETIC-recapture']);
  assert.equal(out.stability.recentIssues[0].createdAt, event.createdAt);
  assert.equal(out.stability.recentIssues[0].independentlyVerified, false);
  assert.equal(out.stability.recentIssues[0].status, 'unverified_statement');
});

test('synthetic: event recaptures require agreeing URL, original time, attribution and native ID', () => {
  const base = { id: 'SYNTHETIC-REPLY-2', summary: 'SYNTHETIC statement', createdAt: '2026-10-23T02:22:32Z', url: 'https://example.org/topic/2', sourceIds: ['SYNTHETIC-one'], sourceGroup: 'SYNTHETIC-topic/2', relation: 'direct_text_match', matchType: 'name_only' };
  const variants = [{ ...base, id: 'SYNTHETIC-REPLY-3' }, { ...base, url: 'https://example.org/topic/3' }, { ...base, createdAt: '2026-10-24T02:22:32Z' }, { ...base, sourceGroup: 'SYNTHETIC-other-group' }, { ...base, relation: 'same_thread_context_only' }, { ...base, matchType: 'domain_only' }];
  for (const other of variants) {
    const result = makeCoreInfo(synthetic({ coreSupplement: { stability: { recentIssues: [base, other], recoveryClues: [base, base] } } }), { asOf: '2026-10-27T12:00:00Z' });
    assert.equal(result.stability.recentIssues.length, 2);
    assert.equal(result.stability.recoveryClues.length, 1);
  }
  const noIdentity = { ...base, id: null };
  assert.equal(makeCoreInfo(synthetic({ coreSupplement: { stability: { recentIssues: [noIdentity, noIdentity] } } }), { asOf: '2026-10-27T12:00:00Z' }).stability.recentIssues.length, 2);
});

test('real: discovery search links are not published as service websites', () => {
  for (const id of ['A012', 'A013']) {
    const raw=actual(id), before=JSON.stringify(raw);
    assert.equal(raw.officialUrl,'https://www.bing.com/search');
    const result=makeCoreInfo(raw,{asOf:AS_OF});
    assert.equal(result.website.url,null);
    assert.equal(result.website.status,'rejected_search_page');
    assert.equal(result.website.operatorIdentityVerified,false);
    assert(result.gaps.includes('当前网址未确认'));
    assert.equal(JSON.stringify(raw),before);
  }
});

test('synthetic: rejecting a search candidate preserves legitimate service paths and community evidence', () => {
  const record=synthetic({officialUrl:'https://service.example/search',coreSupplement:{website:{url:'https://service.example/search',sourceIds:['SYNTHETIC-SITE']}},currentEvidence:{}});
  assert.equal(makeCoreInfo(record,{asOf:AS_OF}).website.url,'https://service.example/search');
  record.coreSupplement.website.url='https://www.bing.com/search?q=SYNTHETIC';
  record.coreSupplement.website.operatorIdentityVerified=true;
  const result=makeCoreInfo(record,{asOf:AS_OF});
  assert.equal(result.website.url,null);
  assert.equal(result.website.operatorIdentityVerified,false);
  assert.deepEqual(result.website.sourceIds,['SYNTHETIC-SITE']);
});

test('synthetic: issue and recovery recency uses original publication after dedup, not recapture time', () => {
  const base = { summary: 'SYNTHETIC claim', url: 'https://example.org/topic/91', sourceIds: ['SYNTHETIC-original'], sourceGroup: 'SYNTHETIC-topic/91', relation: 'same_thread_context_only', matchType: 'name_only', independentlyVerified: false };
  const older = { ...base, id: 'SYNTHETIC-old', createdAt: '2026-10-20T00:00:00Z', complaintClue: true };
  const newer = { ...base, id: 'SYNTHETIC-new', createdAt: '2026-10-27T00:00:00Z', complaintClue: true };
  const tie = { ...newer, id: 'SYNTHETIC-tie' };
  const recaptured = { ...older, observedAt: '2026-10-27T12:00:00Z', summary: 'SYNTHETIC older recaptured', sourceIds: ['SYNTHETIC-recapture'], independentlyVerified: true };
  const record = deepFreeze(synthetic({ currentEvidence: { community: { events: [older, newer, tie] } }, coreSupplement: { stability: { recentIssues: [recaptured], recoveryClues: [older, newer, tie, recaptured] } } }));
  const before = JSON.stringify(record), out = makeCoreInfo(record, { asOf: '2026-10-27T13:00:00Z' });
  for (const events of [out.stability.recentIssues, out.stability.recoveryClues]) {
    assert.deepEqual(events.map(x => x.id), ['SYNTHETIC-new', 'SYNTHETIC-tie', 'SYNTHETIC-old']);
    assert.equal(events[2].createdAt, older.createdAt);
    assert.deepEqual(events[2].sourceIds, ['SYNTHETIC-original', 'SYNTHETIC-recapture']);
    assert.equal(events[2].independentlyVerified, false);
  }
  assert.equal(JSON.stringify(record), before);
});

test('real batch90: newly retained October27 replies precede older thread statements without inflating counts', () => {
  const claims = read('catalog/refresh/2026-10-26/core-auth-batch90/claims.json').records;
  for (const [id, native, size] of [['A036', 'GH-COMMENT-6445264260', 2], ['A073', 'GH-COMMENT-6444591485', 5]]) {
    const out = makeCoreInfo({ ...actual(id), coreSupplement: claims.find(x => x.recordId === id) }, { asOf: '2026-10-27T16:16:00Z' });
    assert.equal(out.stability.recentIssues[0].id, native);
    assert.equal(out.stability.recentIssues.length, size);
    assert(out.stability.recentIssues.every(x => x.independentlyVerified === false));
    assert.equal(out.stability.complaintRate, null);
  }
});


test('synthetic: price summary excludes sold-out, addon and unknown quotes without changing original plans', () => {
  const plans = deepFreeze([
    { name:'SYNTHETIC SOLD', amount:10, billingPeriod:'月付', soldOut:true, sourceIds:['SYNTHETIC'] },
    { name:'SYNTHETIC ADDON', amount:5, billingPeriod:'一次性', addon:{requiredPlan:'基础套餐'}, sourceIds:['SYNTHETIC'] },
    { name:'SYNTHETIC UNKNOWN', amount:null, billingPeriod:'月付', sourceIds:['SYNTHETIC'] },
    { name:'SYNTHETIC BASE', amount:29, currency:'CNY', billingPeriod:'月付', sourceIds:['SYNTHETIC'] }
  ]);
  const project = p => makeCoreInfo(synthetic({coreSupplement:{pricing:{plans:p}}})).pricing;
  const p = project(plans); assert.equal(p.summaryPlanIndex,3); assert.equal(p.summaryExcludedSoldOutCount,1); assert.equal(p.plans.length,4); assert.equal(p.plans[0].amount,10); assert.ok(p.plans[1].addon);
  const sold = project(plans.slice(0,3)); assert.equal(sold.summaryPlanIndex,null); assert.equal(sold.summaryUnavailableReason,'all_numeric_independent_plans_sold_out');
  const addon = project(plans.slice(1,3)); assert.equal(addon.summaryPlanIndex,null); assert.equal(addon.summaryUnavailableReason,'no_numeric_independent_plan');
  const free = project([{name:'SYNTHETIC FREE',amount:0,billingPeriod:'1天',sourceIds:['SYNTHETIC']}]); assert.equal(free.summaryPlanIndex,0);
});


test('synthetic: conditional stock wording is not evidence that a plan is already sold out', () => {
  const project = (restriction,extra={}) => makeCoreInfo(synthetic({coreSupplement:{pricing:{plans:[{name:'SYNTHETIC STOCK',amount:19,billingPeriod:'月付',sourceIds:['SYNTHETIC'],restrictions:[restriction],...extra}]}}})).pricing;
  for (const text of ['即将售罄，实际库存未验证。','节假日开放，售完即止。','尚未确认是否已售罄。','可能售罄','此前售罄，目前是否恢复未知']) {const p=project(text);assert.equal(p.plans[0].soldOut,null,text);assert.equal(p.summaryPlanIndex,0,text);}
  for (const text of ['卡片已售罄，仅记录标价。','页面标为售罄。','采集页标售罄，不代表当前可购买；库存可能变化。','已售完','sold out']) {const p=project(text);assert.equal(p.plans[0].soldOut,true,text);assert.equal(p.summaryPlanIndex,null,text);}
  assert.equal(project('已售罄',{soldOut:false}).plans[0].soldOut,false,'explicit structured field retains precedence');
});


test('real: third-party and mixed historical statements are not automatically attributed to the operator', () => {
  const rows = read('catalog/core-supplement.v1.json').records;
  for (const id of ['A084','A066']) {
    const supplement = rows.find(r=>r.recordId===id), original = catalog.find(r=>r.id===id);
    const history = makeCoreInfo({...original,coreSupplement:supplement},{asOf:'2026-10-28T00:00:00Z'}).operatingHistory;
    assert.equal(history.claimText,supplement.operatingHistory.claimText); assert.doesNotMatch(history.label,/站方有经验/);
    assert.equal(history.startDate,null); assert.equal(history.startYear,null); assert.equal(history.continuousOperationVerified,false);
  }
});

test('synthetic: operator status reports never promote measurements or complaint coverage', () => {
  const report={summary:'SYNTHETIC operator says operational; no incidents reported',sourceIds:['SYNTHETIC-STATUS'],observedAt:AS_OF};
  const result=makeCoreInfo(synthetic({coreSupplement:{stability:{operatorReports:[report,{...report,sourceIds:[]},{...report,observedAt:null},{...report,observedAt:'2027-01-01T00:00:00Z'}]}}}),{asOf:AS_OF});
  assert.equal(result.stability.operatorReports.length,1);
  assert.equal(result.stability.operatorReports[0].status,'operator_report_not_independent_measurement');
  assert.equal(result.stability.measured.observations.length,0);
  assert.equal(result.stability.status,'not_measured');assert.equal(result.stability.complaintRate,null);
  assert.equal(result.stability.recentIssues.length,0);assert.equal(result.stability.recoveryClues.length,0);
  assert.equal(result.stability.searchComplete,false);assert.ok(result.sourceIds.includes('SYNTHETIC-STATUS'));
  assert.ok(result.gaps.includes('可用率实测未确认'));
});

test('synthetic: a public pre-order selector is observed without implying login or a successful transaction', () => {
  const base = { methods: ['SYNTHETIC_PUBLIC_PAY'], evidenceLevel: 'public_checkout', observedAt: AS_OF, sourceIds: ['SYNTHETIC-PUBLIC-PAY'], transactionVerified: true };
  const payment = makeCoreInfo(synthetic({ coreSupplement: { payment: base } })).payment;
  assert.equal(payment.evidenceLevel, 'public_checkout');
  assert.equal(payment.label, '未登录支付选项观察');
  assert.equal(payment.checkoutObserved, true);
  assert.equal(payment.transactionVerified, false);
  for (const missing of ['sourceIds', 'observedAt', 'methods']) {
    const incomplete = { ...base }; delete incomplete[missing];
    const result = makeCoreInfo(synthetic({ coreSupplement: { payment: incomplete } })).payment;
    assert.equal(result.evidenceLevel, 'unknown');
    assert.equal(result.checkoutObserved, false);
    assert.deepEqual(result.methods, []);
  }
});

// SYNTHETIC binding reviews test attribution only, never real service outcomes.
test('synthetic: exact sourced identity review preserves unmatched original and other events', () => {
 const event={id:'SYNTHETIC-E',summary:'SYNTHETIC report',createdAt:'2026-10-20T00:00:00Z',url:'https://example.com/issue/1',sourceGroup:'synthetic-thread',sourceIds:['SYNTHETIC-ORIGINAL'],complaintClue:true};
 const review={status:'identity_unresolved',eventId:event.id,eventUrl:event.url,eventCreatedAt:event.createdAt,eventSourceGroup:event.sourceGroup,reason:'SYNTHETIC identity not established',sourceIds:['SYNTHETIC-REVIEW'],reviewedAt:'2026-10-25T00:00:00Z'};
 const project=r=>makeCoreInfo(synthetic({currentEvidence:{community:{events:[event,{...event,id:'SYNTHETIC-OTHER'}]}},coreSupplement:{stability:{identityReviews:[r]}}}),{asOf:'2026-10-26T00:00:00Z'}).stability;
 const out=project(review);assert.deepEqual(out.recentIssues.map(e=>e.id),['SYNTHETIC-OTHER']);assert.equal(out.identityUnresolvedReports.length,1);assert.equal(out.identityUnresolvedReports[0].summary,event.summary);assert.ok(out.identityUnresolvedReports[0].sourceIds.includes('SYNTHETIC-REVIEW'));assert.equal(out.complaintRate,null);
 for(const patch of [{eventUrl:'https://example.com/other'},{eventCreatedAt:'2026-10-21T00:00:00Z'},{eventSourceGroup:'other-thread'},{sourceIds:[]},{reviewedAt:'2026-10-27T00:00:00Z'}]){const bad=project({...review,...patch});assert.equal(bad.recentIssues.length,2);assert.equal(bad.identityUnresolvedReports.length,0);}
});
