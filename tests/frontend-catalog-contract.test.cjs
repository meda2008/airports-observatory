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

function findElement(root, matches) {
  if (matches(root)) return root;
  for (const child of root.children) {
    const match = findElement(child, matches);
    if (match) return match;
  }
  return null;
}

const jsonResponse = (data, status = 200) => ({ok: status < 400, status, text: async () => JSON.stringify(data)});
const settleFrontend = () => new Promise((resolve) => setImmediate(resolve));

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
  querySelector(selector) {
    assert.equal(selector, '.plans-heading select');
    const heading = findElement(this, (node) => node.className === 'plans-heading');
    return heading && findElement(heading, (node) => node.tagName === 'SELECT');
  }
  reset() {}
  scrollIntoView() {}
  focus() { this.focused = true; }
  showModal() { this.open = true; }
  close() { this.open = false; }
}

function createFrontendSandbox({fetchHandler, hash = '#catalog'} = {}) {
  const indexJsSource = fs.readFileSync(path.join(ROOT, 'deploy-service/public/index.js'), 'utf8');
  const conditionsSource = fs.readFileSync(path.join(ROOT, 'deploy-service/public/plan-conditions.js'), 'utf8');
  const elements = new Map();
  const chips = [
    Object.assign(new FakeElement('button'), {attributes: {'data-preset-needs': '每月15元以内 便宜'}}),
    Object.assign(new FakeElement('button'), {attributes: {'data-preset-needs': '每月20元以内 性价比'}}),
    Object.assign(new FakeElement('button'), {attributes: {'data-payment': '支付宝'}})
  ];
  const getEl = (sel) => {
    if (!elements.has(sel)) elements.set(sel, Object.assign(new FakeElement('div'), {selector: sel}));
    return elements.get(sel);
  };
  const intervals = [];
  const scrolls = [];
  const sandbox = {
    URL,
    URLSearchParams,
    AbortSignal,
    FormData: class {
      constructor(form) {
        this.fields = Array.from(elements).filter(([selector]) => selector.startsWith(`${form.selector} [name=`));
      }
      *[Symbol.iterator]() {
        for (const [selector, field] of this.fields) yield [selector.match(/name="([^"]+)"/)[1], field.value];
      }
    },
    location: {hash},
    addEventListener() {},
    scrollX: 0,
    scrollY: 0,
    scrollTo(position) {
      scrolls.push({...position});
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
              : {items: [], total: 0, totalRecords: 150, pages: 1, page: 1, snapshotId: 'snap-1', sourceAsOf: '2026-11-23T00:00:00Z'}
          )
      }))
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(conditionsSource, sandbox);
  vm.runInContext(
    indexJsSource + '\n;globalThis.__testExports = {catalogCard, renderDetail, performanceNotes, route, pollSnapshotChange, search};',
    sandbox
  );
  return {sandbox, elements, chips, intervals, scrolls, getEl};
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
        text: async () => JSON.stringify({items: [], total: 0, totalRecords: 150, pages: 1, page: 1, snapshotId: statsSnap, sourceAsOf: '2026-11-23T12:00:00Z'})
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
  sandbox.location.hash = '#catalog';
  await sandbox.__testExports.route();
  await settleFrontend();
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
                  comparison: {monthlyAmount: 20, costPerGB: 0.1, months: 1},
                  link: {}
                },
                {
                  id: 'A003',
                  name: 'With both unit prices',
                  plan: {name: 'P3', amount: 120, currency: 'CNY', billingPeriod: '年付', quota: '每月100GB'},
                  comparison: {monthlyAmount: 10, months: 12},
                  unitPrices: {currency: 'CNY', costPerGB: 0.1, dailyAmount: 120 / 365, dayBasis: '365_day_year'},
                  link: {}
                }
              ]
            })
        };
      }
      return jsonResponse({items: [], total: 138, totalRecords: 138, pages: 12, page: 1, snapshotId: 'snap-1', sourceAsOf: '2026-11-23T12:00:00Z'});
    }
  });

  await settleFrontend();
  const meta = elements.get('#catalog-meta');
  await sandbox.__testExports.pollSnapshotChange();
  assert.match(meta.textContent, / · 自动更新暂不可用$/);

  failStats = false;
  await sandbox.__testExports.pollSnapshotChange();
  assert.equal(meta.textContent, '138 个机场 · 数据基准 2026-11-23');

  await sandbox.__testExports.search();
  const renderedText = JSON.stringify(elements.get('#results'));
  assert.match(renderedText, /年付 · 月均 ¥10/);
  assert.match(renderedText, /¥0\.1/);
  assert.match(renderedText, /约 ¥0\.3288/);
  assert.doesNotMatch(renderedText, /NaN|Infinity/);
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
  const finishStale = finishSearch;
  const resetting = elements.get('#search-reset').dispatch('click');
  finishSearch(jsonResponse({items: [], total: 0}));
  await resetting;
  finishStale(response);
  await stale;
  assert.equal(elements.get('#results').children.length, 0);
  sandbox.document.querySelector('#search [name="criterion"]').value = 'cheap';
  sandbox.document.querySelector('#search [name="maxMonthly"]').value = '40';
  const search = sandbox.__testExports.search();
  finishSearch(response);
  await search;
  assert.match(elements.get('#status').textContent, /流量性价比.*20 CNY/);

  const abstained = sandbox.__testExports.search();
  finishSearch(jsonResponse({status: 'abstain', criterion: 'speed', maxMonthly: 15, currency: 'CNY', items: []}));
  await abstained;
  assert.match(elements.get('#status').textContent, /暂无可比较的速度实测数据.*比较口径：速度.*15 CNY/);

  const unparsed = sandbox.__testExports.search();
  finishSearch(jsonResponse({status: 'unparsed_needs', criterion: 'speed', reason: '需求未完整解析', items: []}));
  await unparsed;
  assert.equal(elements.get('#status').textContent, '需求未完整解析');
});

