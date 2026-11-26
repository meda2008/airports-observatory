'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {once} = require('node:events');
const {createWebServer} = require('../deploy-service/three-services/web.cjs');
async function listen(server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return `http://127.0.0.1:${server.address().port}`; }
test('web serves fixed assets and forwards API method, query, auth, and payload', async t => {
  const upstream = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    res.writeHead(201, {'content-type':'application/json', 'set-cookie':'session=retained; HttpOnly'});
    res.end(JSON.stringify({url:req.url,method:req.method,authorization:req.headers.authorization,body}));
  });
  const origin = await listen(upstream);
  const server = createWebServer({upstream:origin});
  const web = await listen(server);
  t.after(() => { server.closeAllConnections(); server.close(); upstream.closeAllConnections(); upstream.close(); });
  const home = await fetch(web); assert.equal(home.status,200); assert.match(home.headers.get('content-type'), /text\/html/);
  const response = await fetch(`${web}/api/example?a=1`, {method:'POST', headers:{authorization:'Bearer test'},body:'payload'});
  assert.equal(response.status,201); assert.match(response.headers.get('set-cookie'), /session=retained/);
  assert.deepEqual(await response.json(),{url:'/api/example?a=1',method:'POST',authorization:'Bearer test',body:'payload'});
  assert.equal((await fetch(`${web}/health`)).status,201);
  for (const url of ['/server.cjs','/.env','/api-other','/three-services/web.cjs']) assert.equal((await fetch(web+url)).status,404);
  assert.equal((await fetch(web, {method:'POST'})).status,405);
  assert.equal((await fetch(web, {method:'HEAD'})).headers.get('content-length'),home.headers.get('content-length'));
});
test('web closes an interrupted upstream response', async t => {
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, {'content-length': '20'});
    res.write('partial', () => res.destroy());
  });
  const origin = await listen(upstream);
  const server = createWebServer({upstream: origin});
  const web = await listen(server);
  t.after(() => { server.closeAllConnections(); server.close(); upstream.closeAllConnections(); upstream.close(); });

  const response = await fetch(`${web}/api/example`, {signal: AbortSignal.timeout(3000)});
  assert.equal(response.status, 200);
  await assert.rejects(response.text(), {name: 'TypeError'});
});

test('web reports unavailable API and rejects credential-bearing upstream URLs', async t => {
  assert.throws(() => createWebServer({upstream:'http://user:secret@api:8080'}), /without credentials/);
  const server = createWebServer({upstream:'http://127.0.0.1:1'});
  const web = await listen(server);
  t.after(() => { server.closeAllConnections(); server.close(); });
  assert.equal((await fetch(`${web}/api/test`)).status,502);
});
