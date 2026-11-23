'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { makeCoreInfo } = require('../../lib/core-info.cjs');

const root = path.resolve(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const catalog = read('data/public-catalog.json');
const modules = Promise.all(['core-view.mjs', 'current-evidence-view.mjs'].map(file => import(pathToFileURL(path.join(root, 'src', file)).href)));
const fields = ['price', 'speed', 'stability', 'payment', 'history', 'policy', 'devices', 'issues', 'privacy'];

test('independent small-file and short HTTP probe measurements keep their scoped labels',async t=>{const h=await harness(t),common={measurementOrigin:'independent_user_route',sourceGroup:'local-route:fixture',independentSourceCount:1,network:'local fixture contract only',methodology:'scoped HTTP',sourceIds:['fixture-source']};const core=makeCoreInfo({id:'SYNTHETIC-MEASURED-CONTRACT',coreSupplement:{speed:{measurements:[{...common,testedAt:'2026-01-01T00:03:00Z',sampleCount:3,downloadMbps:2.2,downloadMbpsQuantiles:{p10:1.7,p50:2.2,p90:2.6},latencyMs:633,applicationBytesPerSample:262144,limitation:'不是线路峰值带宽，不外推机场整体。'}]},stability:{measurements:[{...common,windowStart:'2026-01-01T00:00:00Z',windowEnd:'2026-01-01T00:03:00Z',windowDurationSeconds:180,sampleCount:10,expectedSlots:10,missingSlots:0,availabilityPct:100,packetLossPct:null,limitation:'不是机场整体或长期可用率；未测ICMP丢包。'}]}}},{asOf:'2026-01-02T00:00:00Z'}),detail=h.createCoreDetail({id:'SYNTHETIC-MEASURED-CONTRACT',coreInfo:core},h.ui);const speed=field(detail,'speed'),stability=field(detail,'stability');assert.match(speed.textContent,/独立线路小文件HTTP吞吐/);assert.match(speed.textContent,/HTTP响应头耗时中位数/);assert.match(speed.textContent,/不是线路峰值带宽/);assert.match(speed.textContent,/P10 1.7/);assert.match(stability.textContent,/短窗口HTTP探测成功比例 100%/);assert.match(stability.textContent,/180秒/);assert.match(stability.textContent,/缺测：0/);assert.match(stability.textContent,/未测ICMP丢包/);assert.doesNotMatch(stability.textContent,/丢包 0%/);});

test('supplementary public payment statements remain separate from stronger cashier options',async t=>{const h=await harness(t),payment={methods:['支付宝'],evidenceLevel:'authenticated_checkout',sourceIds:['OLD'],reason:'旧收银台说明，到账未验证。',observations:[{methods:['支付宝'],evidenceLevel:'authenticated_checkout',sourceIds:['OLD']},{methods:['支付宝','USDT'],evidenceLevel:'public_text',sourceIds:['NEW'],reason:'频道简介声明，发布日期未知，收银台未核实。'}]};const card=field(h.createCoreDetail({id:'SYNTHETIC-PAYMENT-APPEND',coreInfo:{payment}},h.ui),'payment');assert.doesNotMatch(card.querySelector('.core-value').textContent,/USDT/);assert.match(card.textContent,/其他来源的支付说明/);assert.match(card.textContent,/USDT/);assert.match(card.textContent,/发布日期未知/);});

// This small DOM stub exercises actual rendering and source-click callbacks.
// It does not simulate browser layout or replace a visual browser check.
class Element {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase(); this.children = []; this.parentElement = null;
    this.dataset = {}; this.attributes = {}; this.listeners = {}; this.className = ''; this.open = false; this._text = '';
    this.classList = { remove: name => { this.className = this.className.split(' ').filter(value => value !== name).join(' '); }, toggle: (name, force) => { const present = this.className.split(' ').includes(name); const next = force ?? !present; this.classList.remove(name); if (next) this.className += ' ' + name; return next; } };
  }
  append(...nodes) { for (const node of nodes) { const child = typeof node === 'string' ? Object.assign(new Element('#text'), { textContent: node }) : node; child.parentElement = this; this.children.push(child); } }
  replaceChildren(...nodes) { this.children = []; this._text = ''; this.append(...nodes); }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
  trigger(type) { const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }; for (const callback of this.listeners[type] || []) callback(event); return event; }
  querySelectorAll(selector) { return descendants(this).filter(node => selector.startsWith('.') ? node.className.split(' ').includes(selector.slice(1)) : selector.startsWith('[data-') ? Object.hasOwn(node.dataset, selector.slice(6, -1)) : node.tagName === selector.toUpperCase()); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  scrollIntoView(options) { this.scrolled = options; }
  focus() {}
}
function descendants(node) { return node.children.flatMap(child => [child, ...descendants(child)]); }
function field(node, key) { return descendants(node).find(child => child.dataset.coreField === key); }
function dom() {
  const body = new Element('body'); body.dataset.correctionsUrl = '';
  const document = { body, baseURI: 'https://synthetic.invalid/', createElement: tag => new Element(tag), createTextNode: text => Object.assign(new Element('#text'), { textContent: text }), getElementById: id => descendants(body).find(node => node.id === id) || null, querySelector: selector => body.querySelector(selector), querySelectorAll: selector => body.querySelectorAll(selector), addEventListener() {} };
  for (const id of ['app', 'menu-toggle', 'primary-nav', 'main-content', 'footer-asof', 'toast']) { const node = new Element('div'); node.id = id; body.append(node); }
  body.append(Object.assign(new Element('a'), { className: 'skip-link' }));
  const el = (tag, className = '', value) => { const node = document.createElement(tag); node.className = className; if (value !== null && value !== undefined) node.textContent = value; return node; };
  const ui = { el, paragraph: (value, className = '') => el('p', className, value), link: (href, value, className = '') => Object.assign(el('a', className, value), { href }), date: value => value };
  return { document, ui };
}
async function harness(t, fetchImpl) {
  const [{ createCoreCard, createCoreDetail }, { createCurrentEvidenceSections }] = await modules;
  const { document, ui } = dom();
  global.document = document; t.after(() => { delete global.document; });
  const location = { hash: '#/explore', href: 'https://synthetic.invalid/' };
  const { validateBrowserIndex, validateBrowserDetail } = await import(pathToFileURL(path.join(root, 'src/browser-data.mjs')).href);
  const context = vm.createContext({ document, Node: Element, createCoreCard, createCoreDetail, createCurrentEvidenceSections, validateBrowserIndex, validateBrowserDetail, createVerificationPage() { throw new Error('not used'); }, location, window: { addEventListener() {}, scrollTo() {} }, URL, URLSearchParams, Intl, Date, Blob, setTimeout, clearTimeout, AbortSignal, fetch: fetchImpl || (() => { throw new Error('Network access is forbidden in core-view tests'); }) });
  const source = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8').replace(/^import[^\r\n]+\r?\n/gm, '').replace(/\bstart\(\);\s*$/, '');
  vm.runInContext(source + '\nglobalThis.testUI = { state, createExplore, createDetail, methodPage, sourcesSection, loadDetail };', context);
  context.testUI.state.catalog = catalog;
  context.testUI.state.sources = new Map(read('data/public-sources.json').items.map(source => [source.id, source]));
  return { ...context.testUI, document, ui, createCoreCard, createCoreDetail, location };
}

