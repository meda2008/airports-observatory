'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../deploy-service/public/console.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../deploy-service/public/console.html'), 'utf8');

// A local DOM fixture exercises the shipped browser code without a browser runner,
// credentials, network traffic, or collector execution.
class Node {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.listeners = {}; this.value = ''; this.hidden = false; this.disabled = false; this.attributes = {}; this.className = ''; this._text = ''; this.isConnected = true; this.classList = { add: name => { this.className += ' ' + name; } }; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(n => n.textContent).join(' '); }
  append(...nodes) { this.children.push(...nodes); }
  prepend(...nodes) { this.children.unshift(...nodes); }
  replaceChildren(...nodes) { this._text = ''; this.children = nodes; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  setAttribute(key, value) { this.attributes[key] = value; }
  querySelectorAll(selector) { const tags = selector.split(','); return this.children.flatMap(n => [...(tags.includes(n.tagName) ? [n] : []), ...n.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0]; }
  focus() { this.focused = true; }
  reset() {}
  async dispatch(type) { if (type === 'click' && this.disabled) return; for (const fn of this.listeners[type] || []) await fn({ preventDefault() {}, target: this }); }
}
function setup() {
  const nodes = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, new Node()]));
  for (const [tag, id] of html.matchAll(/<[^>]+id="([^"]+)"[^>]*>/g)) nodes[id].hidden = /\shidden(?:\s|>)/.test(tag);
  const calls = [], timers = [], fixture = {
    collector: { siteId: 'A001', name: '测试站点', revision: 3, enabled: false, config: { entryUrl: 'https://example.test/', maxPages: 4, refreshIntervalMs: 604800000, fields: ['plans'], enabled: false, allowedHosts: ['example.test'], auth: { mode: 'none' } } },
    control: { engineEnabled: false, weeklyEnabled: false, executionMode: 'iab_bridge' },
    proposals: [], collection: { runs: [], checkpoints: [], events: [] }, unauthorized: false, publication: 'sync_failed', conflict: false
  };
  const context = vm.createContext({ document: { querySelector: s => nodes[s.slice(1)], createElement: tag => new Node(tag), hidden: false }, window: { addEventListener() {} }, URL, Date, console, setInterval: fn => timers.push(fn), fetch: async (url, options) => {
    calls.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
    if (fixture.unauthorized) return { ok: false, status: 401, json: async () => ({ error: 'UNAUTHORIZED' }) };
    if (fixture.fetch) { const result = await fixture.fetch(url, options); if (result) return result; }
    let data = {};
    if (url === '/api/admin/status?view=summary') data = { updateService: { status: 'paused' }, database: { tables: [{ name: 'evidence', count: 7 }] } };
    else if (url === '/api/admin/jobs') data = { items: [] };
    else if (url === '/api/admin/proposals') data = { items: fixture.proposals };
    else if (url.startsWith('/api/admin/proposals/')) data = { ...fixture.proposals[0], currentRevision: 2, before: { price: '原值' }, patch: { price: '<script>不执行</script>' }, after: { price: '<script>不执行</script>' }, evidenceIds: ['ev-1'] };
    else if (url.startsWith('/api/admin/collectors?')) data = { items: [fixture.collector], control: fixture.control, runtime: { connected: false } };
    else if (url === '/api/admin/collection/status') data = { ...fixture.collection, control: fixture.control, runtime: { connected: false } };
    else if (url.endsWith('/config')) { if (fixture.conflict) return { ok: false, status: 409, json: async () => ({ error: 'REVISION_CONFLICT' }) }; fixture.collector = { ...fixture.collector, revision: fixture.collector.revision + 1, config: JSON.parse(options.body).config }; data = fixture.collector; }
    else if (url === '/api/admin/review') data = { publication: { status: fixture.publication } };
    return { ok: true, status: 200, json: async () => structuredClone(data) };
  } });
  vm.runInContext(source, context);
  const run = code => vm.runInContext(code, context);
  const connect = async () => { nodes.token.value = 'memory-only-test-token'; nodes.reviewer.value = '本地验证'; await nodes['auth-form'].dispatch('submit'); };
  const click = (node, label) => node.querySelectorAll('button').find(n => n.textContent === label).dispatch('click');
  return { nodes, fixture, calls, timers, run, connect, click };
}

