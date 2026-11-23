'use strict';
// Presentation only: fixed public assets and transparent same-origin API proxy.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assets = {'/':'index.html','/index.html':'index.html','/index.js':'index.js','/plan-conditions.js':'plan-conditions.js','/index.css':'index.css','/pricing-13.html':'pricing-13.html','/console':'console.html','/console.html':'console.html','/console.js':'console.js','/console.css':'console.css'};
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
function createWebServer({upstream = process.env.API_ORIGIN || 'http://api:8080', publicDir = path.resolve(__dirname, '../public'), gatewayOptions = {apiHost:process.env.PUBLIC_API_HOST,adminHost:process.env.ADMIN_HOST,frontendOrigin:process.env.FRONTEND_ORIGIN}} = {}) {
  const target = new URL(upstream);
  const gate = require('./public-gateway.cjs').createPublicGateway(gatewayOptions);
  if (target.protocol !== 'http:' || target.username || target.password || target.pathname !== '/' || target.search || target.hash) throw new Error('API_ORIGIN must be an HTTP origin without credentials');
  return http.createServer((req, res) => {
    let route;
    try { route = new URL(req.url, 'http://web.local').pathname; } catch { res.writeHead(400).end(); return; }
    const access = gate?.(req,res,route);
    if(access?.handled)return;
    if (route === '/api' || route.startsWith('/api/') || route === '/health') {
      const headers = {...req.headers, host: target.host};
      if(access&&Object.hasOwn(access,'authorization')){delete headers.authorization;if(access.authorization)headers.authorization=access.authorization;}
      for (const name of ['connection','proxy-connection','keep-alive','transfer-encoding','upgrade','proxy-authorization','proxy-authenticate']) delete headers[name];
      let attempts = 0;
      const send = () => {
      attempts++;
      const request = http.request({hostname:target.hostname, port:target.port || 80, path:req.url, method:req.method, headers, agent:false}, response => {
        const responseHeaders = {...response.headers};
        delete responseHeaders.connection;
        delete responseHeaders['transfer-encoding'];
        res.writeHead(response.statusCode, responseHeaders);
        response.pipe(res);
      });
      request.setTimeout(120000, () => request.destroy(new Error('API timeout')));
      request.on('error', error => {
        const bodyless = !req.headers['transfer-encoding'] && (!req.headers['content-length'] || req.headers['content-length'] === '0');
        if (attempts === 1 && ['GET','HEAD'].includes(req.method) && bodyless && !req.aborted && !res.destroyed && !res.headersSent && ['ECONNRESET','ECONNREFUSED','EPIPE'].includes(error.code)) return send();
        if (!res.headersSent) res.writeHead(502, {'content-type':'application/json'});
        res.end('{"error":"API unavailable"}');
      });
      req.once('aborted', () => request.destroy());
      if (attempts === 1) req.pipe(request); else request.end();
      };
      send();
      return;
    }
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405, {allow:'GET, HEAD'}).end(); return; }
    const asset = access?.admin&&route==='/'?'console.html':assets[route];
    if (!asset) { res.writeHead(404).end(); return; }
    fs.readFile(path.join(publicDir, asset), (error, body) => {
      if (error) { res.writeHead(404).end(); return; }
      res.writeHead(200, {'content-type':types[path.extname(asset)], 'content-length':body.length, 'x-content-type-options':'nosniff','cache-control':'no-cache'});
      res.end(req.method === 'HEAD' ? undefined : body);
    });
  });
}
if (require.main === module) {
  const server = createWebServer();
  server.listen(Number(process.env.PORT || 8080), process.env.HOST || '0.0.0.0');
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
module.exports = {createWebServer};
