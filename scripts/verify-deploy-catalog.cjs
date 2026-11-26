'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createStore} = require('../deploy-service/store.cjs');
const {openCatalogDb} = require('../deploy-service/catalog-db.cjs');
const {activeRecords} = require('../deploy-service/catalog-curation.cjs');

function verifyDeployCatalog(root = path.resolve(__dirname, '..')) {
  const source = JSON.parse(fs.readFileSync(path.join(root, 'catalog/catalog.v1.json'), 'utf8')).catalog;
  const expected = activeRecords(source, root);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'airports-catalog-check-'));
  const filename = path.join(directory, 'catalog.sqlite');
  let store, catalog;
  try {
    store = createStore({filename});
    catalog = openCatalogDb({filename, store, root});
    const publication = catalog.sync();
    assert.equal(publication.status, 'published');
    assert.equal(catalog.stats().counts.all, expected.length);
    assert.equal(catalog.sync().status, 'unchanged');
    return {status: 'verified', snapshotId: publication.snapshotId, sourceRecords: source.length, archivedRecords: source.length - expected.length, publishedRecords: expected.length};
  } finally {
    catalog?.close();
    store?.close();
    fs.rmSync(directory, {recursive: true, force: true});
  }
}

if (require.main === module) console.log(JSON.stringify(verifyDeployCatalog()));
module.exports = {verifyDeployCatalog};
