'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function loadFixtureOrFallback(relPath, buildFallback) {
  const fullPath = path.resolve(__dirname, '..', relPath);
  if (fs.existsSync(fullPath)) {
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  }
  return buildFallback();
}

function render(change) {
  const code = fs
    .readFileSync(path.resolve(__dirname, '../deploy-service/public/index.js'), 'utf8')
    .split("$('#search').addEventListener")[0];
  const context = {
    document: {
      createElement: (tag) => ({
        tag,
        textContent: '',
        children: [],
        append(...n) {
          this.children.push(...n);
        }
      })
    }
  };
  vm.createContext(context);
  vm.runInContext(code + ';globalThis.renderCard=changeCard;', context);
  const root = context.renderCard(change, true);
  const walk = (n) => [n.textContent, ...n.children.flatMap(walk)];
  return walk(root).join('\n');
}

const eggtartRefundFixture = () =>
  loadFixtureOrFallback('work/collection-runs/financial-gaps-20261104-v8/eggtart_channel_historical_refund.json', () => ({
    url: 'https://t.me/s/eggtartcloud',
    capturedAt: '2026-11-04T09:10:00.000Z',
    text: '小本生意 尽力而为 服务不满可以工单交流我们尽力帮你解决 实在不满也可以走支付原路退款\n已为今早在群组内公开侮辱机场的两位用户全额退款并提交spam给nmbot团队进行处理。',
    timeMetadata: [
      {permalink: 'https://t.me/eggtartcloud/244', dateTime: '2024-01-29T10:58:43+00:00'},
      {permalink: 'https://t.me/eggtartcloud/326', dateTime: '2024-04-25T05:33:02+00:00'}
    ],
    evidenceId: 'FIXTURE-A077-REFUND'
  }));

const viewturboPaymentFixture = () =>
  loadFixtureOrFallback(
    'work/collection-runs/unread-official-financial-20261104-v7/viewturbo_private_email_payment_options.json',
    () => ({
      url: 'https://web.vtpro.xyz/charge',
      capturedAt: '2026-11-04T08:00:00.000Z',
      evidenceId: 'FIXTURE-A057-CHARGE',
      text: [
        'Private Email',
        'Includes 1 day of unlimited data',
        'USD 1.00',
        'Choose a payment method',
        'WeChat Alipay Stripe WeChatPay Apple Pay Link USDT',
        'Ready when you are.'
      ].join('\n')
    })
  );

const youtuReviewCandidatesFixture = () =>
  loadFixtureOrFallback('work/collection-runs/youtu-kuromis-20261104-v5/review/review-candidates.json', () => ({
    candidates: [
      {
        patch: {
          pricing: {
            plans: [
              ...Array.from({length: 11}, (_, i) => ({
                name: `Plan ${i + 1}`,
                amount: 20 + i * 5,
                currency: 'CNY',
                billingPeriod: '月付',
                quota: `${100 + i * 50}G`,
                observedAt: '2026-11-04T06:00:00.000Z',
                sourceIds: ['FIXTURE-A206']
              })),
              {
                name: '轻量包',
                amount: 99,
                currency: 'CNY',
                billingPeriod: '年付',
                quota: '365天总共200G',
                observedAt: '2026-11-04T06:00:00.000Z',
                sourceIds: ['FIXTURE-A206']
              }
            ]
          },
          payment: {
            summary: '订单页观察到支付宝与微信通道。',
            methods: ['支付宝', '微信支付'],
            observedAt: '2026-11-04T06:00:00.000Z',
            sourceIds: ['FIXTURE-A206'],
            feeStatements: [4, 5, 2, 3, 7].map((ratePercent, idx) => ({method: 'channel-' + idx, ratePercent})),
            orderCleanup: {
              status: 'cancelled',
              cancellationVerified: true,
              checkedAt: '2026-11-04T06:05:00.000Z',
              orderId: 'PRIVATE_ORDER_DO_NOT_PUBLISH'
            },
            statementObservations: [
              {
                quote: '收银台显示支付宝/微信选项',
                checkoutObserved: true,
                observedAt: '2026-11-04T06:00:00.000Z',
                sourceIds: ['FIXTURE-A206']
              }
            ]
          },
          refund: {
            status: 'stated_terms_not_execution_verified',
            summary: '无退款，介意勿扰',
            executionVerified: false,
            observedAt: '2026-11-04T06:00:00.000Z'
          }
        }
      }
    ]
  }));

