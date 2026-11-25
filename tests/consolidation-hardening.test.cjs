'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const vm = require('node:vm');
const {once} = require('node:events');
const {execFileSync} = require('node:child_process');

const {createWebServer, createStaticAssetLoader, sendJsonError} = require('../deploy-service/three-services/web.cjs');
const {createPublicGateway, validateAdminToken} = require('../deploy-service/three-services/public-gateway.cjs');
const {createThreeServiceApi} = require('../deploy-service/three-service-api.cjs');

const ROOT = path.resolve(__dirname, '..');

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

function rawHttpRequest(port, rawTarget, {host = '127.0.0.1', method = 'GET', headers = {}} = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    let data = '';
    socket.on('connect', () => {
      const headerLines = Object.entries({Host: host, Connection: 'close', ...headers}).map(([k, v]) => `${k}: ${v}`);
      socket.write(`${method} ${rawTarget} HTTP/1.1\r\n${headerLines.join('\r\n')}\r\n\r\n`);
    });
    socket.on('data', (chunk) => {
      data += chunk.toString('utf8');
    });
    socket.on('end', () => {
      const [head, ...rest] = data.split('\r\n\r\n');
      const statusLine = head.split('\r\n')[0] || '';
      const status = Number((statusLine.match(/^HTTP\/1\.\d\s+(\d{3})/) || [])[1] || 0);
      resolve({status, head, body: rest.join('\r\n\r\n')});
    });
    socket.on('error', reject);
  });
}

function streamChunkedRequest(urlString, {host, method = 'POST', headers = {}, chunks = []} = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlString);
    let settled = false;
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method,
        headers: {...(host ? {Host: host} : {}), 'transfer-encoding': 'chunked', ...headers}
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          settled = true;
          resolve({status: res.statusCode, body});
        });
      }
    );
    req.on('error', (err) => {
      if (!settled) reject(err);
    });
    for (const chunk of chunks) req.write(chunk);
    req.end();
  });
}

