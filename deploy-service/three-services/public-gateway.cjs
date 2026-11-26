'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const { validateAdminToken } = require('../token-validation.cjs');

const DEFAULT_MAX_BODY_BYTES = 8 * 1024 * 1024;

const PUBLIC_READ_API_ROUTES = new Set([
  '/health',
  '/api/catalog',
  '/api/stats',
  '/api/search',
  '/api/measurement-status',
  '/api/changes',
  '/api/mailbox-privacy'
]);

const PUBLIC_WEB_ASSET_ROUTES = new Set([
  '/',
  '/index.html',
  '/index.js',
  '/index.css',
  '/plan-conditions.js'
]);

function equal(a, b) {
  const x = Buffer.from(a || '');
  const y = Buffer.from(b || '');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function parsePublicWebHosts(rawHosts) {
  const values = Array.isArray(rawHosts)
    ? rawHosts
    : typeof rawHosts === 'string'
      ? rawHosts.split(',')
      : [];
  return [...new Set(values.map((h) => String(h || '').trim().toLowerCase()).filter(Boolean))];
}

function isPublicApiRoute(route) {
  return PUBLIC_READ_API_ROUTES.has(route) || /^\/api\/airports\/A\d{3}$/.test(route);
}

function isBlockedPublicWebPath(route) {
  const lower = String(route || '').toLowerCase();
  return (
    lower === '/console' ||
    lower.startsWith('/console/') ||
    lower.startsWith('/console.') ||
    lower === '/assistance' ||
    lower.startsWith('/assistance/') ||
    lower.startsWith('/assistance.') ||
    lower === '/api/admin' ||
    lower.startsWith('/api/admin/') ||
    lower === '/internal' ||
    lower.startsWith('/internal/') ||
    lower.startsWith('/internal.')
  );
}

function drainAndCapSocket(req, hardCapBytes = 2 * 1024 * 1024) {
  let drained = 0;
  req.on('data', (chunk) => {
    drained += chunk.length;
    if (drained > hardCapBytes) req.destroy();
  });
}

function createPublicGateway({
  apiHost,
  adminHost,
  frontendOrigin,
  adminToken,
  publicWebHosts,
  maxBodyBytes = Number(process.env.MAX_BODY_BYTES || DEFAULT_MAX_BODY_BYTES),
  readFile = fs.readFileSync
} = {}) {
  const webHosts = parsePublicWebHosts(publicWebHosts);
  if (!apiHost && !adminHost && webHosts.length === 0) return null;

  const validHost = (h) => typeof h === 'string' && /^[a-z0-9.-]+$/.test(h);
  if (!validHost(adminHost)) {
    throw Error('separate_gateway_hosts_required');
  }
  if (apiHost !== undefined && apiHost !== '') {
    if (!validHost(apiHost) || apiHost === adminHost) {
      throw Error('separate_gateway_hosts_required');
    }
  }
  for (const h of webHosts) {
    if (!validHost(h) || h === adminHost || (apiHost && h === apiHost)) {
      throw Error('separate_gateway_hosts_required');
    }
  }
  if (!apiHost && webHosts.length === 0) {
    throw Error('separate_gateway_hosts_required');
  }

  let verifiedFrontendOrigin = null;
  if (apiHost || frontendOrigin) {
    const origin = new URL(frontendOrigin);
    if (origin.protocol !== 'https:' || origin.origin !== frontendOrigin) {
      throw Error('exact_https_frontend_origin_required');
    }
    verifiedFrontendOrigin = origin.origin;
  }

  const secret = validateAdminToken(adminToken || readFile(process.env.ADMIN_TOKEN_FILE, 'utf8'));
  const bodyLimit = Number.isFinite(maxBodyBytes) && maxBodyBytes > 0 ? maxBodyBytes : DEFAULT_MAX_BODY_BYTES;

  const respond = (res, status, body, extra = {}) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      ...extra
    });
    res.end(JSON.stringify(body));
    return {handled: true};
  };

  return (req, res, route) => {
    const host = (req.headers.host || '').toLowerCase().replace(/:\d+$/, '');
    const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    if (route === '/health' && local && !req.headers.origin) return null;

    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const contentLengthHeader = req.headers['content-length'];
      if (contentLengthHeader !== undefined) {
        const declared = Number(contentLengthHeader);
        if (!Number.isFinite(declared) || declared < 0 || !Number.isInteger(declared)) {
          req.resume();
          return respond(res, 400, {error: 'invalid_content_length'});
        }
        if (declared > bodyLimit) {
          drainAndCapSocket(req);
          return respond(res, 413, {error: 'payload_too_large'});
        }
      }
    }

    if (webHosts.includes(host)) {
      if (isBlockedPublicWebPath(route)) {
        return respond(res, 404, {error: 'not_found'});
      }
      if (!['GET', 'HEAD'].includes(req.method)) {
        return respond(res, 405, {error: 'read_only_api'});
      }
      if (!PUBLIC_WEB_ASSET_ROUTES.has(route) && !isPublicApiRoute(route)) {
        return respond(res, 404, {error: 'not_found'});
      }
      return {authorization: null, publicWeb: true};
    }

    if (apiHost && host === apiHost) {
      if (!isPublicApiRoute(route)) {
        return respond(res, 404, {error: 'not_found'});
      }
      res.setHeader('Vary', 'Origin');
      if (req.headers.origin && req.headers.origin !== verifiedFrontendOrigin) {
        return respond(res, 403, {error: 'origin_not_allowed'});
      }
      if (req.headers.origin) {
        res.setHeader('Access-Control-Allow-Origin', verifiedFrontendOrigin);
      }
      if (req.method === 'OPTIONS') {
        if (req.headers['access-control-request-method'] && !['GET', 'HEAD'].includes(req.headers['access-control-request-method'])) {
          return respond(res, 405, {error: 'read_only_api'});
        }
        if (req.headers['access-control-request-headers'] && !/^accept$/i.test(req.headers['access-control-request-headers'])) {
          return respond(res, 403, {error: 'header_not_allowed'});
        }
        res.writeHead(204, {
          'Access-Control-Allow-Methods': 'GET, HEAD',
          'Access-Control-Allow-Headers': 'Accept',
          'Access-Control-Max-Age': '600',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Referrer-Policy': 'strict-origin-when-cross-origin'
        });
        res.end();
        return {handled: true};
      }
      if (!['GET', 'HEAD'].includes(req.method)) {
        return respond(res, 405, {error: 'read_only_api'});
      }
      return {authorization: null};
    }

    if (host !== adminHost) {
      return respond(res, 404, {error: 'unknown_host'});
    }

    const supplied = req.headers.authorization || '';
    let valid = equal(supplied, 'Bearer ' + secret);
    if (supplied.startsWith('Basic ')) {
      const decoded = Buffer.from(supplied.slice(6), 'base64').toString('utf8');
      valid = equal(decoded, 'admin:' + secret);
    }
    if (!valid) {
      return respond(
        res,
        401,
        {error: 'administrator_authentication_required'},
        {'WWW-Authenticate': 'Basic realm="Airports administration", charset="UTF-8"'}
      );
    }
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      (req.headers.origin !== 'https://' + adminHost || req.headers['sec-fetch-site'] === 'cross-site')
    ) {
      return respond(res, 403, {error: 'cross_site_write_rejected'});
    }
    const lowerRoute = String(route || '').toLowerCase();
    if (
      route === '/internal' ||
      route.startsWith('/internal/') ||
      lowerRoute === '/internal' ||
      lowerRoute.startsWith('/internal/') ||
      lowerRoute.startsWith('/internal.')
    ) {
      return respond(res, 404, {error: 'not_found'});
    }
    return {authorization: 'Bearer ' + secret, admin: true};
  };
}

module.exports = {createPublicGateway, validateAdminToken, parsePublicWebHosts};
