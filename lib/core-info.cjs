'use strict';

/*
 * Core projection only: no I/O, clock, measurements, identity inference or orders.
 * makeCoreInfo(record, { asOf }) accepts a decorated catalog record. Without an
 * asOf argument the latest retained check time is the deterministic reference.
 *
 * Optional record.coreSupplement uses the same sections as this DTO:
 * - checkedAt, sourceIds, website { url, relationship, basis, sourceIds }
 * - pricing (or offers): the currentEvidence.offers shape, including exact plans;
 *   amountBasis may explicitly retain advertised_starting_price_not_period_total
 * - payment: the currentEvidence.payment shape; observations may add separately
 *   sourced image_only/help_reference/public_text/authenticated_checkout evidence
 * - speed.measurements: metrics + testedAt, sampleCount, methodology, network or
 *   region, sourceIds; speed.advertised contains separately sourced claims
 * - speed.externalReports (or reports): third-party publisher/summary/capture
 *   time/sources; original metric strings and nodeCount never become samples
 * - stability.measurements: availabilityPct/packetLossPct + windowStart/windowEnd,
 *   sampleCount, methodology, network or region, sourceIds; peakHours is context
 * - stability.recentIssues/recoveryClues: dated, sourced statements, not samples
 * - operatingHistory: startedAt (a full date) or startYear, basis, claimType,
 *   sourceIds; continuousOperationVerified additionally requires continuityBasis
 *   and continuitySourceIds. An optional establishedAssessment {value, criterion,
 *   sourceIds} is only usable with that continuity evidence; no age threshold is
 *   invented here. Domain registration/certificate evidence cannot be a start.
 *   Raw core-history claims may be passed unchanged: claimedFoundedAt and
 *   earliestRetainedOperationalEvidenceAt stay separate from an operating start.
 * - refund/trial: summary, conditions, observedAt, sourceIds; promotions: an array
 * - privacy: dated, sourced operator policy; loggedData and retentionPeriod stay
 *   as stated, and publisher claims never establish independent auditing
 * - compatibility: dated, sourced client/configuration requirements, not tests
 *
 * No browser session, credential, technical hash, domain/certificate observation,
 * forecast or unrelated raw field is copied to the DTO. Transaction/refund/trial
 * execution is never inferred from observing a page or a logged-in selector.
 */

const DAY = 86400000;
const PAYMENT_LEVELS = {
  unknown: '未确认',
  image_only: '支付标识图片',
  help_reference: '帮助页提及',
  public_text: '公开文字说明',
  public_checkout: '未登录支付选项观察',
  authenticated_checkout: '登录后支付选项观察'
};
const text = value => typeof value === 'string' && value.trim() ? value.trim() : null;
const list = value => Array.isArray(value) ? value : [];
const texts = value => [...new Set(list(value).map(text).filter(Boolean))];
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const finite = (value, min = 0, max = Infinity) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
const stamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
// Provenance is part of the data contract. A display limit must never discard
// the newest source when a reviewed revision retains its earlier context.
const sources = value => texts(value);
const refs = value => sources([...list(value?.sourceIds), value?.sourceId]);
const latest = values => values.map(stamp).filter(Boolean).sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null;
const fullDateStamp = value => {
  const parsed = stamp(value), datePart = typeof value === 'string' ? value.slice(0, 10) : '';
  if (!parsed || !/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  const calendar = new Date(datePart + 'T00:00:00Z');
  return Number.isFinite(calendar.getTime()) && calendar.toISOString().slice(0, 10) === datePart ? parsed : null;
};

function safeWebsiteUrl(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    url.search = ''; url.hash = '';
    if (/\/(?:auth|login|register|signup|invite|ref|r|f)(?:[./]|$)/i.test(url.pathname)) url.pathname = '/';
    return url.href;
  } catch { return null; }
}

function detailValue(value, keys) {
  if (value === null || value === undefined) return null;
  if (['string', 'boolean'].includes(typeof value)) return value;
  if (typeof value === 'number') return finite(value);
  if (Array.isArray(value)) return value.filter(item => ['string', 'boolean'].includes(typeof item) || finite(item) !== null);
  const result = {};
  for (const key of keys) {
    const child = value[key];
    if (key === 'sourceIds') result[key] = sources(child);
    else if (Array.isArray(child)) result[key] = texts(child);
    else if (child === null || ['string', 'boolean'].includes(typeof child) || finite(child) !== null) result[key] = child;
  }
  return Object.keys(result).length ? result : null;
}

