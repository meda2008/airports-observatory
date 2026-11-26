'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {makeCatalogService} = require('../lib/catalog-service.cjs');
const {customerSummary} = require('../lib/customer-summary.cjs');
const {presentationFor, displayNameFor} = require('../lib/catalog-presentation.cjs');

const ROOT = path.resolve(__dirname, '..');

class FakeElement {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase();
    this.textContent = '';
    this.className = '';
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.colSpan = 1;
    this.classList = {
      toggle: () => {},
      add: () => {},
      remove: () => {}
    };
  }
  append(...nodes) {
    for (const n of nodes) {
      if (n != null) this.children.push(n);
    }
  }
  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }
  setAttribute(k, v) {
    this.attributes[k] = String(v);
  }
  getAttribute(k) {
    return this.attributes[k] ?? null;
  }
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  async dispatch(type) {
    for (const fn of this.listeners[type] || []) {
      await fn({preventDefault() {}, target: this});
    }
  }
  querySelector() {
    return new FakeElement('div');
  }
  reset() {}
  scrollIntoView() {}
}

function createFrontendSandbox({fetchHandler} = {}) {
  const indexJsSource = fs.readFileSync(path.join(ROOT, 'deploy-service/public/index.js'), 'utf8');
  const elements = new Map();
  const chips = [
    Object.assign(new FakeElement('button'), {attributes: {'data-preset-needs': '每月15元以内 便宜'}}),
    Object.assign(new FakeElement('button'), {attributes: {'data-preset-needs': '每月20元以内 性价比'}}),
    Object.assign(new FakeElement('button'), {attributes: {'data-payment': '支付宝'}})
  ];
  const getEl = (sel) => {
    if (!elements.has(sel)) elements.set(sel, new FakeElement('div'));
    return elements.get(sel);
  };
  const intervals = [];
  const sandbox = {
    URL,
    URLSearchParams,
    PlanConditions: require('../deploy-service/public/plan-conditions.js'),
    FormData: class {
      *[Symbol.iterator]() {}
    },
    location: {hash: ''},
    window: {
      addEventListener() {},
      scrollTo() {}
    },
    setInterval: (fn, ms) => {
      intervals.push({fn, ms});
      return intervals.length;
    },
    document: {
      title: '',
      hidden: false,
      createElement: (tag) => new FakeElement(tag),
      querySelector: getEl,
      querySelectorAll: (sel) => {
        if (sel === '[data-preset-needs]') return [chips[0], chips[1]];
        if (sel === '[data-payment]') return [chips[2]];
        return [];
      },
      getElementById: (id) => getEl('#' + id)
    },
    fetch:
      fetchHandler ||
      (async (url) => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify(
            url.startsWith('/api/stats')
              ? {snapshotId: 'snap-1', sourceAsOf: '2026-11-23T00:00:00Z', counts: {primary: 150}}
              : {items: [], total: 0, totalRecords: 150, pages: 1, page: 1, sourceAsOf: '2026-11-23T00:00:00Z'}
          )
      }))
  };
  vm.createContext(sandbox);
  vm.runInContext(
    indexJsSource + '\n;globalThis.__testExports = {catalogCard, renderDetail, performanceNotes, route, pollSnapshotChange, search};',
    sandbox
  );
  return {sandbox, elements, chips, intervals};
}

test('frontend rendering contract: all 215 records from catalog.v1.json + core-supplement.v1.json (including A042) render without error', () => {
  const service = makeCatalogService({baseDir: ROOT});
  const baseRecords = service.rawExport().catalog;
  assert.equal(baseRecords.length, 215);

  const hydrated = baseRecords.map((r) => {
    const full = service.get(r.id);
    const coreInfo = full.coreInfo || {};
    return {
      id: full.id,
      name: full.name,
      category: full.category,
      primary: r.scope === 'application_rosters' || r.primary === true,
      coreInfo,
      ...coreInfo,
      summary: customerSummary(coreInfo),
      link: full.officialUrl ? {url: full.officialUrl, type: 'official'} : {}
    };
  });

  const {sandbox} = createFrontendSandbox();
  const {catalogCard, renderDetail} = sandbox.__testExports;

  let a042Verified = false;
  for (const record of hydrated) {
    const item = {
      ...record,
      name: displayNameFor(record),
      presentation: record.id === 'A082' ? presentationFor(record, hydrated) : null
    };
    const cardNode = catalogCard(item);
    assert.equal(cardNode.tagName, 'ARTICLE', `catalogCard failed for ${record.id}`);
    const detailNode = renderDetail(item);
    assert.equal(detailNode.tagName, 'DIV', `renderDetail failed for ${record.id}`);
    if (record.id === 'A037') {
      assert.match(JSON.stringify(detailNode), /16\.39/);
      assert.match(JSON.stringify(detailNode), /站内原文冲突/);
    }
    if (record.id === 'A042') {
      assert.ok((item.pricing?.plans || []).length > 0, 'A042 should include plans from core-supplement');
      a042Verified = true;
    }
  }
  assert.equal(a042Verified, true);

  // Malformed / sparse nullish record must not crash rendering
  assert.doesNotThrow(() => catalogCard({id: 'A999', name: null, summary: null}));
  assert.doesNotThrow(() => renderDetail({id: 'A999', name: '', summary: {latencyContext: {rows: [{}]}}}));
});