test('real snapshot: default excludes evidenced non-product entries while preserving all records', async t => {
  const h = await harness(t);
  const primary = catalog.items.filter(record => record.listing?.primary ?? ['airport', 'niche'].includes(record.category));
  const others = catalog.items.filter(record => !(record.listing?.primary ?? ['airport', 'niche'].includes(record.category)));
  assert.equal(primary.length, 146); assert.equal(others.length, 69);
  for (const id of ['A076','A192','A193','A195','A202']) {
    const record = catalog.items.find(r => r.id === id);
    assert.equal(record.listing.primary, false);
    assert.ok(record.listing.reason); assert.ok(record.listing.sourceIds.length);
    const detail = await h.createDetail(id); assert.match(detail.textContent, /仅保留资料/); assert.match(detail.textContent, /这不是停服裁决/);
  }
  assert.equal(catalog.items.find(r => r.id === 'A007').listing.primary, true, 'A timeout alone must not remove an airport candidate');
  const shown = [];
  for (let page = 1; page <= Math.ceil(primary.length / h.state.pageSize); page++) {
    const screen = h.createExplore(new URLSearchParams({ page }));
    assert.match(screen.textContent, /146 条/);
    shown.push(...screen.querySelectorAll('.resource-card').map(card => card.querySelector('a').href.split('/').at(-1)));
  }
  assert.deepEqual(new Set(shown), new Set(primary.map(record => record.id)));
  const otherScreen = h.createExplore(new URLSearchParams({ category: 'other' }));
  assert.match(otherScreen.textContent, /仅保留资料 · 69/); assert.match(otherScreen.textContent, /69 条/);
  const all = h.createExplore(new URLSearchParams({ category: 'all' })); assert.match(all.textContent, /215 条/);
  for (const record of others) {
    const detail = await h.createDetail(record.id);
    assert.equal(descendants(detail).filter(node => node.dataset.coreField).length, 9, record.id);
  }
  const form = otherScreen.querySelector('form');
  const category = descendants(form).find(node => node.id === 'catalog-category'); category.value = 'other';
  form.trigger('submit'); assert.match(h.location.hash, /category=other/);
});

test('real: retained legacy usage conditions render with source links and untested limits', async t => {
  const h = await harness(t);
  const supplement = read('../catalog/core-supplement.v1.json');
  for (const id of ['A164', 'A165', 'A196']) {
    const row = supplement.records.find(record => record.recordId === id);
    const record = catalog.items.find(record => record.id === id);
    const coreInfo = makeCoreInfo({ ...record, coreSupplement: row });
    const devices = field(h.createCoreDetail({ ...record, coreInfo }, h.ui), 'devices');
    for (const condition of row.compatibility.conditions) assert.ok(devices.textContent.includes(condition));
    assert.equal(devices.querySelector('.core-item-details').open, false);
    assert.match(devices.textContent, /尚未独立实测/);
    for (const sourceId of row.compatibility.sourceIds) assert.ok(devices.querySelector('.core-sources').querySelectorAll('a').some(node => node.href === '#source-' + encodeURIComponent(sourceId)));
  }
});

test('synthetic: device details are collapsed while the conclusion and uncertainty remain visible', async t => {
  const h = await harness(t), record = { id: 'SYNTHETIC-DEVICE-DISCLOSURE', coreInfo: {
    compatibility: { summary: '示例：按公网IP与并发额度判断。', requirements: ['示例：旧套餐失效不可恢复。'], sourceIds: ['SYNTHETIC-DEVICE-SOURCE'] },
    pricing: { plans: [{ name: '示例套餐', deviceLimit: '3个公网IP，不是3台设备', sourceIds: ['SYNTHETIC-DEVICE-SOURCE'] }] }
  } };
  const devices = field(h.createCoreDetail(record, h.ui), 'devices'), details = devices.querySelector('.core-item-details');
  assert.ok(details); assert.equal(details.open, false);
  assert.equal(details.querySelector('summary').textContent, '设备限额与使用条件');
  assert.equal(devices.querySelector('.core-value').textContent, record.coreInfo.compatibility.summary);
  assert.match(devices.querySelector('.core-note').textContent, /尚未独立实测.*可用性未知/);
  assert.doesNotMatch(devices.querySelector('.core-note').textContent, /失效|3个公网IP/);
  assert.match(details.textContent, /3个公网IP，不是3台设备/); assert.match(details.textContent, /旧套餐失效不可恢复/);
  assert.ok(devices.querySelector('.core-sources').querySelectorAll('a').some(node => node.href === '#source-SYNTHETIC-DEVICE-SOURCE'));
});

test('real snapshot: all records render nine facts without fabricated measurement, founding or zero-complaint claims', async t => {
  const h = await harness(t);
  for (const record of catalog.items) {
    assert.equal(record.coreInfo.speed.measured.observations.length, 0);
    assert.equal(record.coreInfo.stability.measured.observations.length, 0);
    const detail = h.createCoreDetail(record, h.ui);
    assert.deepEqual(descendants(detail).filter(node => node.dataset.coreField).map(node => node.dataset.coreField), fields);
    assert.match(field(detail, 'speed').textContent, /实际速度未知/);
    assert.match(field(detail, 'stability').textContent, /稳定性未实测/);
    assert.doesNotMatch(field(detail, 'history').textContent, /已连续运营|确认成立于/);
    assert.match(field(detail, 'policy').textContent, /实际执行未验证/);
    assert.doesNotMatch(field(detail, 'issues').textContent, /0%|零投诉率/);
    if (!record.coreInfo.privacy?.summary) assert.match(field(detail, 'privacy').textContent, /隐私与日志未确认/);
    assert.match(field(detail, 'privacy').textContent, /站方声明不构成无日志保证/);
    assert.ok(detail.querySelectorAll('.core-sources').every(node => node.open === false));
  }
  const empty = h.createCoreDetail({ id: 'SYNTHETIC-EMPTY' }, h.ui);
  assert.match(empty.textContent, /当前价格未知/); assert.match(empty.textContent, /支付方式未知/); assert.match(empty.textContent, /时间未知/);
  assert.match(empty.textContent, /隐私与日志未确认/); assert.match(empty.textContent, /未知不等于无日志/);
  assert.doesNotMatch(empty.textContent, /0 元|0 Mbps|100%/);
});

test('real snapshot: original billing periods, updated explicit CNY, sold-out plans, add-ons and metered charges stay visible', async t => {
  const h = await harness(t), nx = catalog.items.find(record => record.id === 'A002'), oix = catalog.items.find(record => record.id === 'A015');
  const nxPrice = field(h.createCoreDetail(nx, h.ui), 'price');
  assert.match(nxPrice.textContent, /623\.7 \/ 186天/); assert.match(nxPrice.textContent, /原计费周期：186天/); assert.match(nxPrice.textContent, /附加项/);
  const oixPrice = field(h.createCoreDetail(oix, h.ui), 'price');
  assert.match(oixPrice.textContent, /CNY 192 \/ 年付/); assert.match(oixPrice.textContent, /2000 GiB \/ 所选周期总量/); assert.match(oixPrice.textContent, /售罄/); assert.match(oixPrice.textContent, /每 GiB 附加费：0\.8/);
  assert.match(oixPrice.textContent, /使用条件/); assert.match(oixPrice.textContent, /结束时间：未确认/); assert.match(oixPrice.textContent, /最终折扣与结算总额均未验证/);
  assert.equal(oixPrice.querySelector('.core-plan-details').open, false);
  assert.equal(oix.coreInfo.pricing.plans.length, 36);
  assert.match(oixPrice.textContent, /临界值是公平使用积分倍率/);
  const developer = oix.coreInfo.pricing.plans.find(p => p.name === 'Developer Licenses');
  assert.equal(developer.amount, null);
  assert.equal(oix.coreInfo.pricing.plans.filter(p => p.soldOut).length, 8);
  assert.equal(oix.coreInfo.payment.evidenceLevel, 'authenticated_checkout');
  assert.equal(oix.coreInfo.payment.transactionVerified, false);
});

