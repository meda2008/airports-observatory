'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const egress = require('../deploy-service/verified-public-web-egress.cjs');

const site = 'https://justmysocks.net/members/cart.php';
const echo = 'https://echo.invalid/';
const proxyUrl = 'http://127.0.0.1:12345';
const config = { recordId: 'A023', readOnlyRecipe: 'jms_public_catalog_readonly', publicOnly: true, webEgress: 'authenticated_local_proxy' };
const route = { revision: 1, profile: { id: 'fixture', enabled: true, synthetic: false, identityVerified: true, kind: 'stability',
  expectedEgressIp: '8.8.8.8', proxyUrl, egressUrl: echo, allowedTargetOrigins: [new URL(echo).origin] } };
function setup(get, proxy = proxyUrl) {
  return egress.context({ config, route, egressOptions: { proxy: { server: proxy } }, deadline: Infinity,
    assertPublicUrl: async url => assert.equal(url, echo), createContext: async () => ({ get, dispose: async () => {} }) });
}
const response = body => ({ status: () => 200, text: async () => body });

test('public native read is not returned if its post-read egress check fails', async () => {
  const calls = [];
  const client = await setup(async url => {
    calls.push(url);
    if (url === site) return response('public body');
    return response(JSON.stringify({ ip: calls.length === 1 ? '8.8.8.8' : '9.9.9.9' }));
  });
  try {
    await assert.rejects(client.get(site), /web_egress_check_failed/);
    assert.deepEqual(calls, [echo, site, echo]);
    assert.equal(client.proof().guardedReads, 0);
    assert.equal(client.proof().matchedChecks, 1);
    await assert.rejects(setup(async () => { throw Error('unused'); }, 'http://127.0.0.1:12346'), /web_egress_route_binding_changed/);
  } finally { await client.dispose(); }
});

test('TLS failure is a transport rejection and the source is never requested', async () => {
  const calls = [];
  const client = await setup(async url => { calls.push(url); throw Error('CERT_HAS_EXPIRED'); });
  try {
    await assert.rejects(client.get(site), /web_egress_transport_failed/);
    assert.deepEqual(calls, [echo]);
    assert.equal(client.proof().matchedChecks, 0);
    assert.equal(client.proof().guardedReads, 0);
    assert.equal(client.proof().failedReadAttempts[0].reason, 'read_transport_rejected');
  } finally { await client.dispose(); }
});