test('console connects with memory-only bearer and reports missing capability evidence honestly', async () => {
  const h = setup(); await h.connect();
  assert.equal(h.nodes.token.value, '');
  assert.equal(h.nodes.workspace.hidden, false);
  assert.equal(h.calls.length, 5);
  assert.ok(h.calls.every(c => c.options.headers.Authorization === 'Bearer memory-only-test-token'));
  assert.equal(h.nodes['validation-matrix'].querySelectorAll('strong').filter(n => n.textContent === '未验证').length, 6);
  assert.match(h.nodes['collection-summary'].textContent, /未连接/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|innerHTML|insertAdjacentHTML/);
  assert.doesNotMatch(html, /\son\w+=|<style|style=/i);
});

test('poll and revision changes preserve an edited configuration and show conflict warning', async () => {
  const h = setup(); await h.connect(); h.nodes['config-entry'].value = 'https://example.test/draft';
  await h.nodes['collector-config'].dispatch('input'); h.fixture.collector.revision = 4;
  await h.run('load(false)');
  assert.equal(h.nodes['config-entry'].value, 'https://example.test/draft');
  assert.equal(h.nodes['revision-warning'].hidden, false);
  assert.match(h.nodes['draft-status'].textContent, /未保存/);
  await h.nodes['collector-list'].querySelectorAll('button')[0].dispatch('click');
  assert.equal(h.nodes['config-entry'].value, 'https://example.test/draft');
});

test('configuration saves bind expected revision and conflict preserves the draft', async () => {
  const h = setup(); await h.connect(); h.fixture.conflict = true;
  h.nodes['config-entry'].value = 'https://example.test/new'; await h.nodes['collector-config'].dispatch('input');
  await h.run("saveConfig(editorConfig(), 'saved')");
  const saved = h.calls.find(c => c.url.endsWith('/config'));
  assert.equal(saved.body.expectedRevision, 3); assert.equal(saved.body.config.refreshIntervalMs, 604800000);
  assert.deepEqual(saved.body.config.auth, { mode: 'none' });
  assert.equal(h.nodes['config-entry'].value, 'https://example.test/new');
  assert.match(h.nodes['admin-status'].textContent, /REVISION_CONFLICT/);
});

test('unauthorized polling remains visible without inventing empty success', async () => {
  const h = setup(); await h.connect(); h.fixture.unauthorized = true; await h.run('load(false)');
  assert.equal(h.nodes['request-errors'].hidden, false);
  assert.match(h.nodes['request-errors'].textContent, /UNAUTHORIZED/);
  assert.match(h.nodes.events.textContent, /UNAUTHORIZED/);
});

test('successful save loads the returned revision and clears only the saved draft', async () => {
  const h = setup(); await h.connect(); h.nodes['config-entry'].value = 'https://example.test/updated';
  await h.nodes['collector-config'].dispatch('input'); await h.run("saveConfig(editorConfig(), '配置已保存')");
  assert.equal(h.run('draft.revision'), 4); assert.equal(h.run('dirty'), false);
  assert.equal(h.nodes['config-entry'].value, 'https://example.test/updated');
  assert.equal(h.nodes['revision-warning'].hidden, true);
});

test('engine and weekly switches send separate explicit changes', async () => {
  const h = setup(); await h.connect();
  await h.click(h.nodes['collection-summary'], '开启每周更新');
  const call = h.calls.find(c => c.url === '/api/admin/collection/control');
  assert.deepEqual(call.body, { weeklyEnabled: true, actor: '本地验证' });
  assert.equal(h.calls.some(c => c.url.endsWith('/validate')), false);
});

