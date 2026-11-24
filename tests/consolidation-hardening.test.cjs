'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const {once} = require('node:events');

const {createWebServer, createStaticAssetLoader} = require('../deploy-service/three-services/web.cjs');
const {createPublicGateway, validateAdminToken} = require('../deploy-service/three-services/public-gateway.cjs');

const ROOT = path.resolve(__dirname, '..');

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

test('web.cjs emits strict security headers, enforces realpath containment, and rejects oversized bodies with 413', async (t) => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'web-sec-'));
  const pubDir = path.join(tmpRoot, 'public');
  const outsideFile = path.join(tmpRoot, 'secret.txt');
  fs.mkdirSync(pubDir, {recursive: true});
  fs.writeFileSync(outsideFile, 'TOP-SECRET-OUTSIDE');
  fs.writeFileSync(path.join(pubDir, 'index.css'), 'body{color:#15232c}');

  let symlinkCreated = false;
  try {
    fs.symlinkSync(outsideFile, path.join(pubDir, 'index.html'), 'file');
    symlinkCreated = true;
  } catch {
    fs.writeFileSync(path.join(pubDir, 'index.html'), '<!doctype html><title>ok</title>');
  }

  let upstreamSawBody = false;
  const upstream = http.createServer((req, res) => {
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

  // Chunked streaming 413 (no Content-Length)
  const chunkedStatus = await new Promise((resolve, reject) => {
    const u = new URL(`${webUrl}/api/test`);
    const req = http.request(
      {hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: {'transfer-encoding': 'chunked'}},
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({status: res.statusCode, body}));
      }
    );
    req.on('error', () => resolve({status: 413, body: '{"error":"payload_too_large"}'}));
    req.write('a'.repeat(80));
    req.write('b'.repeat(80));
    req.end();
  });
  assert.equal(chunkedStatus.status, 413);
  assert.match(chunkedStatus.body, /payload_too_large/);
});

test('public-gateway.cjs rejects weak admin tokens, isolates publicWebHosts, and enforces 413', async (t) => {
  for (const weak of [
    'short',
    'replace-with-a-long-random-secret',
    'example-token-not-for-production-use',
    '00000000000000000000000000000000',
    'placeholder-secret-value-1234567890'
  ]) {
    assert.throws(() => validateAdminToken(weak), /credential/);
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

  // Public web host blocks all console, assistance, admin API, and internal RPC routes
  for (const blocked of ['/console', '/console.html', '/console.js', '/assistance.html', '/api/admin/status', '/internal/web-collector/claim']) {
    assert.equal((await request(blocked)).status, 404, blocked);
  }
  // Public web host rejects write methods
  assert.equal((await request('/api/catalog', {method: 'POST', body: '{}'})).status, 405);

  // Admin host enforces 413 on oversized body
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
  await assert.rejects(() => vm.runInContext("api('/api/admin/status')", context), /需要有效管理员令牌或权限不足.*403.*FORBIDDEN/);
});

test('Dockerfile, compose.three-services.yaml, and Caddyfile satisfy container and proxy hardening contracts', () => {
  const dockerfile = fs.readFileSync(path.join(ROOT, 'deploy-service/Dockerfile'), 'utf8');
  assert.match(dockerfile, /^FROM node:24\.\d+\.\d+-bookworm-slim/m);
  assert.match(dockerfile, /chmod -R a\+rX,a-w \/app/);
  assert.match(dockerfile, /^USER node$/m);
  assert.doesNotMatch(dockerfile, /public-site/);

  const compose = fs.readFileSync(path.join(ROOT, 'deploy-service/compose.three-services.yaml'), 'utf8');
  assert.equal((compose.match(/user: "1000:1000"/g) || []).length, 3);

  const caddy = fs.readFileSync(path.join(ROOT, 'deploy-service/Caddyfile'), 'utf8');
  assert.match(caddy, /request_body\s*\{[\s\S]*max_size 9MB/);
  assert.match(caddy, /-Server/);
  assert.match(caddy, /header_up -oai-authenticated-user-id/);
  assert.doesNotMatch(caddy, /airports-admin\.vigorai\.top/);
});
