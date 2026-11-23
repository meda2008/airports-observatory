'use strict';
// Read-only import. Config presence, parser presence and live evidence are separate.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const FIELDS = new Set(['pricing', 'payment', 'refund', 'privacy', 'compatibility', 'promotions', 'trial', 'website', 'speed', 'stability', 'operatingHistory']);
const ADAPTERS = new Set(['generic', 'v2board', 'whmcs', 'document_site', 'flybit']);
const WEEK = 7 * 86400000;
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.length <= 2048;
const selector = value => text(value) && !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value);

function cleanAuth(raw) {
  if (!object(raw)) return undefined;
  const auth = {};
  if (['login', 'register'].includes(raw.mode)) auth.mode = raw.mode;
  for (const [key, value] of Object.entries(raw)) {
    if (/^[a-zA-Z]+Selector$/.test(key) && selector(value)) auth[key] = value;
  }
  if (object(raw.captcha)) {
    const captcha = {};
    for (const [key, value] of Object.entries(raw.captcha)) {
      if ((/^[a-zA-Z]+Selector$/.test(key) && selector(value)) || (key === 'pattern' && text(value))) captcha[key] = value;
    }
    if (Object.keys(captcha).length) auth.captcha = captcha;
  }
  return Object.keys(auth).length ? auth : undefined;
}

function cleanUrlCollector(raw) {
  if (!object(raw)) return undefined;
  const result = {};
  // Metadata only: never import receipts, observed business facts or raw source text.
  for (const key of ['id', 'collectorId', 'recipe', 'recipeModule', 'status', 'lastAttemptAt', 'lastVerifiedAt', 'retryPolicy']) {
    if (text(raw[key]) && !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(raw[key])) result[key] = raw[key];
  }
  for (const key of ['completedAllFields', 'completeAllFields']) if (typeof raw[key] === 'boolean') result[key] = raw[key];
  return Object.keys(result).length ? result : undefined;
}

