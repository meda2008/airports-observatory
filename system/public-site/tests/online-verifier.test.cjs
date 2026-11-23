'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadDirectory } = require('../scripts/verify-publication.cjs');
const { verifyOnline, mapBounded, persistReport, BOUND_TARGET } = require('../scripts/verify-online.cjs');
const root = path.resolve(__dirname, '..');
const files = loadDirectory(path.join(root, 'dist'));
const commit = 'a'.repeat(40); // Explicitly synthetic GitHub metadata; no network access.
const build = JSON.parse(files['build-manifest.json']);

function fixture({ metadata = {}, changeFile, privateStatus = 404, alteredOrigin, deploymentStatus } = {}) {
  const requests = [], apiRequests = [];
  const config = { origin: alteredOrigin || BOUND_TARGET.origin, repositoryUrl: BOUND_TARGET.repositoryUrl, hostingProvider: 'github-pages' };
  const target = { provider: 'github-pages', ...BOUND_TARGET };
  const publication = { ...target, commitSha: commit, publicBuildManifest: build };
  const github = {
    ['repos/' + BOUND_TARGET.repository]: { id: BOUND_TARGET.repositoryId, full_name: BOUND_TARGET.repository, private: false },
    ['repos/' + BOUND_TARGET.repository + '/pages']: { status: 'built', public: true, https_enforced: true,
      html_url: BOUND_TARGET.origin + '/', source: { branch: 'main', path: '/' } },
    ['repos/' + BOUND_TARGET.repository + '/pages/builds/latest']: { status: 'built', commit, error: { message: null } }
  };
  if (deploymentStatus !== undefined) github['repos/' + BOUND_TARGET.repository + '/pages/deployments/' + commit] = { status: deploymentStatus };
  for (const [key, update] of Object.entries(metadata)) Object.assign(github['repos/' + BOUND_TARGET.repository + key], update);
  const ghApi = async endpoint => { apiRequests.push(endpoint); assert.ok(Object.hasOwn(github, endpoint)); return github[endpoint]; };
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url); requests.push({ url, options });
    assert.equal(parsed.origin, 'https://meda2008.github.io');
    assert.equal(parsed.searchParams.get('publication'), commit);
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'manual');
    const name = parsed.pathname.slice('/airports-observatory/'.length) || 'index.html';
    if (['data.js', 'catalog/catalog.v1.json', '.env'].includes(name)) return new Response('synthetic secret body', { status: privateStatus });
    assert.ok(Object.hasOwn(files, name), 'Only declared public files should be requested: ' + name);
    let bytes = Buffer.from(files[name]);
    if (changeFile === name) { if (bytes.length) bytes[0] ^= 1; else bytes = Buffer.from('synthetic changed fixture'); }
    const mime = name.endsWith('.html') ? 'text/html' : /\.m?js$/.test(name) ? 'text/javascript' :
      name.endsWith('.css') ? 'text/css' : name.endsWith('.json') ? 'application/json' : name.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
    return new Response(bytes, { status: 200, headers: { 'Content-Type': mime, 'Content-Length': String(bytes.length) } });
  };
  return { config, target, publication, localFiles: files, ghApi, fetchImpl, requests, apiRequests };
}

test('synthetic HTTP/API replies bind the exact commit and all dynamic artifact files', async () => {
  const inputs = fixture();
  const report = await verifyOnline(inputs);
  assert.equal(report.status, 'PASS_ONLINE_STATIC_HTTP_ONLY');
  assert.equal(report.expectedCommit, commit);
  assert.equal(report.publicFilesVerified, build.files.length + 1);
  assert.equal(report.remoteVerification.status, 'PASS');
  assert.equal(report.remoteVerification.referenceMatched, true);
  assert.equal(report.browserVisualVerified, false);
  assert.equal(report.predictionQualityValidated, false);
  assert.equal(inputs.apiRequests.length, 3);
  assert.equal(inputs.requests.length, build.files.length + 5);
});