test('real core-auth: ByWave starting prices, reset charges, regional limits and refund terms retain their boundaries', async t => {
  const h = await harness(t);
  // Read only the structured business claims; never read authenticated page bodies.
  const supplement = read('../catalog/refresh/2026-10-26/core-auth/claims.json').records.find(record => record.recordId === 'A018');
  const base = catalog.items.find(record => record.id === 'A018');
  const coreInfo = makeCoreInfo({ ...base, coreSupplement: supplement }, { asOf: supplement.checkedAt });
  const record = { ...base, coreInfo };
  assert.equal(coreInfo.pricing.plans.length, 4);
  assert.deepEqual(coreInfo.pricing.plans.map(plan => plan.amount), [30, 60, 110, 140]);
  assert.ok(coreInfo.pricing.plans.slice(0, 3).every(plan => plan.amountBasis === 'advertised_starting_price_not_period_total'));
  assert.equal(coreInfo.pricing.plans[3].amountBasis, 'original_billing_period_total');
  const card = h.createCoreCard(record, h.ui);
  assert.match(card.querySelector('.core-card-price').textContent, /30 \/ 月起（币种未知）/);
  assert.match(card.querySelector('.core-card-price').textContent, /起价不代表月付总额/);
  const detail = h.createCoreDetail(record, h.ui), price = field(detail, 'price');
  for (const expected of [/30 \/ 月起/, /60 \/ 月起/, /110 \/ 月起/, /140 \/ 年/, /未确认各周期总价/, /手动重置价格 ¥24\.00 \/ 次/, /手动重置价格 ¥48\.00 \/ 次/, /手动重置价格 ¥88\.00 \/ 次/, /仅限中国大陆/, /海外及新疆/, /不保证TikTok能用/, /有效期内不重置/]) assert.match(price.textContent, expected);
  const refund = field(detail, 'policy');
  assert.match(refund.textContent, /不接受退款/); assert.match(refund.textContent, /技术故障异常重复扣款/);
  assert.match(refund.textContent, /当前条款与执行情况未独立验证/); assert.match(refund.textContent, /实际执行未验证/);
  assert.equal(coreInfo.refund.executionVerified, false);
  assert.match(field(detail, 'payment').textContent, /支付方式未知/);
  const speed = field(detail, 'speed');
  assert.match(speed.textContent, /实际速度未知/);
  assert.ok(coreInfo.speed.advertised.length > 0);
  for (const claim of coreInfo.speed.advertised) if (claim.summary) assert.ok(speed.textContent.includes(claim.summary));
  assert.match(speed.textContent, /站方宣传/); assert.match(speed.textContent, /非本站实测/);
});

test('real core-auth: SpeedCat keeps eleven shop rows, add-on dependencies, period conflict and unverified Alipay preview', async t => {
  const h = await harness(t);
  const supplement = read('../catalog/refresh/2026-10-26/core-auth/claims.json').records.find(record => record.recordId === 'A006');
  const base = catalog.items.find(record => record.id === 'A006');
  const coreInfo = makeCoreInfo({ ...base, coreSupplement: supplement }, { asOf: supplement.checkedAt });
  assert.equal(coreInfo.pricing.plans.length, 11);
  assert.equal(coreInfo.pricing.plans.filter(plan => plan.addon && typeof plan.addon === 'object').length, 4);
  assert.ok(coreInfo.pricing.plans.every(plan => plan.checkoutVerified === false && plan.currency === null));
  const detail = h.createCoreDetail({ ...base, coreInfo }, h.ui), price = field(detail, 'price');
  for (const expected of [/请不要单独购买，这不是套餐/, /跟着套餐重置/, /不限制客户端数量/, /各计划列表统一显示\/月/, /年付和一次性套餐卡片周期不一致/, /付费前须复核周期/, /未点击立即支付/]) assert.match(price.textContent, expected);
  assert.equal(coreInfo.payment.evidenceLevel, 'authenticated_checkout');
  assert.equal(coreInfo.payment.checkoutObserved, true); assert.equal(coreInfo.payment.transactionVerified, false);
  assert.deepEqual(coreInfo.payment.methods, ['支付宝']);
  const payment = field(detail, 'payment');
  assert.match(payment.textContent, /支付宝/); assert.match(payment.textContent, /收银台说明/);
  assert.match(payment.textContent, /当前收款、到账未验证/);
  assert.doesNotMatch(payment.textContent, /交易已验证|已验证到账/);
  assert.match(field(detail, 'speed').textContent, /实际速度未知/);
});

test('real core-auth batch2: EdNovas keeps quoted/unknown prices, restrictions, conflicting refund text and distinct promotion sources', async t => {
  const h = await harness(t);
  const supplement = read('../catalog/refresh/2026-10-26/core-auth-batch2/claims.json').records.find(record => record.recordId === 'A020');
  const base = catalog.items.find(record => record.id === 'A020');
  const coreInfo = makeCoreInfo({ ...base, coreSupplement: supplement }, { asOf: supplement.checkedAt });
  const record = { ...base, coreInfo };
  assert.equal(coreInfo.pricing.plans.length, 15);
  assert.equal(coreInfo.pricing.plans.filter(plan => typeof plan.amount === 'number').length, 14);
  assert.equal(coreInfo.pricing.plans.find(plan => plan.name === '玲珑').amount, null);
  assert.equal(coreInfo.pricing.plans.find(plan => plan.name === '管中窥天').soldOut, true);
  assert.ok(coreInfo.pricing.plans.every(plan => plan.currency === null && plan.checkoutVerified === false));
  const detail = h.createCoreDetail(record, h.ui), price = field(detail, 'price');
  const custom = price.querySelectorAll('.core-term').find(node => node.querySelector('h4')?.textContent === '玲珑');
  assert.equal(custom.querySelector('p').textContent, '金额未知');
  assert.match(custom.textContent, /未取得具体报价/); assert.match(custom.textContent, /不将该显示金额采为可购买价格/);
  for (const expected of [/页面标为售罄/, /不适用于境外用户/, /面向境外用户，中国大陆用户不适用/, /每月不会重置流量，一年过期/, /每位用户限一次/, /最终折扣与结算总额均未验证/]) assert.match(price.textContent, expected);
  assert.match(h.createCoreCard(record, h.ui).textContent, /页面标为售罄/);
  const sourceHrefs = price.querySelector('.core-sources').querySelectorAll('a').map(node => node.href);
  assert.ok(sourceHrefs.includes('#source-CORE-AUTH-EDNOVAS-B2-PLANS'));
  assert.ok(sourceHrefs.includes('#source-CORE-AUTH-EDNOVAS-B2-ANNOUNCEMENT'));
  assert.equal(new Set(sourceHrefs).size, sourceHrefs.length);
  const refund = field(detail, 'policy');
  for (const expected of [/暂停所有退款方式/, /仍保留旧退款流程/, /不能据此承诺目前可退款/, /实际执行未验证/]) assert.match(refund.textContent, expected);
  assert.equal(coreInfo.refund.executionVerified, false);
  assert.match(field(detail, 'payment').textContent, /帮助页提及/);
  assert.equal(coreInfo.payment.transactionVerified, false);
});

