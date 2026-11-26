'use strict';
// Presentation only: fixed public assets and transparent same-origin API proxy.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {pipeline} = require('node:stream');

const DEFAULT_MAX_BODY_BYTES = 8 * 1024 * 1024;
const assets = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/index.js': 'index.js',
  '/plan-conditions.js': 'plan-conditions.js',
  '/index.css': 'index.css',
  '/console': 'console.html',
  '/console.html': 'console.html',
  '/console.js': 'console.js',
  '/console.css': 'console.css'
};
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8'
};
const SECURITY_HEADERS = {
  'content-security-policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-content-type-options': 'nosniff'
};

function sendJsonError(res, status, message, extraHeaders = {}) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...extraHeaders
  });
  if (!res.writableEnded) {
    res.end(JSON.stringify({error: message}));
  }
}

function drainAndCapSocket(req, hardCapBytes = 2 * 1024 * 1024) {
  let drained = 0;
  req.on('data', (chunk) => {
    drained += chunk.length;
    if (drained > hardCapBytes) req.destroy();
  });
}

function createStaticAssetLoader(publicDir) {
  let realPublicDir;
  try {
    realPublicDir = fs.realpathSync(publicDir);
  } catch {
    realPublicDir = path.resolve(publicDir);
  }
  const cache = new Map();

  return function loadAsset(assetName) {
    const candidatePath = path.resolve(realPublicDir, assetName);
    if (!candidatePath.startsWith(realPublicDir + path.sep) || !fs.existsSync(candidatePath)) {
      return null;
    }
    let realFilePath;
    let stat;
    try {
      realFilePath = fs.realpathSync(candidatePath);
      stat = fs.statSync(realFilePath);
    } catch {
      return null;
    }
    if (!realFilePath.startsWith(realPublicDir + path.sep) || !stat.isFile()) {
      return null;
    }
    const cached = cache.get(realFilePath);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      return cached.asset;
    }
    const body = fs.readFileSync(realFilePath);
    const asset = {
      body,
      etag: '"' + createHash('sha256').update(body).digest('base64url') + '"',
      type: types[path.extname(assetName)] || 'application/octet-stream'
    };
    cache.set(realFilePath, {mtimeMs: stat.mtimeMs, size: stat.size, asset});
    return asset;
  };
}

