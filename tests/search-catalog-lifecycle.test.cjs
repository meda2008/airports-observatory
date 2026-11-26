'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createApp } = require('../lib/app.cjs');
const { createServer } = require('../deploy-service/server.cjs');
const { openCatalogDb } = require('../deploy-service/catalog-db.cjs');

const observedAt = '2026-11-01T00:00:00Z';
function plan(amount) {
  return {
    name: 'Synthetic plan', amount, currency: 'CNY', billingPeriod: '月付',
    amountBasis: 'original_billing_period_total', sourceIds: ['synthetic'], observedAt,
  };
}

function fixture(t, id, amount) {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airport-search-'));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));
  const dir = path.join(baseDir, 'catalog');
  fs.mkdirSync(dir);
  const write = (name, data) => fs.writeFileSync(path.join(dir, name), JSON.stringify(data));
  const catalogFile = path.join(dir, 'catalog.v1.json');
  const referralFile = path.join(dir, 'verified-referrals.json');
  function publishCatalog(evidenceFrozenAt) {
    write('catalog.v1.json', {
      schemaVersion: 'airports-catalog.v1', evidenceFrozenAt,
      catalog: [{ id, name: 'Synthetic ' + id, category: 'airport', officialUrl: 'https://example.invalid', provenanceIds: [] }],
    });
  }
  function publishPrice(price) {
    write('core-supplement.v1.json', {
      schemaVersion: 'airports-core-supplement.v1', sources: [],
      records: [{ recordId: id, pricing: { plans: [plan(price)] } }],
    });
  }
  publishCatalog(observedAt);
  publishPrice(amount);
  write('source-provenance.json', { sources: [{ source_id: 'synthetic' }] });
  fs.writeFileSync(path.join(dir, 'forecast-ledger.v1.ndjson'), '');
  return { baseDir, catalogFile, referralFile, publishCatalog, publishPrice };
}

function countReads(t) {
  const reads = new Map(), read = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', (file, ...args) => {
    reads.set(file, (reads.get(file) || 0) + 1);
    return read(file, ...args);
  });
  return file => reads.get(file) || 0;
}

async function listen(t, server, route) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return async (query = '') => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${route}${query}`);
    return { status: res.status, body: await res.json() };
  };
}

function assertSearch(response, id, price, evidenceAsOf = observedAt) {
  assert.equal(response.status, 200);
  assert.equal(response.body.evidenceAsOf, evidenceAsOf);
  assert.deepEqual(response.body.items.map(item => [item.id, item.comparison.monthlyAmount]), [[id, price]]);
}

test('needs search reuses the app catalog, refreshes its files, and isolates app roots', async t => {
  const left = fixture(t, 'A001', 10), right = fixture(t, 'A002', 30);
  const reads = countReads(t);
  const a = await listen(t, http.createServer(createApp({ baseDir: left.baseDir }).app), '/api/needs-search');
  const b = await listen(t, http.createServer(createApp({ baseDir: right.baseDir }).app), '/api/needs-search');
  assert.equal(reads(left.catalogFile), 1);
  assert.equal(reads(right.catalogFile), 1);

  const first = await a();
  assertSearch(first, 'A001', 10);
  assert.equal(first.body.items[0].link.type, 'official_fallback');
  assertSearch(await b(), 'A002', 30);
  assert.deepEqual(await a(), first);
  assert.equal((await a('?currency=CNY&currency=USD')).status, 400);
  assert.equal(reads(left.catalogFile), 1);
  assert.equal(reads(right.catalogFile), 1);

  const url = 'https://example.invalid/invite?ref=synthetic';
  fs.writeFileSync(left.referralFile, JSON.stringify({ links: [{
    recordId: 'A001', url, status: 'verified_user_referral', owner: 'user',
    sourceIds: ['synthetic'], verifiedAt: observedAt, disclosure: 'Synthetic referral disclosure',
  }] }));
  const withReferral = await a();
  assert.equal(withReferral.body.items[0].link.type, 'verified_user_referral');
  assert.equal(withReferral.body.items[0].link.url, url);
  assert.deepEqual(await a(), withReferral);
  assert.equal(reads(left.referralFile), 1);
  assert.equal(reads(left.catalogFile), 1);
  fs.unlinkSync(left.referralFile);
  assert.deepEqual(await a(), first);

  left.publishPrice(20);
  assertSearch(await a(), 'A001', 20);
  assertSearch(await a(), 'A001', 20);
  assertSearch(await b(), 'A002', 30);
  assert.equal(reads(left.catalogFile), 2);
  assert.equal(reads(right.catalogFile), 1);
});

test('search fallback loads lazily per server and retries a failed file refresh', async t => {
  const left = fixture(t, 'A001', 10), right = fixture(t, 'A002', 30);
  const reads = countReads(t);
  const a = await listen(t, createServer({ baseDir: left.baseDir }), '/api/search');
  const b = await listen(t, createServer({ baseDir: right.baseDir }), '/api/search');
  assert.equal((await a('?currency=CNY&currency=USD')).status, 400);
  assert.equal(reads(left.catalogFile), 0);
  assert.equal(reads(right.catalogFile), 0);

  const first = await a();
  assertSearch(first, 'A001', 10);
  assertSearch(await b(), 'A002', 30);
  assert.deepEqual(await a(), first);
  assert.equal(reads(left.catalogFile), 1);
  assert.equal(reads(right.catalogFile), 1);

  fs.writeFileSync(left.catalogFile, '{');
  assert.equal((await a()).status, 409);
  const publishedAt = '2026-11-02T00:00:00Z';
  left.publishCatalog(publishedAt);
  assertSearch(await a(), 'A001', 10, publishedAt);
  assertSearch(await a(), 'A001', 10, publishedAt);
  assertSearch(await b(), 'A002', 30);
  assert.equal(reads(left.catalogFile), 3);
  assert.equal(reads(right.catalogFile), 1);
});

test('search reads the latest SQLite publication after the HTTP server starts', async t => {
  const { baseDir } = fixture(t, 'A002', 30);
  const catalogDb = openCatalogDb({ filename: ':memory:', root: baseDir });
  t.after(() => catalogDb.close());
  const publish = (amount, date) => catalogDb.importRecords({ records: [{
    id: 'A001', name: 'Synthetic database record', category: 'airport', primary: true, fields: {},
    coreInfo: { pricing: { plans: [{ ...plan(amount), observedAt: date }] } },
  }] });
  publish(10, observedAt);
  const server = createServer({ catalogDb, baseDir });
  const reads = countReads(t);
  const get = await listen(t, server, '/api/search');
  assertSearch(await get(), 'A001', 10);
  const publishedAt = '2026-11-02T00:00:00Z';
  assert.equal(publish(20, publishedAt).status, 'published');
  assertSearch(await get(), 'A001', 20, publishedAt);
  assert.equal(reads(path.join(baseDir, 'catalog/catalog.v1.json')), 0);
});
