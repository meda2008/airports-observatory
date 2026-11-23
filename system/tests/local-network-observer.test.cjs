'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { measure } = require('../lib/local-network-observer.cjs');

async function localServer(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  return { server, endpoint: { url: `http://127.0.0.1:${server.address().port}/observe`, allowLoopback: true, role: 'local_fixture' } };
}

test('local GET reports actual headers latency and body bytes without body or headers', async t => {
  const { endpoint } = await localServer(t, (req, res) => {
    assert.equal(req.method, 'GET');
    assert.equal(req.headers['accept-encoding'], 'identity');
    res.setHeader('X-Private', 'header-secret');
    res.end('fixture-secret');
  });
  const r = await measure(endpoint);
  assert.equal(r.status, 'ok');
  assert.equal(r.statusCode, 200);
  assert.equal(r.bytesRead, Buffer.byteLength('fixture-secret'));
  assert.equal(r.bodyComplete, true);
  assert(r.latencyMs >= 0 && r.elapsedMs >= r.latencyMs);
  assert(Number.isFinite(Date.parse(r.observedAt)));
  assert.equal(r.measurementScope, 'local_endpoint_observation_not_service_speed');
  assert.equal(r.endpointRole, 'local_fixture');
  assert(!JSON.stringify(r).includes('secret'));
  assert(!Object.hasOwn(r, 'url') && !Object.hasOwn(r, 'headers') && !Object.hasOwn(r, 'body'));
});

test('production has no implicit endpoint and missing observation remains null', async () => {
  const r = await measure();
  assert.equal(r.status, 'not_configured');
  for (const k of ['statusCode', 'latencyMs', 'bytesRead']) assert.equal(r[k], null);
  assert.equal(r.bodyComplete, false);
});

test('unsafe configuration is rejected before any request and cannot leak credentials', async t => {
  let requests = 0;
  const { endpoint } = await localServer(t, (_req, res) => { requests++; res.end(); });
  const port = new URL(endpoint.url).port;
  const urls = [
    `http://localhost:${port}/`, 'http://192.0.2.1/', 'https://example.invalid/',
    `http://user:password-secret@127.0.0.1:${port}/`,
    endpoint.url + '?token=secret', endpoint.url + '?target=https://example.invalid',
    endpoint.url + '?bytes=1&bytes=2', endpoint.url + '?bytes=-1',
    endpoint.url + '?bytes=1e3', endpoint.url + '?bytes=67108865',
    endpoint.url + '#secret', 'file:///secret', 'http://[::ffff:127.0.0.1]/'
  ];
  for (const url of urls) {
    const r = await measure({ ...endpoint, url });
    assert.equal(r.status, 'rejected', url);
    assert.equal(r.bytesRead, null);
    assert(!JSON.stringify(r).includes('password-secret'));
    assert(!JSON.stringify(r).includes('example.invalid'));
  }
  assert.equal((await measure(endpoint.url)).status, 'rejected');
  assert.equal((await measure({ ...endpoint, allowLoopback: false })).status, 'rejected');
  assert.equal(requests, 0);
});

test('local agent paths and the sole numeric bytes query are permitted without outputting URL', async t => {
  const seen = [];
  const { endpoint } = await localServer(t, (req, res) => { seen.push(req.url); res.end('abc'); });
  const r = await measure({ ...endpoint, url: endpoint.url.replace('/observe', '/download?bytes=4096'), role: 'local_agent' });
  assert.equal(r.status, 'ok');
  assert.deepEqual(seen, ['/download?bytes=4096']);
  assert(!JSON.stringify(r).includes('4096'));
});

test('approved local proxy receives only the explicit local GET and never a remote target', async t => {
  let count = 0;
  const { endpoint } = await localServer(t, (req, res) => { count++; assert.equal(req.url, '/observe'); res.end('ok'); });
  const proxy = { ...endpoint, role: 'approved_local_proxy' };
  assert.equal((await measure(proxy)).status, 'rejected');
  const r = await measure({ ...proxy, approved: true });
  assert.equal(r.status, 'ok');
  assert.equal(r.endpointRole, 'approved_local_proxy');
  assert.equal(count, 1);
});

test('redirects are not followed even when their destination is another local endpoint', async t => {
  let touched = 0;
  const dest = await localServer(t, (_req, res) => { touched++; res.end(); });
  const source = await localServer(t, (_req, res) => { res.writeHead(302, { Location: dest.endpoint.url + '?token=secret' }); res.end(); });
  const r = await measure(source.endpoint);
  assert.equal(r.status, 'redirect_rejected');
  assert.equal(r.statusCode, 302);
  assert.equal(r.bytesRead, 0);
  assert.equal(touched, 0);
  assert(!JSON.stringify(r).includes('secret'));
});