test('web.cjs emits strict security headers, enforces realpath containment, blocks protocol-relative/backslash URLs, and rejects oversized bodies with real 413', async (t) => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'web-sec-'));
  const pubDir = path.join(tmpRoot, 'public');
  const outsideFile = path.join(tmpRoot, 'secret.txt');
  fs.mkdirSync(pubDir, {recursive: true});
  fs.writeFileSync(outsideFile, 'TOP-SECRET-OUTSIDE');
  fs.writeFileSync(path.join(pubDir, 'index.css'), 'body{color:#15232c}');
  fs.writeFileSync(path.join(pubDir, 'console.html'), '<!doctype html><title>console</title>');

  let symlinkCreated = false;
  try {
    fs.symlinkSync(outsideFile, path.join(pubDir, 'index.html'), 'file');
    symlinkCreated = true;
  } catch {
    fs.writeFileSync(path.join(pubDir, 'index.html'), '<!doctype html><title>ok</title>');
  }

  let upstreamSawBody = false;
  const upstreamHits = [];
  const upstream = http.createServer((req, res) => {
    upstreamHits.push(req.url);
    req.on('data', () => {
      upstreamSawBody = true;
    });
    req.on('end', () => {
      res.writeHead(200, {'content-type': 'application/json'});
      res.end('{"ok":true}');
    });
  });
  const upstreamUrl = await listen(upstream);
  const webServer = createWebServer({upstream: upstreamUrl, publicDir: pubDir, maxBodyBytes: 128});
  const webUrl = await listen(webServer);
  const webPort = webServer.address().port;

  t.after(() => {
    webServer.closeAllConnections();
    webServer.close();
    upstream.closeAllConnections();
    upstream.close();
    fs.rmSync(tmpRoot, {recursive: true, force: true});
  });

  // Security headers on static response
  const cssRes = await fetch(`${webUrl}/index.css`);
  assert.equal(cssRes.status, 200);
  assert.match(cssRes.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(cssRes.headers.get('x-frame-options'), 'DENY');
  assert.equal(cssRes.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(cssRes.headers.get('x-content-type-options'), 'nosniff');

  // /pricing-13.html retired (404)
  assert.equal((await fetch(`${webUrl}/pricing-13.html`)).status, 404);

  // Protocol-relative, backslash, and encoded-slash requests are rejected with 400 and never reach upstream
  for (const rawTarget of ['//console.html', '//evil/api/stats', '/\\console.html', '/%2fconsole.html', '/api/%2fstats']) {
    const r = await rawHttpRequest(webPort, rawTarget);
    assert.equal(r.status, 400, rawTarget);
  }
  assert.equal(upstreamHits.length, 0);

  // Normalized path is forwarded to upstream (e.g. /api/v1/../stats -> /api/stats)
  const normRes = await rawHttpRequest(webPort, '/api/v1/../stats?scope=primary');
  assert.equal(normRes.status, 200);
  assert.equal(upstreamHits.at(-1), '/api/stats?scope=primary');

  // Symlink escape containment
  if (symlinkCreated) {
    const escapedRes = await fetch(`${webUrl}/`);
    assert.equal(escapedRes.status, 404);
  }
  const loader = createStaticAssetLoader(pubDir);
  assert.equal(loader('../secret.txt'), null);

  // Content-Length 413
  const bigRes = await fetch(`${webUrl}/api/test`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({data: 'x'.repeat(300)})
  });
  assert.equal(bigRes.status, 413);
  assert.equal((await bigRes.json()).error, 'payload_too_large');
  assert.equal(upstreamSawBody, false);

  // Real chunked streaming 413 (no Content-Length, no error fallback spoofing)
  const chunked = await streamChunkedRequest(`${webUrl}/api/test`, {chunks: ['a'.repeat(80), 'b'.repeat(80)]});
  assert.equal(chunked.status, 413);
  assert.match(chunked.body, /payload_too_large/);

  // sendJsonError destroys response without trailing JSON when headersSent is already true
  let destroyed = false;
  let endedAfterHeaders = false;
  sendJsonError(
    {
      headersSent: true,
      writableEnded: false,
      destroy() {
        destroyed = true;
      },
      end() {
        endedAfterHeaders = true;
      }
    },
    502,
    'API unavailable'
  );
  assert.equal(destroyed, true);
  assert.equal(endedAfterHeaders, false);
});