const kuromisReviewCandidatesFixture = () =>
  loadFixtureOrFallback('work/collection-runs/kuromis-confirmed-login-20261104-v6/review-A022/review-candidates.json', () => ({
    candidates: [
      {
        patch: {
          refund: {
            status: 'not_confirmed',
            summary: '退款条件仍未确认',
            executionVerified: false,
            observedAt: '2026-11-04T07:00:00.000Z'
          }
        }
      }
    ]
  }));

const fnfTosFixture = () =>
  loadFixtureOrFallback('work/collection-runs/pricing-auth-20261110-v24/A027-tos.json', () => ({
    url: 'https://33333.ifnf.xyz/seni/yes/tos',
    capturedAt: '2026-11-10T05:19:34.231Z',
    evidenceId: 'FIXTURE-A027-TOS',
    text: [
      '本协议最后修订于2020.12.16',
      '2.服务的使用 不得创建、运营一个 TOR 节点，不得进行大量的 BitTorrent 下载，不得在组织或企业内部使用个人类型的订阅。',
      '3.终止/限制访问',
      '3.2 支付金额*套餐已使用比例*0.8，最低退款5元。',
      '3.3 终止条款',
      '4.1 需提供电子邮件及密码并保持联系与账单信息最新。',
      '4.3 账户安全',
      '6.2 保留以技术手段监测服务及依法透露您账户的任何必要信息的权利。',
      '6.3 法律合规',
      '7.5 原路退款请求中的20%将被扣除；所有套餐的余额结转均按时间比例换算剩余价值。',
      '8.资源使用'
    ].join('\n')
  }));

const fnfShopFixture = () =>
  loadFixtureOrFallback('work/collection-runs/fnf-pricing-20261110-v26/capture-1.json', () => ({
    url: 'https://33333.ifnf.xyz/seni/yes/user/shop',
    capturedAt: '2026-11-10T07:47:00.000Z',
    evidenceId: 'FIXTURE-A027-SHOP',
    fnfSelection: {planLabel: 'LV1 Basic', period: '1个月', planId: 'plan_1', activePlan: 'plan_1', activePeriod: '1month', autoRenew: false},
    text: [
      '商品名称',
      '[LV1 Basic] 月付 每月60G',
      '总价',
      '¥ 9.90',
      '支付方式\n 支付宝',
      '默认抵扣账户余额，最低付款金额5元'
    ].join('\n')
  }));

test('historical Eggtart refund statements display original dates and current uncertainty', () => {
  const s = eggtartRefundFixture();
  const patch = require('../collection/url-collectors/eggtart-channel.cjs').extract(s);
  const text = render({siteId: 'A077', revision: 1, after: patch});
  assert(text.includes('退款条件 · 待确认'));
  assert(text.includes('2024-01-29T10:58:43+00:00'));
  assert(text.includes('2024-04-25T05:33:02+00:00'));
  assert(text.includes('https://t.me/eggtartcloud/244'));
  assert(text.includes(s.capturedAt));
  assert(text.includes('不能作为今天购买后的退款保证'));
});

