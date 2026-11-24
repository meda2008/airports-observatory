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
        if (sel === '[data-preset-needs]') return [chips[0]];
        if (sel === '[data-payment]') return [chips[1]];
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
    indexJsSource + '\n;globalThis.__testExports = {catalogCard, renderDetail, performanceNotes, route, pollSnapshotChange};',
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

  // 2. Preset budget chip resets currency to CNY and maxMonthly to '' before search()
  const currencyEl = sandbox.document.querySelector('#search [name="currency"]');
  const maxMonthlyEl = sandbox.document.querySelector('#search [name="maxMonthly"]');
  currencyEl.value = 'USD';
  maxMonthlyEl.value = '99';
  await chips[0].dispatch('click');
  assert.equal(currencyEl.value, 'CNY');
  assert.equal(maxMonthlyEl.value, '');
  assert.equal(sandbox.document.querySelector('#search [name="needs"]').value, '每月15元以内 便宜');

  // 3. 60-second polling checks /api/stats when visible and reloads catalog when snapshotId changes
  assert.ok(intervals.some((i) => i.ms === 60000));
  sandbox.location.hash = '';
  const beforeCatalogCalls = calls.filter((u) => u.startsWith('/api/catalog')).length;
  statsSnap = 'snap-2';
  await sandbox.__testExports.pollSnapshotChange();
  const afterCatalogCalls = calls.filter((u) => u.startsWith('/api/catalog')).length;
  assert.equal(afterCatalogCalls, beforeCatalogCalls + 1);
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