test('public-gateway.cjs and three-service-api.cjs reject weak tokens, block case/encoding bypasses, retire /pricing-13.html, and enforce adminHost chunked 413', async (t) => {
  for (const weak of [
    'short',
    'a'.repeat(64),
    '-'.repeat(32),
    '0123456789abcdef0123456789abcdef',
    'replace-with-a-long-random-secret',
    'prod-v1-replace-with-real-value-xyz987',
    'prefix-9f8e7d6c-changeme-1a2b3c4d5e6f',
    'my-super-long-admin-secret-value-2026!',
    'super-long-production-password-987654!',
    'example-token-not-for-production-use',
    '00000000000000000000000000000000',
    'placeholder-secret-value-1234567890',
    'abcd1234abcd1234abcd1234abcd1234',
    'aaaabbbbccccddddeeeeffffgggghhhh'.slice(0, 32).replace(/./g, (c, i) => (i % 2 ? 'x' : 'y'))
  ]) {
    assert.throws(() => validateAdminToken(weak), /credential/, weak);
    assert.throws(
      () =>
        createThreeServiceApi({
          filename: ':memory:',
          adminToken: weak,
          internalToken: 'valid-strong-internal-token-9f8e7d6c5b'
        }),
      /credential/,
      `createThreeServiceApi should reject weak adminToken: ${weak}`
    );
  }
  const strongToken = 'valid-strong-admin-token-for-unit-test-9999';
  assert.equal(validateAdminToken(strongToken), strongToken);

  assert.throws(
    () =>
      createPublicGateway({
        adminHost: 'airports.vigorai.top',
        publicWebHosts: 'airports.vigorai.top',
        adminToken: strongToken
      }),
    /separate_gateway_hosts_required/
  );

  const seen = [];
  const upstream = http.createServer((req, res) => {
    seen.push({url: req.url, authorization: req.headers.authorization});
    res.writeHead(200, {'content-type': 'application/json'});
    res.end(JSON.stringify({ok: true}));
  });
  const upstreamUrl = await listen(upstream);
  const webServer = createWebServer({
    upstream: upstreamUrl,
    maxBodyBytes: 64,
    gatewayOptions: {
      apiHost: 'api.example.invalid',
      adminHost: 'admin.example.invalid',
      publicWebHosts: 'airports.vigorai.top',
      frontendOrigin: 'https://airports.vigorai.top',
      adminToken: strongToken
    }
  });
  const baseUrl = await listen(webServer);
  const webPort = webServer.address().port;
  t.after(() => {
    webServer.closeAllConnections();
    webServer.close();
    upstream.closeAllConnections();
    upstream.close();
  });

  const request = (urlPath, {host = 'airports.vigorai.top', method = 'GET', headers = {}, body} = {}) =>
    new Promise((resolve, reject) => {
      const req = http.request(baseUrl + urlPath, {method, headers: {Host: host, ...headers}}, (res) => {
        let text = '';
        res.on('data', (c) => (text += c));
        res.on('end', () => resolve({status: res.statusCode, headers: res.headers, text}));
      });
      req.on('error', reject);
      if (body !== undefined) req.write(body);
      req.end();
    });

  // Public web host allows read-only assets and read-only public API, stripping Authorization
  assert.equal((await request('/')).status, 200);
  assert.equal((await request('/index.js')).status, 200);
  assert.equal((await request('/api/stats', {headers: {Authorization: 'Bearer ' + strongToken}})).status, 200);
  assert.equal(seen.at(-1).authorization, undefined);
  assert.equal((await request('/api/airports/A042')).status, 200);

  // Public web host blocks retired /pricing-13.html, all console/assistance/admin/internal routes including case/encoded/dot-segment variants
  for (const blocked of [
    '/pricing-13.html',
    '/console',
    '/Console',
    '/console.html',
    '/Console.html',
    '/%63onsole.html',
    '/console.js',
    '/assistance.html',
    '/Assistance.html',
    '/api/admin/status',
    '/API/ADMIN/status',
    '/internal',
    '/Internal',
    '/internal/',
    '/internal/web-collector/claim',
    '/Internal/web-collector/claim',
    '/%69nternal/web-collector/claim',
    '/api/%2e%2e/internal/web-collector/claim'
  ]) {
    assert.equal((await rawHttpRequest(webPort, blocked, {host: 'airports.vigorai.top'})).status, 404, blocked);
  }
  assert.equal((await rawHttpRequest(webPort, '//console.html', {host: 'airports.vigorai.top'})).status, 400);
  assert.equal((await rawHttpRequest(webPort, '//evil/api/stats', {host: 'airports.vigorai.top'})).status, 400);

  // Admin host blocks /internal, /internal/, /Internal/web-collector/claim even with valid admin token
  for (const adminInternal of ['/internal', '/internal/', '/Internal', '/internal/web-collector/claim', '/%69nternal']) {
    assert.equal(
      (
        await rawHttpRequest(webPort, adminInternal, {
          host: 'admin.example.invalid',
          headers: {Authorization: 'Bearer ' + strongToken}
        })
      ).status,
      404,
      adminInternal
    );
  }

  // Public web host rejects write methods
  assert.equal((await request('/api/catalog', {method: 'POST', body: '{}'})).status, 405);

  // Admin host enforces 413 on Content-Length oversized body and chunked streaming body
  const adminTooLarge = await request('/api/admin/sync', {
    host: 'admin.example.invalid',
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + strongToken,
      'Content-Type': 'application/json',
      'Content-Length': '128'
    },
    body: 'x'.repeat(128)
  });
  assert.equal(adminTooLarge.status, 413);

  const adminChunked = await streamChunkedRequest(`${baseUrl}/api/admin/sync`, {
    host: 'admin.example.invalid',
    headers: {
      Authorization: 'Bearer ' + strongToken,
      'Content-Type': 'application/json'
    },
    chunks: ['x'.repeat(40), 'y'.repeat(40)]
  });
  assert.equal(adminChunked.status, 413);
  assert.match(adminChunked.body, /payload_too_large/);
});

