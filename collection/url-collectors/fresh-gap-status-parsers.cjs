'use strict';
// Exact source review: changed public captures require a new reviewed profile.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { redact } = require('../../lib/collection-engine.cjs');
const { normalizeRetainedDocument } = require('../../lib/retained-document.cjs');
const root = path.resolve(__dirname, '../..');
const profiles = JSON.parse(fs.readFileSync(path.join(__dirname, 'fresh-gap-status-profiles.json'), 'utf8')).profiles;
const sha = value => createHash('sha256').update(value).digest('hex');
const fullTime = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const match = (url, recordId) => profiles.find(p => p.url === url && p.recordId === recordId);
const proof = ref => { const copy = structuredClone(ref); copy.originalSourceId = copy.sourceId; delete copy.sourceId; return copy; };
function documentFor(ref) {
  const bytes = fs.readFileSync(path.join(root, ref.file));
  if (sha(bytes) !== ref.fileSha256) throw Error('pinned identity file changed');
  const doc = normalizeRetainedDocument(bytes, { sha256: ref.fileSha256, url: ref.url, last_capture_at: ref.observedAt });
  if (doc.url !== ref.url || doc.capturedAt !== ref.observedAt || sha(doc.text) !== ref.bodySha256) throw Error('identity wrapper changed');
  return doc;
}
function locator(body, quote) {
  const start = body.indexOf(quote);
  return { kind: 'body_utf16_range', start, end: start + quote.length, quoteSha256: sha(quote), bodySha256: sha(body) };
}
function forOrigin(url, { recordId } = {}) {
  return match(url, recordId) ? { origin: new URL(url).origin, recordIds: [recordId], fields: ['stability'], parserKind: 'fresh_gap_operator_status_native_time_v1', extract } : null;
}
function sourceTargets(recordId) {
  return profiles.filter(p => p.recordId === recordId).map(p => ({ url: p.url, fields: ['stability'], sourceType: 'operator_statement', purpose: 'reviewed_historical_operator_incidents_with_recovery_context' }));
}
function diagnose(observation, { recordId } = {}) {
  const p = match(observation?.url, recordId);
  const reject = reason => ({ accepted: false, reasons: [reason], facts: [] });
  if (!p) return reject('exact_record_and_public_channel_required');
  const body = observation.body || observation.text;
  const observedAt = observation.observedAt || observation.capturedAt;
  const metadata = observation._verifiedMetadata || observation.metadata;
  if (typeof body !== 'string' || sha(body) !== p.ref.bodySha256) return reject('exact_reviewed_original_body_required');
  if (!observation.evidenceId || observation.originalFileSha256 !== p.ref.fileSha256 || observedAt !== p.ref.observedAt || observation.representation !== p.ref.representation) return reject('pinned_original_file_clock_representation_and_source_required');
  if (!metadata || metadata.url !== p.url || metadata.capturedAt !== observedAt || sha(redact(metadata.text || '')) !== p.ref.bodySha256) return reject('verified_original_wrapper_required');
  if (!fullTime(observedAt)) return reject('full_capture_utc_required');
  let identity;
  try {
    identity = documentFor(p.identityRef);
    if(p.identityBinding.kind === 'literal_url_mention') {
      const l=p.identityBinding.sourceLocator;
      if(identity.text.slice(l.start,l.end)!==p.identityBinding.quote || sha(p.identityBinding.quote)!==l.quoteSha256 || l.bodySha256!==p.identityRef.bodySha256 || p.identityBinding.quote!=='https://t.me/'+p.channel) return reject('pinned_official_literal_channel_reference_required');
      if(new URL(p.identityRef.url).origin!==new URL(p.currentOfficialUrlAtReview).origin) return reject('exact_current_origin_literal_binding_required');
    } else {
      const link=identity.links[p.identityLink.index];
      if(!link || link.url!=='https://t.me/'+p.channel || link.url!==p.identityLink.url || link.label!==p.identityLink.label || !identity.text.includes(link.label)) return reject('official_document_native_channel_link_required');
      if(new URL(p.identityRef.url).origin!==new URL(p.currentOfficialUrlAtReview).origin) return reject('exact_current_origin_binding_required');
    }
    const backDoc=p.channelBindingRef?documentFor(p.channelBindingRef):{text:body,links:metadata.links};
    if(!p.channelOfficialLink || !backDoc.links?.some(l=>l.url===p.channelOfficialLink.url && l.label===p.channelOfficialLink.label) || !backDoc.text.includes(p.channelOfficialLink.label)) return reject('channel_native_official_backlink_required');
    const back=new URL(p.channelOfficialLink.url), current=new URL(p.currentOfficialUrlAtReview);
    if(p.hostnameOnlyBinding ? back.hostname!==current.hostname : back.origin!==current.origin) return reject('exact_declared_current_host_required');
    if(p.channelBindingRef) {
      const bindingRaw=JSON.parse(fs.readFileSync(path.join(root,p.channelBindingRef.file)));
      const m=bindingRaw.timeMetadata[p.officialDeclaration.timeMetadataIndex];
      if(!m || m.permalink!==p.officialDeclaration.permalink || m.dateTime!==p.officialDeclaration.dateTime || m.text!==p.officialDeclaration.quote || !backDoc.text.includes(m.text)) return reject('same_native_domain_declaration_post_required');
    }
    if(p.officialDeclaration && !p.channelBindingRef) {
      const m=metadata.timeMetadata[p.officialDeclaration.timeMetadataIndex];
      if(!m || m.permalink!==p.officialDeclaration.permalink || m.dateTime!==p.officialDeclaration.dateTime || m.text!==p.officialDeclaration.quote || !body.includes(m.text)) return reject('same_native_domain_declaration_post_required');
    }
  } catch { return reject('hash_verified_identity_source_required'); }
  const selected = p.events.flatMap(e => [e, ...e.relatedStatements]);
  const selectedTimes = new Set();
  for (const item of selected) {
    const matches = metadata.timeMetadata?.filter(m => m.permalink === item.permalink) || [];
    const native = matches[0];
    if (matches.length !== 1 || metadata.timeMetadata[item.timeMetadataIndex] !== native || native.dateTime !== item.dateTime || !fullTime(native.dateTime) || Date.parse(native.dateTime) > Date.parse(observedAt)) return reject('unique_same_post_native_full_datetime_required');
    if (selectedTimes.has(native.dateTime)) return reject('selected_distinct_posts_must_not_borrow_timestamp');
    selectedTimes.add(native.dateTime);
    if (native.text !== item.quote || !body.includes(item.quote)) return reject('same_post_body_not_reply_text_required');
  }
  const facts = p.events.map(event => {
    const relatedStatements = event.relatedStatements.map(item => ({ postUrl: item.permalink, createdAt: item.dateTime, quote: item.quote, sourceLocator: locator(body, item.quote), dateEvidence: { kind: 'captured_telegram_time_attribute', value: item.dateTime, postUrl: item.permalink, sourceLocator: { kind: 'capture_metadata', path: 'timeMetadata', index: item.timeMetadataIndex, attribute: 'dateTime', fileSha256: p.ref.fileSha256 } } }));
    const fact = {
      id: 'fresh-gap-operator-status-' + recordId + '-' + p.channel + '-' + event.post,
      kind: event.kind, relation: 'direct_text_match', createdAt: event.dateTime, current: false,
      url: event.permalink, postUrl: event.permalink, sourceUrl: p.url, publisher: p.name + '（站方频道）',
      scope: event.scope, summary: event.summary, quote: event.quote, relatedStatements,
      sourceIds: [observation.evidenceId], observedAt, bodySha256: sha(body), sourceLocator: locator(body, event.quote), literalChecked: true,
      dateEvidence: { kind: 'captured_telegram_time_attribute', value: event.dateTime, postUrl: event.permalink, sourceLocator: { kind: 'capture_metadata', path: 'timeMetadata', index: event.timeMetadataIndex, attribute: 'dateTime', fileSha256: p.ref.fileSha256 } },
      identityQualification: p.identityQualification,
      identityBinding: structuredClone(p.identityBinding),
      nativeOfficialBacklink: { url: p.channelOfficialLink.url, label: p.channelOfficialLink.label, sourceLocator: { kind: 'capture_metadata_link', path: 'links', index: (p.channelBindingRef ? documentFor(p.channelBindingRef).links : metadata.links).findIndex(l => l.url === p.channelOfficialLink.url && l.label === p.channelOfficialLink.label), fileSha256: (p.channelBindingRef || p.ref).fileSha256 } },
      officialDomainDeclaration: p.officialDeclaration ? { postUrl: p.officialDeclaration.permalink, createdAt: p.officialDeclaration.dateTime, quote: p.officialDeclaration.quote, sourceLocator: locator(p.channelBindingRef ? documentFor(p.channelBindingRef).text : body, p.officialDeclaration.quote), dateEvidence: { kind: 'captured_telegram_time_attribute', value: p.officialDeclaration.dateTime, sourceLocator: { kind: 'capture_metadata', path: 'timeMetadata', index: p.officialDeclaration.timeMetadataIndex, attribute: 'dateTime', fileSha256: (p.channelBindingRef || p.ref).fileSha256 } } } : null,
      hostnameOnlyBinding: !!p.hostnameOnlyBinding, protocolDifference: p.hostnameOnlyBinding ? { registered: new URL(p.currentOfficialUrlAtReview).protocol, nativeBacklink: new URL(p.channelOfficialLink.url).protocol, inferredRedirect: false } : null,
      currentOfficialUrlAtReview: p.currentOfficialUrlAtReview,
      identityProofs: [p.ref, p.identityRef, ...(p.migrationRef ? [p.migrationRef] : []), ...(p.channelBindingRef ? [p.channelBindingRef] : [])].map(proof),
      identitySourceLocator: p.identityBinding.kind === 'literal_url_mention' ? structuredClone(p.identityBinding.sourceLocator) : { kind: 'capture_metadata_link', path: 'links', index: p.identityLink.index, href: p.identityLink.url, label: p.identityLink.label, fileSha256: p.identityRef.fileSha256 },
      independentMeasurement: false, measurementVerified: false, rawMeasurementLogsVerified: false, operatorIdentityVerified: false, continuousOperationVerified: false,
      durationMinutes: null, sampleCount: null, measurementWindow: null,
      canonicalSourceGroup: 'telegram:' + p.channel, dependencyGroup: 'operator_channel:' + p.channel,
      limitations: [
        '站方历史自述，Telegram帖子可编辑；原生发布时间不等于最后编辑时刻，未独立核实实际故障、法律主体或现时可用性。',
        '只保留原帖明确范围及后续处置或恢复文字；备用建议、升级完成、补偿天数不等于全站实际恢复或中断时长。',
        ...(p.additionalLimitations || []),
        '未取得连续探测、原始测量日志、受影响样本或实际起止时刻，不计算停服时长、可用率或长期稳定率。'
      ]
    };
    return { field: 'stability', collection: 'reviewedIssueSignals', fact };
  });
  return { accepted: true, reasons: [], facts };
}
function extract(observation, { recordId, prior = {} } = {}) {
  const result = diagnose(observation, { recordId });
  if (!result.accepted) return null;
  const old = (prior.coreInfo || prior).stability || {};
  const patch = { ...old, reviewedIssueSignals: [...(old.reviewedIssueSignals || [])] };
  let added = false;
  for (const { fact } of result.facts) {
    if (patch.reviewedIssueSignals.some(x => x.id === fact.id || x.postUrl === fact.postUrl && x.kind === fact.kind && x.quote === fact.quote)) continue;
    patch.reviewedIssueSignals.push(fact);
    patch.sourceIds = [...new Set([...(patch.sourceIds || []), ...fact.sourceIds])];
    added = true;
  }
  return added ? { stability: patch } : null;
}
module.exports = { profiles, forOrigin, sourceTargets, diagnose, extract, retainedSourceRefs: () => profiles.flatMap(p => [p.ref, p.identityRef, ...(p.migrationRef ? [p.migrationRef] : []), ...(p.channelBindingRef ? [p.channelBindingRef] : [])].map(ref => ({ recordId: p.recordId, ref: structuredClone(ref) }))) };
