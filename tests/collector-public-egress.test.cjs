'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const test = require('node:test');
const { collectSite } = require('../deploy-service/collector.cjs');
const { collectStandalone } = require('../deploy-service/standalone-collector.cjs');
const { assertPublicUrl, boundedLookup, createPublicRoute, publicIP, requestPublic } = require('../deploy-service/collector-public-egress.cjs');

const publicV4 = '93.184.216.34';
const publicV6 = '2606:4700::1234';
const entryUrl = 'https://collector.example.test/';
const response = { status: 200, headers: { 'content-type': 'text/plain' }, body: Buffer.from('fixture') };

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'collector-egress-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('public IP policy rejects special-use ranges and address encodings', () => {
  for (const address of [
    '0.1.2.3', '10.1.2.3', '100.127.255.255', '127.2.3.4', '169.254.1.1', '172.31.255.255',
    '192.0.0.9', '192.0.2.1', '192.31.196.1', '192.52.193.1', '192.88.99.1', '192.168.0.1',
    '192.175.48.1', '198.19.1.1', '198.51.100.1',
    '203.0.113.1', '224.0.0.1', '255.255.255.255', '::', '::1', '::ffff:93.184.216.34',
    '64:ff9b::a01:203', '100::1', '2001:2::1', '2001:db8::1', '2002::1', '2620:4f:8000::1', '3ffe::1',
    '3fff:fff::1', 'fc00::1', 'fd00::1', 'fe80::1%eth0', 'ff02::1', 'malformed', undefined
  ]) assert.equal(publicIP(address), false, address);
  for (const address of [publicV4, publicV6, '100.63.255.255', '100.128.0.0', '172.32.0.0']) {
    assert.equal(publicIP(address), true, address);
  }
});

test('URL policy validates all DNS answers and handles literal addresses without DNS', async () => {
  const lookup = async (host, options) => {
    assert.equal(host, 'collector.example.test');
    assert.deepEqual(options, { all: true });
    return [{ address: publicV4, family: 4 }, { address: publicV6, family: 6 }];
  };
  assert.equal((await assertPublicUrl(entryUrl, lookup)).href, entryUrl);
  for (const addresses of [[], null, [{ address: publicV4 }, { address: 'fd00::1' }],
    [{ address: publicV6 }, { address: '192.0.2.1' }], [{ address: publicV4, family: 6 }]]) {
    await assert.rejects(assertPublicUrl(entryUrl, async () => addresses), /nonpublic_destination/);
  }
  await assert.rejects(assertPublicUrl(entryUrl, async () => { throw Error('dns_failed'); }), /dns_failed/);
  await assert.rejects(assertPublicUrl(entryUrl, boundedLookup(() => new Promise(() => {}), { timeoutMs: 5 })), /dns_lookup_timeout/);
  const noLookup = () => assert.fail('unexpected DNS');
  await assertPublicUrl(`https://[${publicV6}]/`, noLookup);
  for (const url of ['https://2130706433/', 'https://[::ffff:7f00:1]/']) {
    await assert.rejects(assertPublicUrl(url, noLookup), /nonpublic_destination/);
  }
  for (const url of ['file:///fixture', 'wss://collector.example.test/', 'https://fixture@collector.example.test/',
    'http://collector.example.test:8080/']) {
    await assert.rejects(assertPublicUrl(url, noLookup), /unsafe_url/);
  }
});

function networkStub({ status = 200, body = 'fixture', locations, inspect = () => {} } = {}) {
  return (url, options, onResponse) => {
    inspect(url, options);
    const req = new EventEmitter();
    req.end = payload => {
      assert.equal(payload.toString(), 'synthetic body');
      const res = Readable.from([Buffer.from(body)]);
      res.statusCode = status;
      res.headers = { 'content-type': 'text/plain', 'alt-svc': 'h3=":443"', connection: 'x-hop', 'x-hop': 'discard' };
      if (locations) {
        res.headersDistinct = { location: locations };
        res.headers.location = locations[0];
      }
      queueMicrotask(() => onResponse(res));
    };
    return req;
  };
}

