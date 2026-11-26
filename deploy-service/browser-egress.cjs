'use strict';
const http = require('node:http');
const net = require('node:net');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const { parsePublicUrl, publicAddresses } = require('./public-destination.cjs');
const { webContextEgress } = require('./web-context-egress.cjs');

const connectTimeoutMs = 8000;
const maxConnections = 128;
const hopHeaders = ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'proxy-connection', 'te', 'trailer', 'transfer-encoding', 'upgrade'];

function forwardedHeaders(headers) {
  const copy = { ...headers };
  for (const name of [...hopHeaders, ...String(headers.connection || '').toLowerCase().split(',')]) {
    delete copy[name.trim()];
  }
  return copy;
}

function destinationKey(url) {
  return `${url.hostname}:${url.port || (url.protocol === 'https:' ? 443 : 80)}`;
}

function connectDirect(address, port, { signal, dial }) {
  return new Promise((resolve, reject) => {
    const socket = dial({ host: address, port, family: 4, signal });
    socket.once('error', reject);
    socket.setTimeout(connectTimeoutMs, () => socket.destroy(Error('browser_egress_connect_timeout')));
    socket.once('connect', () => {
      if (socket.remoteAddress !== address || socket.remotePort !== port) {
        socket.destroy(Error('browser_egress_peer_mismatch'));
        return;
      }
      socket.setTimeout(0);
      resolve(socket);
    });
  });
}

function connectThroughProxy(proxy, address, port, signal) {
  return new Promise((resolve, reject) => {
    const target = `${address}:${port}`;
    const authorization = Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64');
    const request = http.request(proxy.server, {
      method: 'CONNECT', path: target, agent: false, signal,
      headers: { host: target, 'proxy-authorization': `Basic ${authorization}` }
    });
    request.on('error', reject);
    request.setTimeout(connectTimeoutMs, () => request.destroy(Error('browser_egress_proxy_timeout')));
    request.once('connect', (response, socket, head) => {
      if (response.statusCode !== 200) {
        socket.destroy();
        reject(Error('browser_egress_proxy_rejected'));
        return;
      }
      socket.setTimeout(0);
      if (head.length) socket.unshift(head);
      resolve(socket);
    });
    request.end();
  });
}