test('fresh empty SQLite cold-starts createThreeServiceApi with 200 stats/catalog/detail/completeness', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coldstart-api-'));
  const dbFile = path.join(dir, 'empty.sqlite');
  const adminToken = 'coldstart-admin-token-9f8e7d6c5b4a3210';
  const internalToken = 'coldstart-internal-token-1a2b3c4d5e6f78';
  const app = createThreeServiceApi({filename: dbFile, adminToken, internalToken});
  const apiUrl = await listen(app.server);

  t.after(async () => {
    app.server.closeAllConnections();
    await new Promise((resolve) => app.server.close(resolve));
    fs.rmSync(dir, {recursive: true, force: true});
  });

  const statsRes = await fetch(`${apiUrl}/api/stats`);
  assert.equal(statsRes.status, 200);
  const stats = await statsRes.json();
  assert.equal(stats.counts.all, 207);
  assert.equal(stats.counts.primary, 138);

  const catalogRes = await fetch(`${apiUrl}/api/catalog?scope=primary&limit=12`);
  assert.equal(catalogRes.status, 200);
  const catalog = await catalogRes.json();
  assert.equal(catalog.total, 138);
  assert.equal(catalog.items.length, 12);

  const detailRes = await fetch(`${apiUrl}/api/airports/A042`);
  assert.equal(detailRes.status, 200);
  const detail = await detailRes.json();
  assert.ok((detail.item.pricing?.plans || []).length > 0);

  const completeRes = await fetch(`${apiUrl}/api/admin/collectors/completeness`, {
    headers: {Authorization: 'Bearer ' + adminToken}
  });
  assert.equal(completeRes.status, 200);
  const complete = await completeRes.json();
  assert.equal(complete.counts.primary, 138);
});

test('console.js handles non-JSON payloads and surfaces friendly 401/403 Chinese error messages', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'deploy-service/public/console.js'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'deploy-service/public/console.html'), 'utf8');
  const nodes = Object.fromEntries(
    [...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [
      id,
      {
        textContent: '',
        hidden: false,
        disabled: false,
        value: '',
        children: [],
        listeners: {},
        append() {},
        prepend() {},
        replaceChildren() {},
        addEventListener() {},
        querySelector() {
          return {disabled: false};
        },
        querySelectorAll() {
          return [];
        },
        reset() {}
      }
    ])
  );

  let mode = 'nonjson';
  const context = vm.createContext({
    document: {querySelector: (s) => nodes[s.slice(1)], createElement: () => ({append() {}, textContent: ''}), hidden: false},
    window: {addEventListener() {}},
    URL,
    Date,
    console,
    setInterval: () => 1,
    fetch: async () =>
      mode === 'nonjson'
        ? {ok: false, status: 502, text: async () => '<html>Bad Gateway</html>'}
        : {ok: false, status: 403, text: async () => JSON.stringify({error: 'FORBIDDEN'})}
  });
  vm.runInContext(source, context);
  vm.runInContext("adminToken = 'valid-token-for-test';", context);

  await assert.rejects(() => vm.runInContext("api('/api/admin/status')", context), /未返回有效 JSON.*502/);
  mode = '403';
  await assert.rejects(
    () => vm.runInContext("api('/api/admin/status')", context),
    /需要有效管理员令牌或权限不足.*403.*FORBIDDEN/
  );
});