test('target drift and invalid commits stop before any outbound request', async () => {
  const inputs = fixture({ alteredOrigin: 'https://unrelated.example/' });
  let report = await verifyOnline(inputs);
  assert.equal(report.errors[0].code, 'TARGET_MISMATCH');
  assert.equal(inputs.requests.length, 0); assert.equal(inputs.apiRequests.length, 0);
  const valid = fixture();
  report = await verifyOnline({ ...valid, commit: 'synthetic-not-a-commit' });
  assert.equal(report.errors[0].code, 'INVALID_COMMIT');
  assert.equal(valid.requests.length, 0); assert.equal(valid.apiRequests.length, 0);
});

test('private or non-HTTPS Pages and stale builds cannot pass', async () => {
  for (const update of [{ public: false }, { https_enforced: false }, { source: { branch: 'other', path: '/' } }]) {
    const inputs = fixture({ metadata: { '/pages': update } });
    const result = await verifyOnline(inputs);
    assert.equal(result.errors[0].code, 'PAGES_NOT_PUBLIC_HTTPS_BUILT');
    assert.equal(inputs.requests.length, 0);
  }
  const inputs = fixture({ metadata: { '/pages/builds/latest': { commit: 'b'.repeat(40) } } });
  const result = await verifyOnline(inputs);
  assert.equal(result.errors[0].code, 'PAGES_COMMIT_NOT_BUILT');
  assert.equal(inputs.requests.length, 0);
});

test('publication receipt must correspond to the candidate bytes before fetching', async () => {
  const inputs = fixture();
  inputs.publication = { ...inputs.publication, publicBuildManifest: { syntheticMismatch: true } };
  const result = await verifyOnline(inputs);
  assert.equal(result.errors[0].code, 'PUBLICATION_RECEIPT_MISMATCH');
  assert.equal(inputs.requests.length, 0); assert.equal(inputs.apiRequests.length, 0);
});

test('exact-commit successful deployment can supersede a stale failed legacy build, retaining both states', async () => {
  const inputs = fixture({ metadata: { '/pages/builds/latest': { commit: 'b'.repeat(40), status: 'errored', error: { message: 'Old build failed' } } }, deploymentStatus: 'succeed' });
  const result = await verifyOnline(inputs);
  assert.equal(result.status, 'PASS_ONLINE_STATIC_HTTP_ONLY');
  assert.equal(result.github.verificationPath, 'commit_scoped_pages_deployment');
  assert.equal(result.github.buildCommit, commit);
  assert.equal(result.github.latestLegacyBuild.commit, 'b'.repeat(40));
  assert.equal(result.github.latestLegacyBuild.error, 'Old build failed');
  assert(inputs.apiRequests.includes('repos/' + BOUND_TARGET.repository + '/pages/deployments/' + commit));
});

test('a pending or failed target deployment cannot qualify stale legacy metadata', async () => {
  for (const status of ['queued', 'building', 'errored', 'cancelled', 'success']) {
    const inputs = fixture({ metadata: { '/pages/builds/latest': { commit: 'b'.repeat(40) } }, deploymentStatus: status });
    const result = await verifyOnline(inputs);
    assert.equal(result.errors[0].code, 'PAGES_COMMIT_NOT_BUILT'); assert.equal(inputs.requests.length, 0);
  }
});

test('a successful target deployment cannot bypass HTTPS or publication-byte checks', async () => {
  const metadata = { '/pages/builds/latest': { commit: 'b'.repeat(40) } };
  let result = await verifyOnline(fixture({ metadata: { ...metadata, '/pages': { https_enforced: false } }, deploymentStatus: 'succeed' }));
  assert.equal(result.errors[0].code, 'PAGES_NOT_PUBLIC_HTTPS_BUILT');
  result = await verifyOnline(fixture({ metadata, deploymentStatus: 'succeed', changeFile: 'app.js' }));
  assert.equal(result.status, 'FAIL');assert.equal(result.errors[0].code, 'PUBLIC_FILES_FAILED');
});

test('a CDN byte mismatch remains a failure even when GitHub reports built', async () => {
  const result = await verifyOnline(fixture({ changeFile: 'app.js' }));
  assert.equal(result.status, 'FAIL');
  assert.equal(result.errors[0].code, 'PUBLIC_FILES_FAILED');
  assert.equal(result.checks.find(check => check.path === 'app.js').code, 'REMOTE_BYTES_MISMATCH');
});

