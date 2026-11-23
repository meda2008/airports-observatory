'use strict';

/*
 * Pure evidence organizer, not an admission gate or an operating-age calculator.
 * buildHistoricalEvidenceTimeline(record, { sources, identity }) accepts an
 * existing document, { id, document }, or a core-info decorated catalog record.
 * No I/O, clock, registry/parser imports, inferred aliases, scores or continuity.
 * Dates sort by their printed calendar values, not invented UTC instants. A
 * publication, document update and captured observation remain different roles.
 */
const { createHash } = require('node:crypto');
const obj = x => x && typeof x === 'object' && !Array.isArray(x) ? x : {};
const arr = x => Array.isArray(x) ? x : [];
const text = x => typeof x === 'string' && x.trim() ? x.trim() : null;
const unique = xs => [...new Set(xs.filter(x => x !== null && x !== undefined))];
const refs = x => unique([...arr(x.sourceIds), x.sourceId].map(text).filter(Boolean));
const clone = x => x === undefined ? null : JSON.parse(JSON.stringify(x));
const stable = x => Array.isArray(x) ? x.map(stable) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, stable(x[k])])) : x;
const signature = x => JSON.stringify(stable(x));
const hash = x => createHash('sha256').update(signature(x)).digest('hex').slice(0, 24);

function normalizeEvidenceDate(value, { precision = null, meaning = 'unspecified', field = null } = {}) {
  const raw = typeof value === 'number' && Number.isInteger(value) ? String(value) : text(value);
  const result = { value: raw, precision: null, statedPrecision: text(precision), meaning, field, status: 'unknown', reason: 'not_stated', timeZone: null, exactInstant: null };
  if (!raw) return result;
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})?)?)?)?$/.exec(raw);
  if (!match || Number(match[1]) < 1) return { ...result, status: 'invalid', reason: 'unsupported_date_literal' };
  const [, y, m, d, hour, minute, second, fraction, zone] = match;
  const year = Number(y), month = Number(m), day = Number(d);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  if (m && (month < 1 || month > 12) || d && (day < 1 || day > [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])) return { ...result, status: 'invalid', reason: 'invalid_calendar_date' };
  if (hour && (Number(hour) > 23 || Number(minute) > 59 || second && Number(second) > 59)) return { ...result, status: 'invalid', reason: 'invalid_time_of_day' };
  if (zone && zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4, 6)) > 59)) return { ...result, status: 'invalid', reason: 'invalid_time_zone_offset' };
  const actual = hour ? fraction ? 'fractional_second' : second ? 'second' : 'minute' : d ? 'day' : m ? 'month' : 'year';
  if (precision && precision !== actual && !(precision === 'second' && actual === 'fractional_second')) return { ...result, precision: actual, status: 'invalid', reason: 'declared_precision_conflicts_with_literal' };
  return { ...result, precision: actual, status: 'known', reason: null, timeZone: hour ? zone || 'unknown' : null, exactInstant: zone ? raw : null };
}

const COLLECTIONS = {
  operatingHistory: ['historyStatements', 'historicalClaims', 'events'],
  speed: ['verifiedReports', 'externalReports', 'historicalClaims', 'imageReports', 'undatedImageReports', 'videoReports', 'playbackVideoReports', 'speedTestReports', 'operatorTestReports', 'operatorMeasuredClaims', 'reportedNodeRanges', 'publisherPerformanceSnapshots', 'measurements'],
  stability: ['reviewedIssueSignals', 'recentIssues', 'recoveryClues', 'identityUnresolvedReports', 'linkedChannelReports', 'operatorReports', 'operatorStatusReports', 'thirdPartyStatusReports', 'thirdPartyMonitorReports', 'operatorSlaClaims', 'measurements']
};
const FLAGS = ['identityVerified', 'operatorIdentityVerified', 'currentOperatingServiceIdentityVerified', 'currentHistoricalIdentityVerified', 'historicalIdentityVerified', 'legacyRecordIdentityVerified', 'legacyIdentityVerified', 'legacyContinuityVerified', 'legalEntityContinuityVerified', 'continuousOperationVerified', 'currentEntryContinuityVerified'];

