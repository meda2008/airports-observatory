#!/usr/bin/env node
'use strict';

// Read-only verification of this project's existing, explicitly bound Pages site.
// Usage: node scripts/verify-online.cjs [--commit <40-character-commit>]
// Never accepts a URL, repository, credential or alternate publication target.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { verifyPublication, loadDirectory } = require('./verify-publication.cjs');
const execFileAsync = promisify(execFile);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const BOUND_TARGET = Object.freeze({
  repository: 'meda2008/airports-observatory', repositoryId: 1433348516,
  repositoryUrl: 'https://github.com/meda2008/airports-observatory',
  origin: 'https://meda2008.github.io/airports-observatory', branch: 'main'
});
const PRIVATE_PATHS = ['data.js', 'catalog/catalog.v1.json', '.env'];
const CONCURRENCY = 3;
const REQUEST_TIMEOUT_MS = 20000;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const same = (a, b) => require('node:util').isDeepStrictEqual(a, b);

class VerificationError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function ensure(condition, code, message) { if (!condition) throw new VerificationError(code, message); }
function parseJson(bytes, name) {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new VerificationError('INVALID_JSON', 'JSON文件无效：' + name); }
}

function validateTarget(config, publication, target, commit) {
  ensure(config && config.origin?.replace(/\/$/, '') === BOUND_TARGET.origin &&
    config.repositoryUrl === BOUND_TARGET.repositoryUrl && config.hostingProvider === 'github-pages',
  'TARGET_MISMATCH', '站点配置不属于本项目已授权的GitHub Pages目标。');
  for (const doc of [publication, target]) ensure(doc && doc.provider === 'github-pages' &&
    doc.repository === BOUND_TARGET.repository && doc.repositoryId === BOUND_TARGET.repositoryId &&
    doc.repositoryUrl === BOUND_TARGET.repositoryUrl && doc.branch === BOUND_TARGET.branch,
  'TARGET_MISMATCH', 'GitHub发布记录或目标身份发生变化。');
  const expected = commit || publication.commitSha;
  ensure(typeof expected === 'string' && /^[a-f0-9]{40}$/.test(expected), 'INVALID_COMMIT', '必须提供40位小写Git提交。');
  return expected;
}

async function githubApi(endpoint) {
  // No shell, authentication token reads, credential output, or GitHub mutations.
  const args = ['api', '--method', 'GET', endpoint];
  const options = { encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, GH_PROMPT_DISABLED: '1' } };
  let result;
  try { result = await execFileAsync('gh', args, options); }
  catch (error) {
    if (error.code !== 'ENOENT' || !process.env.USERPROFILE) throw new VerificationError('GITHUB_API_FAILED', '现有gh只读查询失败；请核对登录与网络。');
    const existingGh = path.join(process.env.USERPROFILE, '.agent-reach/tools/gh/bin/gh.exe');
    ensure(fs.existsSync(existingGh), 'GH_UNAVAILABLE', '未找到现有gh，不自动安装或切换账号。');
    try { result = await execFileAsync(existingGh, args, options); }
    catch { throw new VerificationError('GITHUB_API_FAILED', '现有gh只读查询失败；请核对登录与网络。'); }
  }
  try { return JSON.parse(result.stdout); }
  catch { throw new VerificationError('GITHUB_RESPONSE_INVALID', 'GitHub API未返回有效JSON。'); }
}

async function mapBounded(items, concurrency, worker) {
  let next = 0;
  const results = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

async function readBoundedBody(response, maximumBytes) {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null) ensure(Number(declaredLength) <= maximumBytes, 'RESPONSE_TOO_LARGE', '远端文件超过预期大小。');
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const parts = []; let bytes = 0;
  while (true) {
    const part = await reader.read(); if (part.done) break;
    bytes += part.value.byteLength;
    if (bytes > maximumBytes) { await reader.cancel(); throw new VerificationError('RESPONSE_TOO_LARGE', '远端文件超过预期大小。'); }
    parts.push(part.value);
  }
  const result = new Uint8Array(bytes); let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.byteLength; }
  return result;
}