test('Dockerfile, .dockerignore files, compose.three-services.yaml, and Caddyfile satisfy container and proxy hardening contracts', () => {
  const dockerfile = fs.readFileSync(path.join(ROOT, 'deploy-service/Dockerfile'), 'utf8');
  assert.match(dockerfile, /^FROM node:24\.\d+\.\d+-bookworm-slim/m);
  assert.match(dockerfile, /scripts\/collector-completeness-audit\.cjs/);
  assert.match(dockerfile, /deploy-service\/biubiu-checkbox-geometry\.py/);
  assert.match(dockerfile, /COPY deploy-service\/seed \/app\/deploy-service\/seed/);
  assert.match(dockerfile, /mkdir -p \/data \/collector-state\/home/);
  assert.match(dockerfile, /chmod -R a\+rX,a-w \/app/);
  assert.match(dockerfile, /^USER node$/m);
  assert.doesNotMatch(dockerfile, /public-site/);

  for (const line of dockerfile.split(/\r?\n/)) {
    const m = line.match(/^COPY\s+(.+?)\s+\/app\/\S+$/);
    if (!m) continue;
    for (const src of m[1].split(/\s+/)) {
      if (src.includes('*')) continue;
      assert.ok(fs.existsSync(path.join(ROOT, src)), `Missing Dockerfile COPY source: ${src}`);
    }
  }

  const normalizeIgnore = (file) =>
    fs
      .readFileSync(path.join(ROOT, file), 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));

  assert.deepEqual(normalizeIgnore('.dockerignore'), normalizeIgnore('deploy-service/Dockerfile.dockerignore'));
  const ignoreRules = normalizeIgnore('.dockerignore');
  for (const required of [
    '!scripts/measurements.cjs',
    '!scripts/local-product.cjs',
    '!scripts/collector-completeness-audit.cjs',
    '!deploy-service/biubiu-checkbox-geometry.py',
    '!deploy-service/seed/',
    '!deploy-service/seed/**',
    '!collection/*.cjs',
    '!collection/*.mjs',
    '!collection/*.json'
  ]) {
    assert.ok(ignoreRules.includes(required), `Missing .dockerignore rule: ${required}`);
  }

  const compose = fs.readFileSync(path.join(ROOT, 'deploy-service/compose.three-services.yaml'), 'utf8');
  assert.equal((compose.match(/user: "1000:1000"/g) || []).length, 3);
  assert.match(compose, /HOME:\s*\/collector-state\/home/);

  const caddy = fs.readFileSync(path.join(ROOT, 'deploy-service/Caddyfile'), 'utf8');
  assert.match(caddy, /request_body\s*\{[\s\S]*max_size 9MB/);
  assert.match(caddy, /-Server/);
  assert.match(caddy, /header_up -oai-authenticated-user-id/);
  assert.match(caddy, /@blocked path_regexp blocked \(\?i\)\^\/\(console\|assistance\|api\/admin\|internal\)\(\[\/\.\]\.\*\)\?\$/);
  assert.match(caddy, /@blocked_internal path_regexp blocked_internal \(\?i\)\^\/internal\(\[\/\.\]\.\*\)\?\$/);
  assert.doesNotMatch(caddy, /airports-admin\.vigorai\.top/);

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'deploy-service/seed/manifest.json'), 'utf8'));
  assert.equal(manifest.file, 'deploy-service/seed/catalog-bundle.json.gz');
});

test('repository guard blocks Windows drive absolute paths and vpn-finder-app/_private references across tracked files', () => {
  const tracked = execFileSync('git', ['ls-files'], {cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024})
    .split(/\r?\n/)
    .filter(Boolean);
  const winDrivePattern = /(?<![A-Za-z0-9_/?])[A-Za-z]:(?:\\[A-Za-z0-9_.\-]+|\/[A-Za-z0-9_.\-]+\/[A-Za-z0-9_.\-]+)/;
  const privatePattern = /vpn-finder-app(?:[\/\\]_private)?/i;
  const ignoredFiles = new Set(['.gitignore', 'tests/consolidation-hardening.test.cjs']);
  const hits = [];

  for (const rel of tracked) {
    if (ignoredFiles.has(rel)) continue;
    if (/\.(png|jpg|jpeg|gif|webp|gz|zip|sqlite|db|woff2?|ttf|ico)$/i.test(rel)) continue;
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) continue;
    const buf = fs.readFileSync(full);
    if (buf.includes(0)) continue;
    const lines = buf.toString('utf8').split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (winDrivePattern.test(line)) hits.push(`${rel}:${idx + 1} [win-drive]`);
      if (privatePattern.test(line)) hits.push(`${rel}:${idx + 1} [private-fallback]`);
    });
  }
  assert.deepEqual(hits, []);
});
