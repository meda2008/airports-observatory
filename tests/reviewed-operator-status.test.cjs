'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const parser = require('../collection/url-collectors/reviewed-operator-status-parsers.cjs');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function observation(p) {
  const bytes = fs.readFileSync(path.join(root, p.ref.file));
  assert.equal(sha(bytes), p.ref.fileSha256);
  const raw = JSON.parse(bytes);
  return { url: p.url, body: require('../lib/collection-engine.cjs').redact(raw.text), evidenceId: p.ref.sourceId, observedAt: p.ref.observedAt, representation: p.ref.representation, originalFileSha256: p.ref.fileSha256, _verifiedMetadata: raw };
}
for (const p of parser.profiles) {
  test(p.recordId + ' pins native event dates, exact quotes and recovery context with no achieved uptime', () => {
    const o = observation(p), result = parser.diagnose(o, { recordId: p.recordId });
    assert.equal(result.accepted, true, result.reasons.join(','));
    assert.equal(result.facts.length, p.recordId === 'A074' ? 1 : 2);
    for (const { collection, fact: f } of result.facts) {
      assert.equal(collection, 'reviewedIssueSignals');
      assert.equal(o.body.slice(f.sourceLocator.start, f.sourceLocator.end), f.quote);
      assert.equal(f.current, false);
      assert.equal(f.independentMeasurement, false);
      for (const k of ['durationMinutes', 'sampleCount', 'measurementWindow']) assert.equal(f[k], null);
      for (const k of ['uptimePercent', 'availabilityPercent', 'recoveredAt', 'outageDurationMinutes']) assert.equal(f[k], undefined);
      for (const related of f.relatedStatements) assert.equal(o.body.slice(related.sourceLocator.start, related.sourceLocator.end), related.quote);
      for (const proof of f.identityProofs) { assert.equal(proof.sourceId, undefined); assert.ok(proof.originalSourceId); }
    }
  });
  test(p.recordId + ' rejects changed wrapper, time, post body, duplicate or borrowed metadata', () => {
    const first = p.events[0];
    for (const mutate of [
      o => o.body += '\n', o => o.originalFileSha256 = '0'.repeat(64), o => o.observedAt = '2026-11-12T00:00:00Z',
      o => o.evidenceId = '', o => o.representation = 'unverified_text', o => o._verifiedMetadata.text += 'x',
      o => o._verifiedMetadata.url = 'https://t.me/s/other',
      o => o._verifiedMetadata.timeMetadata[first.timeMetadataIndex].dateTime = '07:31',
      o => o._verifiedMetadata.timeMetadata[first.timeMetadataIndex].text = '不同的帖子正文',
      o => o._verifiedMetadata.timeMetadata.push({ ...o._verifiedMetadata.timeMetadata[first.timeMetadataIndex] }),
      o => o._verifiedMetadata.timeMetadata.splice(first.timeMetadataIndex, 1),
      o => o._verifiedMetadata.links = []
    ]) { const o = observation(p); mutate(o); assert.equal(parser.diagnose(o, { recordId: p.recordId }).accepted, false); }
  });
  test(p.recordId + ' exact routes, retained unrelated fields and idempotent replay', () => {
    for (const url of [p.url + '?before=1', p.url + '#x', p.url.replace('https:', 'http:')]) assert.equal(parser.forOrigin(url, { recordId: p.recordId }), null);
    assert.equal(parser.forOrigin(p.url, { recordId: 'A002' }), null);
    const prior = { stability: { status: 'not_measured', sentinel: 'keep', sourceIds: ['old'], reviewedIssueSignals: [{ id: 'old' }] } };
    const result = parser.extract(observation(p), { recordId: p.recordId, prior });
    assert.equal(result.stability.sentinel, 'keep');
    assert.equal(result.stability.reviewedIssueSignals.length, p.recordId === 'A074' ? 2 : 3);
    assert.ok(result.stability.sourceIds.includes('old'));
    assert.equal(prior.stability.reviewedIssueSignals.length, 1);
    assert.equal(parser.extract(observation(p), { recordId: p.recordId, prior: result }), null);
    const summary = require('../lib/performance-summary.cjs').performanceSummary(result, '2026-11-12T01:08:40Z');
    assert.equal(summary.stability, p.recordId === 'A020' ? '有近期问题反馈' : '有历史中断记录');
    assert.match(summary.stabilityContext.description, p.recordId === 'A020' ? /尚未独立核实/ : /不代表当前/);
  });
}
test('EdNovas recovery uses own message rather than quoted previous outage reply', () => {
  const p = parser.profiles.find(p => p.recordId === 'A020');
  const event = parser.diagnose(observation(p), { recordId: p.recordId }).facts[1].fact;
  assert.match(event.relatedStatements[0].quote, /^请更新订阅，已恢复/);
  assert.equal(event.relatedStatements[0].createdAt, '2026-10-19T23:31:47+00:00');
  assert.match(event.summary, /补偿天数不等于实际中断时长/);
});
test('YkkCloud website and Emby scope preserves edited recovery ambiguity and excludes protocol notice', () => {
  const p = parser.profiles.find(p => p.recordId === 'A074');
  const facts = parser.diagnose(observation(p), { recordId: p.recordId }).facts.map(f => f.fact);
  assert.match(facts[0].scope, /不证明代理转发节点/);
  assert.match(facts[0].relatedStatements[0].quote, /Emby 服务需等待/);
  assert.match(facts[0].relatedStatements[0].quote, /已恢复/);
  assert.match(facts[0].summary, /未取得编辑时刻/);
  assert.equal(facts.some(f => f.postUrl.endsWith('/222')), false);
  assert.ok(p.rootBindingRef);
});
test('official attribution is native saved-domain binding rather than channel brand alone', () => {
  for (const p of parser.profiles) {
    const ref = p.rootBindingRef || p.identityRef;
    assert.equal(new URL(ref.url).origin, new URL(p.currentOfficialUrlAtReview).origin);
    const bytes = fs.readFileSync(path.join(root, p.identityRef.file));
    const doc = require('../lib/retained-document.cjs').normalizeRetainedDocument(bytes, { sha256: p.identityRef.fileSha256, url: p.identityRef.url, last_capture_at: p.identityRef.observedAt });
    assert.equal(doc.links[p.identityLink.index].url, 'https://t.me/' + p.channel);
    assert.ok(doc.text.includes(p.identityLink.label));
  }
});



