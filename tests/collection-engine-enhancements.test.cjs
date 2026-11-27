'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/collection-engine.cjs');
const {runDir} = require('../scripts/collection.cjs');
const {auditDatabase, probePublicSite} = require('../scripts/audit-catalog-gaps.cjs');

test('collection.cjs runDir rejects undefined and invalid run IDs cleanly', () => {
  assert.throws(() => runDir(undefined), /Invalid run ID/);
  assert.throws(() => runDir(''), /Invalid run ID/);
  assert.throws(() => runDir('../escape'), /Invalid run ID/);
  assert.match(runDir('run_2026-11-28'), /run_2026-11-28$/);
});

test('collection-engine extract supports multi-char symbols, suffixed prices, billing cycles and extended payments while keeping ambiguous symbols null', () => {
  const s = {
    capturedAt: '2026-11-28T00:00:00Z',
    text: '支持 Apple Pay、Stripe 与 USDT (TRC20) 付款\n不提供退费服务\n严格 no-logs 隐私保护',
    blocks: [
      {text: '香港专线 HK$128 半年付'},
      {text: '台湾节点 NT$300 一次性 不限时'},
      {text: '标准套餐 19.9 元 月付'},
      {text: '企业版 25 USD Annually'},
      {text: '歧义标价 ¥29.9 月付'}
    ]
  };
  const out = E.extract(s, 'TEST-SRC');
  const pricing = out.filter((x) => x.field === 'pricing');
  assert.equal(pricing.length, 5);
  assert.deepEqual(
    pricing.map((p) => [p.amount, p.currency, p.billingPeriod]),
    [
      [128, 'HKD', '半年付'],
      [300, 'TWD', '一次性'],
      [19.9, null, '月付'],
      [25, 'USD', 'Annually'],
      [29.9, null, '月付']
    ]
  );
  assert.ok(out.some((x) => x.field === 'payment' && /Apple Pay/.test(x.quote)));
  assert.ok(out.some((x) => x.field === 'refund' && /退费/.test(x.quote)));
  assert.ok(out.some((x) => x.field === 'privacy' && /no-logs/.test(x.quote)));
});

test('audit-catalog-gaps audits database coverage and probes public HTML safely without mutating catalog', async () => {
  const report = auditDatabase();
  assert.ok(report.counts.primary > 0);
  assert.ok(report.planQuality.plansTotal > 0);
  assert.ok(Array.isArray(report.gaps));

  const probed = await probePublicSite(
    {id: 'A999', name: 'Demo', url: 'https://demo.example.org/', missing: ['payment', 'refund'], probeEligible: true},
    {
      fetchImpl: async () => ({
        status: 200,
        url: 'https://demo.example.org/',
        text: async () => '<html><title>Demo</title><body><p>我们支持支付宝与USDT付款，购买后3天内可申请退款。</p>' + '说明文字 '.repeat(25) + '</body></html>'
      })
    }
  );
  assert.equal(probed.classification, 'content_observed');
  assert.deepEqual(probed.matchedFields.sort(), ['payment', 'refund']);
  assert.ok(probed.hints.length >= 2);

  const limited = await probePublicSite(
    {id: 'A998', name: 'Limited', url: 'https://demo.example.org/', missing: ['privacy'], probeEligible: true},
    {fetchImpl: async () => ({status: 429, url: 'https://demo.example.org/', text: async () => 'Too Many Requests '.repeat(20)})}
  );
  assert.equal(limited.classification, 'rate_limited');
  assert.equal(limited.hints.length, 0);
});