function projectPlan(input, offer) {
  const plan = object(input), sourceIds = refs(plan);
  const amount = sourceIds.length && text(plan.billingPeriod) ? finite(plan.amount) : null;
  const statedAmountBasis = plan.amountBasis === undefined ? 'original_billing_period_total' : text(plan.amountBasis);
  const amountBasis = amount !== null && ['original_billing_period_total', 'advertised_starting_price_not_period_total', 'advertised_monthly_equivalent_not_period_total'].includes(statedAmountBasis) ? statedAmountBasis : 'not_confirmed';
  const restrictions = texts(plan.restrictions);
  const explicitSoldOut = /^(?:(?:页面|卡片|本套餐|该套餐|当前|采集页)?(?:标为|显示|标注|标记|标)?已?售罄|已?售完|sold\s*out)$/i;
  const soldOut = typeof plan.soldOut === 'boolean' ? plan.soldOut : restrictions.some(value => value.split(/[，,。；;]/).some(clause => explicitSoldOut.test(clause.trim()))) ? true : null;
  const terms = typeof plan.terms === 'string' ? plan.terms : detailValue(plan.terms, ['deviceLimit', 'resetRule', 'refundPolicy', 'advertisedSpeedMbps', 'speedStatus']);
  const statedDeviceLimit = text(plan.maxDevices);
  const numericDevices = statedDeviceLimit && /^[1-9]\d*$/.test(statedDeviceLimit) ? Number(statedDeviceLimit) : plan.maxDevices;
  const maxDevices = Number.isSafeInteger(numericDevices) ? finite(numericDevices, 1) : null;
  return {
    name: text(plan.name) || '未命名套餐', amount,
    amountBasis,
    currency: /^[A-Z]{3}$/.test(plan.currency || '') ? plan.currency : null,
    currencySymbol: text(plan.currencySymbol), currencyStatus: text(plan.currencyStatus) || 'not_confirmed',
    currencyReason: text(plan.currencyReason), billingPeriod: text(plan.billingPeriod),
    quota: text(plan.quota), quotaReset: text(plan.quotaReset), maxDevices,
    deviceLimit: text(plan.deviceLimit) || text(object(plan.terms).deviceLimit) || statedDeviceLimit, soldOut, restrictions,
    addon: detailValue(plan.addon, ['name', 'summary', 'requiredPlan', 'amount', 'billingPeriod', 'sourceIds']),
    discount: detailValue(plan.discount, ['label', 'listPrice', 'expiresAt', 'affiliateBinding', 'status', 'conditions', 'sourceIds']),
    additionalCharges: detailValue(plan.additionalCharges, ['summary', 'amount', 'currency', 'currencySymbol', 'perGiB', 'requiredBalance', 'conditions', 'sourceIds']),
    terms, displayBasis: text(plan.displayBasis),
    priceStatus: amount === null ? 'not_confirmed' : 'advertised_not_checkout_verified',
    checkoutVerified: false, observedAt: stamp(plan.observedAt) || stamp(offer.observedAt), sourceIds
  };
}

function paymentLevel(value) {
  const stated = text(value.evidenceLevel);
  if (stated && Object.hasOwn(PAYMENT_LEVELS, stated)) return stated;
  const type = text(value.statementType) || '';
  if (/authenticated|logged_in|login_after/.test(type)) return 'authenticated_checkout';
  if (/logo|image/.test(type)) return 'image_only';
  if (/help/.test(type)) return 'help_reference';
  if (/public_statement|public_text/.test(type)) return 'public_text';
  return 'unknown';
}

function projectPayment(current, supplement) {
  const candidates = [current, ...list(current?.observations), supplement, ...list(supplement?.observations)].filter(Boolean);
  const observations = candidates.map(raw => {
    const value = object(raw), methods = texts(value.methods), sourceIds = refs(value);
    const observedAt = stamp(value.observedAt) || stamp(value.checkedAt);
    const evidenceLevel = methods.length && sourceIds.length && observedAt ? paymentLevel(value) : 'unknown';
    return {
      evidenceLevel, label: PAYMENT_LEVELS[evidenceLevel], methods: evidenceLevel === 'unknown' ? [] : methods,
      statementType: text(value.statementType) || 'not_confirmed', observedAt, sourceIds,
      quote: text(value.quote), reason: text(value.reason), processorClaim: text(value.processorClaim),
      orderCleanup: value.orderCleanup?.status==='pending' ? {status:'pending',cancellationVerified:false,newOrderBlocked:value.orderCleanup.newOrderBlocked===true,reason:text(value.orderCleanup.reason),checkedAt:stamp(value.orderCleanup.checkedAt)} : null,
      transactionVerified: false
    };
  });
  const rank = Object.keys(PAYMENT_LEVELS);
  const ordered = observations.toSorted((a, b) => rank.indexOf(b.evidenceLevel) - rank.indexOf(a.evidenceLevel) || (Date.parse(b.observedAt) || 0) - (Date.parse(a.observedAt) || 0));
  const best = ordered[0] || { evidenceLevel: 'unknown', label: PAYMENT_LEVELS.unknown, methods: [], sourceIds: [], observedAt: null, statementType: 'not_confirmed', quote: null, reason: null, processorClaim: null };
  return {
    ...best, status: best.evidenceLevel === 'unknown' ? 'not_confirmed' : 'observed_not_transaction_verified',
    checkoutObserved: ['public_checkout', 'authenticated_checkout'].includes(best.evidenceLevel), transactionVerified: false,
    observations: observations.filter(item => item.evidenceLevel !== 'unknown'),
    reason: best.reason || '支付页面或说明不证明当前收款成功；尚无交易验证。'
  };
}