test('real core-auth batch2: Mesl preserves period totals, custom quote conflict, unknown payment and stated logging', async t => {
  const h = await harness(t);
  const supplement = read('../catalog/refresh/2026-10-26/core-auth-batch2/claims.json').records.find(record => record.recordId === 'A017');
  const base = catalog.items.find(record => record.id === 'A017');
  const coreInfo = makeCoreInfo({ ...base, coreSupplement: supplement }, { asOf: supplement.checkedAt });
  const record = { ...base, coreInfo };
  assert.equal(coreInfo.pricing.plans.length, 10);
  assert.equal(coreInfo.pricing.plans.filter(plan => typeof plan.amount === 'number').length, 9);
  assert.equal(coreInfo.pricing.plans.find(plan => plan.name === 'Premium Enterprise Service').amount, null);
  const card = h.createCoreCard(record, h.ui);
  assert.match(card.querySelector('.core-card-price').querySelector('strong').textContent, /155 \/ 年/);
  assert.doesNotMatch(card.querySelector('.core-card-price').querySelector('strong').textContent, /12\.92|155 \/ 月/);
  const detail = h.createCoreDetail(record, h.ui), price = field(detail, 'price');
  for (const expected of [/155 \/ 年/, /72 \/ 季/, /9项标价及1项定制待询价/, /其他地区用户勿购买/]) assert.match(price.textContent, expected);
  const enterprise = price.querySelectorAll('.core-term').find(node => node.querySelector('h4')?.textContent === 'Premium Enterprise Service');
  assert.equal(enterprise.querySelector('p').textContent, '金额未知');
  for (const expected of [/标题显示¥1000\/月/, /500CNY\/月起/, /购买前联系工单/, /不将标题金额视为已确认套餐总额/, /SLA为商家条款主张，不是实测可用率/]) assert.match(enterprise.textContent, expected);
  const payment = field(detail, 'payment');
  for (const expected of [/支付方式未知/, /最低充值¥50\.00/, /未发起充值/, /渠道保持未确认/]) assert.match(payment.textContent, expected);
  assert.equal(coreInfo.payment.evidenceLevel, 'unknown'); assert.equal(coreInfo.payment.transactionVerified, false);
  assert.ok(payment.querySelector('.core-sources').querySelectorAll('a').some(node => node.href === '#source-CORE-AUTH-MESL-B2-WALLET'));
  const policy = field(detail, 'policy');
  for (const expected of [/重大故障例外也不是保证退款/, /属于付费购买建议/, /未见免费试用承诺/, /不能将付费短期体验理解为免费试用或退款保障/, /实际执行未验证/]) assert.match(policy.textContent, expected);
  assert.equal(coreInfo.refund.executionVerified, false); assert.equal(coreInfo.trial.executionVerified, false);
  assert.equal(coreInfo.privacy.independentlyAudited, false); assert.equal(coreInfo.privacy.retentionPeriod, null);
  const privacy = field(detail, 'privacy');
  for (const expected of [/连接时间/, /源IP/, /目标域名/, /流量统计/, /保存期限：未确认/, /独立审计未确认/, /不构成无日志保证/]) assert.match(privacy.textContent, expected);
  assert.ok(privacy.querySelector('.core-sources').querySelectorAll('a').some(node => node.href === '#source-CORE-AUTH-MESL-B2-TERMS'));
  assert.match(field(detail, 'history').textContent, /未确认|未知/);
  assert.doesNotMatch(field(detail, 'history').textContent, /2022|2022-02-01/);
  assert.match(field(detail, 'speed').textContent, /实际速度未知/);
  assert.match(field(detail, 'stability').textContent, /稳定性未实测/);
});

test('real core-auth batch3: conflicting candidate brands warn on cards and compatibility keeps plan device limits', async t => {
  const h = await harness(t);
  const claims = read('../catalog/refresh/2026-10-26/core-auth-batch3/claims.json').records;
  const observedBrands = { A176: '九霄云', A042: 'SNTP' };
  for (const [id, brand] of Object.entries(observedBrands)) {
    const supplement = claims.find(record => record.recordId === id);
    assert.ok(supplement, id + ' structured business claim exists');
    const base = catalog.items.find(record => record.id === id);
    const coreInfo = makeCoreInfo({ ...base, coreSupplement: supplement }, { asOf: supplement.checkedAt });
    assert.equal(coreInfo.website.status, 'brand_name_conflict');
    const record = { ...base, coreInfo }, card = h.createCoreCard(record, h.ui), detail = h.createCoreDetail(record, h.ui);
    for (const warning of [card.querySelector('.core-card-identity'), detail.querySelector('.core-identity-note')]) {
      assert.ok(warning, id + ' identity warning is visible');
      assert.ok(warning.textContent.includes(brand));
      assert.match(warning.textContent, /品牌名与归属待核/);
      assert.match(warning.textContent, /候选入口/);
      assert.match(warning.textContent, /不能据此认定更名/);
    }
    if (id === 'A042') {
      assert.equal(coreInfo.compatibility.independentlyTested, false);
      const devices = field(detail, 'devices');
      for (const expected of [/旧.*APP/i, /Mihomo/i, /DNS/, /站方兼容性说明尚未独立实测/, /你所在网络的可用性未知/]) assert.match(devices.textContent, expected);
      const limits = [...new Set(coreInfo.pricing.plans.map(plan => plan.maxDevices).filter(value => typeof value === 'number'))];
      assert.ok(limits.length, 'real plan contains a device count alongside the compatibility notice');
      for (const limit of limits) assert.ok(devices.textContent.includes('设备数 ' + limit));
      const sourceHrefs = devices.querySelector('.core-sources').querySelectorAll('a').map(node => node.href);
      assert.ok(coreInfo.compatibility.sourceIds.length);
      for (const id of coreInfo.compatibility.sourceIds) assert.ok(sourceHrefs.includes('#source-' + encodeURIComponent(id)));
      assert.equal(descendants(detail).filter(node => node.dataset.coreField).length, 9);
    }
  }
});

test('real core-auth batch4: pricing warnings are visible before expanding terms and conflicting amounts remain unknown', async t => {
  const h = await harness(t);
  const claims = read('../catalog/refresh/2026-10-26/core-auth-batch4/claims.json').records;
  let unknownCount = 0, knownCount = 0;
  for (const id of ['A143', 'A152']) {
    const supplement = claims.find(record => record.recordId === id);
    assert.ok(supplement, id + ' structured business claim exists');
    const base = catalog.items.find(record => record.id === id);
    const coreInfo = makeCoreInfo({ ...base, coreSupplement: supplement }, { asOf: supplement.checkedAt });
    assert.ok(coreInfo.pricing.limitation, id + ' has an explicit backend pricing limitation');
    const originalPlans = JSON.stringify(coreInfo.pricing.plans);
    const record = { ...base, coreInfo }, card = h.createCoreCard(record, h.ui), price = field(h.createCoreDetail(record, h.ui), 'price');
    assert.ok(card.querySelector('.core-card-price').querySelector('p').textContent.includes(coreInfo.pricing.limitation));
    assert.ok(price.querySelector('.core-note').textContent.includes(coreInfo.pricing.limitation));
    assert.equal(price.querySelector('.core-plan-details').open, false, 'the warning is visible while detailed terms remain closed');
    const rows = price.querySelectorAll('.core-term');
    for (const [index, plan] of coreInfo.pricing.plans.entries()) {
      const row = rows[index];
      assert.ok(row, plan.name + ' is rendered');
      assert.equal(row.querySelector('h4').textContent, plan.name);
      if (plan.amount === null) {
        unknownCount++;
        assert.equal(row.querySelector('p').textContent, '金额未知');
      } else {
        knownCount++;
        assert.ok(row.querySelector('p').textContent.includes(String(plan.amount)), 'retain the actual quoted amount');
        assert.ok(row.textContent.includes('原计费周期：' + plan.billingPeriod), 'retain the original billing period');
      }
    }
    assert.equal(JSON.stringify(coreInfo.pricing.plans), originalPlans, 'rendering does not rewrite amounts');
  }
  assert.ok(unknownCount >= 3, 'real conflict rows keep null amounts');
  assert.ok(knownCount > 0, 'normal B4 quotes remain present alongside conflicting rows');
});

test('real FlyBit operator notice: show dated risk text without opening terms or implying a user complaint or measurement', async t => {
  const h = await harness(t);
  const supplement = read('../catalog/refresh/2026-10-26/core-auth-batch4/claims.json').records.find(record => record.recordId === 'A145');
  const base = catalog.items.find(record => record.id === 'A145');
  const coreInfo = makeCoreInfo({ ...base, coreSupplement: supplement }, { asOf: supplement.checkedAt });
  const notice = coreInfo.stability.recentIssues.find(event => event.sourceIds.includes('CORE-AUTH-FLYBIT-B4-NETWORK-NOTICE'));
  assert.ok(notice, 'the dated, sourced operator notice is admitted by the backend');
  assert.equal(notice.createdAt, '2026-10-26'); assert.equal(notice.independentlyVerified, false);
  const date = (value, full = false) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', ...(full ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(new Date(value));
  const record = { ...base, coreInfo }, detail = h.createCoreDetail(record, { ...h.ui, date }), issues = field(detail, 'issues');
  const note = issues.querySelector('.core-note').textContent;
  assert.ok(note.includes(coreInfo.stability.recentIssues[0].summary), 'first backend-selected event is visible in the uncollapsed note');
  assert.ok(note.includes(notice.summary));
  assert.match(note, /材料日期：2026-10-26）/);
  assert.doesNotMatch(note, /材料日期：2026\/10\/26 08:00|材料日期：2026-10-26 08:00/);
  for (const expected of [/尚未独立核实/, /来源覆盖不完整/, /不等于独立投诉人数或投诉率/]) assert.match(note, expected);
  assert.match(notice.summary, /站方|公告/);
  assert.equal(field(detail, 'stability').querySelector('.core-value').textContent, '稳定性未实测');
  const href = '#source-CORE-AUTH-FLYBIT-B4-NETWORK-NOTICE';
  const source = issues.querySelector('.core-sources').querySelectorAll('a').find(node => node.href === href);
  assert.ok(source);
  const drawer = h.ui.el('details', 'evidence-drawer'); drawer.append(h.sourcesSection(record, h.state.sources)); h.document.body.append(detail, drawer);
  const event = source.trigger('click');
  assert.equal(event.defaultPrevented, true); assert.equal(drawer.open, true);
  assert.ok(h.document.getElementById('source-CORE-AUTH-FLYBIT-B4-NETWORK-NOTICE').scrolled);
});