test('frontend handles malformed hash encoding, resets currency/budget on preset chip, and polls 60s snapshotId changes', async () => {
  const calls = [];
  let statsSnap = 'snap-1';
  const {sandbox, elements, chips, intervals} = createFrontendSandbox({
    fetchHandler: async (url) => {
      calls.push(url);
      if (url.startsWith('/api/stats')) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({snapshotId: statsSnap, sourceAsOf: '2026-11-23T12:00:00Z', counts: {primary: 150}})
        };
      }
      if (url.startsWith('/api/search')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({criterion: 'value', currency: 'CNY', items: []})
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({items: [], total: 0, totalRecords: 150, pages: 1, page: 1, sourceAsOf: '2026-11-23T12:00:00Z'})
      };
    }
  });

  // 1. Malformed percent-encoding in hash is safely caught
  sandbox.location.hash = '#/airport/%E0%A4%A';
  await sandbox.__testExports.route();
  const detailText = JSON.stringify(elements.get('#detail-content'));
  assert.match(detailText, /无效的编码字符/);

  // 2. Preset budget chip syncs criterion and resets currency/maxMonthly before search()
  const criterionEl = sandbox.document.querySelector('#search [name="criterion"]');
  const currencyEl = sandbox.document.querySelector('#search [name="currency"]');
  const maxMonthlyEl = sandbox.document.querySelector('#search [name="maxMonthly"]');
  currencyEl.value = 'USD';
  maxMonthlyEl.value = '99';
  criterionEl.value = 'cheap';
  await chips[1].dispatch('click');
  assert.equal(criterionEl.value, 'value');
  assert.equal(currencyEl.value, 'CNY');
  assert.equal(maxMonthlyEl.value, '');
  assert.equal(sandbox.document.querySelector('#search [name="needs"]').value, '每月20元以内 性价比');
  await chips[0].dispatch('click');
  assert.equal(criterionEl.value, 'cheap');
  assert.equal(sandbox.document.querySelector('#search [name="needs"]').value, '每月15元以内 便宜');

  // 3. 60-second polling checks /api/stats when visible, clears failure suffix on recovery, and reloads catalog when snapshotId changes
  assert.ok(intervals.some((i) => i.ms === 60000));
  sandbox.location.hash = '';
  const beforeCatalogCalls = calls.filter((u) => u.startsWith('/api/catalog')).length;
  statsSnap = 'snap-2';
  await sandbox.__testExports.pollSnapshotChange();
  const afterCatalogCalls = calls.filter((u) => u.startsWith('/api/catalog')).length;
  assert.equal(afterCatalogCalls, beforeCatalogCalls + 1);
});

test('pollSnapshotChange clears stale offline suffix on recovery and search guards non-finite comparison metrics', async () => {
  let failStats = true;
  const {sandbox, elements} = createFrontendSandbox({
    fetchHandler: async (url) => {
      if (url.startsWith('/api/stats')) {
        if (failStats) throw new Error('network');
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({snapshotId: 'snap-1', sourceAsOf: '2026-11-23T12:00:00Z', counts: {primary: 138}})
        };
      }
      if (url.startsWith('/api/search')) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              criterion: 'value',
              currency: 'CNY',
              items: [
                {
                  id: 'A001',
                  name: 'NonFinite',
                  plan: {name: 'P1', amount: 10, currency: 'CNY', billingPeriod: '月付', quota: '100G'},
                  comparison: {monthlyAmount: 'bad', costPerGB: null},
                  link: {}
                },
                {
                  id: 'A002',
                  name: 'Finite',
                  plan: {name: 'P2', amount: 20, currency: 'CNY', billingPeriod: '月付', quota: '200G'},
                  comparison: {monthlyAmount: 20, costPerGB: 0.1},
                  link: {}
                }
              ]
            })
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({snapshotId: 'snap-1', items: [], total: 138, totalRecords: 138, pages: 1, page: 1, sourceAsOf: '2026-11-23T12:00:00Z'})
      };
    }
  });

  await new Promise((r) => setTimeout(r, 10));
  const meta = elements.get('#catalog-meta');
  meta.textContent = '138 个机场 · 数据基准 2026-11-23';
  await sandbox.__testExports.pollSnapshotChange();
  assert.match(meta.textContent, / · 自动更新暂不可用$/);

  failStats = false;
  await sandbox.__testExports.pollSnapshotChange();
  assert.equal(meta.textContent, '138 个机场 · 数据基准 2026-11-23');

  await sandbox.__testExports.search();
  const renderedText = JSON.stringify(elements.get('#results'));
  assert.match(renderedText, /折合每月 20/);
  assert.match(renderedText, /每 GB 0\.1/);
});