test('clearing search ignores both successful and failed responses already in flight', async () => {
  const requests = [];
  const {getEl} = createFrontendSandbox({
    fetchHandler: (url) => {
      if (url.startsWith('/api/search?')) {
        const response = Promise.withResolvers();
        requests.push(response);
        return response.promise;
      }
      return jsonResponse({items: [], total: 0, pages: 0, page: 1, snapshotId: 'one'});
    }
  });
  const search = getEl('#search');
  const reset = getEl('#search-reset');
  const status = getEl('#status');
  for (const response of [jsonResponse({items: [{id: 'A042', name: 'Old result'}]}), jsonResponse({error: 'Old error'}, 503)]) {
    const submitted = search.dispatch('submit');
    assert.equal(status.textContent, '正在查找…');
    const stale = requests.at(-1);
    const resetting = reset.dispatch('click');
    requests.at(-1).resolve(jsonResponse({items: [], total: 0}));
    await resetting;
    const cleared = status.textContent;
    stale.resolve(response);
    await submitted;
    assert.equal(status.textContent, cleared);
    assert.match(cleared, /暂无符合条件/);
    assert.equal(getEl('#results').children.length, 0);
  }
});

test('catalog retries the submitted filters and page while preserving successful cards, metadata and pager', async () => {
  const queries = [];
  const superseded = Promise.withResolvers();
  let snapshotId = 'one';
  let pages = 3;
  let fail = false;
  const {sandbox, getEl} = createFrontendSandbox({
    fetchHandler: (url) => {
      if (url === '/api/stats') return jsonResponse({snapshotId});
      const query = new URL(url, 'http://localhost').searchParams;
      queries.push(query);
      if (query.get('q') === 'superseded') return superseded.promise;
      const page = Number(query.get('page'));
      const name = `${snapshotId} ${query.get('q') || 'initial'} page ${page}`;
      return fail ? jsonResponse({error: 'Temporary failure'}, 503) : jsonResponse({
        items: page <= pages ? [{id: 'A042', name}] : [], page, pages, total: 12 * pages, snapshotId
      });
    }
  });
  await settleFrontend();
  const results = getEl('#catalog-results');
  const label = getEl('#page-label');
  const meta = getEl('#catalog-meta');
  const next = getEl('#next');
  const previous = getEl('#previous');
  const error = getEl('#catalog-error');
  const queryInput = getEl('#catalog-form [name="q"]');
  const catalogForm = getEl('#catalog-form');
  const retry = getEl('#catalog-retry');
  const initialCard = results.children[0];
  const initialMeta = meta.textContent;

  queryInput.value = 'unsent';
  fail = true;
  await next.dispatch('click');
  assert.equal(queries.at(-1).get('page'), '2');
  assert.equal(queries.at(-1).has('q'), false);
  assert.equal(results.children[0], initialCard);
  assert.equal(meta.textContent, initialMeta);
  assert.equal(label.textContent, '第 1 / 3 页');
  assert.equal(previous.disabled, true);
  assert.equal(next.disabled, false);
  assert.equal(error.hidden, false);

  fail = false;
  await next.dispatch('click');
  assert.equal(queries.at(-1).get('page'), '2');
  assert.equal(label.textContent, '第 2 / 3 页');
  assert.equal(error.hidden, true);

  const secondCard = results.children[0];
  queryInput.value = 'A+B & C';
  fail = true;
  await catalogForm.dispatch('submit');
  const submitted = queries.at(-1).toString();
  assert.equal(queries.at(-1).get('page'), '1');
  assert.equal(queries.at(-1).get('q'), 'A+B & C');
  assert.equal(results.children[0], secondCard);
  assert.equal(label.textContent, '第 2 / 3 页');
  queryInput.value = 'another unsent edit';
  fail = false;
  await retry.dispatch('click');
  assert.equal(queries.at(-1).toString(), submitted);
  assert.match(JSON.stringify(results), /A\+B & C/);

  await next.dispatch('click');
  const filteredSecondCard = results.children[0];
  snapshotId = 'two';
  pages = 1;
  fail = true;
  await sandbox.__testExports.pollSnapshotChange();
  assert.equal(queries.at(-1).get('page'), '2');
  assert.equal(results.children[0], filteredSecondCard);
  assert.equal(label.textContent, '第 2 / 3 页');
  fail = false;
  await sandbox.__testExports.pollSnapshotChange();
  assert.deepEqual(queries.slice(-2).map((q) => [q.get('q'), q.get('page')]), [['A+B & C', '2'], ['A+B & C', '1']]);
  assert.match(JSON.stringify(results), /two A\+B & C page 1/);
  assert.equal(label.textContent, '第 1 / 1 页');
  assert.equal(next.disabled, true);
  assert.equal(error.hidden, true);

  queryInput.value = 'superseded';
  const olderRequest = catalogForm.dispatch('submit');
  queryInput.value = 'current';
  await catalogForm.dispatch('submit');
  superseded.resolve(jsonResponse({error: 'Outdated failure'}, 503));
  await olderRequest;
  assert.match(JSON.stringify(results), /two current page 1/);
  assert.equal(error.hidden, true);
});