test('synthetic only: empty pricing preserves the backend gap reason without declaring there are no sales', async t => {
  const h = await harness(t), reason = 'SYNTHETIC：报价页尚未取得，当前套餐与金额未确认。';
  const record = { id: 'SYNTHETIC-NO-QUOTE', coreInfo: { pricing: { plans: [], limitation: reason } } };
  const card = h.createCoreCard(record, h.ui), price = field(h.createCoreDetail(record, h.ui), 'price');
  assert.equal(card.querySelector('.core-card-price').querySelector('strong').textContent, '当前价格未知');
  assert.equal(card.querySelector('.core-card-price').querySelector('p').textContent, reason);
  assert.equal(price.querySelector('.core-note').textContent, reason);
  assert.doesNotMatch(price.textContent, /无售|停售|不再出售|没有套餐出售/);
});

test('real core-speed batch3: original report units remain visible without becoming our measurements', async t => {
  const h = await harness(t);
  const claims = read('../catalog/refresh/2026-10-26/core-speed-batch3/claims.json').records;
  let reportCount = 0;
  for (const supplement of claims) {
    const base = catalog.items.find(record => record.id === supplement.recordId);
    assert.ok(base, supplement.recordId + ' exists in the public catalog');
    const coreInfo = makeCoreInfo({ ...base, coreSupplement: supplement }, { asOf: supplement.checkedAt });
    assert.equal(coreInfo.speed.measured.observations.length, 0);
    const speed = field(h.createCoreDetail({ ...base, coreInfo }, h.ui), 'speed');
    assert.equal(speed.querySelector('.core-value').textContent, '实际速度未知');
    for (const claim of coreInfo.speed.advertised) {
      if (claim.summary) assert.ok(speed.textContent.includes(claim.summary));
      assert.match(speed.textContent, /站方宣传/);
      assert.match(speed.textContent, /非本站实测/);
    }
    const reports = speed.querySelectorAll('.core-external-report');
    assert.equal(reports.length, coreInfo.speed.externalReports.length);
    for (const [index, report] of coreInfo.speed.externalReports.entries()) {
      reportCount++;
      const row = reports[index];
      const visibleNote = speed.querySelector('.core-note').textContent;
      assert.ok(visibleNote.includes('测试日期：' + (report.testedAt ? report.testedAt.slice(0, 10) : '未知')));
      if (report.publishedAt) assert.ok(visibleNote.includes('发布日期：' + report.publishedAt.slice(0, 10)));
      for (const metric of report.metrics) assert.ok(row.textContent.includes(metric.valueText), 'preserve original metric text and unit');
      for (const [key, label] of [['testedAt', '报告测试时间'], ['publishedAt', '报告发布时间'], ['observedAt', '本站采集时间']]) assert.ok(row.textContent.includes(label + '：' + (report[key] || '未说明')));
      assert.match(row.textContent, /节点数不等于测量样本数/);
      if (!Number.isSafeInteger(report.sampleCount)) assert.match(row.textContent, /测量样本数：未说明/);
      assert.match(row.textContent, /商业关系：/);
      assert.match(row.textContent, /未经本站独立复核/);
      assert.match(row.textContent, /不保证当前或其他用户的实际速度/);
      const sourceHrefs = speed.querySelector('.core-sources').querySelectorAll('a').map(node => node.href);
      for (const id of report.sourceIds) assert.ok(sourceHrefs.includes('#source-' + encodeURIComponent(id)));
    }
  }
  assert.ok(reportCount > 0, 'real original third-party reports are present');
});

test('real report date-only precision: retain calendar dates while formatting actual collection timestamps', async t => {
  const h = await harness(t);
  const claims = read('../catalog/refresh/2026-10-26/core-speed-batch3/claims.json').records;
  const calls = [];
  // Browser failure retained here: the old formatter rendered A176's date-only
  // 2026-08-24 as 2026/08/24 08:00 in Asia/Shanghai, inventing a test time.
  const date = (value, full = false) => {
    calls.push({ value, full });
    return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', ...(full ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(new Date(value));
  };
  let dateOnlyCount = 0, timestampCount = 0;
  for (const supplement of claims) {
    const base = catalog.items.find(record => record.id === supplement.recordId);
    const coreInfo = makeCoreInfo({ ...base, coreSupplement: supplement }, { asOf: supplement.checkedAt });
    const rows = field(h.createCoreDetail({ ...base, coreInfo }, { ...h.ui, date }), 'speed').querySelectorAll('.core-external-report');
    for (const [index, report] of coreInfo.speed.externalReports.entries()) {
      for (const [key, label] of [['testedAt', '报告测试时间'], ['publishedAt', '报告发布时间']]) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(report[key] || '')) continue;
        dateOnlyCount++;
        const line = rows[index].children.find(node => node.textContent.startsWith(label + '：'));
        assert.equal(line.textContent, label + '：' + report[key], 'date-only evidence must not acquire hours and minutes');
      }
      if (report.observedAt && /T\d{2}:\d{2}/.test(report.observedAt)) {
        timestampCount++;
        const line = rows[index].children.find(node => node.textContent.startsWith('本站采集时间：'));
        assert.equal(line.textContent, '本站采集时间：' + date(report.observedAt, true));
      }
      if (report.timeWindow) assert.ok(rows[index].textContent.includes('测量时段：' + report.timeWindow));
    }
  }
  assert.ok(dateOnlyCount >= 3, 'actual A176/A049 test and publication dates exercise date-only evidence');
  assert.ok(timestampCount > 0, 'actual collection timestamps retain their recorded time');
  assert.ok(!calls.some(call => /^\d{4}-\d{2}-\d{2}$/.test(call.value || '') && call.full), 'date-only values never request precise time formatting');
});

test('synthetic only: admitted scoped measurement DTOs render metrics, method, sample and conditions', async t => {
  const h = await harness(t);
  const asOf = '2026-10-26T08:00:00Z';
  const sample = { sourceIds: ['SYNTHETIC-MEASUREMENT'], region: 'SYNTHETIC-REGION', network: 'SYNTHETIC-NETWORK', plan: 'SYNTHETIC-PLAN', methodology: 'SYNTHETIC-METHOD', sampleCount: 12, peakHours: 'SYNTHETIC-PEAK-WINDOW' };
  const coreInfo = makeCoreInfo({ id: 'SYNTHETIC-MEASURED', category: 'airport', coreSupplement: { checkedAt: asOf, speed: { measurements: [{ ...sample, testedAt: '2026-10-25T11:00:00Z', downloadMbpsQuantiles: { p50: 42.5 }, uploadMbps: 8, latencyMs: 91 }] }, stability: { measurements: [{ ...sample, windowStart: '2026-10-24T00:00:00Z', windowEnd: '2026-10-25T00:00:00Z', availabilityPct: 97.5, packetLossPct: 2.5 }] } } }, { asOf });
  assert.equal(coreInfo.speed.measured.status, 'scoped_measurements_available');
  assert.equal(coreInfo.stability.measured.status, 'scoped_measurements_available');
  const detail = h.createCoreDetail({ coreInfo }, h.ui);
  assert.match(field(detail, 'speed').textContent, /下载中位数 42\.5 Mbps/); assert.match(field(detail, 'speed').textContent, /延迟 91 ms/);
  assert.match(field(detail, 'stability').textContent, /可用率 97\.5%/);
  for (const key of ['speed', 'stability']) for (const expected of [/SYNTHETIC-REGION/, /SYNTHETIC-NETWORK/, /SYNTHETIC-METHOD/, /SYNTHETIC-PEAK-WINDOW/, /12 个样本/, /仅适用于/]) assert.match(field(detail, key).textContent, expected);
  coreInfo.speed.measured.observations[0].downloadMbpsQuantiles = { p10: 3.25 };
  coreInfo.speed.measured.observations[0].uploadMbps = null;
  const p10 = field(h.createCoreDetail({ coreInfo }, h.ui), 'speed');
  assert.match(p10.textContent, /下载 P10 3\.25 Mbps/); assert.doesNotMatch(p10.textContent, /下载中位数/);
  coreInfo.speed.measured.status = 'not_confirmed';
  assert.match(field(h.createCoreDetail({ coreInfo }, h.ui), 'speed').textContent, /实际速度未知/);
});