function createWebServer({
  upstream = process.env.API_ORIGIN || 'http://api:8080',
  publicDir = path.resolve(__dirname, '../public'),
  maxBodyBytes = Number(process.env.MAX_BODY_BYTES || DEFAULT_MAX_BODY_BYTES),
  gatewayOptions = {
    apiHost: process.env.PUBLIC_API_HOST,
    adminHost: process.env.ADMIN_HOST,
    frontendOrigin: process.env.FRONTEND_ORIGIN,
    publicWebHosts: process.env.PUBLIC_WEB_HOSTS,
    maxBodyBytes: Number(process.env.MAX_BODY_BYTES || DEFAULT_MAX_BODY_BYTES)
  }
} = {}) {
  const target = new URL(upstream);
  const bodyLimit = Number.isFinite(maxBodyBytes) && maxBodyBytes > 0 ? maxBodyBytes : DEFAULT_MAX_BODY_BYTES;
  const normalizedGatewayOptions = gatewayOptions
    ? {maxBodyBytes: bodyLimit, ...gatewayOptions}
    : undefined;
  const gate = require('./public-gateway.cjs').createPublicGateway(normalizedGatewayOptions);
  if (
    target.protocol !== 'http:' ||
    target.username ||
    target.password ||
    target.pathname !== '/' ||
    target.search ||
    target.hash
  ) {
    throw new Error('API_ORIGIN must be an HTTP origin without credentials');
  }
  const loadAsset = createStaticAssetLoader(publicDir);
  const staticAssets = new Map([...new Set(Object.values(assets))].map(name => [name, loadAsset(name)]));

  return http.createServer((req, res) => {
    if (
      typeof req.url !== 'string' ||
      !req.url.startsWith('/') ||
      req.url.startsWith('//') ||
      req.url.includes('\\')
    ) {
      res.writeHead(400, SECURITY_HEADERS).end();
      return;
    }
    let route;
    let upstreamPath;
    try {
      const parsed = new URL(req.url, 'http://web.local');
      if (parsed.origin !== 'http://web.local' || /%(?:2f|5c|00)/i.test(parsed.pathname)) {
        res.writeHead(400, SECURITY_HEADERS).end();
        return;
      }
      const decodedPathname = decodeURIComponent(parsed.pathname);
      if (
        !decodedPathname.startsWith('/') ||
        decodedPathname.startsWith('//') ||
        decodedPathname.includes('\\') ||
        decodedPathname.includes('\0')
      ) {
        res.writeHead(400, SECURITY_HEADERS).end();
        return;
      }
      const canonical = new URL(decodedPathname + parsed.search, 'http://web.local');
      if (canonical.origin !== 'http://web.local' || canonical.pathname.startsWith('//')) {
        res.writeHead(400, SECURITY_HEADERS).end();
        return;
      }
      route = canonical.pathname;
      upstreamPath = canonical.pathname + canonical.search;
    } catch {
      res.writeHead(400, SECURITY_HEADERS).end();
      return;
    }
    const access = gate?.(req, res, route);
    if (access?.handled) return;

    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const contentLengthHeader = req.headers['content-length'];
      if (contentLengthHeader !== undefined) {
        const declaredLength = Number(contentLengthHeader);
        if (!Number.isFinite(declaredLength) || declaredLength < 0 || !Number.isInteger(declaredLength)) {
          req.resume();
          sendJsonError(res, 400, 'invalid_content_length');
          return;
        }
        if (declaredLength > bodyLimit) {
          drainAndCapSocket(req);
          sendJsonError(res, 413, 'payload_too_large');
          return;
        }
      }
    }

    if (route === '/api' || route.startsWith('/api/') || route === '/health') {
      const headers = {...req.headers, host: target.host};
      if (access && Object.hasOwn(access, 'authorization')) {
        delete headers.authorization;
        if (access.authorization) headers.authorization = access.authorization;
      }
      for (const name of [
        'connection',
        'proxy-connection',
        'keep-alive',
        'transfer-encoding',
        'upgrade',
        'proxy-authorization',
        'proxy-authenticate'
      ]) {
        delete headers[name];
      }
      let attempts = 0;
      let rejectedTooLarge = false;
      let activeRequest;
      res.once('close', () => { if (!res.writableFinished) activeRequest?.destroy(); });
      req.once('aborted', () => activeRequest?.destroy());
      const send = () => {
        attempts++;
        const request = http.request(
          {hostname: target.hostname, port: target.port || 80, path: upstreamPath, method: req.method, headers, agent: false},
          (response) => {
            if (rejectedTooLarge || res.destroyed) { response.destroy(); return; }
            const responseHeaders = {...response.headers};
            delete responseHeaders.connection;
            delete responseHeaders['transfer-encoding'];
            for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
              if (!Object.hasOwn(responseHeaders, k)) responseHeaders[k] = v;
            }
            res.writeHead(response.statusCode, responseHeaders);
            pipeline(response, res, () => {});
          }
        );
        activeRequest = request;
        request.setTimeout(120000, () => request.destroy(new Error('API timeout')));
        request.on('error', (error) => {
          if (rejectedTooLarge || res.destroyed) return;
          const bodyless =
            !req.headers['transfer-encoding'] && (!req.headers['content-length'] || req.headers['content-length'] === '0');
          if (
            attempts === 1 &&
            ['GET', 'HEAD'].includes(req.method) &&
            bodyless &&
            !req.aborted &&
            !res.destroyed &&
            !res.headersSent &&
            ['ECONNRESET', 'ECONNREFUSED', 'EPIPE'].includes(error.code)
          ) {
            return send();
          }
          if (res.headersSent) res.destroy(error);
          else sendJsonError(res, 502, 'API unavailable');
        });
        if (attempts === 1) {
          let streamedBytes = 0;
          const cleanupListeners = () => {
            req.removeListener('data', onData);
            req.removeListener('end', onEnd);
            req.removeListener('error', onReqError);
          };
          const onData = (chunk) => {
            streamedBytes += chunk.length;
            if (streamedBytes > bodyLimit) {
              rejectedTooLarge = true;
              cleanupListeners();
              request.destroy();
              drainAndCapSocket(req);
              sendJsonError(res, 413, 'payload_too_large');
              return;
            }
            if (!request.write(chunk)) {
              req.pause();
              request.once('drain', () => req.resume());
            }
          };
          const onEnd = () => {
            cleanupListeners();
            if (!rejectedTooLarge) request.end();
          };
          const onReqError = () => {
            cleanupListeners();
            if (!rejectedTooLarge) request.destroy();
          };
          req.on('data', onData);
          req.once('end', onEnd);
          req.once('error', onReqError);
        } else {
          request.end();
        }
      };
      send();
      return;
    }

    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, {...SECURITY_HEADERS, allow: 'GET, HEAD'}).end();
      return;
    }
    const asset = access?.admin && route === '/' ? 'console.html' : assets[route];
    if (!asset) {
      res.writeHead(404, SECURITY_HEADERS).end();
      return;
    }
    const loaded = staticAssets.get(asset);
    if (!loaded) {
      res.writeHead(404, SECURITY_HEADERS).end();
      return;
    }
    const assetHeaders = {
      ...SECURITY_HEADERS,
      'content-type': loaded.type,
      'cache-control': access?.admin ? 'private, no-cache' : 'no-cache',
      etag: loaded.etag
    };
    const validators = req.headers['if-none-match']?.split(',').map(value => value.trim().replace(/^W\//, '')) || [];
    if (validators.includes('*') || validators.includes(loaded.etag)) {
      res.writeHead(304, assetHeaders).end();
      return;
    }
    res.writeHead(200, {...assetHeaders, 'content-length': loaded.body.length});
    res.end(req.method === 'HEAD' ? undefined : loaded.body);
  });
}

if (require.main === module) {
  const server = createWebServer();
  server.listen(Number(process.env.PORT || 8080), process.env.HOST || '0.0.0.0');
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}

module.exports = {createWebServer, SECURITY_HEADERS, createStaticAssetLoader, sendJsonError};
