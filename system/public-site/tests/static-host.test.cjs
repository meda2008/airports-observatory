'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { once } = require('node:events');
const { createApp } = require('../../lib/app.cjs');
const { loadDirectory, verifyPublication } = require('../scripts/verify-publication.cjs');

test('real local app serves the complete public module graph with exact bytes and blocks private files', async () => {
  const { app } = createApp({ baseDir: path.resolve(__dirname, '../..') });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const base = 'http://127.0.0.1:' + server.address().port + '/';
    const expected = loadDirectory(path.join(__dirname, '../dist'));
    const actual = Object.create(null);
    for (const [file, bytes] of Object.entries(expected)) {
      const response = await fetch(new URL(file, base));
      assert.equal(response.status, 200, file);
      if (/\.m?js$/.test(file)) assert.match(response.headers.get('content-type'), /(?:text|application)\/javascript/, file);
      actual[file] = Buffer.from(await response.arrayBuffer());
      assert.deepEqual(actual[file], bytes, file);
    }
    const result = await verifyPublication(actual);
    assert.equal(result.status, 'PASS', JSON.stringify(result.errors));
    for (const file of ['catalog/catalog.v1.json', '.env', 'data.js', 'scripts/settle-ledger.cjs', 'data/details/.env', 'data/details/secrets.json', 'data/details/A999.json', 'data/details/A014.txt', 'data/details/%2e%2e%2f.env']) {
      assert.equal((await fetch(new URL(file, base))).status, 404, file);
    }
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('real build: entry assets and transitive modules share a content revision and serve exact versioned bytes', async () => {
  const { app } = createApp({ baseDir: path.resolve(__dirname, '../..') });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const base = 'http://127.0.0.1:' + server.address().port + '/';
    const files = loadDirectory(path.join(__dirname, '../dist'));
    const manifest = JSON.parse(files['build-manifest.json']);
    assert.match(manifest.assetRevision, /^[a-f0-9]{64}$/);
    const refs = new Set([...files['index.html'].toString().matchAll(/(?:src|href)=["'](\.\/[^"']+)["']/g)].map(x => x[1]));
    let imports = 0;
    for (const file of ['app.js', 'verification-page.mjs', 'core-view.mjs', 'current-evidence-view.mjs', 'integrity.mjs']) {
      for (const match of files[file].toString().matchAll(/\bfrom\s+["'](\.\/[^"']+)["']/g)) { refs.add(match[1]); imports++; }
    }
    assert(imports >= 4, 'the actual transitive module graph must be checked');
    for (const ref of refs) {
      const url = new URL(ref, base);
      assert.deepEqual([...url.searchParams.keys()], ['v']);
      assert.equal(url.searchParams.get('v'), manifest.assetRevision);
      const canonical = files[url.pathname.slice(1)];
      assert(canonical, 'versioned reference must resolve to a retained canonical file');
      const response = await fetch(url);
      assert.equal(response.status, 200);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), canonical);
    }
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