test('runtime mode is explicit and switching it does not silently enable collection or weekly scheduling',async()=>{const h=setup();h.fixture.control.executionMode='iab_bridge';await h.connect();await h.click(h.nodes['collection-summary'],'切换为独立后台采集');assert.deepEqual(h.calls.find(c=>c.url==='/api/admin/collection/control').body,{executionMode:'standalone',actor:'本地验证'});const standalone=setup();standalone.fixture.control.executionMode='standalone';await standalone.connect();assert.match(standalone.nodes['collection-summary'].textContent,/独立后台采集服务/);await standalone.click(standalone.nodes['collection-summary'],'切换为内置浏览器执行');assert.deepEqual(standalone.calls.find(c=>c.url==='/api/admin/collection/control').body,{executionMode:'iab_bridge',actor:'本地验证'});});

test('proposal requires detail fetch, renders literal values, and distinguishes saved review from publication', async () => {
  const h = setup(); h.fixture.proposals = [{ id: 'p1', siteId: 'A001', status: 'pending', expectedRevision: 2, evidenceIds: ['ev-1'] }]; await h.connect();
  let card = h.nodes.proposals.children[0];
  assert.equal(card.querySelectorAll('button').find(n => n.textContent === '批准资料更新').disabled, true);
  await h.click(card, '查看旧值与新值');
  assert.match(card.textContent, /原值/); assert.match(card.textContent, /<script>不执行<\/script>/);
  assert.equal(card.querySelectorAll('script').length, 0);
  // An unchanged poll retains the displayed comparison and any fetched evidence.
  await h.run('load(false)'); assert.equal(h.nodes.proposals.children[0], card);
  await h.click(card, '批准资料更新');
  assert.equal(h.calls.find(c => c.url === '/api/admin/review').body.expectedRevision, 2);
  assert.match(h.nodes['admin-status'].textContent, /复核已保存但未发布/);
  assert.match(h.nodes['request-errors'].textContent, /复核已保存但未发布/);
});

test('checkpoint URLs reject script and credential URLs; actions use encoded IDs and actor', async () => {
  const h = setup(); h.fixture.collection.checkpoints = [{ id: 'cp/1', siteId: 'A001', status: 'pending', url: 'javascript:alert(1)', requestedAction: '等待处理' }]; await h.connect();
  assert.equal(h.nodes.checkpoints.querySelectorAll('a').length, 0);
  assert.equal(h.run("safeLink('https://user:password@example.test/').tagName"), 'span');
  await h.click(h.nodes.checkpoints, '从断点重新入队');
  const call = h.calls.find(c => c.url.endsWith('cp%2F1/resume'));
  assert.equal(call.body.actor, '本地验证');
  assert.match(h.nodes.events.textContent, /等待执行端验证/);
});

test('disconnect clears data and in-flight responses cannot restore management content', async () => {
  const h = setup(); await h.connect(); let release;
  h.fixture.fetch = async url => url === '/api/admin/status?view=summary' ? new Promise(resolve => { release = resolve; }) : null;
  const pending = h.run('load(false)'); await new Promise(resolve => setImmediate(resolve));
  await h.nodes.disconnect.dispatch('click'); release({ ok: true, status: 200, json: async () => ({ database: { snapshotId: 'must-not-return' } }) }); await pending;
  assert.equal(h.nodes.workspace.hidden, true); assert.equal(h.nodes.database.textContent, '');
  assert.equal(h.run('adminToken'), ''); assert.equal(h.nodes['config-entry'].value, ''); assert.equal(h.nodes['config-advanced'].value, '');
});

test('validate-all displays per-site queue and skip results while preserving configuration drafts', async () => {
  const h = setup(); await h.connect(); h.nodes['config-entry'].value = 'https://example.test/unsaved';
  await h.nodes['collector-config'].dispatch('input');
  h.fixture.fetch = async url => url === '/api/admin/collectors/validate-all' ? { ok: true, status: 200, json: async () => ({ items: [{ siteId: 'A001', status: 'queued', jobId: 'job1' }, { siteId: 'A002', status: 'disabled_not_run' }, { siteId: 'A003', status: 'already_validated_recently' }], control: h.fixture.control, runtime: { connected: false } }) } : null;
  await h.nodes['validate-all'].dispatch('click');
  assert.equal(h.calls.find(c => c.url.endsWith('/validate-all')).body.actor, '本地验证');
  assert.equal(h.nodes['config-entry'].value, 'https://example.test/unsaved'); assert.equal(h.run('dirty'), true);
  assert.equal(h.nodes['batch-results'].hidden, false);
  assert.match(h.nodes['batch-results'].textContent, /已排队，等待执行端/);
  assert.match(h.nodes['batch-results'].textContent, /站点已停用，本次未执行/);
  assert.match(h.nodes['batch-results'].textContent, /近期已有验证，本次跳过/);
  assert.match(h.nodes['batch-results'].textContent, /仍需在线执行端领取/);
});