test('a private source returning HTTP 200 fails and is never copied into the report', async () => {
  const result = await verifyOnline(fixture({ privateStatus: 200 }));
  assert.equal(result.status, 'FAIL');
  assert.equal(result.errors[0].code, 'PRIVATE_PATH_EXPOSED');
  assert.equal(result.checks.find(check => check.path === 'data.js').httpStatus, 200);
  assert.equal(JSON.stringify(result).includes('synthetic secret body'), false);
});

test('bounded work never exceeds the configured number of active requests', async () => {
  let active = 0, maximum = 0;
  const result = await mapBounded(Array.from({ length: 17 }, (_, index) => index), 3, async value => {
    active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 1)); active--;
    return value * 2;
  });
  assert.equal(maximum, 3);
  assert.deepEqual(result, Array.from({ length: 17 }, (_, index) => index * 2));
});

test('canonical report updates preserve the original failed bytes and immutable histories', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'airports-online-receipts-'));
  try {
    fs.mkdirSync(path.join(directory, '.openai'));
    const original = Buffer.from('{"status":"FAIL","synthetic":"original failure"}\n');
    const latestPath = path.join(directory, '.openai/online-verification.json');
    fs.writeFileSync(latestPath, original);
    const saved = persistReport({ status: 'PASS_ONLINE_STATIC_HTTP_ONLY', completedAt: '2026-10-26T01:02:03.000Z' }, directory);
    assert.equal(JSON.parse(fs.readFileSync(latestPath)).status, 'PASS_ONLINE_STATIC_HTTP_ONLY');
    const histories = fs.readdirSync(path.join(directory, '.openai/online-verifications'));
    assert.ok(histories.some(name => fs.readFileSync(path.join(directory, '.openai/online-verifications', name)).equals(original)));
    assert.ok(fs.existsSync(path.join(directory, saved.historyEntry)));
    persistReport({ status: 'PASS_ONLINE_STATIC_HTTP_ONLY', completedAt: '2026-10-26T01:02:03.000Z' }, directory);
    assert.equal(fs.readdirSync(path.join(directory, '.openai/online-verifications')).filter(name => name.startsWith('2026-')).length, 2);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('transient public-file transport failure retries the same bound URL and retains the failed attempt',async()=>{const inputs=fixture(),base=inputs.fetchImpl;let seen=0;inputs.fetchImpl=async(url,options)=>{if(new URL(url).pathname.endsWith('/styles.css')&&++seen===1)throw new TypeError('fetch failed');return base(url,options);};const report=await verifyOnline(inputs);assert.equal(report.status,'PASS_ONLINE_STATIC_HTTP_ONLY');const check=report.checks.find(x=>x.path==='styles.css');assert.equal(seen,2);assert.equal(check.attempts.length,2);assert.equal(check.attempts[0].status,'FAIL');assert.equal(check.attempts[1].status,'PASS');assert.equal(check.sha256,require('node:crypto').createHash('sha256').update(files['styles.css']).digest('hex'));});
test('a byte mismatch is not retried or masked as a transport failure',async()=>{const inputs=fixture({changeFile:'styles.css'}),base=inputs.fetchImpl;let seen=0;inputs.fetchImpl=async(url,options)=>{if(new URL(url).pathname.endsWith('/styles.css'))seen++;return base(url,options);};const report=await verifyOnline(inputs);assert.equal(report.status,'FAIL');assert.equal(seen,1);assert.equal(report.checks.find(x=>x.path==='styles.css').code,'REMOTE_BYTES_MISMATCH');});
test('repeated network failure stops after three attempts and preserves every failure',async()=>{const inputs=fixture(),base=inputs.fetchImpl;let seen=0;inputs.fetchImpl=async(url,options)=>{if(new URL(url).pathname.endsWith('/styles.css')){seen++;throw new TypeError('fetch failed');}return base(url,options);};const report=await verifyOnline(inputs);assert.equal(report.status,'FAIL');assert.equal(seen,3);const check=report.checks.find(x=>x.path==='styles.css');assert.equal(check.attempts.length,3);assert(check.attempts.every(x=>x.status==='FAIL'));});
