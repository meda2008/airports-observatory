'use strict';
// No DB, subscription, credentials, remote hostname or public listener.
const fs = require('node:fs');
const http = require('node:http');
const assert = require('node:assert/strict');
if (process.argv[2] === 'server') {
  assert(fs.readFileSync('/fixture/inert-config.yaml', 'utf8').includes('proxies: []'));
  const server = http.createServer((req, res) => {
    if (req.url === '/identity') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ synthetic: true, routeId: 'fixture-only', egressIp: '127.0.0.1' }));
    }
    if (req.url === '/download?bytes=4096') return res.end(Buffer.alloc(4096, 1));
    res.writeHead(404); res.end();
  });
  server.listen(17890, '127.0.0.1');
  process.on('SIGTERM', () => server.close());
} else if (process.argv[2] === 'worker') {
  (async () => {
    const identity = await (await fetch('http://127.0.0.1:17890/identity')).json();
    assert.equal(identity.synthetic, true);
    assert.equal(identity.routeId, 'fixture-only');
    const { measure } = require('./local-network-observer.cjs');
    const result = await measure({ url: 'http://127.0.0.1:17890/download?bytes=4096', allowLoopback: true, role: 'local_fixture' }, { maxBytes: 8192, timeoutMs: 3000 });
    assert.equal(result.status, 'ok');
    assert.equal(result.bytesRead, 4096);
    assert.equal(result.bodyComplete, true);
    console.log(JSON.stringify({ synthetic: true, sharedLoopbackVerified: true, bytesRead: result.bytesRead, bodyComplete: result.bodyComplete, measurementVerified: false, routePerformanceClaim: false }));
  })().catch(() => { console.error('isolated_fixture_failed'); process.exitCode = 1; });
} else {
  throw Error('explicit_fixture_mode_required');
}