function acceptedMime(name, header) {
  const mime = (header || '').split(';')[0].trim().toLowerCase();
  if (name.endsWith('.html')) return mime === 'text/html';
  if (/\.m?js$/.test(name)) return ['text/javascript', 'application/javascript'].includes(mime);
  if (name.endsWith('.css')) return mime === 'text/css';
  if (name.endsWith('.json')) return mime === 'application/json';
  if (name.endsWith('.svg')) return mime === 'image/svg+xml';
  // .cjs, .nojekyll and _headers are download artifacts with host-specific MIME.
  return true;
}

async function requestFileAttempt(fetchImpl, relative, expected, commit) {
  const base = BOUND_TARGET.origin + '/';
  const url = new URL(relative || './', base);
  ensure(url.origin === new URL(base).origin && url.pathname.startsWith(new URL(base).pathname),
    'UNSAFE_REMOTE_PATH', '远端路径越过已授权站点。');
  url.searchParams.set('publication', commit);
  const response = await fetchImpl(url.href, { method: 'GET', redirect: 'manual', cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), headers: { 'Cache-Control': 'no-cache' } });
  const result = { path: relative || '/', status: response.status, contentType: response.headers.get('content-type'),
    checkedAt: new Date().toISOString() };
  if(response.status!==200){await response.body?.cancel();const error=new VerificationError('HTTP_STATUS','公开文件未返回200：'+(relative||'/'));error.httpStatus=response.status;throw error;}
  ensure(acceptedMime(relative || 'index.html', result.contentType), 'MIME_MISMATCH', '公开文件MIME不符：' + (relative || '/'));
  const maximum = Math.min(MAX_FILE_BYTES, expected.byteLength + 1);
  const bytes = await readBoundedBody(response, maximum);
  result.bytes = bytes.byteLength; result.sha256 = sha256(bytes);
  ensure(bytes.byteLength === expected.byteLength && result.sha256 === sha256(expected),
    'REMOTE_BYTES_MISMATCH', '线上与本地字节不一致：' + (relative || '/'));
  return { result: { ...result, status: 'PASS', httpStatus: 200 }, bytes };
}