test('direct detail loads lazily and a failed publication refresh retries without resetting the billing filter or scroll', async () => {
  const calls = [];
  const detailPriorities = [];
  let snapshotId = 'one';
  let fail = false;
  const {sandbox, getEl, scrolls} = createFrontendSandbox({
    hash: '#/airport/A042',
    fetchHandler: (url, options) => {
      calls.push(url);
      if (url === '/api/stats') return jsonResponse({snapshotId});
      if (url.startsWith('/api/catalog?')) return jsonResponse({items: [], page: 1, pages: 0, total: 0, snapshotId});
      assert.equal(url, '/api/airports/A042');
      detailPriorities.push(options.priority);
      if (fail) return jsonResponse({error: 'Temporary failure'}, 503);
      return jsonResponse({
        snapshotId,
        item: {
          id: 'A042', name: snapshotId,
          summary: {price: {billingPeriod: '月付'}},
          pricing: {plans: [{name: 'Monthly', billingPeriod: '月付'}, {name: 'Yearly', billingPeriod: '年付'}]}
        }
      });
    }
  });
  await settleFrontend();
  assert.deepEqual(calls, ['/api/airports/A042', '/api/stats']);
  const content = getEl('#detail-content');
  const initial = content.children[0];
  const select = content.querySelector('.plans-heading select');
  assert.equal(select.value, '月付');
  select.value = '年付';
  await select.dispatch('change');
  sandbox.scrollY = 420;
  snapshotId = 'two';
  fail = true;
  await sandbox.__testExports.pollSnapshotChange();
  assert.equal(content.children[0], initial);
  assert.equal(getEl('#detail-error').hidden, false);
  assert.deepEqual(scrolls, [{top: 0, behavior: 'instant'}]);

  fail = false;
  await sandbox.__testExports.pollSnapshotChange();
  assert.deepEqual(detailPriorities, [undefined, 'low', 'low']);
  assert.equal(calls.some((url) => url.startsWith('/api/catalog?')), false);
  assert.match(JSON.stringify(content), /"textContent":"two"/);
  assert.equal(content.querySelector('.plans-heading select').value, '年付');
  assert.match(JSON.stringify(content), /Yearly/);
  assert.doesNotMatch(JSON.stringify(content), /Monthly/);
  assert.deepEqual(scrolls.at(-1), {left: 0, top: 420, behavior: 'instant'});
  assert.equal(getEl('#detail-error').hidden, true);

  sandbox.location.hash = '#catalog';
  await sandbox.__testExports.route();
  assert.equal(calls.filter((url) => url.startsWith('/api/catalog?')).length, 1);
  sandbox.location.hash = '#compare';
  await sandbox.__testExports.route();
  assert.equal(calls.filter((url) => url.startsWith('/api/catalog?')).length, 1);
});

