'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const { createBrowserEgress } = require('../deploy-service/browser-egress.cjs');
const { guardBrowserRedirects } = require('../deploy-service/collector-browser-redirect.cjs');
const { assertPublicUrl } = require('../deploy-service/public-destination.cjs');

const address = '8.8.8.8';
const entry = 'http://collector.invalid/';
const basic = (user, password) => `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

async function listen(t, server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

function connect(proxy, authority, credentials = true) {
  return new Promise((resolve, reject) => {
    const headers = credentials ? { 'proxy-authorization': basic(proxy.username, proxy.password) } : {};
    const request = http.request(proxy.server, { method: 'CONNECT', path: authority, headers, agent: false });
    request.on('error', reject);
    request.on('connect', (response, socket) => {
      socket.destroy();
      resolve(response.statusCode);
    });
    request.end();
  });
}

async function captureProxy(t, egress) {
  t.after(() => egress.close());
  let proxy;
  await egress.open({ newContext: async options => { proxy = options.proxy; return {}; } });
  return proxy;
}

test('destination validation rejects non-public answers before any dial', async () => {
  for (const ip of ['127.0.0.1', '10.0.0.3', '100.64.0.2', '169.254.169.254', '192.168.0.5',
    '198.18.0.3', '192.0.2.1', '198.51.100.2', '203.0.113.8', '240.0.0.1', '::1']) {
    await assert.rejects(assertPublicUrl(entry, async () => [{ address }, { address: ip }]), /nonpublic_destination/);
  }
  await assert.rejects(assertPublicUrl('http://127.0.0.1/', async () => [{ address }]), /nonpublic_destination/);
});

test('proxy dials only an admitted literal address and rejects an unexpected socket peer', { timeout: 10000 }, async t => {
  const localServer = net.createServer();
  await listen(t, localServer);
  let lookups = 0;
  const dials = [];
  const egress = createBrowserEgress({
    lookup: async () => { lookups++; return [{ address }]; },
    dial(options) {
      dials.push([options.host, options.port, options.family]);
      return net.connect({ host: '127.0.0.1', port: localServer.address().port, signal: options.signal });
    }
  });
  const proxy = await captureProxy(t, egress);
  await egress.check(entry);
  assert.equal(await connect(proxy, 'collector.invalid:80'), 502);
  await egress.admit(entry);
  assert.equal(await connect(proxy, 'collector.invalid:80', false), 407);
  assert.equal(await connect(proxy, 'collector.invalid:443'), 502);
  assert.equal(await connect(proxy, 'collector.invalid:80'), 502);
  assert.equal(lookups, 1);
  assert.deepEqual(dials, [[address, 80, 4]]);
});

test('Chromium preserves browsing and redirects on an authenticated pinned route', { timeout: 120000 }, async t => {
  const { chromium } = require('../deploy-service/node_modules/playwright');
  const seen = [];
  const origin = http.createServer(async (request, response) => {
    const body = [];
    for await (const chunk of request) body.push(chunk);
    seen.push({ url: request.url, host: request.headers.host, auth: request.headers['proxy-authorization'], cookie: request.headers.cookie, body: Buffer.concat(body).toString() });
    if (request.url === '/redirect') response.writeHead(302, { Location: '/landing', 'Set-Cookie': 'fixture=admitted; Path=/; SameSite=Lax' });
    if (request.url === '/wrong-path') response.writeHead(302, { Location: '/outside-scope' });
    if (request.url === '/unapproved') response.writeHead(302, { Location: 'http://other.invalid/' });
    if (request.url === '/private') response.writeHead(302, { Location: `http://127.0.0.1:${origin.address().port}/local` });
    response.end('fixture catalog');
  });
  await listen(t, origin);
  const tunnels = [];
  const upstream = http.createServer();
  upstream.on('connect', (request, client) => {
    tunnels.push({ target: request.url, auth: request.headers['proxy-authorization'] });
    const remote = net.connect(origin.address().port, '127.0.0.1', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      client.pipe(remote).pipe(client);
    });
    client.on('error', () => remote.destroy());
    client.once('close', () => remote.destroy());
    remote.on('error', () => client.destroy());
    remote.once('close', () => client.destroy());
  });
  const server = await listen(t, upstream);
  const browser = await chromium.launch({ headless: true, timeout: 60000 });
  const egress = createBrowserEgress({ lookup: async () => [{ address }],
    egressOptions: { proxy: { server, username: 'fixture', password: 'synthetic' } } });
  try {
    const context = await egress.open(browser);
    await context.route('**/*', async route => {
      if (new URL(route.request().url()).hostname !== 'collector.invalid') return route.abort();
      await egress.admit(route.request().url());
      return route.continue();
    });
    const page = await context.newPage();
    await guardBrowserRedirects(context, page, url => url.pathname !== '/outside-scope');
    page.setDefaultTimeout(45000);
    await page.goto(`${entry}redirect`);
    assert.equal(page.url(), `${entry}landing`);
    assert.equal(await page.locator('body').innerText(), 'fixture catalog');
    assert.equal(await page.evaluate(() => fetch('/posted', { method: 'POST', body: 'fixture body' }).then(r => r.text())), 'fixture catalog');
    assert.equal((await context.request.head(`${entry}probe`, { maxRedirects: 0 })).status(), 200);
    for (const rejected of ['unapproved', 'private', 'wrong-path']) {
      await assert.rejects(page.goto(`${entry}${rejected}`), /net::ERR_ABORTED/);
    }
    assert.deepEqual(seen.filter(row => row.url !== '/favicon.ico').map(row => row.url),
      ['/redirect', '/landing', '/posted', '/probe', '/unapproved', '/private', '/wrong-path']);
    assert.equal(seen.find(row => row.url === '/landing').cookie, 'fixture=admitted');
    assert.equal(seen.find(row => row.url === '/posted').body, 'fixture body');
    assert.ok(seen.every(row => row.host === 'collector.invalid' && row.auth === undefined));
    assert.ok(tunnels.length >= 6);
    assert.ok(tunnels.every(row => row.target === `${address}:80` && row.auth === basic('fixture', 'synthetic')));
  } finally {
    await egress.close();
    await browser.close();
  }
});
