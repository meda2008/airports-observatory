'use strict';

const http = require('node:http');
const https = require('node:https');
const { performance } = require('node:perf_hooks');

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_BYTES = 1024 * 1024;
const MAX_TIMEOUT_MS = 300000;
const MAX_BYTES = 64 * 1024 * 1024;
const SCOPE = 'local_endpoint_observation_not_service_speed';

// No default production endpoint, DNS resolution, proxy environment handling,
// target URL, response body, headers or raw errors are exposed by this module.
function validateEndpoint(endpoint) {
  if (endpoint == null) return { status: 'not_configured', reason: 'local_endpoint_not_configured' };
  if (typeof endpoint !== 'object' || endpoint.allowLoopback !== true || typeof endpoint.url !== 'string') {
    return { status: 'rejected', reason: 'explicit_loopback_permission_required' };
  }
  const role = endpoint.role ?? 'local_agent';
  if (!['local_agent', 'local_fixture', 'approved_local_proxy'].includes(role)) {
    return { status: 'rejected', reason: 'unsupported_endpoint_role' };
  }
  if (role === 'approved_local_proxy' && endpoint.approved !== true) {
    return { status: 'rejected', reason: 'local_proxy_approval_required' };
  }
  let url;
  try { url = new URL(endpoint.url); } catch { return { status: 'rejected', reason: 'invalid_endpoint' }; }
  if (!['http:', 'https:'].includes(url.protocol)) return { status: 'rejected', reason: 'http_or_https_required' };
  if (url.username || url.password) return { status: 'rejected', reason: 'userinfo_forbidden' };
  if (url.hash) return { status: 'rejected', reason: 'fragment_forbidden' };
  // Numeric loopback only. In particular, localhost and other names cannot
  // trigger DNS, and IPv4-mapped IPv6 addresses are not silently accepted.
  if (!(url.hostname === '[::1]' || /^127(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(url.hostname))) {
    return { status: 'rejected', reason: 'numeric_loopback_required' };
  }
  const params = [...url.searchParams];
  if (params.length > 1 || params.some(([key, value]) => key !== 'bytes' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > MAX_BYTES)) {
    return { status: 'rejected', reason: 'query_not_allowlisted' };
  }
  return { url, role };
}

/**
 * Observe one explicitly permitted local HTTP endpoint with a bounded GET.
 * Approved proxies are local destinations only; remote targets stay in the
 * agent's private configuration and cannot be supplied to this API.
 * latencyMs is time to response headers, not TCP latency or service latency.
 * bytesRead counts application-consumed response bytes. At the cap we stop
 * conservatively, even if an unconsumed end marker might immediately follow.
 */
async function measure(endpoint, options = {}) {
  const started = performance.now();
  const observedAt = new Date().toISOString();
  let statusCode = null;
  let latencyMs = null;
  let bytesRead = null;
  let endpointRole = null;
  const result = (status, reason, bodyComplete = false) => ({
    status, reason, statusCode, latencyMs,
    elapsedMs: Math.max(0, performance.now() - started),
    bytesRead, bodyComplete, observedAt,
    measurementScope: SCOPE, endpointRole
  });
  const validated = validateEndpoint(endpoint);
  if (validated.status) return result(validated.status, validated.reason);
  endpointRole = validated.role;
  if (!options || typeof options !== 'object') return result('rejected', 'invalid_options');
  const { timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = DEFAULT_MAX_BYTES, signal } = options;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS || !Number.isInteger(maxBytes) || maxBytes <= 0 || maxBytes > MAX_BYTES) {
    return result('rejected', 'invalid_limits');
  }
  if (signal != null && !(signal instanceof AbortSignal)) return result('rejected', 'invalid_abort_signal');
  if (signal?.aborted) return result('aborted', 'caller_aborted');

  return new Promise(resolve => {
    let request;
    let response;
    let timer;
    let settled = false;
    const finish = (status, reason, complete = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      const value = result(status, reason, complete);
      response?.destroy();
      request?.destroy();
      resolve(value);
    };
    const abort = () => finish('aborted', 'caller_aborted');
    const url = validated.url;
    try {
      // Supplying only these fixed fields ignores HTTP(S)_PROXY and avoids
      // credentials, ambient headers, shared agents and redirect following.
      request = (url.protocol === 'https:' ? https : http).request({
        protocol: url.protocol,
        hostname: url.hostname === '[::1]' ? '::1' : url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'GET',
        agent: false,
        headers: { Connection: 'close', 'Accept-Encoding': 'identity' }
      }, res => {
        response = res;
        statusCode = res.statusCode ?? null;
        latencyMs = Math.max(0, performance.now() - started);
        bytesRead = 0;
        if (statusCode >= 300 && statusCode < 400) return finish('redirect_rejected', 'redirect_not_followed');
        if (statusCode < 200 || statusCode >= 300) return finish('http_error', 'non_success_http_status');
        // Pull at most the remaining budget rather than consuming an entire
        // arbitrarily large data chunk and silently truncating its byte count.
        res.on('readable', () => {
          while (!settled) {
            // An extra read with an empty buffer allows the stream to emit
            // end; otherwise a complete body can wait until our timeout.
            const available = Math.min(res.readableLength || (maxBytes - bytesRead), maxBytes - bytesRead);
            const chunk = res.read(available);
            if (chunk === null) break;
            bytesRead += chunk.length;
            if (bytesRead >= maxBytes) return finish('byte_limit', 'response_byte_limit_reached');
          }
        });
        res.on('end', () => finish('ok', 'response_complete', true));
        res.on('aborted', () => finish('network_error', 'response_interrupted'));
        res.on('error', () => finish('network_error', 'response_interrupted'));
      });
      request.on('error', () => finish('network_error', 'request_failed'));
      timer = setTimeout(() => finish('timeout', 'overall_timeout'), timeoutMs);
      signal?.addEventListener('abort', abort, { once: true });
      // Catch an abort racing listener installation without sending a request.
      if (signal?.aborted) return abort();
      request.end();
    } catch {
      finish('network_error', 'request_failed');
    }
  });
}

module.exports = { measure };