test('timeout before headers is missing observation, and the same endpoint can recover', async t => {
  let recover = false;
  const { endpoint } = await localServer(t, (_req, res) => { if (recover) res.end('recovered'); });
  const timed = await measure(endpoint, { timeoutMs: 60 });
  assert.equal(timed.status, 'timeout');
  assert.equal(timed.latencyMs, null);
  assert.equal(timed.statusCode, null);
  assert.equal(timed.bytesRead, null);
  recover = true;
  const r = await measure(endpoint);
  assert.equal(r.status, 'ok');
  assert.equal(r.bytesRead, 9);
});

test('timeout after a partial response keeps observed bytes and incomplete status', async t => {
  const { endpoint } = await localServer(t, (_req, res) => { res.writeHead(200); res.write('part'); });
  const r = await measure(endpoint, { timeoutMs: 80 });
  assert.equal(r.status, 'timeout');
  assert.equal(r.statusCode, 200);
  assert.equal(r.bytesRead, 4);
  assert.equal(r.bodyComplete, false);
  assert(r.latencyMs !== null);
});

test('HTTP failure and recovery remain distinct from transport failure and zero bytes', async t => {
  let healthy = false;
  const { endpoint } = await localServer(t, (_req, res) => {
    res.statusCode = healthy ? 204 : 503;
    res.end(healthy ? undefined : 'private-error');
  });
  const bad = await measure(endpoint);
  assert.equal(bad.status, 'http_error');
  assert.equal(bad.statusCode, 503);
  assert.equal(bad.bytesRead, 0);
  healthy = true;
  const ok = await measure(endpoint);
  assert.equal(ok.status, 'ok');
  assert.equal(ok.bytesRead, 0);
  assert.equal(ok.bodyComplete, true);
});

test('byte cap limits actual application reads without claiming a complete response', async t => {
  const { endpoint } = await localServer(t, (_req, res) => res.end(Buffer.alloc(200000, 7)));
  const r = await measure(endpoint, { maxBytes: 37 });
  assert.equal(r.status, 'byte_limit');
  assert.equal(r.bytesRead, 37);
  assert.equal(r.bodyComplete, false);
});

test('partial socket failure retains consumed bytes and can recover', async t => {
  let healthy = false;
  const { endpoint } = await localServer(t, (_req, res) => {
    if (healthy) return res.end('ok');
    res.writeHead(200, { 'Content-Length': '100' });
    res.write('partial');
    setTimeout(() => res.destroy(), 15);
  });
  const r = await measure(endpoint);
  assert.equal(r.status, 'network_error');
  assert.equal(r.bytesRead, 7);
  assert.equal(r.bodyComplete, false);
  healthy = true;
  assert.equal((await measure(endpoint)).status, 'ok');
});

test('socket failure before headers is missing data rather than a zero-speed observation', async t => {
  const { endpoint } = await localServer(t, (req) => req.socket.destroy());
  const r = await measure(endpoint);
  assert.equal(r.status, 'network_error');
  assert.equal(r.reason, 'request_failed');
  assert.equal(r.statusCode, null);
  assert.equal(r.latencyMs, null);
  assert.equal(r.bytesRead, null);
  assert.equal(r.bodyComplete, false);
});

test('HTTP rate limiting stays an HTTP error without returning private response metadata', async t => {
  const { endpoint } = await localServer(t, (_req, res) => {
    res.writeHead(429, { 'Retry-After': 'private-fixture-value' });
    res.end('private-response-body');
  });
  const r = await measure(endpoint);
  assert.equal(r.status, 'http_error');
  assert.equal(r.statusCode, 429);
  assert.equal(r.bytesRead, 0);
  assert(!JSON.stringify(r).includes('private-'));
});

test('abort before and during requests resolves without leaking signal reason', async t => {
  let requests = 0;
  const { endpoint } = await localServer(t, () => { requests++; });
  const pre = new AbortController(); pre.abort('private-reason');
  const r = await measure(endpoint, { signal: pre.signal });
  assert.equal(r.status, 'aborted');
  assert.equal(requests, 0);
  const active = new AbortController();
  const pending = measure(endpoint, { signal: active.signal });
  setTimeout(() => active.abort('private-reason'), 30);
  const mid = await pending;
  assert.equal(mid.status, 'aborted');
  assert.equal(mid.bytesRead, null);
  assert(!JSON.stringify(mid).includes('private-reason'));
});

test('invalid bounds and signals cannot start a request', async t => {
  let count = 0;
  const { endpoint } = await localServer(t, (_req, res) => { count++; res.end(); });
  for (const options of [{ timeoutMs: 0 }, { timeoutMs: Infinity }, { maxBytes: 0 }, { maxBytes: 0.5 }, { maxBytes: 67108865 }, { signal: {} }, null]) {
    assert.equal((await measure(endpoint, options)).status, 'rejected');
  }
  assert.equal(count, 0);
});