test('actual source callbacks: multiple references expand all enclosing drawers and missing metadata is explicit', async t => {
  const h = await harness(t);
  const record = { id: 'SYNTHETIC-REFS', coreInfo: { pricing: { plans: [{ amount: 9, currency: 'USD', billingPeriod: '31天', sourceIds: ['SYNTHETIC-A', 'SYNTHETIC-B'] }] } } };
  const detail = h.createCoreDetail(record, h.ui), refs = field(detail, 'price').querySelector('.core-sources');
  assert.equal(refs.open, false); assert.equal(refs.querySelectorAll('a').length, 2);
  const outer = h.ui.el('details', 'evidence-drawer'), inner = h.ui.el('details');
  inner.append(h.sourcesSection(record, new Map([['SYNTHETIC-A', { id: 'SYNTHETIC-A', label: 'SYNTHETIC SOURCE' }]]))); outer.append(inner); h.document.body.append(detail, outer);
  refs.open = true;
  const event = refs.querySelectorAll('a')[1].trigger('click');
  assert.equal(event.defaultPrevented, true); assert.equal(outer.open, true); assert.equal(inner.open, true);
  const target = h.document.getElementById('source-SYNTHETIC-B');
  assert.deepEqual(target.scrolled, { block: 'start', behavior: 'auto' }); assert.match(target.textContent, /来源目录中暂缺此条/);
});