function identityFor(fact, context, sourceRows, recordId) {
  const qualifications = Object.fromEntries(FLAGS.filter(k => typeof fact[k] === 'boolean').map(k => [k, fact[k]]));
  const declaredIds = unique([...arr(fact.recordIds), ...sourceRows.flatMap(s => arr(s.recordIds))].map(text).filter(Boolean));
  const unresolved = fact.identityVerified === false || fact.currentOperatingServiceIdentityVerified === false || /unresolved|unverified|unclosed|归属未核/i.test([fact.bindingStatus, fact.identityMode, fact.identityQualification, fact.kind].filter(Boolean).join(' '));
  const mismatch = recordId && declaredIds.length && !declaredIds.includes(recordId);
  const candidate = fact.currentCandidateOnly === true || fact.currentOperatingServiceCandidateOnly === true;
  const historicalUnverified = fact.currentHistoricalIdentityVerified === false || fact.historicalIdentityVerified === false || fact.legacyRecordIdentityVerified === false || fact.legacyContinuityVerified === false;
  return {
    status: mismatch ? 'record_mismatch' : candidate ? 'current_candidate_only' : unresolved ? 'identity_unresolved' : historicalUnverified ? 'historical_identity_unverified' : fact.identityVerified === true || fact.currentOperatingServiceIdentityVerified === true ? 'explicit_identity_assertion' : 'not_confirmed',
    recordId, declaredRecordIds: declaredIds, currentCandidateOnly: candidate,
    qualification: text(fact.identityQualification), bindingStatus: text(fact.bindingStatus),
    candidateServiceName: text(fact.candidateServiceName), candidateServiceHostname: text(fact.candidateServiceHostname),
    currentOfficialHostname: text(fact.currentOfficialHostname), qualifications,
    suppliedContext: clone(context), verificationBasis: 'existing_input_only_not_reverified'
  };
}

function originType(fact, section, collection) {
  const kind = text(fact.kind) || '';
  if (/operator|sla|policy/i.test(kind) || ['operatorReports', 'operatorTestReports', 'operatorMeasuredClaims', 'operatorSlaClaims', 'operatorStatusReports'].includes(collection)) return 'operator_statement';
  if (fact.independentMeasurement === true && fact.measurementVerified === true) return 'independent_measurement';
  if (kind === 'problem_feedback' || /feedback|complaint/.test(kind)) return 'user_feedback';
  if (/third_party|publisher|youtube/.test(kind) || section === 'speed' && collection !== 'measurements' || ['thirdPartyStatusReports', 'thirdPartyMonitorReports'].includes(collection)) return 'third_party_report';
  return 'unclassified_statement';
}

function meaningFor(fact, section, field) {
  if (field === 'publishedAt' || field === 'publisherDate' || field === 'createdAt') return 'statement_publication';
  if (field === 'dataDate') return 'reported_snapshot_date';
  if (field === 'windowEnd') return 'measurement_window_end';
  if (field === 'claimedFoundedAt' || field === 'startYear' || field === 'startedAt' || field === 'startDate') return 'claimed_operating_start';
  if (/earliest/.test(field)) return 'retained_evidence_date_not_operating_start';
  if (fact.dateEvidence?.kind === 'operator_document_last_updated') return 'document_last_updated';
  if (/domain|rdap|whois|certificate/.test([fact.kind, fact.claimType].join(' '))) return 'domain_metadata_not_operating_start';
  if (field === 'testedAt' || section === 'speed' && field === 'date' || /test_record|test_statement/.test(fact.kind || '')) return 'reported_test_date';
  if (/opening|operating_since|founded/.test(fact.kind || '')) return 'claimed_operating_start';
  if (section === 'stability') return 'reported_service_event_date';
  return 'historical_statement_date';
}

function datesFor(fact, section, sourceRows) {
  const fields = section === 'speed' ? ['testedAt', 'date', 'dataDate', 'publisherSessionDate', 'publishedAt', 'publisherDate'] : section === 'stability' ? ['createdAt', 'date', 'publishedAt', 'dataDate'] : ['date', 'testedAt', 'publishedAt', 'createdAt', 'claimedFoundedAt', 'startedAt', 'startDate', 'startYear', 'earliestRetainedOperationalEvidenceAt', 'earliestEvidenceAt'];
  const dates = [];
  for (const field of fields) if (fact[field] !== null && fact[field] !== undefined && fact[field] !== '') {
    const precision = field === 'testedAt' ? fact.testedAtPrecision : field === 'createdAt' ? fact.createdAtPrecision : field === 'date' ? fact.datePrecision : field === 'dataDate' ? fact.dataDatePrecision : null;
    dates.push(normalizeEvidenceDate(fact[field], { precision, meaning: meaningFor(fact, section, field), field }));
  }
  if (!dates.length && fact.windowEnd) dates.push(normalizeEvidenceDate(fact.windowEnd, { meaning: 'measurement_window_end', field: 'windowEnd' }));
  if (!dates.length) for (const source of sourceRows) if (source.publishedAt) dates.push({ ...normalizeEvidenceDate(source.publishedAt, { meaning: 'source_publication', field: 'source.publishedAt' }), sourceId: text(source.sourceId || source.source_id || source.id) });
  return dates;
}