function projectMeasurement(input, kind, asOf) {
  const value = object(input), sourceIds = refs(value);
  // Fixture observations can exercise the same proposal contract in isolated DBs.
  // They must never render as independent service measurements.
  if (value.synthetic === true) return null;
  const sampleCount = Number.isSafeInteger(value.sampleCount) && value.sampleCount > 0 ? value.sampleCount : null;
  const methodology = text(value.methodology), network = text(value.network), region = text(value.region);
  if (!sourceIds.length || !sampleCount || !methodology || (!network && !region)) return null;
  const result = { sourceIds, sampleCount, methodology, network, region, plan: text(value.plan), provider: text(value.provider), peakHours: text(value.peakHours) };
  if(value.measurementOrigin==='independent_user_route'){result.measurementOrigin=value.measurementOrigin;result.sourceGroup=text(value.sourceGroup);result.independentSourceCount=1;result.scope=text(value.scope);result.testTarget=text(value.testTarget);result.limitation=text(value.limitation);result.sampleQuantileDefinition=text(value.sampleQuantileDefinition);result.latencyDefinition=text(value.latencyDefinition);result.applicationBytesPerSample=finite(value.applicationBytesPerSample);result.latencyMsQuantiles=Object.fromEntries(['p10','p50','p90'].filter(k=>finite(value.latencyMsQuantiles?.[k])!==null).map(k=>[k,value.latencyMsQuantiles[k]]));result.windowDurationSeconds=finite(value.windowDurationSeconds);result.expectedSlots=finite(value.expectedSlots);result.missingSlots=finite(value.missingSlots);result.eligibleForSpeedRanking=false;}
  if (kind === 'speed') {
    result.testedAt = stamp(value.testedAt);
    if (!result.testedAt || (asOf && Date.parse(result.testedAt) > Date.parse(asOf))) return null;
    result.downloadMbps = finite(value.downloadMbps); result.uploadMbps = finite(value.uploadMbps);
    result.latencyMs = finite(value.latencyMs); result.packetLossPct = finite(value.packetLossPct, 0, 100);
    result.durationSeconds = finite(value.durationSeconds, 1);
    const quantiles = object(value.downloadMbpsQuantiles);
    result.downloadMbpsQuantiles = Object.fromEntries(['p10', 'p50', 'p90', 'p95'].filter(key => finite(quantiles[key]) !== null).map(key => [key, quantiles[key]]));
    if (result.downloadMbps === null && result.uploadMbps === null && !Object.keys(result.downloadMbpsQuantiles).length) return null;
  } else {
    result.windowStart = stamp(value.windowStart); result.windowEnd = stamp(value.windowEnd);
    if (!result.windowStart || !result.windowEnd || Date.parse(result.windowEnd) <= Date.parse(result.windowStart) || (asOf && Date.parse(result.windowEnd) > Date.parse(asOf))) return null;
    result.availabilityPct = finite(value.availabilityPct, 0, 100); result.packetLossPct = finite(value.packetLossPct, 0, 100);
    if (result.availabilityPct === null && result.packetLossPct === null) return null;
  }
  return result;
}

function projectExternalReport(input) {
  const value = object(input), publisher = text(value.publisher), summary = text(value.summary), sourceIds = refs(value), observedAt = stamp(value.observedAt);
  if (!publisher || !summary || !sourceIds.length || !observedAt) return null;
  return {
    status: 'unverified_third_party_report', publisher, summary, observedAt, sourceIds,
    testedAt: fullDateStamp(value.testedAt), publishedAt: fullDateStamp(value.publishedAt ?? value.publisherDate),
    region: text(value.region), network: text(value.network), timeWindow: text(value.timeWindow),
    nodeCount: Number.isSafeInteger(value.nodeCount) && value.nodeCount > 0 ? value.nodeCount : null,
    sampleCount: Number.isSafeInteger(value.sampleCount) && value.sampleCount > 0 ? value.sampleCount : null,
    methodology: text(value.methodology),
    metrics: list(value.metrics).map(item => ({ label: text(object(item).label), valueText: text(object(item).valueText) })).filter(item => item.label && item.valueText),
    affiliateBinding: typeof value.affiliateBinding === 'boolean' ? value.affiliateBinding : text(value.affiliateBinding),
    limitations: texts(value.limitations)
  };
}

