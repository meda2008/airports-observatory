'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { verifyPublication, loadDirectory } = require('../scripts/verify-publication.cjs');
const root = path.resolve(__dirname, '..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => Buffer.from(JSON.stringify(value));
const read = (files, name) => JSON.parse(files[name].toString('utf8'));
const clone = files => Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, Buffer.from(bytes)]));
const base = loadDirectory(path.join(root, 'dist'));

// Rehashing here simulates a publisher updating a file AND its embedded manifests.
// Semantic validation and an externally retained manifest hash must remain useful.
function rehash(files, change) {
  change(files);
  const publication = read(files, 'data/publication-manifest.json');
  for (const output of publication.outputs) {
    const bytes = files['data/' + output.file];
    output.sha256 = hash(bytes); output.bytes = bytes.byteLength;
  }
  files['data/publication-manifest.json'] = jsonBytes(publication);
  const build = read(files, 'build-manifest.json');
  build.sourcePublication = publication;
  for (const entry of build.files) {
    const bytes = files[entry.path];
    entry.sha256 = hash(bytes); entry.bytes = bytes.byteLength;
  }
  files['build-manifest.json'] = jsonBytes(build);
}

async function fails(files, code, options) {
  const result = await verifyPublication(files, options);
  assert.equal(result.status, 'FAIL');
  assert.equal(result.errors[0].code, code);
  assert.equal(result.factualClaimsVerified, false);
  assert.equal(result.originalLedgerRecomputed, false);
  return result;
}

test('current public bytes independently verify with explicitly limited claims', async () => {
  const result = await verifyPublication(base, { expectedManifestSha256: hash(base['build-manifest.json']) });
  assert.equal(result.status, 'PASS');
  assert.equal(result.counts.catalog, 215);
  assert.equal(result.counts.discovery, 30);
  assert.equal(result.counts.ledger, 245);
  assert.equal(result.counts.sources, read(base,'data/public-sources.json').items.length);
  assert.equal(result.counts.scorablePredictions, 0);
  assert.equal(result.referenceMatched, true);
  assert.equal(result.trustedTimestampVerified, false);
  assert.equal(result.factualClaimsVerified, false);
  assert.equal(result.originalLedgerRecomputed, false);
});

test('a same-length byte change fails its declared SHA-256', async () => {
  const files = clone(base); files['app.js'][0] ^= 1;
  await fails(files, 'HASH_MISMATCH');
});

test('refresh: rehashing cannot promote an advertisement to a verified checkout price', async () => {
  const files=clone(base);rehash(files,changed=>{
    const catalog=read(changed,'data/public-catalog.json');
    catalog.items.find(item=>item.currentEvidence.offers.plans.length).currentEvidence.offers.plans[0].checkoutVerified=true;
    changed['data/public-catalog.json']=jsonBytes(catalog);
  });
  await fails(files,'UNSUPPORTED_CURRENT_PRICE');
});

test('refresh: a limited community scan cannot be promoted to a verified complaint rate', async () => {
  const files=clone(base);rehash(files,changed=>{
    const catalog=read(changed,'data/public-catalog.json');
    catalog.items[0].currentEvidence.community.zeroMatchesMeansZeroComplaints=true;
    changed['data/public-catalog.json']=jsonBytes(catalog);
  });
  await fails(files,'UNSUPPORTED_COMPLAINT_CERTAINTY');
});

test('missing and extra undeclared files fail exact public artifact coverage', async () => {
  const missing = clone(base); delete missing['app.js'];
  await fails(missing, 'FILE_SET_MISMATCH');
  const extra = clone(base); extra['untracked.html'] = Buffer.from('synthetic undeclared fixture');
  await fails(extra, 'FILE_SET_MISMATCH');
});

test('path traversal, backslashes, URLs and duplicate declarations are rejected', async () => {
  for (const bad of ['../outside', '/absolute', 'data\\escape', 'https://example.com/x', 'data/%2e%2e/x', 'data//x']) {
    const files = clone(base), build = read(files, 'build-manifest.json');
    build.files[0].path = bad; files['build-manifest.json'] = jsonBytes(build);
    await fails(files, 'UNSAFE_PATH');
  }
  const files = clone(base), build = read(files, 'build-manifest.json');
  build.files.push(build.files[0]); files['build-manifest.json'] = jsonBytes(build);
  await fails(files, 'DUPLICATE_PATH');
});

test('rehashing cannot hide unresolved source references', async () => {
  const files = clone(base);
  rehash(files, target => {
    const catalog = read(target, 'data/public-catalog.json');
    catalog.items[0].sourceIds.push('synthetic-absent-source');
    target['data/public-catalog.json'] = jsonBytes(catalog);
  });
  await fails(files, 'UNRESOLVED_SOURCE');
});

test('rehashing cannot erase original ledger hash or sever record/forecast links', async () => {
  const noHash = clone(base);
  rehash(noHash, files => {
    const ledger = read(files, 'data/public-ledger.json'); delete ledger.items[0].originalEntrySha256;
    files['data/public-ledger.json'] = jsonBytes(ledger);
  });
  await fails(noHash, 'ORIGINAL_HASH_MISSING');
  const wrongLink = clone(base);
  rehash(wrongLink, files => {
    const ledger = read(files, 'data/public-ledger.json'); ledger.items[0].forecastId += '-synthetic-changed';
    files['data/public-ledger.json'] = jsonBytes(ledger);
  });
  await fails(wrongLink, 'FORECAST_LINK_MISMATCH');
});

test('same-manifest rewrite is only detectable with an independently retained pin', async () => {
  const files = clone(base);
  rehash(files, target => { target['app.js'][0] ^= 1; });
  // Self-published hashes do not certify JS behavior. This honest limit is explicit.
  const unpinned = await verifyPublication(files);
  assert.equal(unpinned.status, 'PASS');
  assert.equal(unpinned.referenceProvided, false);
  await fails(files, 'MANIFEST_PIN_MISMATCH', { expectedManifestSha256: hash(base['build-manifest.json']) });
});

test('updated manifests do not conceal ledger/record forecast field disagreement', async () => {
  const files = clone(base);
  rehash(files, target => {
    const ledger = read(target, 'data/public-ledger.json'); ledger.items[0].pointProbability = 0.7;
    target['data/public-ledger.json'] = jsonBytes(ledger);
  });
  await fails(files, 'FORECAST_FIELD_MISMATCH');
});

test('repository metadata exceptions are explicit, fixed and reported', async () => {
  const files = clone(base); files['README.md'] = Buffer.from('synthetic repository metadata');
  await fails(files, 'FILE_SET_MISMATCH');
  const result = await verifyPublication(files, { allowRepositoryMetadata: true });
  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.ignoredRepositoryMetadata, ['README.md']);
  files['.github/unexpected.yml'] = Buffer.from('synthetic unexpected file');
  await fails(files, 'FILE_SET_MISMATCH', { allowRepositoryMetadata: true });
});

test('CLI reads only the selected public directory and uses failure exit codes', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'airports-public-verify-'));
  try {
    // Small isolated broken package: no dependency on private catalog or parent dirs.
    fs.writeFileSync(path.join(directory, 'build-manifest.json'), base['build-manifest.json']);
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/verify-publication.cjs'), '--directory', directory], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).errors[0].code, 'FILE_SET_MISMATCH');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('rehashing a changed scoped detail cannot detach it from the complete public record',async()=>{
 const files=clone(base);rehash(files,target=>{const detail=read(target,'data/details/A014.json');detail.record.name='Unbound replacement';target['data/details/A014.json']=jsonBytes(detail);});
 await fails(files,'BROWSER_DATA_MISMATCH');
});
