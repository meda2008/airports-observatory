'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { collectSite } = require('../deploy-service/collector.cjs');
const { collectStandalone } = require('../deploy-service/standalone-collector.cjs');

const playwrightPath = process.env.COLLECTOR_TEST_PLAYWRIGHT_DIR;
const origin = 'https://collector.example.test';
const credentials = { email: 'fixture@example.test', password: 'synthetic-only' };
const publicAddress = '93.184.216.34';

function document(body) {
  return { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: Buffer.from(`<!doctype html><html><head><title>Fixture</title></head><body>${body}</body></html>`) };
}

function redirect(status, location, cookies) {
  const headers = { location };
  if (cookies) headers['set-cookie'] = cookies;
  return { status, headers, body: Buffer.alloc(0) };
}

test('isolated Chromium collectors keep final URLs and session cookies across guarded same-origin redirects', {
  skip: !playwrightPath && 'Set COLLECTOR_TEST_PLAYWRIGHT_DIR to an offline Playwright installation', timeout: 45000
}, async t => {
  const { chromium } = require(path.join(playwrightPath, 'node_modules', 'playwright'));
  const attemptedConnections = [];
  const proxy = http.createServer((req, res) => { attemptedConnections.push('http'); res.writeHead(403).end(); });
  proxy.on('connect', (req, socket) => { attemptedConnections.push('https'); socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); });
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  t.after(() => proxy.close());
  const browser = await chromium.launch({ args: [
    '--disable-background-networking', '--disable-quic', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
    `--proxy-server=http://127.0.0.1:${proxy.address().port}`, '--proxy-bypass-list=<-loopback>'
  ] });
  t.after(() => browser.close());

  for (const [name, collect] of [['collector', collectSite], ['standalone', collectStandalone]]) {
    await t.test(name, async t => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'collector-session-fixture-'));
      t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
      const credentialsFile = path.join(directory, 'synthetic-credentials.json');
      fs.writeFileSync(credentialsFile, JSON.stringify([{ url: origin, ...credentials }]));
      const calls = [], errors = [];
      const result = await collect({ config: {
        recordId: 'A000', entryUrl: `${origin}/start`, allowedHosts: ['collector.example.test'],
        auth: { mode: 'login', emailSelector: '#email', passwordSelector: '#password', submitSelector: '#sign-in', successSelector: '#sign-out' }
      } }, {
        browser,
        credentials: { [origin]: credentials },
        credentialsFile,
        sessionDir: path.join(directory, 'sessions'),
        maxPages: 1,
        lookup: async (hostname, options) => {
          assert.equal(hostname, 'collector.example.test');
          assert.deepEqual(options, { all: true });
          return [{ address: publicAddress, family: 4 }];
        },
        webTransport: async (target, request) => {
          try {
            assert.equal(target.url.origin, origin);
            assert.equal(target.address, publicAddress);
            assert.equal(target.family, 4);
            calls.push(`${request.method} ${target.url.pathname}`);
            switch (target.url.pathname) {
              case '/start': return redirect(302, request.headers.cookie?.includes('__Host-sid=fixture-session') ? './account' : './login');
              case '/login': return document('<main><form action="/auth/login" method="POST"><label for="email">Email</label><input id="email" name="email" type="email"><label for="password">Password</label><input id="password" name="password" type="password"><button id="sign-in" type="submit">Sign in</button></form></main>');
              case '/auth/login': {
                assert.equal(request.method, 'POST');
                const data = new URLSearchParams(request.body.toString());
                assert.equal(data.get('email'), credentials.email);
                assert.equal(data.get('password'), credentials.password);
                return redirect(303, '/continue', '__Host-sid=fixture-session; Path=/; Secure; HttpOnly; SameSite=Lax');
              }
              case '/continue':
                assert.equal(request.method, 'GET');
                assert.equal(request.body, null);
                assert.equal(request.headers.cookie, '__Host-sid=fixture-session');
                return redirect(307, '/account', 'step=proceed; Path=/account; Secure; SameSite=Strict');
              case '/account':
                assert.equal(request.method, 'GET');
                assert.match(request.headers.cookie, /(?:^|; )__Host-sid=fixture-session(?:; |$)/);
                assert.match(request.headers.cookie, /(?:^|; )step=proceed(?:; |$)/);
                return document('<main><h1>Mock account</h1><p>This synthetic account page provides visible content that confirms a successful session for the isolated collector fixture.</p><button id="sign-out">Log out</button></main>');
              default: throw Error('unexpected_fixture_route');
            }
          } catch (error) {
            errors.push(error);
            throw error;
          }
        }
      });
      assert.deepEqual(errors, []);
      const loginChain = ['GET /start', 'GET /login', 'POST /auth/login', 'GET /continue', 'GET /account'];
      assert.deepEqual(calls, name === 'collector' ? loginChain : [...loginChain, 'GET /start', 'GET /account']);
      assert.equal(result.blocker ?? result.checkpoint ?? null, null);
      if (name === 'standalone') assert.equal(result.capabilities.login.status, 'session_observed');
      const captured = (result.observations || result.captures).find(capture => capture.url === `${origin}/account`);
      assert.match(captured?.body || '', /Mock account/);
    });
  }
  await t.test('refuses unsupported targets before any second outbound request', async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'collector-redirect-denials-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const cases = [
      () => redirect(302, 'https://other.example.test/next'),
      () => redirect(302, '/payment'),
      () => redirect(302, '/next')
    ];
    for (const [index, fixture] of cases.entries()) {
      const calls = [], directoryPath = path.join(directory, String(index));
      const result = await collectStandalone({ config: { recordId: 'A000', entryUrl: `${origin}/start`,
        allowedHosts: ['collector.example.test', 'other.example.test'] } }, {
        browser: index === 2 ? { newContext: async options => {
          const context = await browser.newContext(options);
          context.newCDPSession = undefined;
          return context;
        } } : browser,
        credentialsFile: path.join(directory, 'nonexistent.json'),
        sessionDir: directoryPath,
        lookup: async () => [{ address: publicAddress }],
        webTransport: async target => { calls.push(target.url.pathname); return fixture(); }
      });
      assert.deepEqual(calls, ['/start']);
      assert.deepEqual(result.captures, []);
      assert.match(result.checkpoint.reason, /net::ERR_(?:ABORTED|FAILED)/);
    }
  });
  assert.deepEqual(attemptedConnections, []);
});