function createBrowserEgress({ config = {}, lookup, dial = net.connect, egressOptions } = {}) {
  const resolutions = new Map();
  const admitted = new Map();
  const sockets = new Set();
  const reported = new Set();
  const stop = new AbortController();
  let server, closePromise;

  function report(reason) {
    if (stop.signal.aborted || reported.has(reason)) return;
    reported.add(reason);
    console.warn(JSON.stringify({ service: 'collector_web', event: 'browser_egress_rejected', reason }));
  }

  async function resolveUrl(raw) {
    const url = parsePublicUrl(raw);
    if (!resolutions.has(url.hostname)) {
      if (resolutions.size >= 256) throw Error('browser_egress_resolution_limit');
      const hostname = url.hostname;
      resolutions.set(hostname, publicAddresses(hostname, lookup).catch(error => {
        resolutions.delete(hostname);
        report(error.message === 'nonpublic_destination' ? 'nonpublic_destination' : 'dns_resolution_failed');
        throw error;
      }));
    }
    return { url, addresses: await resolutions.get(url.hostname) };
  }

  async function check(raw) {
    return (await resolveUrl(raw)).url;
  }

  async function admit(raw) {
    const { url, addresses } = await resolveUrl(raw);
    stop.signal.throwIfAborted();
    admitted.set(destinationKey(url), addresses);
  }

  function close() {
    if (!closePromise) {
      stop.abort();
      closePromise = server ? new Promise(resolve => {
        server.close(() => resolve());
        for (const socket of sockets) socket.destroy();
      }) : Promise.resolve();
    }
    return closePromise;
  }

  async function start() {
    stop.signal.throwIfAborted();
    if (server) throw Error('browser_egress_already_started');
    const upstream = (egressOptions || webContextEgress(config)).proxy;
    const username = 'collector';
    const password = randomBytes(24).toString('hex');
    const authorization = Buffer.from(`Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`);
    const proxyHeaders = { 'Proxy-Authenticate': 'Basic realm="collector"' };

    function authenticated(request) {
      const supplied = Buffer.from(request.headers['proxy-authorization'] || '');
      return authorization.length === supplied.length && timingSafeEqual(authorization, supplied);
    }

    async function connect(key, client) {
      const addresses = admitted.get(key);
      if (!addresses) {
        report('destination_not_admitted');
        throw Error('browser_egress_destination_not_admitted');
      }
      const port = Number(key.slice(key.lastIndexOf(':') + 1));
      const signal = stop.signal;
      // Try only addresses from the same validated answer and share one connection budget.
      const attempt = new AbortController();
      const disconnect = () => attempt.abort();
      client.once('close', disconnect);
      const timer = setTimeout(disconnect, connectTimeoutMs);
      const bounded = AbortSignal.any([signal, attempt.signal]);
      try {
        if (client.destroyed) throw Error('browser_egress_client_closed');
        for (const address of addresses) {
          bounded.throwIfAborted();
          try {
            const socket = upstream ? await connectThroughProxy(upstream, address, port, bounded) :
              await connectDirect(address, port, { signal: bounded, dial });
            if (client.destroyed || bounded.aborted) {
              socket.destroy();
              throw Error('browser_egress_client_closed');
            }
            return socket;
          } catch (error) {
            if (error.message === 'browser_egress_peer_mismatch') {
              report('peer_mismatch');
              throw error;
            }
            if (bounded.aborted) throw error;
          }
        }
        throw Error('browser_egress_connection_failed');
      } finally {
        clearTimeout(timer);
        client.off('close', disconnect);
      }
    }

    server = http.createServer({ headersTimeout: 10000, requestTimeout: 30000 }, (request, response) => {
      if (!authenticated(request)) { response.writeHead(407, proxyHeaders).end(); return; }
      const run = async () => {
        const url = parsePublicUrl(request.url);
        if (url.protocol !== 'http:' || url.hash || request.headers.host?.toLowerCase() !== url.host) {
          throw Error('browser_egress_http_authority_rejected');
        }
        const socket = await connect(destinationKey(url), request.socket);
        const headers = { ...forwardedHeaders(request.headers), host: url.host };
        const remote = http.request({
          host: url.hostname, path: url.pathname + url.search, method: request.method, headers,
          createConnection: () => socket
        }, result => {
          response.writeHead(result.statusCode, forwardedHeaders(result.headers));
          result.on('error', () => response.destroy());
          result.pipe(response);
        });
        remote.on('error', () => {
          if (response.headersSent) response.destroy();
          else response.writeHead(502).end();
        });
        response.once('close', () => remote.destroy());
        remote.setTimeout(30000, () => remote.destroy());
        request.pipe(remote);
      };
      run().catch(() => { if (!response.destroyed) response.writeHead(502).end(); });
    });
    server.maxConnections = maxConnections;
    server.on('connection', socket => {
      sockets.add(socket);
      socket.on('error', () => socket.destroy());
      socket.once('close', () => sockets.delete(socket));
    });
    server.on('upgrade', (_request, socket) => socket.destroy());
    server.on('connect', (request, client, head) => {
      if (!authenticated(request)) {
        client.end('HTTP/1.1 407 Proxy Authentication Required\r\n' +
          `Proxy-Authenticate: ${proxyHeaders['Proxy-Authenticate']}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
        return;
      }
      const run = async () => {
        if (!/^[a-z0-9._-]+:(?:80|443)$/i.test(request.url)) throw Error('browser_egress_authority_rejected');
        const remote = await connect(request.url.toLowerCase(), client);
        remote.on('error', () => client.destroy());
        remote.once('close', () => client.destroy());
        client.once('close', () => remote.destroy());
        client.setTimeout(30000, () => client.destroy());
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) remote.write(head);
        client.pipe(remote).pipe(client);
      };
      run().catch(() => client.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'));
    });

    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      stop.signal.throwIfAborted();
      return { server: `http://127.0.0.1:${server.address().port}`, username, password, bypass: '<-loopback>' };
    } catch (error) {
      await close();
      throw error;
    }
  }

  async function open(browser, options) {
    const proxy = await start();
    try {
      const context = await browser.newContext({
        ...options, ignoreHTTPSErrors: false, serviceWorkers: 'block', proxy
      });
      context.once?.('close', () => { void close(); });
      return context;
    } catch (error) {
      await close();
      throw error;
    }
  }

  return { start, open, check, admit, close };
}

module.exports = { createBrowserEgress };