test('data explanation leads with user boundaries and keeps audit links in a closed appendix', async t => {
  const h = await harness(t), page = h.methodPage(), appendix = page.querySelector('.method-appendix');
  for (const expected of [/实际结算/, /没有合格的实际速度或稳定性测量/, /成立时间与历史材料/, /投诉来源/, /核对时间/, /退款/, /不会自动发送/]) assert.match(page.textContent, expected);
  assert.equal(appendix.open, false);
  assert.ok(appendix.querySelectorAll('a').some(node => node.href === '#/ledger'));
  assert.ok(appendix.querySelectorAll('a').some(node => node.href === '#/verify'));
  const source = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
  assert.doesNotMatch(source, /function probability\(|function detailAside\(|function principles\(/);
});

test('synthetic: annual-plan monthly equivalent is not rendered as an original period total', async t => {
  const h = await harness(t);
  const base = { id: 'SYNTHETIC-EQUIVALENT', category: 'airport' };
  const coreInfo = makeCoreInfo({ ...base, coreSupplement: { pricing: { plans: [{ name: 'SYNTHETIC annual equivalent', amount: 38.25, amountBasis: 'advertised_monthly_equivalent_not_period_total', billingPeriod: '年付折算每月', currencySymbol: '＄', sourceIds: ['SYNTHETIC-PRICE'] }] } } });
  const card = h.createCoreCard({ ...base, coreInfo }, h.ui);
  const price = card.querySelector('.core-card-price').textContent;
  assert.match(price, /38\.25/);
  assert.match(price, /年付折算月价，不是月付金额/);
  assert.doesNotMatch(price, /按原计费周期展示|459/);
  const detail = field(h.createCoreDetail({ ...base, coreInfo }, h.ui), 'price').textContent;
  assert.match(detail, /价格口径：年付折算每月/);
  assert.doesNotMatch(detail, /原计费周期：/);
});

test('real batch82: report scope and method-conflict summary stays visible before expanding details', async t => {
  const h=await harness(t);
  const claims=read('../catalog/refresh/2026-10-26/core-auth-batch82/claims.json').records;
  for(const supplement of claims){
    const base=catalog.items.find(x=>x.id===supplement.recordId);
    const coreInfo=makeCoreInfo({...base,coreSupplement:supplement},{asOf:supplement.checkedAt});
    const speed=field(h.createCoreDetail({...base,coreInfo},h.ui),'speed');
    const note=speed.querySelector('.core-note').textContent;
    const report=coreInfo.speed.externalReports[0];
    assert.ok(note.includes(report.summary),'default card must retain the qualified summary, not only numeric metrics');
    assert.equal(speed.querySelector('.core-value').textContent,'实际速度未知');
    const detail=speed.querySelector('.core-external-report');
    for(const metric of report.metrics)assert.ok(detail.textContent.includes(metric.valueText),'all original metric text remains in details');
    if(supplement.recordId==='A142'){
      assert.ok(note.includes('方法有冲突且直连基准失败'));
      assert.ok(note.includes('不同分母'));
    }
  }
});

test('real batch90: default issue cards show the newest original statement supplied by the backend', async t => {
  const h = await harness(t);
  const claims = read('../catalog/refresh/2026-10-26/core-auth-batch90/claims.json').records;
  for (const id of ['A036', 'A073']) {
    const base = catalog.items.find(x => x.id === id), supplement = claims.find(x => x.recordId === id);
    const coreInfo = makeCoreInfo({ ...base, coreSupplement: supplement }, { asOf: '2026-10-27T16:16:00Z' });
    const issue = field(h.createCoreDetail({ ...base, coreInfo }, h.ui), 'issues');
    const note = issue.querySelector('.core-note').textContent;
    assert(note.includes('最新材料（材料日期：2026-10-27）'));
    assert(note.includes(coreInfo.stability.recentIssues[0].summary));
    assert(note.includes('尚未独立核实'));
    assert(note.includes('线索数不等于独立投诉人数或投诉率'));
    assert(!note.includes('首条材料'));
  }
});

test('real batch92: default issue card keeps partial recovery alongside the newer configuration complaint', async t => {
  const h = await harness(t);
  const base = catalog.items.find(x => x.id === 'A026');
  const issue = field(h.createCoreDetail(base, h.ui), 'issues');
  const note = issue.querySelector('.core-note').textContent;
  assert(note.includes('导入Clash'));
  assert(note.includes('最新材料（材料日期：2026-10-27）'));
  assert(note.includes('最新恢复材料（材料日期：2026-10-24）'));
  assert(note.includes('仍非所有节点正常'));
  assert(note.includes('恢复范围与当前状态尚未独立核实'));
  assert(note.includes('线索数不等于独立投诉人数或投诉率'));
});

test('real payment source qualifier remains in the prominent detail summary as well as the list card', async t => {
  const h = await harness(t);
  const cases = [
    ['A002', 'image_only', '（仅图标）'],
    ['A019', 'help_reference', '（帮助页提及）'],
    ['A001', 'public_text', '（站方说明）'],
    ['A006', 'authenticated_checkout', '（收银台说明）'],
    ['A026', 'public_checkout', '（公开结算页）']
  ];
  for (const [id, level, qualifier] of cases) {
    const record = catalog.items.find(item => item.id === id);
    assert(record, id);
    assert.equal(record.coreInfo.payment.evidenceLevel, level, id);
    const payment = field(h.createCoreDetail(record, h.ui), 'payment');
    const prominent = payment.querySelector('.core-value').textContent;
    assert(prominent.endsWith(qualifier), id + ': source qualification must be visible without reading the note');
    assert(h.createCoreCard(record, h.ui).textContent.includes(prominent), id + ': list and detail must describe the same evidence');
    assert.match(payment.querySelector('.core-note').textContent, /当前收款、到账未验证/);
    assert.doesNotMatch(payment.textContent, /交易已验证|已验证到账/);
  }
});

test('unknown payment fixture stays unknown without implying a checkout or source upgrade', async t => {
  const h = await harness(t);
  // A real airport can acquire new payment evidence; do not freeze its unknown state.
  const record = { id: 'SYNTHETIC-UNKNOWN-PAYMENT', name: 'Synthetic unknown payment', category: 'airport',
    coreInfo: makeCoreInfo({ id: 'SYNTHETIC-UNKNOWN-PAYMENT', name: 'Synthetic unknown payment', category: 'airport' }) };
  assert.equal(record.coreInfo.payment.evidenceLevel, 'unknown');
  assert.deepEqual(record.coreInfo.payment.methods, []);
  const payment = field(h.createCoreDetail(record, h.ui), 'payment');
  assert.equal(payment.querySelector('.core-value').textContent, '支付方式未知');
  assert.equal(record.coreInfo.payment.checkoutObserved, false);
  assert.equal(record.coreInfo.payment.transactionVerified, false);
});


test('real OIX current offers: duplicate advertised limits collapse only in overview; source-specific details remain', async t => {
 const h = await harness(t), record = catalog.items.find(x => x.id === 'A015');
 const speed = field(h.createCoreDetail(record, h.ui), 'speed');
 const note = speed.querySelector('.core-note').textContent;
 assert.equal((note.match(/标称带宽 500 Mbps/g) || []).length, 1);
 for (const value of [100,200,300,500,600]) assert.ok(note.includes('标称带宽 '+value+' Mbps'));
 assert.match(note, /非本站实测/);
 assert.equal(speed.querySelector('.core-value').textContent, '实际速度未知');
 assert.equal(speed.querySelectorAll('.core-term').length, record.coreInfo.speed.advertised.length);
 assert.ok(record.coreInfo.speed.advertised.length > 20);
 assert.match(speed.textContent, /宣传采集时间/);
 assert.match(speed.textContent, /涉及套餐：Pass Iron/);
});


test('real B111: authenticated prices retain currency, IP, fee, trial and quota conflicts', async t => {
 const h = await harness(t), get = id => catalog.items.find(r => r.id === id);
 const sky = get('A060').coreInfo;
 const conflict = sky.pricing.plans.find(p => p.name === 'Once 2000GB一期');
 assert.match(conflict.quota, /2000GB.*1000G/);
 assert.equal(conflict.maxDevices, null); assert.match(conflict.deviceLimit, /公网IP/);
 assert.equal(sky.pricing.plans.find(p => p.name === '试用').amount, 100);
 assert.match(sky.trial.summary, /未见免费/);
 const sf = get('A068').coreInfo.pricing.plans.find(p => p.billingPeriod === '年付');
 assert.equal(sf.amount, 119); assert.match(sf.quota, /180G\/年/); assert.equal(sf.maxDevices, 5);
 const chick = get('A062').coreInfo.pricing.plans[0];
 assert.equal(chick.amount, 108); assert.equal(chick.billingPeriod, '年付');
 for (const p of get('A071').coreInfo.pricing.plans) { assert.equal(p.currency, null); assert.equal(p.additionalCharges.currency, 'CNY'); assert.equal(p.maxDevices, 5); }
 for (const p of get('A078').coreInfo.pricing.plans) assert.match(p.additionalCharges.summary, /不含手续费/);
 const y = get('A021').coreInfo.pricing.plans.filter(p => /TEAM/.test(p.name));
 assert.equal(y.length, 2); for (const p of y) {assert.equal(p.maxDevices, null); assert.match(p.deviceLimit, /IP不是设备数/); assert.match(p.quota, /GiB/);}
 assert.ok(get('A070').coreInfo.pricing.plans.every(p => p.currency === 'CNY'));
 for (const id of ['A050','A060','A062','A068','A070','A071','A078']) {
   const r = get(id), detail = h.createCoreDetail(r, h.ui);
   assert.notEqual(field(detail, 'price').querySelector('.core-value').textContent, '当前价格未知', id);
   assert.equal(field(detail, 'speed').querySelector('.core-value').textContent, '实际速度未知', id);
   assert.equal(field(detail, 'stability').querySelector('.core-value').textContent, '稳定性未实测', id);
   assert.equal(r.coreInfo.pricing.checkoutVerified, false);
 }
});

test('real B111: OIX cashier upgrades options without claiming payment or a package checkout', async t => {
 const h = await harness(t), r = catalog.items.find(r => r.id === 'A015');
 assert.equal(r.coreInfo.payment.evidenceLevel, 'authenticated_checkout');
 assert.deepEqual(r.coreInfo.payment.methods, ['支付宝','微信','USDT (TRC20)','USDT (Polygon)','USDT (BSC)']);
 assert.equal(r.coreInfo.payment.transactionVerified, false);
 assert.match(r.coreInfo.payment.reason, /充值收银台/);
 assert.match(r.coreInfo.payment.reason, /未输入充值金额/);
 const payment = field(h.createCoreDetail(r, h.ui), 'payment');
 assert.match(payment.querySelector('.core-value').textContent, /收银台说明/);
 assert.match(payment.textContent, /到账未验证/);
});


test('synthetic: backend-selected headline does not turn sold-out or addon prices into a base offer', async t => {
  const h = await harness(t), plans = [
    {name:'SYNTHETIC SOLD',amount:10,currency:'CNY',billingPeriod:'月付',soldOut:true,sourceIds:['SYNTHETIC']},
    {name:'SYNTHETIC ADDON',amount:5,currency:'CNY',billingPeriod:'一次性',addon:true,sourceIds:['SYNTHETIC']},
    {name:'SYNTHETIC BASE',amount:29,currency:'CNY',billingPeriod:'月付',sourceIds:['SYNTHETIC']}
  ];
  const record = p => ({id:'SYNTHETIC-PRICE-SUMMARY',coreInfo:makeCoreInfo({id:'SYNTHETIC-PRICE-SUMMARY',coreSupplement:{pricing:{plans:p}}})});
  const card = h.createCoreCard(record(plans),h.ui); assert.equal(card.querySelector('.core-card-price').querySelector('strong').textContent,'CNY 29 / 月付'); assert.match(card.textContent,/不保证库存或实际可下单/);
  const sold = h.createCoreCard(record(plans.slice(0,1)),h.ui); assert.match(sold.querySelector('.core-card-price').querySelector('strong').textContent,/均标为售罄/);
  const detail = field(h.createCoreDetail(record(plans),h.ui),'price'); assert.match(detail.textContent,/CNY 10/); assert.match(detail.textContent,/CNY 5/); assert.equal(detail.querySelectorAll('.core-term').length,3);
});


test('real: historical notes preserve third-party attribution instead of a blanket operator self-report heading', async t => {
  const h = await harness(t);
  for (const id of ['A084','A066']) {
    const record = catalog.items.find(r=>r.id===id), history = field(h.createCoreDetail(record,h.ui),'history');
    assert.match(history.textContent,/原材料说明：/); assert.doesNotMatch(history.textContent,/站方自述：/);
    assert.ok(history.textContent.includes(record.coreInfo.operatingHistory.claimText));
  }
});

test('synthetic: operator status remains separate from measured stability and complaint counts', async t => {
  const h=await harness(t),record={id:'SYNTHETIC-STATUS',coreInfo:makeCoreInfo({id:'SYNTHETIC-STATUS',coreSupplement:{stability:{operatorReports:[{summary:'SYNTHETIC OPERATOR STATUS',sourceIds:['SYNTHETIC-STATUS-SOURCE'],observedAt:'2026-10-27T00:00:00Z'}]}}},{asOf:'2026-10-28T00:00:00Z'})};
  const view=h.createCoreDetail(record,h.ui),stability=field(view,'stability');
  assert.match(stability.textContent,/稳定性未实测/);assert.match(stability.textContent,/运营方状态自报 · 非独立实测/);
  assert.match(stability.textContent,/SYNTHETIC OPERATOR STATUS/);assert.match(stability.textContent,/不等于零故障、零投诉/);
  assert.doesNotMatch(field(view,'issues').textContent,/SYNTHETIC OPERATOR STATUS/);
});

test('privacy capture dates use Beijing day for instants and retain date-only evidence', async t => {
  const h = await harness(t), original = catalog.items.find(r => r.id === 'A186');
  for (const [observedAt, expected] of [
    ['2026-10-28T23:01:44.027Z', '2026-10-29'],
    ['2026-10-28T15:59:59Z', '2026-10-28'],
    ['2026-10-28', '2026-10-28']
  ]) {
    const record = structuredClone(original);
    record.coreInfo.privacy.observedAt = observedAt;
    assert.match(field(h.createCoreDetail(record, h.ui), 'privacy').textContent, new RegExp('说明采集于 ' + expected + '（北京时间）'));
  }
  const record = structuredClone(original);
  record.coreInfo.privacy.observedAt = null;
  assert.doesNotMatch(field(h.createCoreDetail(record, h.ui), 'privacy').textContent, /说明采集于/);
});

test('real: unresolved same-name reports remain visible without counting against NiceCloud', async t => {
 const h=await harness(t),record=catalog.items.find(r=>r.id==='A005'),info=record.coreInfo.stability;
 assert.equal(info.recentIssues.length,0);assert.equal(info.identityUnresolvedReports.length,2);
 const view=field(h.createCoreDetail(record,h.ui),'issues');assert.match(view.textContent,/近月问题情况未知/);assert.match(view.textContent,/2 条归属待核材料/);assert.match(view.textContent,/归属待核材料/);assert.match(view.textContent,/v2ny/);assert.match(view.textContent,/nicecloud/);assert.doesNotMatch(view.textContent,/近月有 2 条问题线索/);
});

test('lightweight index cards render exactly the same evidence-qualified content as full records', async t => {
 const h=await harness(t),{browserDataDocuments}=await import(pathToFileURL(path.join(root,'src/browser-data.mjs')).href);
 const hashes={catalogSha256:'a'.repeat(64),sourcesSha256:'b'.repeat(64)};
 const docs=browserDataDocuments(catalog,read('data/public-sources.json'),hashes),index=docs.get('data/browser-index.json');
 for(const [i,record]of catalog.items.entries())assert.equal(h.createCoreCard(index.items[i],h.ui).textContent,h.createCoreCard(record,h.ui).textContent,record.id);
 h.state.catalog=index;assert.match(h.methodPage().textContent,/没有合格的实际速度或稳定性测量/);
});

test('airport detail requests only its scoped bundle and preserves the complete source drawer',async t=>{
 const {browserDataDocuments}=await import(pathToFileURL(path.join(root,'src/browser-data.mjs')).href);
 const docs=browserDataDocuments(catalog,read('data/public-sources.json'),{catalogSha256:'a'.repeat(64),sourcesSha256:'b'.repeat(64)}),requested=[];
 const h=await harness(t,async url=>{requested.push(new URL(url).pathname);const bundle=docs.get(new URL(url).pathname.slice(1));assert(bundle,'Unexpected whole-snapshot request');return {ok:true,json:async()=>bundle};});
 h.state.catalog=docs.get('data/browser-index.json');
 const detail=await h.createDetail('A014');assert.deepEqual(requested,['/data/details/A014.json']);
 assert.match(detail.textContent,/天津联通/);assert.match(detail.textContent,/0.00B/);
 for(const source of docs.get('data/details/A014.json').sources)assert(detail.textContent.includes(source.id));
 await h.createDetail('A014');assert.equal(requested.length,1,'Successful scoped detail is reused');
 await h.createDetail('A004');assert.deepEqual(requested,['/data/details/A014.json','/data/details/A004.json']);
});

test('failed scoped request is retryable and concurrent requests share one in-flight fetch',async t=>{
 const {browserDataDocuments}=await import(pathToFileURL(path.join(root,'src/browser-data.mjs')).href);
 const docs=browserDataDocuments(catalog,read('data/public-sources.json'),{catalogSha256:'a'.repeat(64),sourcesSha256:'b'.repeat(64)});let calls=0,release;
 const gate=new Promise(resolve=>{release=resolve;});
 const h=await harness(t,async()=>{calls++;if(calls===1)return {ok:false,status:503};await gate;return {ok:true,json:async()=>docs.get('data/details/A014.json')};});h.state.catalog=docs.get('data/browser-index.json');
 await assert.rejects(h.loadDetail('A014'),/HTTP 503/);
 const first=h.loadDetail('A014'),second=h.loadDetail('A014');assert.equal(calls,2);release();
 const [a,b]=await Promise.all([first,second]);assert.equal(a,b);assert.equal(calls,2);
});

test('payment evidence remains known while cleanup is a separate operational notice',async t=>{const h=await harness(t),core=makeCoreInfo({id:'SYNTHETIC-CLEANUP',coreSupplement:{payment:{methods:['支付宝'],evidenceLevel:'authenticated_checkout',statementType:'authenticated_unpaid_order',sourceIds:['PAYMENT'],observedAt:'2026-11-01T05:23:00Z',reason:'本次收银台提供支付宝，未付款。',transactionVerified:false,orderCleanup:{status:'pending',cancellationVerified:false,newOrderBlocked:true,reason:'未找到取消入口。',checkedAt:'2026-11-01T05:45:00Z'}}}});assert.deepEqual(core.payment.methods,['支付宝']);assert.equal(core.payment.orderCleanup.status,'pending');const card=field(h.createCoreDetail({id:'SYNTHETIC-CLEANUP',coreInfo:core},h.ui),'payment');assert.match(card.querySelector('.core-value').textContent,/支付宝/);assert.doesNotMatch(card.querySelector('.core-value').textContent,/未知/);assert.match(card.querySelector('.core-order-cleanup').textContent,/取消尚未确认/);assert.match(card.querySelector('.core-order-cleanup').textContent,/禁止重复建单/);});

test('third-party price panel exposes publisher dates and never becomes headline price',async t=>{const h=await harness(t),r={status:'unverified_third_party_price',publisher:'SYNTHETIC publisher',summary:'SYNTHETIC ¥12/月',publishedAt:null,observedAt:'2026-11-02T00:00:00.000Z',sourceIds:['SYNTHETIC-REF'],identityLimitation:'SYNTHETIC identity unverified',freshnessLimitation:'SYNTHETIC freshness unverified',affiliateDisclosure:'disclosed'};const card=field(h.createCoreDetail({id:'SYNTHETIC-PRICE-REPORT',coreInfo:{pricing:{plans:[],externalReports:[r]}}},h.ui),'price');assert.match(card.textContent,/第三方报价 · 未核实/);assert.match(card.textContent,/页面日期：未标明/);assert.match(card.textContent,/SYNTHETIC publisher/);assert.match(card.textContent,/不代表当前官网价格/);assert.doesNotMatch(card.querySelector('.core-value').textContent,/12/);});
test('candidate operator prices expose unresolved ownership without entering the headline price',async t=>{const h=await harness(t),r={status:'unverified_candidate_price',publisher:'SYNTHETIC candidate',summary:'SYNTHETIC 26.80/月起',observedAt:'2026-11-15T00:00:00.000Z',sourceIds:['SYNTHETIC-CANDIDATE'],officialCurrentPriceVerified:false,identityLimitation:'SYNTHETIC unresolved ownership'};const card=field(h.createCoreDetail({id:'SYNTHETIC-CANDIDATE-PRICE',coreInfo:{pricing:{plans:[],externalReports:[r]}}},h.ui),'price');assert.match(card.textContent,/候选站报价 · 归属未核/);assert.match(card.textContent,/26.80\/月起/);assert.doesNotMatch(card.querySelector('.core-value').textContent,/26.80/);});