function projectClaim(input, fallback = {}) {
  const value = typeof input === 'string' ? { summary: input } : object(input);
  const sourceIds = refs(value).length ? refs(value) : refs(fallback);
  const summary = text(value.summary) || text(value.claim) || text(value.text);
  const advertisedSpeedMbps = finite(value.advertisedSpeedMbps ?? value.speedMbps);
  if ((!summary && advertisedSpeedMbps === null) || !sourceIds.length) return null;
  return { summary, advertisedSpeedMbps, plan: text(value.plan) || text(fallback.name), observedAt: stamp(value.observedAt) || stamp(fallback.observedAt), sourceIds, status: 'publisher_claim_not_measured' };
}

function projectEvent(input, window) {
  const value = object(input), sourceIds = refs(value), createdAt = stamp(value.createdAt) || stamp(value.observedAt);
  if (!text(value.summary) || !sourceIds.length || !createdAt) return null;
  if (window.end && Date.parse(createdAt) > Date.parse(window.end)) return null;
  if (window.start && Date.parse(createdAt) < Date.parse(window.start)) return null;
  return {
    id: text(value.id), summary: text(value.summary), createdAt, url: safeWebsiteUrl(value.url), sourceIds,
    relation: text(value.relation), matchType: text(value.matchType), sourceGroup: text(value.sourceGroup),
    independentlyVerified: value.independentlyVerified === true,
    status: value.independentlyVerified === true ? 'sourced_verified_event' : 'unverified_statement'
  };
}