function compatibleDates(a, b) {
  if (a.status !== 'known' || b.status !== 'known') return true;
  if (a.exactInstant && b.exactInstant) {
    const fraction = value => (/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/.exec(value)?.[1] || '').padEnd(9, '0');
    return Date.parse(a.exactInstant) === Date.parse(b.exactInstant) && fraction(a.value) === fraction(b.value);
  }
  const n = Math.min(a.value.length, b.value.length, 10);
  return a.value.slice(0, n) === b.value.slice(0, n);
}

function buildHistoricalEvidenceTimeline(record, { sources = [], identity = null } = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new TypeError('A document or catalog record is required');
  if (!Array.isArray(sources)) throw new TypeError('sources must be an array of existing source metadata');
  const document = Object.keys(obj(record.document)).length ? record.document : record;
  const recordId = text(record.id || document.id || record.recordId || document.recordId);
  const website = obj(document.website || record.coreSupplement?.website);
  const identityContext = identity || (Object.keys(website).length ? { status: text(website.status), relationship: text(website.relationship), url: text(website.url), operatorIdentityVerified: typeof website.operatorIdentityVerified === 'boolean' ? website.operatorIdentityVerified : null, sourceIds: refs(website), basis: 'record_website_metadata_not_evidence_identity' } : null);
  const sourceIndex = new Map(), conflicts = [], entries = [], copies = new Map();
  for (const row of sources.map(obj)) {
    const id = text(row.sourceId || row.source_id || row.id);
    if (id) sourceIndex.set(id, [...(sourceIndex.get(id) || []), row]);
  }
  for (const [id, rows] of sourceIndex) if (new Set(rows.map(s => signature([s.url || null, s.sha256 || s.bodySha256 || null]))).size > 1) conflicts.push({ type: 'source_metadata_conflict', sourceId: id, alternatives: rows.map(s => ({ url: text(s.url), bodySha256: text(s.bodySha256 || s.sha256) })) });
  function add(factInput, section, collection, inputPath, inherited = null) {
    const fact = obj(factInput); if (!Object.keys(fact).length) return;
    const sourceIds = refs(fact).length ? refs(fact) : refs(obj(inherited));
    const sourceRows = sourceIds.flatMap(id => sourceIndex.get(id) || []);
    const attribution = identityFor(fact, identityContext, sourceRows, recordId), dates = datesFor(fact, section, sourceRows);
    if (inherited) {
      attribution.parent = identityFor(inherited, identityContext, sourceRows, recordId);
      const restrictions = ['record_mismatch', 'current_candidate_only', 'identity_unresolved', 'historical_identity_unverified'];
      const parentRank = restrictions.indexOf(attribution.parent.status), ownRank = restrictions.indexOf(attribution.status);
      if (parentRank >= 0 && (ownRank < 0 || parentRank < ownRank)) attribution.status = attribution.parent.status;
      attribution.currentCandidateOnly ||= attribution.parent.currentCandidateOnly;
    }
    const primary = dates[0] || normalizeEvidenceDate(null);
    const sourceUrl = text(fact.sourceUrl || fact.postUrl || fact.url || inherited?.sourceUrl);
    const evidenceId = text(fact.id), quote = text(fact.quote || fact.summary || fact.claimText || fact.publicShortExcerpt);
    const observations = unique([fact.observedAt, fact.sourceOriginalObservedAt, ...sourceRows.flatMap(s => [s.observedAt, s.capturedAt, s.last_capture_at])].map(text).filter(Boolean)).map(value => ({ value, meaning: 'capture_observation_not_event_date' }));
    const value = {
      id: '', evidenceId, section, collection, kind: text(fact.kind || fact.claimType) || 'unspecified',
      evidenceType: originType(fact, section, collection), date: primary, dates, identity: attribution,
      quote, publisher: text(fact.publisher), sourceUrl, nativeStatementUrl: text(fact.postUrl || fact.permalink), sourceIds,
      sourceStatus: !sourceIds.length ? sourceUrl ? 'url_only_reference' : 'missing_source_reference' : sourceRows.length === 0 ? 'referenced_without_metadata' : sourceIds.some(id => !sourceIndex.has(id)) ? 'partially_resolved' : 'resolved',
      sources: sourceRows.map(s => ({ id: text(s.sourceId || s.source_id || s.id), url: text(s.url), sourceType: text(s.sourceType || s.source_type), authenticationObserved: typeof s.authenticationObserved === 'boolean' ? s.authenticationObserved : null, recordIds: unique(arr(s.recordIds).map(text).filter(Boolean)), dependencyGroup: text(s.dependencyGroup || s.dependency_group) })),
      canonicalSourceGroup: text(fact.canonicalSourceGroup || fact.sourceGroup), dependencyGroup: text(fact.dependencyGroup || fact.dependency_group),
      observations, bodySha256s: unique([text(fact.bodySha256)]).filter(Boolean), occurrences: [inputPath],
      qualifications: Object.fromEntries(['literalChecked', 'independentMeasurement', 'measurementVerified', 'current', 'currentSpeedVerified', 'rawMeasurementLogsVerified'].filter(k => typeof fact[k] === 'boolean').map(k => [k, fact[k]])),
      limitations: arr(fact.limitations).map(text).filter(Boolean),
      explicitConflicts: ['metadataConflicts', 'dateConflicts', 'conflicts'].filter(k => Array.isArray(fact[k]) ? fact[k].length : Object.keys(obj(fact[k])).length).map(k => ({ field: k, details: clone(fact[k]) })),
      conflictAssertions: { dateConflict: typeof fact.dateConflict === 'boolean' ? fact.dateConflict : null, conflictsResolved: typeof fact.conflictsResolved === 'boolean' ? fact.conflictsResolved : null },
      reportedDateContext: Object.fromEntries(['reportedLocalTime', 'reportedTimeZone', 'timeZoneOffset', 'exactPublicationInstant', 'reportedDateTime'].filter(k => Object.hasOwn(fact, k)).map(k => [k, clone(fact[k])])),
      relatedStatements: clone(arr(fact.relatedStatements)), counterevidence: clone(arr(fact.counterevidence)),
      dateEvidence: clone(fact.dateEvidence), semanticDateConflict: false
    };
    const key = evidenceId || text(fact.postUrl) ? signature([evidenceId, fact.postUrl || sourceUrl, value.kind, quote, dates, attribution, value.qualifications, value.canonicalSourceGroup, value.dependencyGroup, value.dateEvidence, value.explicitConflicts, value.conflictAssertions, value.reportedDateContext, value.relatedStatements, value.counterevidence]) : null;
    if (key && copies.has(key)) {
      const existing = copies.get(key); existing.sourceIds = unique([...existing.sourceIds, ...sourceIds]);
      existing.observations = unique([...existing.observations, ...observations].map(signature)).map(JSON.parse);
      existing.bodySha256s = unique([...existing.bodySha256s, ...value.bodySha256s]); existing.occurrences.push(inputPath);
      existing.sources = unique([...existing.sources, ...value.sources].map(signature)).map(JSON.parse);
      existing.limitations = unique([...existing.limitations, ...value.limitations]); return;
    }
    value.id = 'history-evidence-' + hash(key || [inputPath, quote, dates]);
    entries.push(value); if (key) copies.set(key, value);
    const aliases = dates.filter(d => d.meaning === primary.meaning && d.field !== primary.field);
    const evidenceDate = fact.dateEvidence?.value ? normalizeEvidenceDate(fact.dateEvidence.value) : null;
    const evidenceKind = text(fact.dateEvidence?.kind) || '';
    const evidenceRole = /publication|comment.*date|created_at/.test(evidenceKind) ? 'statement_publication' : /document_last_updated/.test(evidenceKind) ? 'document_last_updated' : /test|test_window/.test(evidenceKind) ? 'reported_test_date' : primary.meaning;
    const evidenceTarget = dates.find(d => d.meaning === evidenceRole);
    if (aliases.some(d => !compatibleDates(primary, d)) || evidenceDate && evidenceTarget && !compatibleDates(evidenceTarget, evidenceDate)) {
      value.semanticDateConflict = true;
      conflicts.push({ type: 'date_assertions_conflict', entryIds: [value.id], dates: clone(dates), dateEvidence: clone(fact.dateEvidence) });
    }
    if (Array.isArray(value.explicitConflicts) && value.explicitConflicts.length || fact.dateConflict === true || fact.conflictsResolved === false) conflicts.push({ type: 'retained_explicit_conflict', entryIds: [value.id], details: clone(value.explicitConflicts), resolved: fact.conflictsResolved === true });
  }
  const layers = [['document', document], ['coreSupplement', obj(record.coreSupplement)]];
  // A decorated catalog's current evidence is included only where it actually
  // carries these named sections; general collection/search metadata is ignored.
  if (Object.keys(obj(record.currentEvidence)).length) layers.push(['currentEvidence', record.currentEvidence]);
  for (const [layerName, layer] of layers) for (const [section, collections] of Object.entries(COLLECTIONS)) {
    const container = obj(layer[section]);
    for (const collection of collections) arr(container[collection]).forEach((fact, n) => {
      const inputPath = `${layerName}.${section}.${collection}[${n}]`;
      add(fact, section, collection, inputPath);
      // Events are already scoped by their enclosing report; reply/comment
      // relatedStatements are deliberately not counted as separate evidence.
      if (collection === 'thirdPartyStatusReports') arr(fact.events).forEach((event, k) => add({ ...event, kind: event.kind || fact.kind, identityQualification: event.identityQualification || fact.identityQualification, canonicalSourceGroup: event.canonicalSourceGroup || fact.canonicalSourceGroup, dependencyGroup: event.dependencyGroup || fact.dependencyGroup }, section, 'reportedEvents', `${inputPath}.events[${k}]`, fact));
    });
    arr(obj(container.measured).observations).forEach((fact, n) => add(fact, section, 'measurements', `${layerName}.${section}.measured.observations[${n}]`));
    if (section === 'operatingHistory') {
      const historyFields = ['claimedFoundedAt', 'startedAt', 'startDate', 'startYear', 'earliestRetainedOperationalEvidenceAt', 'earliestEvidenceAt'];
      for (const field of historyFields) if (container[field] !== undefined && container[field] !== null) {
        const copy = { ...container }; for (const key of historyFields) delete copy[key];
        add({ ...copy, [field]: container[field], kind: text(container.claimType) || field }, section, 'legacyHistoryFields', `${layerName}.${section}.${field}`);
      }
    }
  }
  const grouped = new Map();
  for (const entry of entries) {
    // A report/page source group can contain several real events. It is not a
    // native statement identity and cannot turn their different dates into a
    // contradiction. Only an explicit evidence ID or native post is comparable.
    const key = entry.evidenceId || entry.nativeStatementUrl ? signature([entry.evidenceId || entry.nativeStatementUrl, entry.kind, entry.identity, entry.canonicalSourceGroup]) : null;
    if (key) grouped.set(key, [...(grouped.get(key) || []), entry]);
  }
  for (const group of grouped.values()) if (group.some(a => group.some(b => a !== b && a.date.meaning === b.date.meaning && !compatibleDates(a.date, b.date)))) {
    group.forEach(e => { e.semanticDateConflict = true; });
    conflicts.push({ type: 'same_evidence_date_conflict', entryIds: group.map(e => e.id), dates: group.map(e => clone(e.date)) });
  }
  const datedEntries = entries.filter(e => e.date.status === 'known').sort((a, b) => b.date.value.slice(0, 10).localeCompare(a.date.value.slice(0, 10)) || a.id.localeCompare(b.id));
  const undatedEntries = entries.filter(e => e.date.status !== 'known');
  const sourceGroups = new Map();
  for (const entry of entries) {
    const key = entry.dependencyGroup || entry.canonicalSourceGroup;
    if (key) sourceGroups.set(key, unique([...(sourceGroups.get(key) || []), entry.id]));
  }
  return { schemaVersion: 1, recordId, ordering: 'descending_printed_calendar_date_not_inferred_instant_order', datedEntries, undatedEntries, conflicts,
    sourceGroups: [...sourceGroups].map(([key, entryIds]) => ({ key, entryIds, independentSourceCount: null })),
    scope: 'Existing evidence organization only; identity assertions, source authenticity and measurement qualification are not reverified. No founded date, operating age, continuous operation, score or independent source count is inferred.' };
}

module.exports = { buildHistoricalEvidenceTimeline, makeHistoricalEvidenceTimeline: buildHistoricalEvidenceTimeline, normalizeEvidenceDate };