test('catalog polling recovers initial and subsequent failures and keeps the latest successful view', async () => {
  let snapshotId = 's1';
  let failCatalog = true;
  let requests = 0;
  const {sandbox, elements} = createFrontendSandbox({fetchHandler: async (url) => {
    if (url === '/api/stats') return {ok: true, json: async () => ({snapshotId})};
    requests++;
    if (failCatalog) throw Error('offline');
    return {ok: true, json: async () => ({snapshotId, items: [{id: 'A042', name: snapshotId}], total: 1})};
  }});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(elements.get('#catalog-meta').textContent, '加载失败');
  failCatalog = false;
  await sandbox.__testExports.pollSnapshotChange();
  const results = elements.get('#catalog-results');
  assert.match(JSON.stringify(results), /s1/);
  snapshotId = 's2';
  failCatalog = true;
  await sandbox.__testExports.pollSnapshotChange();
  assert.match(JSON.stringify(results), /s1/);
  failCatalog = false;
  await sandbox.__testExports.pollSnapshotChange();
  assert.match(JSON.stringify(results), /s2/);
  await sandbox.__testExports.pollSnapshotChange();
  assert.equal(requests, 4);
});

test('resetting the budget search discards a delayed response and shows the applied policy on the next search', async () => {
  let finishSearch;
  const {sandbox, elements} = createFrontendSandbox({fetchHandler: async (url) => {
    if (url.startsWith('/api/search?')) return new Promise(resolve => { finishSearch = resolve; });
    return {ok: true, json: async () => ({items: [], total: 0})};
  }});
  const response = {ok: true, json: async () => ({criterion: 'value', maxMonthly: 20, currency: 'CNY', items: [{name: 'result'}]})};
  const stale = sandbox.__testExports.search();
  await elements.get('#search-reset').dispatch('click');
  finishSearch(response);
  await stale;
  assert.equal(elements.get('#results').children.length, 0);
  const search = sandbox.__testExports.search();
  finishSearch(response);
  await search;
  assert.match(elements.get('#status').textContent, /流量性价比.*20 CNY/);
});

test('snapshot shrink reloads the last valid page and retains the card projection', async () => {
  const requested = [];
  let total = 25;
  const h = createFrontendSandbox({fetchHandler: async (url, options) => {
    let data;
    if (url.startsWith('/api/stats')) {
      data = {snapshotId: 'snap-' + total};
      if (total === 24) assert.equal(options.priority, 'low');
    } else {
      const params = new URL(url, 'http://localhost').searchParams;
      const page = Number(params.get('page'));
      const pages = Math.ceil(total / 12);
      assert.equal(params.get('view'), 'card');
      requested.push(page);
      data = {items: page <= pages ? [{id: 'A001', name: 'Fixture'}] : [], total, pages, page, snapshotId: 'snap-' + total};
    }
    return {ok: true, status: 200, json: async () => data};
  }});
  await new Promise(resolve => setImmediate(resolve));
  await h.elements.get('#next').dispatch('click');
  await new Promise(resolve => setImmediate(resolve));
  await h.elements.get('#next').dispatch('click');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.elements.get('#page-label').textContent, '第 3 / 3 页');
  total = 24;
  await h.intervals[0].fn();
  assert.deepEqual(requested.slice(-2), [3, 2]);
  assert.equal(h.elements.get('#page-label').textContent, '第 2 / 2 页');
  assert.equal(h.elements.get('#next').disabled, true);
});

test('public index.html hides /console.html and includes hero stat cards, snapshot badge, scope/refund filters and quick chips', () => {
  const html = fs.readFileSync(path.join(ROOT, 'deploy-service/public/index.html'), 'utf8');
  assert.doesNotMatch(html, /\/console\.html/);
  assert.doesNotMatch(html, /__SITE_NONCE__/);
  assert.match(html, /id="snapshot-badge"/);
  assert.match(html, /id="stat-primary"/);
  assert.match(html, /name="scope"/);
  assert.match(html, /name="refund"/);
  assert.match(html, /data-payment="支付宝"/);
  assert.match(html, /data-preset-needs="每月20元以内 性价比"/);
});
