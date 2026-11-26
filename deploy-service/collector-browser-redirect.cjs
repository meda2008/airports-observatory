'use strict';

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const maxRedirects = 4;

const networkUrl = url => url.href.split('#', 1)[0];

function redirectedDestination(url, method, response) {
  if (method !== 'GET' && !(method === 'POST' && url.protocol === 'https:' &&
      [301, 302, 303].includes(response.status))) throw Error('unsupported_web_redirect');
  const location = response.headers?.location;
  if (typeof location !== 'string' || !location || /[\u0000- \u007f\\]/u.test(location)) {
    throw Error('invalid_web_redirect_location');
  }
  const destination = new URL(location, url);
  if (destination.origin !== url.origin || destination.username || destination.password ||
      networkUrl(destination) === networkUrl(url)) throw Error('unapproved_web_redirect');
  return destination;
}

function withLocation(response, destination) {
  return { ...response, headers: { ...response.headers, location: destination.href } };
}

function protocolResponse(response) {
  const headers = Object.entries(response.headers).flatMap(([name, value]) => {
    const values = name === 'set-cookie' ? value.split('\n') : [value];
    return values.map(value => ({ name, value }));
  });
  return { responseCode: response.status, responseHeaders: headers, body: response.body.toString('base64') };
}

// Playwright's public routing auto-continues browser redirects. For checked main
// navigations only, take over the exact next request via a separate Chromium
// session. The browser stays offline, so a missed interception cannot dial out.
function createBrowserRedirect(context, { validateDestination, read }) {
  const pages = new WeakMap();
  async function attach(page) {
    if (typeof context.newCDPSession !== 'function') return;
    const session = await context.newCDPSession(page);
    const { frameTree: { frame: { id: frameId } } } = await session.send('Page.getFrameTree');
    const frame = page.mainFrame();
    let initial, expected, chain, timer;
    function clearChain() {
      clearTimeout(timer);
      expected = null;
      chain = null;
    }
    async function arm(active, destination, hops, previous) {
      await validateDestination(destination);
      if (chain !== active) throw Error('web_redirect_interrupted');
      clearTimeout(timer);
      expected = { destination, hops, previous: { networkId: previous.networkId, requestId: previous.requestId } };
      timer = setTimeout(clearChain, 25000);
      timer.unref();
    }
    async function fail(event) {
      await session.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'Aborted' }).catch(() => {});
    }
    async function paused(event) {
      const request = event.request;
      const main = event.frameId === frameId && event.resourceType === 'Document';
      if (!event.redirectedRequestId) {
        if (main) {
          clearChain();
          initial = { networkId: event.networkId, requestId: event.requestId, url: request.url, method: request.method };
        }
        // The Playwright route handles fresh requests. Browser offline mode
        // denies direct connection if Playwright ever misses this handoff.
        await session.send('Fetch.continueRequest', { requestId: event.requestId });
        return;
      }
      const next = expected;
      if (!next || !main || !event.networkId || event.networkId !== next.previous.networkId ||
          event.redirectedRequestId !== next.previous.requestId || request.method !== 'GET' || request.hasPostData ||
          networkUrl(new URL(request.url)) !== networkUrl(next.destination)) return fail(event);
      const active = chain;
      expected = null;
      try {
        // Chromium selects cookies from the previous checked response and applies
        // normal POST-to-GET semantics. The shared reader rechecks and pins the hop.
        const headers = Object.fromEntries(Object.entries(request.headers).map(([name, value]) => [name.toLowerCase(), value]));
        const requestView = { url: () => next.destination.href, method: () => 'GET', resourceType: () => 'document',
          postData: () => null, postDataBuffer: () => null, headers: () => headers, allHeaders: async () => headers,
          frame: () => frame, isNavigationRequest: () => true };
        let response = await read(requestView, true);
        const redirects = redirectStatuses.has(response.status);
        if (redirects) {
          if (next.hops >= maxRedirects) throw Error('web_redirect_limit');
          const destination = redirectedDestination(next.destination, 'GET', response);
          await arm(active, destination, next.hops + 1, event);
          response = withLocation(response, destination);
        }
        if (chain !== active) throw Error('web_redirect_interrupted');
        if (!redirects) clearChain();
        await session.send('Fetch.fulfillRequest', { requestId: event.requestId, ...protocolResponse(response) });
      } catch {
        if (chain === active) clearChain();
        await fail(event);
      }
    }
    session.on('Fetch.requestPaused', event => { void paused(event).catch(() => fail(event)); });
    page.once('close', clearChain);
    await session.send('Fetch.enable', { patterns: [{ urlPattern: '*', resourceType: 'Document', requestStage: 'Request' }] });
    pages.set(frame, async (route, url, method, response) => {
      if (chain) throw Error('web_redirect_already_pending');
      const source = initial;
      initial = null;
      if (!source?.networkId || source.method !== method ||
          networkUrl(new URL(source.url)) !== networkUrl(url)) throw Error('web_redirect_source_unverified');
      const active = chain = {};
      try {
        const destination = redirectedDestination(url, method, response);
        await arm(active, destination, 1, source);
        await route.fulfill(withLocation(response, destination));
      } catch (error) {
        if (chain === active) clearChain();
        throw error;
      }
    });
  }
  async function follow(route, frame, url, method, response) {
    if (!frame) throw Error('unsupported_web_redirect');
    const start = pages.get(frame);
    if (!start) throw Error('web_redirect_api_unavailable');
    await start(route, url, method, response);
  }
  return { attach, follow };
}

module.exports = { createBrowserRedirect, redirectStatuses };