function projectEvents(inputs, window) {
  const output = [], identities = new Map();
  for (const input of inputs) {
    const event = projectEvent(input, window);
    if (!event) continue;
    // A recapture is not a new statement. Require the same native identity,
    // original publication time, URL and attribution before merging copies.
    const key = event.id && event.url && event.sourceGroup
      ? JSON.stringify([event.id, event.url, Date.parse(event.createdAt), event.sourceGroup, event.relation, event.matchType]) : null;
    if (key === null || !identities.has(key)) {
      if (key !== null) identities.set(key, output.length);
      output.push(event);
      continue;
    }
    const index = identities.get(key), previous = output[index];
    const independentlyVerified = previous.independentlyVerified && event.independentlyVerified;
    output[index] = { ...event, createdAt: previous.createdAt,
      sourceIds: sources([...previous.sourceIds, ...event.sourceIds]), independentlyVerified,
      status: independentlyVerified ? 'sourced_verified_event' : 'unverified_statement' };
  }
  // Order by retained event dates after deduplication. When an original
  // statement time exists, a later capture must not change its position.
  return output.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function projectHistory(input, asOf) {
  const value = object(input), sourceIds = refs(value), basis = text(value.basis), claimType = text(value.claimType) || 'not_confirmed';
  const excludedBasis = /domain[_ -]?(?:registration|creation)|rdap|certificate|whois|域名注册|证书签发/i.test([claimType, value.startMeaning, basis].filter(Boolean).join(' '));
  const rawStart = text(value.startedAt) || text(value.startDate);
  let startDate = rawStart && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(rawStart) ? fullDateStamp(rawStart) : null;
  let startYear = Number.isInteger(value.startYear) ? value.startYear : /^\d{4}$/.test(rawStart || '') ? Number(rawStart) : null;
  const evidenced = sourceIds.length > 0 && Boolean(basis) && !excludedBasis;
  if (!evidenced) { startDate = null; startYear = null; }
  const reference = asOf ? new Date(asOf) : null;
  if (startDate && reference && Date.parse(startDate) > reference.getTime()) startDate = null;
  if (startYear !== null && (startYear < 1900 || (reference && startYear > reference.getUTCFullYear()))) startYear = null;
  if (startDate) startYear = new Date(startDate).getUTCFullYear();
  let yearsSinceStart = null, yearRange = null;
  if (reference && startDate) {
    const start = new Date(startDate);
    yearsSinceStart = reference.getUTCFullYear() - start.getUTCFullYear() - (reference.getUTCMonth() < start.getUTCMonth() || (reference.getUTCMonth() === start.getUTCMonth() && reference.getUTCDate() < start.getUTCDate()) ? 1 : 0);
  } else if (reference && startYear !== null) {
    const difference = reference.getUTCFullYear() - startYear;
    yearRange = [Math.max(0, difference - 1), difference];
  }
  const known = startDate !== null || startYear !== null;
  const continuitySourceIds = sources(value.continuitySourceIds);
  const continuousOperationVerified = known && value.continuousOperationVerified === true && continuitySourceIds.length > 0 && Boolean(text(value.continuityBasis));
  const assessment = object(value.establishedAssessment);
  const qualifiedAssessment = continuousOperationVerified && typeof assessment.value === 'boolean' && Boolean(text(assessment.criterion)) && refs(assessment).length > 0;
  const rawEarliest = value.earliestRetainedOperationalEvidenceAt || value.earliestEvidenceAt;
  const earliestEvidenceAt = sourceIds.length && basis && !excludedBasis ? fullDateStamp(rawEarliest) : null;
  const qualifiedEarliest = earliestEvidenceAt && (!reference || Date.parse(earliestEvidenceAt) <= reference.getTime()) ? earliestEvidenceAt : null;
  let elapsedSinceEarliestEvidence = null;
  if (qualifiedEarliest && reference) {
    const earliest = new Date(qualifiedEarliest);
    const fullYears = reference.getUTCFullYear() - earliest.getUTCFullYear() - (reference.getUTCMonth() < earliest.getUTCMonth() || (reference.getUTCMonth() === earliest.getUTCMonth() && reference.getUTCDate() < earliest.getUTCDate()) ? 1 : 0);
    elapsedSinceEarliestEvidence = { fullYears, asOf, interpretation: '距当前保留的该份历史材料的时间跨度，不是成立或已证实的连续运营年限。' };
  }
  const selfReportedDuration = object(value.selfReportedDuration);
  const claimText = text(value.claimText) || (value.claimStatus === 'self_report' && finite(selfReportedDuration.value) !== null ? text(value.publicShortExcerpt) || `${selfReportedDuration.value} ${text(selfReportedDuration.unit) || ''} ${text(selfReportedDuration.scope) || ''}`.trim() : null);
  const claimedFoundedAt = sourceIds.length && basis && !excludedBasis ? fullDateStamp(value.claimedFoundedAt) : null;
  const unknownLabel = qualifiedEarliest ? `有距今${elapsedSinceEarliestEvidence ? elapsedSinceEarliestEvidence.fullYears + '个完整年' : '较早'}的历史材料；成立及连续经营未确认` : claimText ? '有未经独立核实的历史陈述，成立及连续经营未确认' : '成立及运营起点未确认，不能判断是否老牌';
  return {
    status: known ? 'sourced_operating_start' : qualifiedEarliest ? 'historical_evidence_only' : claimText ? 'self_report_only' : 'not_confirmed', startDate, startYear, basis,
    claimType: known ? claimType : 'not_confirmed', yearsSinceStart, yearRange,
    claimedFoundedAt, claimedFoundedAtPrecision: claimedFoundedAt ? text(value.claimedFoundedAtPrecision) : null,
    claimedFoundedAtNullReason: text(value.claimedFoundedAtNullReason),
    earliestEvidenceAt: qualifiedEarliest, evidenceDateBasis: text(value.evidenceDateBasis) || text(value.historicalEvidenceNature),
    earliestEvidencePrecision: qualifiedEarliest ? text(value.earliestRetainedOperationalEvidenceAtPrecision) : null,
    elapsedSinceEarliestEvidence, claimText,
    independentHistoricalArchiveVerified: value.independentHistoricalArchiveVerified === true,
    ageBasis: known ? 'elapsed_since_sourced_start_not_proof_of_continuity' : 'not_confirmed',
    continuousOperationVerified, continuityBasis: continuousOperationVerified ? text(value.continuityBasis) : null,
    continuitySourceIds: continuousOperationVerified ? continuitySourceIds : [],
    isEstablished: qualifiedAssessment ? assessment.value : null,
    establishedCriterion: qualifiedAssessment ? text(assessment.criterion) : null,
    establishedSourceIds: qualifiedAssessment ? refs(assessment) : [],
    label: !known ? unknownLabel : !continuousOperationVerified ? '有运营起点材料，连续经营待核实，不能据此称老牌' : qualifiedAssessment ? (assessment.value ? '符合所列老牌判断条件' : '未符合所列老牌判断条件') : '有连续经营材料，老牌判断条件未定义',
    observedAt: stamp(value.observedAt), sourceIds
  };
}

function projectPolicy(input) {
  const value = typeof input === 'string' ? { summary: input } : object(input), sourceIds = refs(value), summary = text(value.summary);
  const known = Boolean(summary && sourceIds.length);
  return { status: known ? 'stated_terms_not_execution_verified' : 'not_confirmed', summary: known ? summary : null, conditions: known ? texts(value.conditions) : [], observedAt: stamp(value.observedAt), sourceIds: known ? sourceIds : [], executionVerified: false };
}

function projectPrivacy(input) {
  const value = object(input), summary = text(value.summary), sourceIds = refs(value), observedAt = stamp(value.observedAt);
  const known = Boolean(summary && sourceIds.length && observedAt);
  return {
    status: known ? 'operator_policy_observed' : 'not_confirmed', summary: known ? summary : null,
    loggedData: known ? texts(value.loggedData) : [], retentionPeriod: known ? text(value.retentionPeriod) : null,
    independentlyAudited: false, observedAt: known ? observedAt : null, sourceIds: known ? sourceIds : []
  };
}

function projectCompatibility(input) {
  const value = object(input), summary = text(value.summary), sourceIds = refs(value), observedAt = stamp(value.observedAt);
  const known = Boolean(summary && sourceIds.length && observedAt);
  return {
    status: known ? 'operator_requirements_observed' : 'not_confirmed', summary: known ? summary : null,
    requirements: known ? [...new Set([...texts(value.requirements), ...texts(value.conditions)])] : [], observedAt: known ? observedAt : null,
    sourceIds: known ? sourceIds : [], independentlyTested: false
  };
}

function projectPromotion(input, fallback, asOf) {
  const value = object(input), sourceIds = refs(value).length ? refs(value) : refs(fallback);
  const code = text(value.code), label = text(value.label) || text(value.summary), amount = finite(value.amount);
  if ((!code && !label && amount === null) || !sourceIds.length) return null;
  const expiresAt = stamp(value.expiresAt);
  return { code, label, amount, applicablePlan: text(value.applicablePlan) || text(fallback?.name), listPrice: finite(value.listPrice), conditions: texts(value.conditions), expiresAt, affiliateBinding: typeof value.affiliateBinding === 'boolean' ? value.affiliateBinding : text(value.affiliateBinding), status: value.status === 'restriction_only' ? 'restriction_only' : expiresAt && asOf && Date.parse(expiresAt) < Date.parse(asOf) ? 'expired_stated_offer' : 'stated_offer_not_checkout_verified', observedAt: stamp(value.observedAt) || stamp(fallback?.observedAt), sourceIds };
}

function makeCoreInfo(record, { asOf } = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new TypeError('A catalog record is required');
  if (asOf !== undefined && !stamp(asOf)) throw new TypeError('asOf must be an ISO-compatible date string');
  const current = object(record.currentEvidence), supplement = object(record.coreSupplement);
  const lastChecked = latest([supplement.checkedAt, current.checkedAt, current.collection?.checkedAt, record.observedAt]);
  const reference = asOf === undefined ? lastChecked : asOf;
  const binding = object(current.identityBinding), websiteInput = object(supplement.website);
  const websiteUrl = safeWebsiteUrl(websiteInput.url || record.officialUrl);
  // A discovery query is evidence of a search, never a service's own site.
  const searchPage = websiteUrl !== null && (() => {
    const url = new URL(websiteUrl);
    return ['bing.com', 'www.bing.com'].includes(url.hostname) && url.pathname === '/search';
  })();
  const website = {
    url: searchPage ? null : websiteUrl,
    status: searchPage ? 'rejected_search_page' : text(websiteInput.status) || text(record.officialUrlStatus) || 'not_confirmed',
    relationship: searchPage ? 'search_page_not_service_website' : text(websiteInput.relationship) || text(binding.status) || 'not_confirmed',
    basis: searchPage ? '原始候选链接是Bing搜索页面，不能作为机场官网；当前官网未确认，需可归属到该服务的原始入口证据。' : text(websiteInput.basis) || text(binding.basis),
    operatorIdentityVerified: !searchPage && (websiteInput.operatorIdentityVerified === true || binding.operatorIdentityVerified === true || binding.legalOperatorVerified === true),
    observedAt: stamp(websiteInput.observedAt) || stamp(current.collection?.checkedAt),
    sourceIds: refs(websiteInput).length ? refs(websiteInput) : refs(binding)
  };
  const offer = object(supplement.pricing || supplement.offers || current.offers);
  const plans = list(offer.plans).map(plan => projectPlan(plan, offer));
  const independentNumericPlans = plans.filter(plan => plan.amount !== null && !plan.addon);
  const summaryPlanIndex = plans.findIndex(plan => plan.amount !== null && !plan.addon && plan.soldOut !== true);
  const pricing = { summaryPlanIndex: summaryPlanIndex < 0 ? null : summaryPlanIndex, summaryUnavailableReason: summaryPlanIndex >= 0 ? null : independentNumericPlans.length ? 'all_numeric_independent_plans_sold_out' : 'no_numeric_independent_plan', summaryExcludedSoldOutCount: plans.filter(plan => plan.soldOut === true).length, status: plans.some(plan => plan.amount !== null) ? 'advertised_not_checkout_verified' : 'not_confirmed', plans, observedAt: stamp(offer.observedAt), checkoutVerified: false, limitation: text(offer.limitation) || '金额及起价含义以逐项标价依据为准，未验证实际下单总额。' };
  pricing.externalReports = list(object(supplement.pricingReports).reports).filter(r => ['unverified_third_party_price', 'unverified_candidate_price'].includes(r.status) && r.officialCurrentPriceVerified === false && text(r.publisher) && text(r.summary) && stamp(r.observedAt) && refs(r).length).map(r => ({status:r.status,publisher:text(r.publisher),summary:text(r.summary),quote:text(r.quote),publishedAt:fullDateStamp(r.publishedAt)?.slice(0,10)||null,publisherDateQuote:text(r.publisherDateQuote),observedAt:stamp(r.observedAt),sourceIds:refs(r),officialCurrentPriceVerified:false,identityLimitation:text(r.identityLimitation),freshnessLimitation:text(r.freshnessLimitation),affiliateDisclosure:text(r.affiliateDisclosure)}));
  const payment = projectPayment(current.payment, supplement.payment);
  const speedInput = object(supplement.speed), stabilityInput = object(supplement.stability);
  const speedSamples = [...list(speedInput.measurements), ...list(object(record.speedQuantiles).measurements)];
  const measuredSpeed = speedSamples.map(value => projectMeasurement(value, 'speed', reference)).filter(Boolean);
  const advertised = [...list(speedInput.advertised).map(value => projectClaim(value)), ...list(offer.plans).map(plan => projectClaim(typeof plan.terms === 'string' && /Mbps|MB\/s|速|speed|带宽/i.test(plan.terms) ? { summary: plan.terms } : object(plan.terms), plan))].filter(Boolean);
  const externalReports = (Array.isArray(speedInput.externalReports) ? speedInput.externalReports : list(speedInput.reports)).map(projectExternalReport).filter(Boolean);
  const speed = {
    status: measuredSpeed.length ? 'scoped_measurements_available' : 'not_measured',
    measured: { status: measuredSpeed.length ? 'scoped_measurements_available' : 'not_confirmed', observations: measuredSpeed, rejectedObservationCount: speedSamples.length - measuredSpeed.length },
    advertised, externalReports,
    historicalClaims: text(record.legacyClaims?.speed) ? [{ summary: text(record.legacyClaims.speed), status: 'unverified_legacy_claim_not_current_measurement' }] : [],
    limitation: '实测只适用于列出的时间、网络、地区和样本；宣传上限及历史陈述不作为实测。'
  };
  const stableSamples = [...list(stabilityInput.measurements), ...list(object(record.availability).measurements)];
  const measuredStability = stableSamples.map(value => projectMeasurement(value, 'stability', reference)).filter(Boolean);
  const recentWindow = { start: reference ? new Date(Date.parse(reference) - 30 * DAY).toISOString() : null, end: reference };
  const community = object(current.community);
  // Clue dimensions may overlap on one retained statement. Keep its identity and
  // sourceGroup in both views rather than dropping a label or creating new events.
  const issueInputs = [...list(community.events).filter(event => event.complaintClue === true || event.kind === 'complaint_claim'), ...list(stabilityInput.recentIssues)];
  const recoveryInputs = [...list(community.events).filter(event => event.recoveryOrPartialUseClue === true || event.kind === 'recovery_claim'), ...list(stabilityInput.recoveryClues)];
  const identityReviews = list(stabilityInput.identityReviews).filter(value =>
    value.status === 'identity_unresolved' && text(value.reason) && refs(value).length &&
    stamp(value.reviewedAt) && reference && Date.parse(value.reviewedAt) <= Date.parse(reference));
  const unresolved = new Map();
  const bindEvents = events => events.filter(event => {
    const review = identityReviews.find(value => value.eventId === event.id &&
      safeWebsiteUrl(value.eventUrl) === event.url &&
      Date.parse(value.eventCreatedAt) === Date.parse(event.createdAt) &&
      value.eventSourceGroup === event.sourceGroup);
    if (!review) return true;
    const key = JSON.stringify([event.id, event.url, event.createdAt, event.sourceGroup]);
    unresolved.set(key, { ...event, bindingStatus: 'identity_unresolved',
      bindingReason: text(review.reason), bindingReviewedAt: stamp(review.reviewedAt),
      sourceIds: sources([...event.sourceIds, ...refs(review)]) });
    return false;
  });
  const recentIssues = bindEvents(projectEvents(issueInputs, recentWindow));
  const recoveryClues = bindEvents(projectEvents(recoveryInputs, recentWindow));
  const identityUnresolvedReports = [...unresolved.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const operatorReports = list(stabilityInput.operatorReports).map(value => {
    const claim = projectClaim(value);
    if (!claim?.summary || !claim.observedAt || (reference && Date.parse(claim.observedAt) > Date.parse(reference))) return null;
    return { summary: claim.summary, observedAt: claim.observedAt, sourceIds: claim.sourceIds, status: 'operator_report_not_independent_measurement' };
  }).filter(Boolean);
  const stability = {
    status: measuredStability.length ? 'scoped_measurements_available' : 'not_measured',
    measured: { status: measuredStability.length ? 'scoped_measurements_available' : 'not_confirmed', observations: measuredStability, rejectedObservationCount: stableSamples.length - measuredStability.length },
    recentWindow, recentIssues, recoveryClues, operatorReports, identityUnresolvedReports, complaintRate: null, zeroMatchesMeansZeroComplaints: false,
    searchComplete: community.coverage?.searchComplete === true,
    limitation: '近月问题和恢复线索是来源陈述；未匹配到陈述不等于无故障，线索数不是独立投诉数或投诉率。'
  };
  const operatingHistory = projectHistory(supplement.operatingHistory, reference);
  const refund = projectPolicy(supplement.refund || current.refund);
  const trial = projectPolicy(supplement.trial || current.trial);
  const privacy = projectPrivacy(supplement.privacy);
  const compatibility = projectCompatibility(supplement.compatibility);
  const promotionInputs = [...list(offer.promotions).map(value => [value, offer]), ...list(supplement.promotions).map(value => [value, supplement]), ...list(offer.plans).flatMap(plan => [[plan.discount, plan], [object(plan.terms).promotion, plan]])];
  const promotions = promotionInputs.map(([value, fallback]) => projectPromotion(value, fallback, reference)).filter(Boolean);
  const gaps = [];
  if (!website.url) gaps.push('当前网址未确认');
  if (!website.operatorIdentityVerified) gaps.push('网址与经营主体的独立归属未确认');
  if (!plans.some(plan => plan.amount !== null)) gaps.push('当前套餐价格未确认');
  else gaps.push('实际下单总额未验证');
  if (plans.some(plan => !plan.currency)) gaps.push('部分套餐的结算币种未确认');
  if (plans.some(plan => !plan.quota)) gaps.push('部分套餐配额未确认');
  if (plans.some(plan => plan.maxDevices === null && !plan.deviceLimit)) gaps.push('部分套餐设备限制未确认');
  if (payment.evidenceLevel === 'unknown') gaps.push('当前支付方式未确认');
  else gaps.push('支付选项当前可收款及退款未验证');
  if (!measuredSpeed.length) gaps.push('缺少注明时间、网络与方法的速度实测');
  if (!measuredStability.some(value => value.availabilityPct !== null)) gaps.push('可用率实测未确认');
  if (!measuredStability.some(value => value.packetLossPct !== null)) gaps.push('丢包实测未确认');
  if (!measuredStability.some(value => value.peakHours)) gaps.push('晚高峰稳定性实测未确认');
  if (!stability.searchComplete) gaps.push('近月问题与恢复线索的检索覆盖不完整');
  if (!operatingHistory.startDate && operatingHistory.startYear === null) gaps.push('成立及运营起点未确认');
  if (!operatingHistory.continuousOperationVerified) gaps.push('连续经营历史未核实，不能据此称老牌');
  if (refund.status === 'not_confirmed') gaps.push('退款条件未确认');
  if (trial.status === 'not_confirmed') gaps.push('试用条件未确认');
  if (privacy.status === 'not_confirmed') gaps.push('隐私与访问日志政策未确认');
  if (!promotions.length) gaps.push('当前优惠及适用条件未确认');
  if (promotions.some(value => !value.expiresAt || value.affiliateBinding === null || !value.conditions.length)) gaps.push('部分优惠的到期、绑定或使用条件未完整确认');
  const coreSourceIds = sources([...pricing.externalReports.flatMap(value => value.sourceIds), ...promotions.flatMap(value => value.sourceIds), ...privacy.sourceIds, ...compatibility.sourceIds, ...externalReports.flatMap(value => value.sourceIds), ...plans.flatMap(value => value.sourceIds), ...payment.sourceIds, ...operatingHistory.sourceIds, ...refund.sourceIds, ...trial.sourceIds, ...website.sourceIds, ...measuredSpeed.flatMap(value => value.sourceIds), ...measuredStability.flatMap(value => value.sourceIds), ...recentIssues.flatMap(value => value.sourceIds), ...recoveryClues.flatMap(value => value.sourceIds), ...identityUnresolvedReports.flatMap(value => value.sourceIds), ...operatorReports.flatMap(value => value.sourceIds)]);
  return { id: text(record.id), name: text(record.name), category: text(record.category) || 'unknown', website, pricing, payment, speed, stability, operatingHistory, refund, trial, privacy, compatibility, promotions, lastChecked, asOf: reference, gaps, sourceIds: coreSourceIds };
}

module.exports = { makeCoreInfo };