test('validation basis and revisions distinguish retained material from current live observation', async () => {
  const h = setup(); h.fixture.collector.lastValidation = { status: 'completed', profileRevision: 2, finishedAt: '2026-11-10T01:00:00Z', capabilities: { pageReadable: true, dataBasis: { status: 'retained_reparse' } }, outcome: { status: 'validation_material_observed', detail: { status: 'no_fact_change', basis: 'retained_reparse' } } };
  await h.connect();
  assert.match(h.nodes['validation-meta'].textContent, /旧配置结果，不代表当前配置已验证/);
  assert.match(h.nodes['validation-meta'].textContent, /已取得验证材料.*资料事实无变更/);
  assert.match(h.nodes['validation-basis'].textContent, /保留原文重解析.*不代表新访问/);
  assert.match(h.nodes['validation-matrix'].textContent, /旧配置/);
  h.fixture.collector.lastValidation.profileRevision = 3;
  h.fixture.collector.lastValidation.capabilities.dataBasis.status = 'live_browser';
  await h.run('load(false)');
  assert.match(h.nodes['validation-meta'].textContent, /当前配置的验证记录/);
  assert.doesNotMatch(h.nodes['validation-meta'].textContent, /旧配置结果/);
  assert.match(h.nodes['validation-basis'].textContent, /实站观察/);
});

test('legacy completed runs with retained evidence can reparse and paused execution requires an explicit enable', async () => {
  const h = setup(); h.fixture.collection.runs = [{ id: 'r1', siteId: 'A001', status: 'completed', evidenceIds: ['ev1'] }, { id: 'r2', siteId: 'A001', status: 'completed', evidenceIds: [] }, { id: 'r3', siteId: 'A001', status: 'running', evidenceIds: ['ev3'] }];
  await h.connect();
  const buttons = h.nodes.jobs.querySelectorAll('button').filter(n => n.textContent === '复用原文重解析');
  assert.equal(buttons.length, 1); assert.equal(buttons[0].disabled, true);
  await buttons[0].dispatch('click'); assert.equal(h.calls.some(c => c.url.endsWith('/reparse')), false);
  assert.match(h.nodes.jobs.textContent, /需先开启采集总开关/);
});

test('reparse sends the original run ID, reports retained basis and preserves original timestamps and drafts', async () => {
  const h = setup(); h.fixture.control.engineEnabled = true;
  const run = { id: 'r/1', siteId: 'A001', status: 'completed', evidenceIds: ['ev1'], startedAt: '2026-11-09T00:00:00Z', finishedAt: '2026-11-09T00:05:00Z', capabilities: { pageReadable: { status: 'observed' }, dataBasis: { status: 'retained_reparse' } }, outcome: { status: 'validation_material_observed', detail: { status: 'no_fact_change', basis: 'retained_reparse' } } };
  h.fixture.collection.runs = [run]; await h.connect();
  h.nodes['config-entry'].value = 'https://example.test/draft'; await h.nodes['collector-config'].dispatch('input');
  h.fixture.fetch = async url => url.endsWith('/reparse') ? { ok: true, status: 200, json: async () => ({ status: 'completed', evidenceIds: ['ev1'], proposalId: null, run }) } : null;
  await h.click(h.nodes.jobs, '复用原文重解析');
  const request = h.calls.find(c => c.url.endsWith('/reparse'));
  assert.deepEqual(request.body, { runId: 'r/1', actor: '本地验证' });
  assert.equal(h.nodes['config-entry'].value, 'https://example.test/draft');
  assert.equal(h.nodes['reparse-results'].hidden, false); assert.match(h.nodes['reparse-results'].textContent, /未重新访问网站.*不刷新原采集时间/);
  assert.match(h.nodes.jobs.textContent, /保留原文重解析/); assert.match(h.nodes.jobs.textContent, /2026-11-09T00:05:00Z/);
  assert.match(h.nodes['reparse-results'].textContent, /原访问断点状态独立保留.*不表示 CF \/ 验证码已经解决/);
});