test('public response keeps historical refund date, permalink and scope separate from capture', async (t) => {
  const s = eggtartRefundFixture();
  const patch = require('../collection/url-collectors/eggtart-channel.cjs').extract(s);
  const server = require('../deploy-service/server.cjs').createServer({
    store: {listChanges: () => [{siteId: 'A077', revision: 1, after: patch}]}
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const json = await (await fetch('http://127.0.0.1:' + server.address().port + '/api/changes')).json();
  const r = json.items[0].after.refund;
  assert.equal(r.status, 'not_confirmed');
  assert.equal(r.policyStatements[0].publishedAt, '2024-01-29T10:58:43+00:00');
  assert.equal(r.policyStatements[0].observedAt, s.capturedAt);
  assert(r.policyStatements[1].scope.includes('个别'));
});

test('ViewTurbo actual public product options render with scope, source and capture time without checkout claim', () => {
  const s = viewturboPaymentFixture();
  const patch = require('../collection/url-collectors/viewturbo-web.cjs').extract(s);
  const text = render({siteId: 'A057', revision: 4, after: patch});
  assert(text.includes('Private Email'));
  assert(text.includes('Apple Pay'));
  assert(text.includes(s.capturedAt));
  assert(text.includes(s.url));
  assert(!text.includes('支付方式 · 订单页已观察'));
});

test('checkout-observed card labels the actual evidence level and shows refund plus period quotes', () => {
  const patch = youtuReviewCandidatesFixture().candidates[0].patch;
  const text = render({siteId: 'A206', revision: 2, after: patch});
  assert(text.includes('支付方式 · 订单页已观察'));
  assert(!text.includes('支付资料差异 · 未核实收银台'));
  assert(text.includes('无退款，介意勿扰'));
  assert(text.includes('当前套餐报价：12 组'));
  assert(text.includes('365天总共200G'));
  assert(text.includes('实际执行未验证'));
});

test('unobserved operator statements stay labeled as not verified at checkout', () => {
  const text = render({
    siteId: 'SYNTHETIC',
    revision: 1,
    after: {
      payment: {
        summary: 'SYNTHETIC',
        statementObservations: [{quote: 'SYNTHETIC OPERATOR STATEMENT', checkoutObserved: false}]
      }
    }
  });
  assert(text.includes('支付资料差异 · 未核实收银台'));
  assert(!text.includes('支付方式 · 订单页已观察'));
  assert(!text.includes('\nundefined\n'));
});

test('scoped unknown refund check is displayed as pending, not a confirmed operator refund rule', () => {
  const patch = kuromisReviewCandidatesFixture().candidates[0].patch;
  const text = render({siteId: 'A022', revision: 1, after: patch});
  assert(text.includes('退款条件 · 待确认'));
  assert(!text.includes('退款条件 · 站方声明'));
  assert(text.includes('退款条件仍未确认'));
  assert(!text.includes('无退款'));
});

test('public financial response preserves rates and cancellation but drops private order metadata', async (t) => {
  const patch = youtuReviewCandidatesFixture().candidates[0].patch;
  const after = {
    ...patch,
    payment: {
      ...patch.payment,
      privateOrderUrl: 'PRIVATE_ORDER_DO_NOT_PUBLISH',
      orderCleanup: {...patch.payment.orderCleanup, orderId: 'PRIVATE_ORDER_DO_NOT_PUBLISH'}
    }
  };
  const server = require('../deploy-service/server.cjs').createServer({
    store: {listChanges: () => [{siteId: 'A206', revision: 2, after}]}
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const response = await (await fetch('http://127.0.0.1:' + server.address().port + '/api/changes')).text();
  assert(!response.includes('PRIVATE_ORDER_DO_NOT_PUBLISH'));
  const p = JSON.parse(response).items[0].after;
  assert.equal(p.pricing.plans.length, 12);
  assert.deepEqual(
    p.payment.feeStatements.map((f) => f.ratePercent),
    [4, 5, 2, 3, 7]
  );
  assert.equal(p.payment.orderCleanup.cancellationVerified, true);
});

test('FnF current policy and simple payment fields render without hiding unknown retention or implying a payment', () => {
  const s = fnfTosFixture();
  const c = require('../collection/url-collectors/33333-ifnf-xyz.cjs');
  const policy = c.extract(s);
  const quote = fnfShopFixture();
  const payment = c.extract(quote).payment;
  const text = render({siteId: 'A027', revision: 5, after: {...policy, payment}});
  assert(text.includes('隐私资料 · 站方声明'));
  assert(text.includes('保留期限：未知'));
  assert(text.includes('未独立审计'));
  assert(text.includes(s.capturedAt));
  assert(text.includes(s.url));
  assert(text.includes('具名渠道：支付宝'));
  assert(text.includes('自动续费说明中提到微信不代表当前可选微信通道'));
  assert(!text.includes('支付方式 · 订单页已观察'));
});