function validHost(host) {
  if (!text(host) || host !== host.toLowerCase() || /[\s/:@?#]/.test(host)) return false;
  try { return new URL('https://' + host).hostname === host && (host.includes('.') || net.isIP(host) !== 0); } catch { return false; }
}

function loadProfiles({root = path.resolve(__dirname, '..')} = {}) {
  const directory = path.join(root, 'collection/site-collectors');
  if (!fs.existsSync(directory)) return [];
  let binding, parserRegistry;
  try { binding = require(path.join(root, 'lib/website-collector-binding.cjs')).bindWebsiteCollector; } catch {}
  try { parserRegistry = require(path.join(root, 'collection/url-collectors/index.cjs')); } catch {}
  return fs.readdirSync(directory).filter(file => file.endsWith('.json')).sort().map(file => {
    const siteId = path.basename(file, '.json');
    const issues = [];
    let raw = {}, badJson = false;
    try {
      raw = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8').replace(/^\uFEFF/, ''));
      if (!object(raw)) throw Error('invalid_config_object');
    } catch { raw = {}; badJson = true; issues.push('invalid_config_json'); }
    const recordId = typeof raw.recordId === 'string' && /^[A-Za-z0-9_-]+$/.test(raw.recordId) ? raw.recordId : siteId;
    const name = text(raw.name) ? raw.name : siteId;
    if (raw.recordId !== siteId) issues.push('record_id_missing_or_filename_mismatch');
    let configuredHost = null, origin = null, entryUrl = '', unsafeEntry = false;
    if (!raw.entryUrl) issues.push('entry_missing');
    else {
      try {
        const url = new URL(raw.entryUrl);
        if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
            [...url.searchParams.keys()].some(key => /token|password|email|session|credential|secret|auth(?:_|$)/i.test(key)) ||
            /(?:[?&]|\/)(?:token|access_token|password|secret)=/i.test(url.hash)) throw Error('unsafe');
        entryUrl = raw.entryUrl;
        configuredHost = url.hostname;
        origin = url.origin;
        if (/^(?:www\.)?(?:bing\.com|google\.[a-z.]+|baidu\.com|duckduckgo\.com|search\.yahoo\.com)$/i.test(url.hostname) || /\/(?:search|s)\/?$/i.test(url.pathname)) issues.push('search_page_not_official_entry');
        if (/(?:aff|affiliate|promo)/i.test(url.hostname)) issues.push('marketing_domain_identity_unconfirmed');
        if (url.hostname === 'localhost' || /\.(?:localhost|local|internal)$/.test(url.hostname) ||
            (net.isIP(url.hostname) && !require('./collector.cjs').publicIP(url.hostname))) issues.push('nonpublic_entry');
      } catch { unsafeEntry = true; issues.push('unsafe_or_invalid_entry'); }
    }
    const allowedHosts = Array.isArray(raw.allowedHosts) ? [...new Set(raw.allowedHosts.filter(validHost))] : [];
    if (!Array.isArray(raw.allowedHosts) || allowedHosts.length !== raw.allowedHosts.length) issues.push('invalid_allowed_hosts');
    if (configuredHost && !allowedHosts.includes(configuredHost)) issues.push('entry_host_not_allowed');
    const maxPages = Number.isInteger(raw.maxPages) ? Math.min(8, Math.max(1, raw.maxPages)) : 4;
    if (raw.maxPages !== maxPages) issues.push('max_pages_normalized');
    const fields = Array.isArray(raw.fields) ? [...new Set(raw.fields.filter(field => FIELDS.has(field)))] : [];
    const deferredFields = Array.isArray(raw.fields) ? [...new Set(raw.fields.filter(field => typeof field === 'string' && !FIELDS.has(field)))] : [];
    let adapter = ADAPTERS.has(raw.adapter) ? raw.adapter : 'generic';
    if (adapter !== raw.adapter) issues.push('adapter_unknown_generic_fallback');
    const config = {recordId, name, entryUrl, allowedHosts, adapter, maxPages, enabled: raw.enabled === true,
      fields, refreshIntervalMs: Number.isSafeInteger(raw.refreshIntervalMs) && raw.refreshIntervalMs > 0 ? raw.refreshIntervalMs : WEEK,
      challengePolicy: 'checkpoint'};
    for (const key of ['knowledgeAdapter', 'includeClientGuides', 'publicOnly', 'accountReadOnly', 'collectPerformanceReferences']) if (typeof raw[key] === 'boolean') config[key] = raw[key];
    if (text(raw.readOnlyRecipe)) config.readOnlyRecipe = raw.readOnlyRecipe;
    if (recordId==='A218'&&raw.businessApiConsent&&require('./xxyun-visible-catalog.cjs').validConsent({...config,businessApiConsent:raw.businessApiConsent},{siteId:recordId})) config.businessApiConsent=raw.businessApiConsent;
    const auth = cleanAuth(raw.auth), urlCollector = cleanUrlCollector(raw.urlCollector);
    if (auth) config.auth = auth;
    if (urlCollector) config.urlCollector = urlCollector;
    let websiteCollectorId = null;
    if (!binding) { config.adapter = 'generic'; issues.push('binding_dependency_unavailable'); }
    else {
      try {
        const bound = binding({...config, ...(text(raw.readOnlyRecipe) ? {readOnlyRecipe: raw.readOnlyRecipe} : {})}, {directory: path.join(root, 'collection/website-collectors')});
        websiteCollectorId = bound.websiteCollectorId || null;
        if (bound.websiteCollectorStatus === 'definition_missing') issues.push('website_collector_definition_missing');
        if (bound.websiteCollectorStatus === 'official_origin_unresolved') issues.push('website_collector_origin_unresolved');
      } catch { config.adapter = 'generic'; issues.push('website_collector_binding_failed'); }
    }
    if (websiteCollectorId) config.websiteCollectorId = websiteCollectorId;
    let parserAvailable = false;
    if (!parserRegistry || typeof parserRegistry.forOrigin !== 'function') issues.push('parser_dependency_unavailable');
    else if (origin) {
      try {
        const parser = parserRegistry.forOrigin(entryUrl);
        if (parser && typeof parser.extract === 'function') {
          const bindingMissing = parser.recordIds !== undefined &&
            (!Array.isArray(parser.recordIds) || !parser.recordIds.includes(recordId));
          parserAvailable = !bindingMissing;
          if (bindingMissing) issues.push('parser_record_binding_missing');
        }
      }
      catch { issues.push('parser_lookup_failed'); }
    }
    const referenceMonitor = config.readOnlyRecipe === 'candidate_review_monitor' && require('../collection/url-collectors/candidate-review-monitors.cjs').specs.some(s => s.recordId === recordId && s.entryUrl === entryUrl);
    if(referenceMonitor) parserAvailable = true;
    if (raw.enabled !== true) issues.push('source_disabled');
    if (typeof raw.eligibility === 'string' && raw.eligibility !== 'queued') issues.push('source_eligibility_' + raw.eligibility.replace(/[^a-z0-9_]/gi, '_'));
    // Source eligibility and origin identity are kept as caveats, not silently
    // re-adjudicated from a hostname substring. Only concrete unsafe entries
    // prevent this registered read-only configuration from being executable.
    const blockers = issues.filter(issue => ['invalid_config_json', 'record_id_missing_or_filename_mismatch', 'entry_missing',
      'unsafe_or_invalid_entry', 'search_page_not_official_entry', 'entry_host_not_allowed', 'nonpublic_entry'].includes(issue));
    if (badJson || unsafeEntry || blockers.length) config.enabled = false;
    const captchaSelectors = Object.fromEntries(Object.entries(auth?.captcha || {}).filter(([key]) => key.endsWith('Selector')));
    const challengeAdapters = {policy: 'checkpoint', imageCaptcha: {configured: Object.keys(captchaSelectors).length > 0, selectors: captchaSelectors},
      cloudflare: {support: 'checkpoint_only', automaticPass: false}};
    return {siteId, recordId, name, config, staticValidation: {status: config.enabled ? 'eligible_static_only' : 'checkpoint', issues,
      websiteCollectorId, parserAvailable, parserScope: referenceMonitor ? 'third_party_review_only' : 'site_registered_fields', configuredHost, origin, deferredFields, challengeAdapters, liveVerified: false}};
  });
}

function summarizeProfiles(profiles) {
  const origins = new Set(profiles.map(profile => profile.staticValidation.origin).filter(Boolean));
  const originCounts = new Map();
  for (const profile of profiles) {
    const origin = profile.staticValidation.origin;
    if (origin) originCounts.set(origin, (originCounts.get(origin) || 0) + 1);
  }
  return {total: profiles.length, uniqueOrigins: origins.size, eligible: profiles.filter(profile => profile.config.enabled).length,
    disabled: profiles.filter(profile => !profile.config.enabled).length,
    parserAvailable: profiles.filter(profile => profile.staticValidation.parserAvailable).length,
    uniqueParserOrigins: new Set(profiles.filter(profile => profile.staticValidation.parserAvailable).map(profile => profile.staticValidation.origin)).size,
    sharedOrigins: [...originCounts.values()].filter(count => count > 1).length,
    challengeCheckpoint: profiles.filter(profile => profile.config.challengePolicy === 'checkpoint').length,
    configuredCaptcha: profiles.filter(profile => profile.staticValidation.challengeAdapters.imageCaptcha.configured).length,
    cloudflareCheckpoint: profiles.filter(profile => profile.staticValidation.challengeAdapters.cloudflare.support === 'checkpoint_only').length,
    liveVerified: 0, evidenceScope: 'local_static_configuration_only'};
}

module.exports = {loadProfiles, summarizeProfiles};