test('pending proposal conflict leaves retained run and configuration intact', async () => {
  const h = setup(); h.fixture.control.engineEnabled = true;
  h.fixture.collection.runs = [{ id: 'r1', siteId: 'A001', status: 'completed', evidenceIds: ['ev1'] }]; await h.connect();
  const originalCard = h.nodes.jobs.children[0]; h.nodes['config-entry'].value = 'https://example.test/draft'; await h.nodes['collector-config'].dispatch('input');
  h.fixture.fetch = async url => url.endsWith('/reparse') ? { ok: false, status: 409, json: async () => ({ error: 'PENDING_PROPOSAL' }) } : null;
  await h.click(h.nodes.jobs, '复用原文重解析');
  assert.equal(h.nodes.jobs.children[0], originalCard); assert.equal(h.nodes['config-entry'].value, 'https://example.test/draft');
  assert.match(h.nodes['admin-status'].textContent, /PENDING_PROPOSAL/); assert.equal(h.nodes['reparse-results'].hidden, true);
});

test('blocked and reviewed runs reuse observed body evidence without promoting captcha checkpoints', async () => {
  const h = setup(); h.fixture.control.engineEnabled = true;
  const observed = { pageReadable: { status: 'observed' }, challenge: { status: 'checkpoint_required' }, dataBasis: { status: 'live_browser' } };
  h.fixture.collection.runs = [
    { id: 'blocked-body', siteId: 'A023', status: 'blocked', evidenceIds: ['body1', 'gate1'], capabilities: observed, blocker: '图片验证码待处理' },
    { id: 'blocked-gate', siteId: 'A024', status: 'blocked', evidenceIds: ['gate2'], capabilities: { pageReadable: { status: 'not_verified' } } },
    { id: 'approved-body', siteId: 'A025', status: 'review_approved', evidenceIds: ['body3'], capabilities: observed },
    { id: 'rejected-body', siteId: 'A026', status: 'review_rejected', evidenceIds: ['body4'], capabilities: observed },
    { id: 'completed-gate', siteId: 'A027', status: 'completed', evidenceIds: ['gate5'], capabilities: { pageReadable: { status: 'not_verified' } } }
  ];
  h.fixture.collection.checkpoints = [{ id: 'cp-image', siteId: 'A023', type: 'captcha', status: 'pending', reason: '图片验证码待处理' }];
  await h.connect();
  const cards = h.nodes.jobs.children;
  const reparseButtons = card => card.querySelectorAll('button').filter(n => n.textContent === '复用原文重解析');
  assert.equal(reparseButtons(cards[0]).length, 1); assert.equal(reparseButtons(cards[0])[0].disabled, false);
  assert.equal(reparseButtons(cards[1]).length, 0);
  assert.equal(reparseButtons(cards[2]).length, 1); assert.equal(reparseButtons(cards[3]).length, 1);
  assert.equal(reparseButtons(cards[4]).length, 0);
  assert.match(cards[0].textContent, /状态 blocked/); assert.match(cards[0].textContent, /图片验证码待处理/);
  assert.match(cards[0].textContent, /原访问断点状态独立保留.*不表示 CF \/ 验证码已经解决/);
  assert.match(h.nodes.checkpoints.textContent, /pending/); assert.match(h.nodes.checkpoints.textContent, /图片验证码待处理/);
  assert.equal(h.calls.some(c => c.url.endsWith('/resume') || c.url.endsWith('/reparse')), false);
});