test('HTTP transport pins the connection lookup and retains URL hostname for TLS', async () => {
  const url = new URL(entryUrl);
  const input = { method: 'POST', headers: { Host: 'wrong.example.test', Cookie: 'fixture=1', 'Proxy-Authorization': 'synthetic' }, body: Buffer.from('synthetic body') };
  for (const [address, family] of [[publicV4, 4], [publicV6, 6]]) {
    const target = { url, hostname: url.hostname, address, family };
    const result = await requestPublic(target, input, { request: networkStub({ inspect(actualUrl, options) {
      assert.equal(actualUrl.hostname, url.hostname);
      assert.equal(options.agent, false);
      assert.equal(options.rejectUnauthorized, true);
      assert.equal(options.family, family);
      assert.equal(options.autoSelectFamily, false);
      assert.equal(options.method, 'POST');
      assert.equal(options.headers.Host, undefined);
      assert.equal(options.headers['Proxy-Authorization'], undefined);
      assert.equal(options.headers.Cookie, input.headers.Cookie);
      options.lookup(url.hostname, { family }, (error, result, resultFamily) => {
        assert.ifError(error);
        assert.equal(result, address);
        assert.equal(resultFamily, family);
      });
      options.lookup(url.hostname, { all: true }, (error, results) => {
        assert.ifError(error);
        assert.deepEqual(results, [{ address, family }]);
      });
      options.lookup('different.example.test', { family }, error => assert.match(error.message, /web_connection_target_changed/));
      options.lookup(url.hostname, { family: family === 4 ? 6 : 4 }, error => assert.match(error.message, /web_connection_target_changed/));
    } }) });
    assert.deepEqual(result, response);
  }
  const target = { url, hostname: url.hostname, address: publicV4, family: 4 };
  for (const locations of [undefined, ['/a', '/b']]) {
    await assert.rejects(requestPublic(target, input, { request: networkStub({ status: 302, locations }) }), /invalid_web_redirect_location/);
  }
  const redirect = await requestPublic(target, input, { request: networkStub({ status: 302, locations: ['/checked'] }) });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.location, '/checked');
  await assert.rejects(requestPublic(target, input, { request: networkStub({ status: 305 }) }), /unchecked_web_redirect/);
  await assert.rejects(requestPublic(target, input, { request: networkStub(), maxBytes: 1 }), /web_response_too_large/);
});

for (const [name, collect] of [['collector', collectSite], ['standalone collector', collectStandalone]]) {
  test(`${name} sends approved navigation and subresources through guarded transport`, async t => {
    const sessionDir = temporary(t);
    const calls = [];
    const sketch = {};
    const context = {
      route: async (pattern, handler) => { assert.equal(pattern, '**/*'); sketch.handler = handler; },
      routeWebSocket: async (pattern, handler) => {
        assert.equal(pattern, '**/*');
        await handler({ close: () => { sketch.socketClosed = true; } });
      },
      newPage: async () => {
        const run = async (url, { main = false } = {}) => {
          let verdict;
          await sketch.handler({
            request: () => ({ url: () => url, method: () => 'GET', isNavigationRequest: () => main,
              frame: () => ({ parentFrame: () => null }), resourceType: () => main ? 'document' : 'script',
              allHeaders: async () => ({}), postDataBuffer: () => null }),
            abort: async () => { verdict = 'blocked'; },
            fulfill: async value => { assert.deepEqual(value, response); verdict = 'fulfilled'; },
            continue: async () => { verdict = 'browser_network'; }
          });
          return verdict;
        };
        // Stubs exercise the installed handlers before any real navigation.
        sketch.verdicts = [
          await run(entryUrl, { main: true }),
          await run(new URL('asset.js', entryUrl).href),
          await run('https://mixed.example.test/asset.js'),
          await run('https://missing.example.test/asset.js'),
          await run('https://unapproved.example.test/asset.js'),
          await run(new URL('redirect', entryUrl).href, { main: true }),
          await run(new URL('transport-error', entryUrl).href)
        ];
        throw Error('synthetic_end');
      },
      close: async () => { sketch.contextClosed = true; }
    };
    const collection = collect({ config: { recordId: 'A000', entryUrl, publicOnly: true,
      allowedHosts: ['collector.example.test', 'mixed.example.test', 'missing.example.test'] } }, {
      browser: { newContext: async options => {
        assert.equal(options.serviceWorkers, 'block');
        assert.equal(options.offline, true);
        return context;
      } },
      sessionDir,
      credentialsFile: path.join(sessionDir, 'missing.json'),
      lookup: async (host, options) => {
        assert.deepEqual(options, { all: true });
        if (host === 'mixed.example.test') return [{ address: publicV6 }, { address: '10.0.0.1' }];
        if (host === 'missing.example.test') throw Error('synthetic_dns_failure');
        assert.equal(host, 'collector.example.test');
        return [{ address: publicV6 }];
      },
      webTransport: async (target, request) => {
        assert.equal(target.address, publicV6);
        assert.equal(target.family, 6);
        assert.equal(target.hostname, 'collector.example.test');
        assert.equal(request.method, 'GET');
        calls.push(target.url.pathname);
        if (target.url.pathname === '/redirect') return { ...response, status: 302, headers: { location: '/unrequested' } };
        if (target.url.pathname === '/transport-error') throw Error('synthetic_transport_failure');
        return response;
      }
    });
    if (name === 'collector') await assert.rejects(collection, /synthetic_end/);
    else assert.match((await collection).checkpoint.reason, /synthetic_end/);
    assert.deepEqual(sketch.verdicts, ['fulfilled', 'fulfilled', 'blocked', 'blocked', 'blocked', 'blocked', 'blocked']);
    assert.deepEqual(calls, ['/', '/asset.js', '/redirect', '/transport-error']);
    assert.equal(sketch.socketClosed, true);
    assert.equal(sketch.contextClosed, true);
  });
}