test('public details put latency in a focusable scroll region and show only sourced available-plan notes', () => {
  const {sandbox} = createFrontendSandbox();
  const plan = {amount: 10, billingPeriod: '月付', sourceIds: ['private-source-id']};
  const root = sandbox.__testExports.renderDetail({
    summary: {latencyContext: {rows: [{region: '香港', cloudflareTypicalMs: 80}]}},
    pricing: {status: 'advertised_not_checkout_verified', plans: [
      {...plan, name: 'Available', quotaReset: '每月重置', terms: {summary: '<b>限本人使用</b>', sourceIds: ['private-terms-id']},
        additionalCharges: 0, retainedContractFields: {additionalCharges: {historical: true, observedAt: '2026-10-26', sourceIds: ['private-charge-id']}}},
      {...plan, name: 'Sold out', soldOut: true, terms: 'sold-out note'},
      {...plan, name: 'Unavailable', purchasable: false, terms: 'unavailable note'},
      {...plan, name: 'Unconfirmed', priceStatus: 'not_confirmed', terms: 'unconfirmed note'},
      {...plan, name: 'Unsourced', sourceIds: [], terms: 'unsourced note'},
      {...plan, name: 'No conditions'}
    ]}
  });
  const latency = findElement(root, (node) => node.className === 'historical-latency');
  const wrap = findElement(latency, (node) => node.className === 'table-wrap');
  assert.equal(wrap.tabIndex, 0);
  assert.equal(wrap.getAttribute('role'), 'region');
  assert.equal(wrap.getAttribute('aria-label'), latency.children[0].textContent);
  assert.deepEqual(wrap.children[0].children.map((n) => n.tagName), ['THEAD', 'TBODY']);
  const plans = findElement(root, (node) => node.className === 'plans-section');
  const planWrap = findElement(plans, (node) => node.className === 'table-wrap');
  assert.equal(planWrap.tabIndex, 0);
  assert.equal(planWrap.getAttribute('role'), 'region');
  assert.equal(planWrap.getAttribute('aria-label'), '套餐价格');
  assert.ok(planWrap.children[0].children[0].children[0].children.every((header) => header.scope === 'col'));
  const conditions = findElement(root, (node) => node.className === 'plan-conditions');
  const notes = conditions.children[1].children.map((n) => n.textContent).join('\n');
  assert.match(notes, /每月重置/);
  assert.match(notes, /<b>限本人使用<\/b>/);
  assert.match(notes, /附加费用：0/);
  assert.match(notes, /2026-10-26.*本轮未重验/);
  const rendered = JSON.stringify(root);
  assert.equal(rendered.match(/"className":"plan-conditions"/g).length, 1);
  assert.doesNotMatch(rendered, /private-(source|terms|charge)-id|sold-out note|unavailable note|unconfirmed note|unsourced note/);
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
      assert.equal(options.priority, total === 24 ? 'low' : undefined);
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

test('public index.html serves a plan-first landing page while retaining the airport filters and hiding console access', () => {
  const html = fs.readFileSync(path.join(ROOT, 'deploy-service/public/index.html'), 'utf8');
  assert.doesNotMatch(html, /\/console\.html/);
  assert.doesNotMatch(html, /__SITE_NONCE__/);
  assert.match(html, /id="snapshot-badge"/);
  assert.match(html, /id="stat-primary"/);
  assert.match(html, /id="open-plan-comparison"/);
  assert.match(html, /name="monthlyOnly"/);
  assert.match(html, /<section id="catalog"[^>]+ hidden>/);
  assert.match(html, /name="scope"/);
  assert.match(html, /name="refund"/);
  assert.match(html, /data-payment="支付宝"/);
  assert.match(html, /data-preset-needs="每月20元以内 性价比"/);
});

test('the home route loads individual plan offers, preserves comparison on pagination, and opens the selected offers', async () => {
  const queries = [];
  const {getEl} = createFrontendSandbox({hash: '', fetchHandler: async (url) => {
    if (url === '/api/stats') return jsonResponse({snapshotId: 'one'});
    assert.match(url, /^\/api\/search\?/);
    const params = new URL(url, 'http://localhost').searchParams;
    assert.equal(params.get('view'), 'plans');
    const page = Number(params.get('page'));
    queries.push(params);
    return jsonResponse({snapshotId: 'one', currency: 'CNY', total: 13, page, pages: 2, items: [{
      id: 'A001', name: 'Fixture', planKey: 'A001-' + page,
      plan: {name: 'Plan ' + page, amount: page * 60, currency: 'CNY', billingPeriod: '年付'},
      comparison: {monthlyAmount: page * 5, months: 12},
      unitPrices: {currency: 'CNY', dailyAmount: page * 60 / 365, dayBasis: '365_day_year'}
    }]});
  }});
  await settleFrontend();
  assert.equal(queries.length, 1);
  assert.equal(getEl('#catalog').hidden, true);
  assert.equal(getEl('#open-plan-comparison').disabled, true);
  const chooseVisiblePlan = () => findElement(getEl('#results'), el => el.className.includes('offer-toggle')).dispatch('click');
  await chooseVisiblePlan();
  getEl('#search [name="q"]').value = 'unsubmitted draft';
  await getEl('#plan-next').dispatch('click');
  assert.equal(queries.at(-1).get('page'), '2');
  assert.equal(queries.at(-1).has('q'), false);
  await chooseVisiblePlan();
  await getEl('#open-plan-comparison').dispatch('click');
  assert.equal(getEl('#plan-comparison').open, true);
  const compare = JSON.stringify(getEl('#plan-comparison-content'));
  assert.match(compare, /Plan 1/);
  assert.match(compare, /年付 · 月均 ¥10/);
  assert.match(compare, /约 ¥0\.3288/);
  assert.equal(getEl('#plan-selection-count').textContent, '2/3');
  await getEl('#clear-plan-comparison').dispatch('click');
  assert.equal(getEl('#plan-comparison').open, false);
  assert.equal(getEl('#plan-selection-count').textContent, '0/3');
});