function retryableReadFailure(error){
 return ['TimeoutError','AbortError'].includes(error?.name)||(error instanceof TypeError&&error.message==='fetch failed')||(error?.code==='HTTP_STATUS'&&[408,502,503,504].includes(error.httpStatus));
}
async function requestFile(fetchImpl,relative,expected,commit){
 const attempts=[];for(let index=0;index<3;index++){
  try{const item=await requestFileAttempt(fetchImpl,relative,expected,commit);if(attempts.length)item.result.attempts=[...attempts,{status:'PASS',checkedAt:item.result.checkedAt}];return item;}
  catch(error){attempts.push({status:'FAIL',code:error.code||'FETCH_FAILED',message:error.message,checkedAt:new Date().toISOString()});if(index===2||!retryableReadFailure(error)){error.attempts=attempts;throw error;}await new Promise(resolve=>setTimeout(resolve,250*(index+1)));}
 }
}
async function verifyOnline({ config, publication, target, localFiles, commit,
  fetchImpl = globalThis.fetch, ghApi = githubApi } = {}) {
  const report = { schemaVersion: 'airports-online-verification.v1', status: 'FAIL',
    verificationScope: 'HTTP_BYTES_GITHUB_BINDING_ONLY', browserVisualVerified: false, browserInteractionVerified: false,
    startedAt: new Date().toISOString(), completedAt: null, expectedCommit: null,
    target: BOUND_TARGET, localBuildManifestSha256: null, checks: [], errors: [],
    factualClaimsVerified: false, predictionQualityValidated: false };
  try {
    const expectedCommit = validateTarget(config, publication, target, commit);
    report.expectedCommit = expectedCommit;
    ensure(typeof fetchImpl === 'function', 'FETCH_UNAVAILABLE', '需要Node22内置fetch。');
    const local = await verifyPublication(localFiles);
    ensure(local.status === 'PASS', 'LOCAL_PUBLICATION_INVALID', '本地公开产物校验失败：' + (local.errors[0]?.code || 'UNKNOWN'));
    report.localBuildManifestSha256 = local.buildManifestSha256;
    report.localVerification = local;
    const build = parseJson(localFiles['build-manifest.json'], 'build-manifest.json');
    ensure(same(build, publication.publicBuildManifest), 'PUBLICATION_RECEIPT_MISMATCH', '本地构建与已推送发布记录不一致；请先完成本候选的发布。');
    const endpoint = 'repos/' + BOUND_TARGET.repository;
    const [repository, pages, latest] = await Promise.all([ghApi(endpoint), ghApi(endpoint + '/pages'), ghApi(endpoint + '/pages/builds/latest')]);
    ensure(repository.id === BOUND_TARGET.repositoryId && repository.full_name === BOUND_TARGET.repository && repository.private === false,
      'REPOSITORY_MISMATCH', 'GitHub仓库身份或公开状态不符。');
    ensure(pages.status === 'built' && pages.public === true && pages.https_enforced === true &&
      pages.html_url?.replace(/\/$/, '') === BOUND_TARGET.origin && pages.source?.branch === BOUND_TARGET.branch && pages.source?.path === '/',
      'PAGES_NOT_PUBLIC_HTTPS_BUILT', 'GitHub Pages尚未就绪，或公开/HTTPS/发布源不符。');
    const legacyBuilt = latest.status === 'built' && latest.commit === expectedCommit && !latest.error?.message;
    let deployment = null;
    if (!legacyBuilt) {
      // GitHub also accepts an exact commit SHA as a Pages deployment ID.
      // Preserve a stale legacy build; it cannot override a successful target
      // deployment, nor can an arbitrary newer/older deployment satisfy this gate.
      try { deployment = await ghApi(endpoint + '/pages/deployments/' + expectedCommit); } catch { /* fail closed below */ }
      ensure(deployment?.status === 'succeed', 'PAGES_COMMIT_NOT_BUILT', '目标提交未取得成功的Pages构建或部署证明。');
    }
    report.github = { repositoryId: repository.id, repository: repository.full_name,
      pagesStatus: pages.status, public: pages.public, httpsEnforced: pages.https_enforced,
      source: pages.source, buildStatus: legacyBuilt ? latest.status : deployment.status, buildCommit: expectedCommit,
      verificationPath: legacyBuilt ? 'legacy_build' : 'commit_scoped_pages_deployment',
      latestLegacyBuild: { status: latest.status, commit: latest.commit, error: latest.error?.message || null },
      buildCreatedAt: legacyBuilt ? latest.created_at || null : null, buildUpdatedAt: legacyBuilt ? latest.updated_at || null : null };
    report.checks.push({ name: 'github_repository_pages_commit_binding', status: 'PASS' });
    const remoteFiles = Object.create(null);
    const paths = ['build-manifest.json', ...build.files.map(file => file.path)];
    const results = await mapBounded(paths, CONCURRENCY, async name => {
      try {
        const item = await requestFile(fetchImpl, name, localFiles[name], expectedCommit);
        remoteFiles[name] = item.bytes;
        return item.result;
      } catch (error) {
        return { path: name, status: 'FAIL', code: error.code || 'FETCH_FAILED', message: error.message, checkedAt: new Date().toISOString(), ...(error.attempts?{attempts:error.attempts}:{}) };
      }
    });
    report.checks.push(...results);
    const failed = results.filter(result => result.status !== 'PASS');
    ensure(failed.length === 0, 'PUBLIC_FILES_FAILED', failed.length + '个公开文件未通过HTTP/字节核查。');
    const remote = await verifyPublication(remoteFiles, { expectedManifestSha256: local.buildManifestSha256 });
    report.remoteVerification = remote;
    ensure(remote.status === 'PASS', 'REMOTE_PUBLICATION_INVALID', '完整线上公开投影未通过共享校验。');
    report.checks.push({ name: 'remote_shared_publication_verifier', status: 'PASS' });
    const home = await requestFile(fetchImpl, '', localFiles['index.html'], expectedCommit);
    report.checks.push(home.result);
    for (const relative of PRIVATE_PATHS) {
      const url = new URL(relative, BOUND_TARGET.origin + '/'); url.searchParams.set('publication', expectedCommit);
      const response = await fetchImpl(url.href, { method: 'GET', redirect: 'manual', cache: 'no-store',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), headers: { 'Cache-Control': 'no-cache' } });
      // Never print or retain a response body from a private-path probe.
      await response.body?.cancel();
      const pass = response.status === 404;
      report.checks.push({ name: 'private_path_blocked', path: relative, status: pass ? 'PASS' : 'FAIL', httpStatus: response.status });
      ensure(pass, 'PRIVATE_PATH_EXPOSED', '私有路径未返回404：' + relative);
    }
    report.publicFilesVerified = paths.length;
    report.status = 'PASS_ONLINE_STATIC_HTTP_ONLY';
  } catch (error) {
    report.errors.push({ code: error.code || 'VERIFICATION_FAILED', message: error.message || '线上核查失败。' });
  }
  report.completedAt = new Date().toISOString();
  return report;
}