async function redirectFixture({ status = 302, location = '/next', authorize = () => true,
  authorizeRequest = () => true, lookup, redirectApi = true } = {}) {
  const calls = [];
  const frame = {};
  const session = new EventEmitter();
  session.send = async (method, params) => {
    if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'main' } } };
    if (method !== 'Fetch.enable') session.emit('result', { method, params });
  };
  const { attach, send } = createPublicRoute(redirectApi ? { newCDPSession: async () => session } : {}, {
    lookup: lookup || (async () => [{ address: publicV4 }]),
    authorizeRequest,
    authorizeRedirect: authorize,
    transport: async (target, request) => {
      calls.push([target.url.pathname, request.method]);
      return { ...response, status, headers: { location: typeof location === 'function' ? location(target.url) : location } };
    }
  });
  await attach({ mainFrame: () => frame, once() {} });
  function event(path, requestId, extra = {}) {
    const { method = 'GET', ...overrides } = extra;
    return { frameId: 'main', resourceType: 'Document', networkId: 'document', requestId,
      request: { url: new URL(path, entryUrl).href, method, headers: {} }, ...overrides };
  }
  function paused(event) {
    return new Promise(resolve => {
      session.once('result', resolve);
      session.emit('Fetch.requestPaused', event);
    });
  }
  async function start(path, { method = 'GET', main = true } = {}) {
    if (redirectApi) await paused(event(path, '0', { method }));
    let fulfilled;
    await send({
      request: () => ({ url: () => new URL(path, entryUrl).href, method: () => method,
        allHeaders: async () => ({}), postDataBuffer: () => null }),
      fulfill: async response => { fulfilled = response; }
    }, main ? frame : null);
    return fulfilled;
  }
  function hop(path, number, extra = {}) {
    return paused(event(path, String(number), { redirectedRequestId: String(number - 1), ...extra }));
  }
  return { calls, start, hop };
}

test('redirect checks the request chain, frame, method, path, and four-hop limit', async () => {
  const { start, hop, calls } = await redirectFixture({ location: url => '/step/' + (Number(url.pathname.split('/').at(-1)) + 1) });
  assert.equal((await start('/step/0')).headers.location, new URL('/step/1', entryUrl).href);
  for (const [path, extra] of [['/step/9', {}], ['/step/1', { method: 'POST' }], ['/step/1', { networkId: 'other' }],
    ['/step/1', { frameId: 'other' }], ['/step/1', { redirectedRequestId: 'unexpected' }]]) {
    assert.equal((await hop(path, 1, extra)).method, 'Fetch.failRequest');
  }
  for (const number of [1, 2, 3]) {
    assert.equal((await hop('/step/' + number, number)).method, 'Fetch.fulfillRequest');
  }
  assert.equal((await hop('/step/4', 4)).method, 'Fetch.failRequest');
  assert.deepEqual(calls, [0, 1, 2, 3, 4].map(i => ['/step/' + i, 'GET']));
});

test('redirect rejects cross-origin, unapproved, unsupported and unresolved hops', async () => {
  const denied = [
    [{ location: 'http://collector.example.test/next' }, {}, /unapproved_web_redirect/],
    [{ location: 'https://another.example.test/next' }, {}, /unapproved_web_redirect/],
    [{ authorize: () => false }, {}, /unapproved_web_redirect/],
    [{ location: '/entry#hash-only' }, {}, /unapproved_web_redirect/],
    [{ location: String.fromCharCode(92) + 'next' }, {}, /invalid_web_redirect_location/],
    [{ status: 307 }, { method: 'POST' }, /unsupported_web_redirect/],
    [{}, { main: false }, /unsupported_web_redirect/],
    [{ redirectApi: false }, {}, /web_redirect_api_unavailable/]
  ];
  for (const [scenario, options, error] of denied) {
    const { start, calls } = await redirectFixture(scenario);
    await assert.rejects(start('/entry', options), error);
    assert.deepEqual(calls, [['/entry', options.method || 'GET']]);
  }
  let resolutions = 0;
  const { start, calls } = await redirectFixture({ lookup: async () => [{ address: ++resolutions === 1 ? publicV4 : '10.0.0.1' }] });
  await assert.rejects(start('/entry'), /nonpublic_destination/);
  assert.deepEqual(calls, [['/entry', 'GET']]);
});

test('the actual redirect request must pass the same operation and address checks again', async () => {
  let resolves = 0;
  for (const options of [
    { authorizeRequest: (_request, main, url) => main && url.pathname === '/entry' },
    { lookup: async () => [{ address: ++resolves <= 2 ? publicV4 : '10.0.0.1' }] }
  ]) {
    const { start, hop, calls } = await redirectFixture(options);
    assert.equal((await start('/entry')).status, 302);
    assert.equal((await hop('/next', 1)).method, 'Fetch.failRequest');
    assert.deepEqual(calls, [['/entry', 'GET']]);
  }
});

test('standalone browser rejects an unguarded proxy profile before DNS or context setup', async () => {
  const result = await collectStandalone({ config: { recordId: 'A000', entryUrl,
    allowedHosts: ['collector.example.test'], webEgress: 'authenticated_local_proxy' } }, {
    browser: { newContext: () => assert.fail('unexpected context') },
    lookup: () => assert.fail('unexpected DNS')
  });
  assert.equal(result.checkpoint.reason, 'web_egress_transport_not_guarded');
});
