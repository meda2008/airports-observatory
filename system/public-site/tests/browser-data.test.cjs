'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const catalogBytes = fs.readFileSync(path.join(root, 'data/public-catalog.json'));
const sourceBytes = fs.readFileSync(path.join(root, 'data/public-sources.json'));
const catalog = JSON.parse(catalogBytes), sources = JSON.parse(sourceBytes);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const hashes = { catalogSha256: hash(catalogBytes), sourcesSha256: hash(sourceBytes) };
const modulePromise = import(pathToFileURL(path.join(root, 'src/browser-data.mjs')).href);

test('all browser details preserve exact records and every nested evidence reference with bounded request sizes', async () => {
  const { browserDataDocuments } = await modulePromise;
  const documents = browserDataDocuments(catalog, sources, hashes);
  assert.equal(documents.size, catalog.items.length + 1);
  const sourceMap = new Map(sources.items.map(source => [source.id, source]));
  for (const record of catalog.items) {
    const bundle = documents.get('data/details/' + record.id + '.json');
    assert.deepEqual(bundle.record, record);
    const references = new Set();
    const visit = value => {
      if (!value || typeof value !== 'object') return;
      for (const id of value.sourceIds || []) references.add(id);
      for (const child of Object.values(value)) if (child && typeof child === 'object') visit(child);
    };
    visit(record);
    assert.deepEqual(new Set(bundle.sources.map(source => source.id)), references);
    for (const source of bundle.sources) assert.deepEqual(source, sourceMap.get(source.id));
    assert(Buffer.byteLength(JSON.stringify(bundle)) < 512 * 1024, record.id + ' exceeded detail request budget');
  }
  assert(Buffer.byteLength(JSON.stringify(documents.get('data/browser-index.json'))) < 300 * 1024);
});

test('browser data rejects unresolved evidence and path-shaped record IDs rather than emitting partial details', async () => {
  const { browserDataDocuments } = await modulePromise;
  const missing = structuredClone(catalog); missing.items[0].coreInfo.sourceIds.push('UNRESOLVED');
  assert.throws(() => browserDataDocuments(missing, sources, hashes), /Unresolved public source/);
  const unsafe = structuredClone(catalog); unsafe.items[0].id = '../private';
  assert.throws(() => browserDataDocuments(unsafe, sources, hashes), /Invalid or duplicate browser record/);
});

test('runtime read models reject mismatched snapshot, wrong record and lost evidence', async () => {
  const { browserDataDocuments, validateBrowserIndex, validateBrowserDetail } = await modulePromise;
  const documents = browserDataDocuments(catalog, sources, hashes), index = documents.get('data/browser-index.json');
  assert.equal(validateBrowserIndex(index, hashes.catalogSha256), index);
  assert.throws(() => validateBrowserIndex(index, 'f'.repeat(64)), /版本不一致/);
  const detail = documents.get('data/details/A014.json');
  assert.equal(validateBrowserDetail(detail, 'A014', index), detail);
  assert.throws(() => validateBrowserDetail(detail, 'A004', index), /版本不一致/);
  assert.throws(() => validateBrowserDetail({ ...detail, sourcesSha256: 'f'.repeat(64) }, 'A014', index), /版本不一致/);
  assert.throws(() => validateBrowserDetail({ ...detail, sources: [] }, 'A014', index), /缺少引用来源/);
});