function persistReport(report, projectRoot = PROJECT_ROOT) {
  const state = path.join(projectRoot, '.openai');
  const history = path.join(state, 'online-verifications');
  fs.mkdirSync(history, { recursive: true });
  const current = path.join(state, 'online-verification.json');
  // Preserve an earlier canonical report, including an initial failure from an
  // older version of this tool, before replacing its convenient latest pointer.
  if (fs.existsSync(current)) {
    const previous = fs.readFileSync(current);
    const previousPath = path.join(history, 'previous-' + sha256(previous) + '.json');
    if (!fs.existsSync(previousPath)) fs.writeFileSync(previousPath, previous, { flag: 'wx' });
  }
  const stem = (report.completedAt || new Date().toISOString()).replace(/[^\dTZ-]/g, '-') + '-' + report.status;
  let sequence = 0, destination;
  do { destination = path.join(history, stem + (sequence ? '-' + sequence : '') + '.json'); sequence++; } while (fs.existsSync(destination));
  const saved = { ...report, historyEntry: path.relative(projectRoot, destination).split(path.sep).join('/') };
  const bytes = JSON.stringify(saved, null, 2) + '\n';
  fs.writeFileSync(destination, bytes, { flag: 'wx' });
  fs.writeFileSync(current, bytes);
  return saved;
}

async function main(argv) {
  let commit;
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--commit' && argv[index + 1]) commit = argv[++index];
    else if (argv[index] === '--help') {
      console.log('node scripts/verify-online.cjs [--commit <40-lowercase-hex>]\n只读核查固定的机场观察GitHub Pages站点；不接受URL或仓库覆盖。每次结果留存到.openai/online-verifications/，最新结果写入.openai/online-verification.json。');
      return 0;
    } else throw new Error('未知参数或缺少参数值：' + argv[index]);
  }
  let report;
  try {
    const read = name => JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, '.openai', name), 'utf8'));
    report = await verifyOnline({ config: read('site-origin.json'), publication: read('github-publication.json'),
      target: read('github-target.json'), localFiles: loadDirectory(path.join(PROJECT_ROOT, 'dist')), commit });
  } catch (error) {
    report = { schemaVersion: 'airports-online-verification.v1', status: 'FAIL', completedAt: new Date().toISOString(),
      verificationScope: 'HTTP_BYTES_GITHUB_BINDING_ONLY', browserVisualVerified: false, browserInteractionVerified: false,
      errors: [{ code: error.code || 'LOCAL_INPUT_FAILED', message: error.message }] };
  }
  const saved = persistReport(report);
  console.log(JSON.stringify({ status: saved.status, expectedCommit: saved.expectedCommit,
    publicFilesVerified: saved.publicFilesVerified || 0, checks: saved.checks?.length || 0,
    errors: saved.errors, historyEntry: saved.historyEntry }, null, 2));
  return report.status === 'PASS_ONLINE_STATIC_HTTP_ONLY' ? 0 : 1;
}

module.exports = { verifyOnline, validateTarget, mapBounded, persistReport, main, BOUND_TARGET };
if (require.main === module) main(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(error => {
  console.log(JSON.stringify({ status: 'FAIL', errors: [{ code: 'CLI_INPUT_ERROR', message: error.message }] }));
  process.exitCode = 2;
});
