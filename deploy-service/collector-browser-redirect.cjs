'use strict';

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const maxRedirects = 4;
const withoutFragment = url => url.href.split('#', 1)[0];

function redirectDestination(event) {
  const {request, responseStatusCode, responseHeaders} = event;
  const source = new URL(request.url);
  const loginRedirect = request.method === 'POST' && source.protocol === 'https:' && [301, 302, 303].includes(responseStatusCode);
  if (request.method !== 'GET' && !loginRedirect) throw Error('unsupported_web_redirect');
  const locations = responseHeaders.filter(header => header.name.toLowerCase() === 'location');
  const location = locations[0]?.value;
  if (locations.length !== 1 || !location || /[\u0000- \u007f\\]/u.test(location)) throw Error('invalid_web_redirect_location');
  const destination = new URL(location, source);
  if (destination.origin !== source.origin || destination.username || destination.password ||
      withoutFragment(destination) === withoutFragment(source)) throw Error('unapproved_web_redirect');
  return destination;
}

async function guardBrowserRedirects(context, page, allowDestination) {
  if (typeof context.newCDPSession !== 'function') return;
  const session = await context.newCDPSession(page);
  const {frameTree: {frame: {id: mainFrame}}} = await session.send('Page.getFrameTree');
  let navigationId, hops;

  async function paused(event) {
    const {requestId, networkId, frameId, resourceType, responseStatusCode} = event;
    try {
      if (redirectStatuses.has(responseStatusCode)) {
        if (frameId !== mainFrame || resourceType !== 'Document' || !networkId) throw Error('unsupported_web_redirect');
        hops = networkId === navigationId ? hops + 1 : 1;
        navigationId = networkId;
        if (hops > maxRedirects || !allowDestination(redirectDestination(event))) throw Error('unapproved_web_redirect');
      } else if (navigationId === networkId) {
        navigationId = null;
      }
      // Chromium applies the original response headers and cookies on the pinned connection.
      await session.send('Fetch.continueResponse', {requestId});
    } catch {
      await session.send('Fetch.failRequest', {requestId, errorReason: 'Aborted'}).catch(() => {});
    }
  }

  session.on('Fetch.requestPaused', event => { void paused(event); });
  await session.send('Fetch.enable', {patterns: [{urlPattern: '*', requestStage: 'Response'}]});
}

module.exports = {guardBrowserRedirects};