test('task controls match queued or leased cancellation and blocked, failed or cancelled retry contracts', async () => {
  const h = setup();
  const statuses = ['queued', 'leased', 'blocked', 'failed', 'cancelled', 'completed', 'cancel_requested', 'awaiting_semantic_review', 'review_approved', 'review_rejected', 'pending', 'running', 'claimed', 'retrying', 'waiting', 'checkpoint', 'waiting_checkpoint', 'canceled', 'interrupted', 'expired', 'stopped', 'error'];
  h.fixture.collection.runs = statuses.map((status, index) => ({ id: 'run-' + status, runId: 'run-' + status, jobId: 'job/' + status, siteId: 'A' + String(index + 1).padStart(3, '0'), status }));
  await h.connect();
  const cards = h.nodes.jobs.children;
  for (const [index, status] of statuses.entries()) {
    const labels = cards[index].querySelectorAll('button').map(n => n.textContent);
    assert.equal(labels.includes('停止任务'), ['queued', 'leased'].includes(status), status + ' cancellation eligibility');
    assert.equal(labels.includes('重试入队'), ['blocked', 'failed', 'cancelled'].includes(status), status + ' retry eligibility');
  }
  await h.click(cards[statuses.indexOf('leased')], '停止任务');
  const cancel = h.calls.find(c => c.url.endsWith('/cancel'));
  assert.equal(cancel.url, '/api/admin/collection/jobs/job%2Fleased/cancel');
  assert.deepEqual(cancel.body, { actor: '本地验证' });
  assert.equal(h.calls.some(c => c.url.includes('blocked/cancel')), false);
  const blockedCard = h.nodes.jobs.children[statuses.indexOf('blocked')];
  await h.click(blockedCard, '重试入队');
  const retry = h.calls.find(c => c.url.endsWith('/retry'));
  assert.equal(retry.url, '/api/admin/collection/jobs/job%2Fblocked/retry');
  assert.deepEqual(retry.body, { actor: '本地验证' });
});

test('checkpoint recorded time uses API createdAt and falls back to legacy observedAt', async () => {
  const h = setup(); h.fixture.collection.checkpoints = [
    { id: 'new-cp', siteId: 'A001', status: 'open', createdAt: '2026-11-10T13:20:00Z', observedAt: '2026-11-10T13:19:00Z' },
    { id: 'legacy-cp', siteId: 'A002', status: 'open', observedAt: '2026-11-09T12:00:00Z' }
  ];
  await h.connect();
  const values = h.nodes.checkpoints.children.map(card => card.querySelectorAll('dd').map(n => n.textContent));
  assert.equal(values[0][3], '2026-11-10T13:20:00Z');
  assert.equal(values[1][3], '2026-11-09T12:00:00Z');
});

test('task queue times use only explicit queue or creation fields and keep due and start times separate', async () => {
  const h = setup(); h.fixture.collection.runs = [
    { id: 'times-provided', siteId: 'A001', status: 'completed', enqueuedAt: '2026-11-10T10:00:00Z', createdAt: '2026-11-10T09:59:00Z', dueAt: '2026-11-10T10:05:00Z', startedAt: '2026-11-10T10:06:00Z' },
    { id: 'creation-provided', siteId: 'A002', status: 'completed', createdAt: '2026-11-10T11:00:00Z', startedAt: '2026-11-10T11:06:00Z' },
    { id: 'start-only', siteId: 'A003', status: 'completed', startedAt: '2026-11-10T12:06:00Z', finishedAt: '2026-11-10T12:07:00Z' }
  ];
  await h.connect();
  const values = h.nodes.jobs.children.map(card => card.querySelectorAll('dd').map(n => n.textContent));
  assert.deepEqual(values[0].slice(0, 3), ['2026-11-10T10:00:00Z', '2026-11-10T10:05:00Z', '2026-11-10T10:06:00Z']);
  assert.equal(values[1][0], '2026-11-10T11:00:00Z');
  assert.deepEqual(values[2].slice(0, 4), ['未提供排队时间', '未提供到期时间', '2026-11-10T12:06:00Z', '2026-11-10T12:07:00Z']);
});
