'use strict';

const dns = require('node:dns').promises;
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const { createBrowserRedirect, redirectStatuses } = require('./collector-browser-redirect.cjs');
const collectorContextOptions = { offline: true, serviceWorkers: 'block' };

const specialIPv4 = new net.BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 16], ['192.31.196.0', 24],
  ['192.52.193.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['192.175.48.0', 24],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]
]) specialIPv4.addSubnet(address, prefix, 'ipv4');

const globalIPv6 = new net.BlockList();
globalIPv6.addSubnet('2000::', 3, 'ipv6');
const specialIPv6 = new net.BlockList();
for (const [address, prefix] of [
  ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['2620:4f:8000::', 48],
  ['3ffe::', 16], ['3fff::', 20]
]) specialIPv6.addSubnet(address, prefix, 'ipv6');

function publicIP(address) {
  const family = net.isIP(address);
  if (family === 4) return !specialIPv4.check(address, 'ipv4');
  // The global unicast range excludes mapped, local and translation prefixes.
  return family === 6 && !address.includes('%') && globalIPv6.check(address, 'ipv6') &&
    !specialIPv6.check(address, 'ipv6');
}

function parsePublicUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw Error('unsafe_url');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      (url.port && !['80', '443'].includes(url.port))) throw Error('unsafe_url');
  return url;
}

function boundedLookup(lookup = dns.lookup, { timeoutMs = 5000 } = {}) {
  return async (host, options) => {
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(() => lookup(host, options)),
        new Promise((_, reject) => { timer = setTimeout(() => reject(Error('dns_lookup_timeout')), timeoutMs); })
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
}

async function resolvePublicUrl(raw, lookup = boundedLookup()) {
  const url = parsePublicUrl(raw);
  const hostname = url.hostname.replace(/^\[(.*)\]$/, '$1');
  const family = net.isIP(hostname);
  const addresses = family ? [{ address: hostname, family }] : await lookup(hostname, { all: true });
  if (!Array.isArray(addresses) || !addresses.length || addresses.some(result => {
    const address = result?.address;
    return !publicIP(address) || (result.family !== undefined && result.family !== net.isIP(address));
  })) throw Error('nonpublic_destination');
  // Prefer IPv4 when available, while requiring every DNS answer to pass.
  const { address } = addresses.find(result => net.isIPv4(result.address)) || addresses[0];
  return { url, hostname, address, family: net.isIP(address) };
}

async function assertPublicUrl(raw, lookup) {
  return (await resolvePublicUrl(raw, lookup)).url;
}

const hopByHopHeaders = [
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'proxy-connection',
  'te', 'trailer', 'transfer-encoding', 'upgrade'
];

function endToEndHeaders(headers, extra = []) {
  const excluded = new Set([...hopByHopHeaders, ...extra]);
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === 'connection') {
      for (const token of String(value).split(',')) excluded.add(token.trim().toLowerCase());
    }
  }
  return Object.fromEntries(Object.entries(headers).filter(([name, value]) =>
    value !== undefined && !excluded.has(name.toLowerCase())));
}

function assertResponseStatus(status) {
  if (!Number.isInteger(status) || status < 200 || status > 599) throw Error('unusable_web_response');
  if (status >= 300 && status < 400 && status !== 304 && !redirectStatuses.has(status)) throw Error('unchecked_web_redirect');
}

function requestPublic(target, { method, headers, body }, {
  request = target.url.protocol === 'https:' ? https.request : http.request,
  timeoutMs = 15000,
  maxBytes = 8 * 1024 * 1024,
  signal
} = {}) {
  const { url, hostname, address, family } = target;
  const timeout = AbortSignal.timeout(timeoutMs);
  const outgoing = endToEndHeaders(headers, ['host', 'content-length', 'accept-encoding']);
  outgoing['accept-encoding'] = 'identity';
  if (body !== null) outgoing['content-length'] = body.length;

  return new Promise((resolve, reject) => {
    const req = request(url, {
      method,
      headers: outgoing,
      agent: false,
      family,
      autoSelectFamily: false,
      ...(url.protocol === 'https:' ? { rejectUnauthorized: true } : {}),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      // Keep the URL hostname for Host and TLS verification. The socket uses
      // only the approved address and never makes a second resolver call.
      lookup(host, options, callback) {
        if (host !== hostname || (options.family && options.family !== family)) {
          callback(Error('web_connection_target_changed'));
        } else if (options.all) {
          callback(null, [{ address, family }]);
        } else {
          callback(null, address, family);
        }
      }
    }, response => {
      response.on('error', reject);
      try {
        assertResponseStatus(response.statusCode);
        if (redirectStatuses.has(response.statusCode) && response.headersDistinct?.location?.length !== 1) {
          throw Error('invalid_web_redirect_location');
        }
      } catch (error) {
        reject(error);
        response.destroy();
        return;
      }
      const chunks = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          reject(Error('web_response_too_large'));
          response.destroy();
        } else {
          chunks.push(chunk);
        }
      });
      response.on('end', () => {
        const headers = endToEndHeaders(response.headers, ['alt-svc']);
        for (const [name, value] of Object.entries(headers)) {
          if (Array.isArray(value)) headers[name] = value.join(name === 'set-cookie' ? '\n' : ', ');
        }
        resolve({ status: response.statusCode, headers, body: Buffer.concat(chunks) });
      });
    });
    req.on('error', reject);
    req.on('upgrade', (_, socket) => {
      socket.destroy();
      reject(Error('web_protocol_upgrade_rejected'));
    });
    req.end(body);
  });
}

function createPublicRoute(context, { lookup, transport = requestPublic, authorizeRequest, authorizeRedirect, signal } = {}) {
  async function read(request, main) {
    signal?.throwIfAborted();
    const method = request.method();
    if (['CONNECT', 'TRACE', 'TRACK'].includes(method.toUpperCase())) throw Error('unsafe_web_method');
    const url = parsePublicUrl(request.url());
    if (!await authorizeRequest(request, main, url)) throw Error('unapproved_web_request');
    const target = await resolvePublicUrl(url, lookup);
    const headers = await request.allHeaders();
    signal?.throwIfAborted();
    const response = await transport(target, { method, headers, body: request.postDataBuffer() }, { signal });
    signal?.throwIfAborted();
    assertResponseStatus(response?.status);
    return response;
  }
  const redirect = createBrowserRedirect(context, { read, async validateDestination(url) {
    if (!authorizeRedirect(url)) throw Error('unapproved_web_redirect');
    await assertPublicUrl(url, lookup);
  } });
  async function send(route, mainFrame) {
    const request = route.request();
    const response = await read(request, !!mainFrame);
    if (redirectStatuses.has(response.status)) {
      await redirect.follow(route, mainFrame, parsePublicUrl(request.url()), request.method(), response);
    } else {
      await route.fulfill(response);
    }
  }
  return { attach: redirect.attach, send };
}

function blockWebSockets(context) {
  return context.routeWebSocket('**/*', route => route.close());
}

module.exports = { assertPublicUrl, blockWebSockets, boundedLookup, collectorContextOptions, createPublicRoute, parsePublicUrl, publicIP, requestPublic };
