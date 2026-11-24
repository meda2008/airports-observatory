'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { buildHistoricalEvidenceTimeline: build, makeHistoricalEvidenceTimeline, normalizeEvidenceDate: date } = require('../lib/historical-evidence-timeline.cjs');
const source = (id, extra = {}) => ({ source_id: id, url: `https://example.test/${id}`, last_capture_at: '2026-11-14T02:00:00Z', recordIds: ['A1'], ...extra });
const history = (extra = {}) => ({ id: 'event', kind: 'third_party_test_record_date', date: '2024-04-17', datePrecision: 'day', quote: 'SYNTHETIC original dated test', sourceIds: ['S1'], ...extra });
const record = fact => ({ id: 'A1', operatingHistory: { historyStatements: [fact] } });
function freeze(x) { if (x && typeof x === 'object') { Object.values(x).forEach(freeze); Object.freeze(x); } return x; }

test('calendar precision and local timezone remain literal; invalid dates never roll over', () => {
  for (const [value, precision] of [['2024', 'year'], ['2024-02', 'month'], ['2024-02-29', 'day'], ['2024-02-29T09:00', 'minute'], ['2024-02-29T09:00:00', 'second']]) {
    const d = date(value); assert.equal(d.status, 'known'); assert.equal(d.value, value); assert.equal(d.precision, precision); assert.equal(d.exactInstant, null);
  }
  assert.equal(date('2024-02-29T09:00:00').timeZone, 'unknown');
  assert.equal(date('2024-02-29T09:00:00+08:00').exactInstant, '2024-02-29T09:00:00+08:00');
  for (const value of ['2023-02-29', '2024-04-31', '2024-13', '2024-00-01', '2024-01-01T24:00:00Z', '2024-01-01T10:61:00Z', '2024-01-01T10:00:00+25:00', 'yesterday']) assert.equal(date(value).status, 'invalid', value);
  assert.equal(date('2024-02', { precision: 'day' }).reason, 'declared_precision_conflicts_with_literal');
});

test('test, publication, update and source capture dates retain distinct meanings', () => {
  const result = build({ id: 'A1', speed: { operatorMeasuredClaims: [{ id: 'operator', kind: 'operator_measured_throughput_self_report', publishedAt: '2026-11-10T17:08:04+00:00', testedAt: null, date: null, quote: 'SYNTHETIC attainable 550', sourceIds: ['S1'] }] }, operatingHistory: { historyStatements: [history({ kind: 'operator_announcement_date', dateEvidence: { kind: 'operator_document_last_updated', value: '2024-04-17' } })] } }, { sources: [source('S1')] });
  assert.equal(result.datedEntries[0].date.meaning, 'statement_publication');
  assert.equal(result.datedEntries[0].date.field, 'publishedAt');
  assert.equal(result.datedEntries[0].evidenceType, 'operator_statement');
  assert.equal(result.datedEntries[1].date.meaning, 'document_last_updated');
  assert(result.datedEntries.every(e => e.observations.some(o => o.value === '2026-11-14T02:00:00Z')));
});

test('undated or invalid evidence is retained without capture-date backfill', () => {
  const r = build({ id: 'A1', speed: { undatedImageReports: [{ id: 'image', kind: 'third_party_undated_download_image_table', date: null, observedAt: '2026-11-13T01:00:00Z', sourceIds: ['S1'] }] }, operatingHistory: { historyStatements: [history({ id: 'bad', date: '2025-02-30' })] } }, { sources: [source('S1')] });
  assert.equal(r.datedEntries.length, 0); assert.equal(r.undatedEntries.length, 2);
  assert.equal(r.undatedEntries.find(e => e.evidenceId === 'image').date.value, null);
  assert.equal(r.undatedEntries.find(e => e.evidenceId === 'bad').date.status, 'invalid');
});

test('explicit source publication may date a source, never a test or service start', () => {
  const r = build(record(history({ date: null, datePrecision: null })), { sources: [source('S1', { publishedAt: '2022-09' })] });
  assert.equal(r.datedEntries[0].date.meaning, 'source_publication'); assert.equal(r.datedEntries[0].date.value, '2022-09');
});

test('unresolved and current candidate identities survive a stronger supplied context', () => {
  const a = history({ id: 'candidate', currentCandidateOnly: true, legacyRecordIdentityVerified: false, currentOperatingServiceIdentityVerified: false, candidateServiceHostname: 'candidate.test' });
  const b = history({ id: 'unresolved', identityVerified: false });
  const r = build({ id: 'A1', operatingHistory: { historyStatements: [a, b] } }, { sources: [source('S1')], identity: { status: 'verified' } });
  assert.equal(r.datedEntries.find(e => e.evidenceId === 'candidate').identity.status, 'current_candidate_only');
  assert.equal(r.datedEntries.find(e => e.evidenceId === 'candidate').identity.qualifications.legacyRecordIdentityVerified, false);
  assert.equal(r.datedEntries.find(e => e.evidenceId === 'unresolved').identity.status, 'identity_unresolved');
});

test('record/source membership mismatch is explicit rather than cross-brand attribution', () => {
  const r = build(record(history()), { sources: [source('S1', { recordIds: ['OTHER'] })] });
  assert.equal(r.datedEntries[0].identity.status, 'record_mismatch');
});

test('native identity recaptures merge observations and sources, not event counts', () => {
  const a = history({ sourceUrl: 'https://example.test/post/1', observedAt: '2026-01-01T00:00:00Z', bodySha256: 'old' });
  const b = { ...a, sourceIds: ['S2'], observedAt: '2026-02-01T00:00:00Z', bodySha256: 'new' };
  const r = build({ id: 'A1', operatingHistory: { historyStatements: [a, b] } });
  assert.equal(r.datedEntries.length, 1); assert.deepEqual(r.datedEntries[0].sourceIds, ['S1', 'S2']);
  assert.deepEqual(r.datedEntries[0].bodySha256s, ['old', 'new']); assert.equal(r.datedEntries[0].observations.length, 2); assert.equal(r.datedEntries[0].occurrences.length, 2);
});

test('same native identity contradictory dates remain two entries and an unresolved conflict', () => {
  const a = history({ sourceUrl: 'https://example.test/post/1' }), b = { ...a, date: '2024-04-18' };
  const r = build({ id: 'A1', operatingHistory: { historyStatements: [a, b] } });
  assert.equal(r.datedEntries.length, 2); assert(r.conflicts.some(c => c.type === 'same_evidence_date_conflict'));
  assert(r.datedEntries.every(e => e.semanticDateConflict));
});

test('dateEvidence mismatch is a conflict, while test vs publication is not', () => {
  const r = build(record(history({ dateEvidence: { value: '2024-04-18' } })));
  assert(r.conflicts.some(c => c.type === 'date_assertions_conflict'));
  const compatible = build({ id: 'A1', speed: { verifiedReports: [{ id: 'test', testedAt: '2024-04-17', date: '2024-04-17T12:00:00Z', publishedAt: '2024-05-01', sourceIds: ['S1'] }] } });
  assert.equal(compatible.conflicts.length, 0);
});

test('conflicting source metadata and missing source references are retained honestly', () => {
  const r = build(record(history({ sourceIds: ['S1', 'MISSING'] })), { sources: [source('S1'), source('S1', { url: 'https://other.test/' })] });
  assert.equal(r.datedEntries[0].sourceStatus, 'partially_resolved'); assert.equal(r.datedEntries[0].sources.length, 2);
  assert(r.conflicts.some(c => c.type === 'source_metadata_conflict'));
  const missing = build(record(history({ sourceIds: [] }))); assert.equal(missing.datedEntries[0].sourceStatus, 'missing_source_reference');
});

test('operator statements never become independent measurements; explicit measurement flags are distinguished', () => {
  const r = build({ id: 'A1', stability: { operatorSlaClaims: [{ id: 'sla', kind: 'operator_sla_claim', date: '2024', sourceIds: ['S1'], independentMeasurement: true, measurementVerified: true }], measurements: [{ id: 'ind', date: '2025', sourceIds: ['S2'], independentMeasurement: true, measurementVerified: true }, { id: 'unverified', date: '2023', independentMeasurement: true, measurementVerified: false, sourceIds: ['S3'] }] } });
  assert.equal(r.datedEntries.find(e => e.evidenceId === 'sla').evidenceType, 'operator_statement');
  assert.equal(r.datedEntries.find(e => e.evidenceId === 'ind').evidenceType, 'independent_measurement');
  assert.equal(r.datedEntries.find(e => e.evidenceId === 'unverified').evidenceType, 'unclassified_statement');
});

test('legacy start claims, retained evidence and domain metadata never generate age or continuity', () => {
  const r = build({ id: 'A1', operatingHistory: { claimedFoundedAt: '2019', earliestRetainedOperationalEvidenceAt: '2023-07-05', claimType: 'operator_opening_claim', sourceIds: ['S1'], continuousOperationVerified: false, historyStatements: [history({ kind: 'domain_registration', date: '2010', datePrecision: 'year' })] } });
  assert.equal(r.datedEntries.length, 3);
  assert(r.datedEntries.some(e => e.date.meaning === 'claimed_operating_start'));
  assert(r.datedEntries.some(e => e.date.meaning === 'retained_evidence_date_not_operating_start'));
  assert(r.datedEntries.some(e => e.date.meaning === 'domain_metadata_not_operating_start'));
  for (const key of ['score', 'yearsSinceStart', 'continuousOperationVerified', 'foundedAt', 'startDate']) assert.equal(r[key], undefined);
});

test('report events inherit only enclosing source references; reply statements do not add events', () => {
  const r = build({ id: 'A1', stability: { thirdPartyStatusReports: [{ id: 'group', kind: 'historical_third_party_service_status_claim', sourceIds: ['S1'], sourceUrl: 'https://example.test/report', canonicalSourceGroup: 'same-page', dependencyGroup: 'same-publisher', events: [{ id: 'korea', date: '2026-02-05', summary: 'SYNTHETIC Korea only problem' }], relatedStatements: [{ quote: 'SYNTHETIC recovery clue', date: '2026-02-06' }] }] } });
  assert.equal(r.datedEntries.length, 1); assert.equal(r.undatedEntries.length, 1);
  assert.deepEqual(r.datedEntries[0].sourceIds, ['S1']); assert.equal(r.datedEntries[0].date.meaning, 'reported_service_event_date');
  assert.equal(r.sourceGroups.length, 1); assert.equal(r.sourceGroups[0].independentSourceCount, null);
});

test('decorated, wrapped and immutable inputs have a deterministic pure result', () => {
  const fact = history({ sourceUrl: 'https://example.test/post/1' });
  const input = freeze({ id: 'A1', document: { operatingHistory: { historyStatements: [fact] } }, coreSupplement: { operatingHistory: { historyStatements: [fact] } } });
  const options = freeze({ sources: [source('S1')] });
  const before = JSON.stringify(input), a = build(input, options), b = makeHistoricalEvidenceTimeline(input, options);
  assert.deepEqual(a, b); assert.equal(a.datedEntries.length, 1); assert.equal(a.datedEntries[0].occurrences.length, 2); assert.equal(JSON.stringify(input), before);
  a.datedEntries[0].identity.declaredRecordIds.push('MUTATION'); assert.deepEqual(build(input, options), b);
  assert.throws(() => build(null), TypeError); assert.throws(() => build({}, { sources: {} }), TypeError);
});

test('a child event cannot upgrade an unresolved enclosing report identity', () => {
  const r = build({ id: 'A1', stability: { thirdPartyStatusReports: [{ id: 'candidate', currentCandidateOnly: true, currentOperatingServiceIdentityVerified: false, sourceIds: ['S1'], events: [{ id: 'child', date: '2026-01-01', identityVerified: true }] }] } });
  const event = r.datedEntries[0]; assert.equal(event.identity.status, 'current_candidate_only');
  assert.equal(event.identity.qualifications.identityVerified, true);
  assert.equal(event.identity.parent.qualifications.currentOperatingServiceIdentityVerified, false);
});

test('publication evidence does not contradict a distinct test clock; changed evidence conflicts are not deduplicated away', () => {
  const r = build({ id: 'A1', speed: { verifiedReports: [{ id: 'two-clocks', testedAt: '2024-03-01', publishedAt: '2024-03-04', dateEvidence: { kind: 'native_post_publication', value: '2024-03-04' }, sourceIds: ['S1'] }] } });
  assert.equal(r.conflicts.length, 0);
  const a = history({ dateEvidence: { value: '2024-04-17' } }), b = { ...a, dateEvidence: { value: '2024-04-19' } };
  const changed = build({ id: 'A1', operatingHistory: { historyStatements: [a, b] } });
  assert.equal(changed.datedEntries.length, 2);
  assert(changed.conflicts.some(c => c.type === 'date_assertions_conflict'));
});

test('structured explicit conflicts, local reported context and current website limitation survive projection', () => {
  const r = build({ ...record(history({ metadataConflicts: { captionDate: '2024-04-18', footerDate: '2024-04-17' }, conflictsResolved: false, reportedLocalTime: '09:00', reportedTimeZone: null, timeZoneOffset: null })), website: { url: 'https://candidate.test/', status: 'brand_name_conflict', operatorIdentityVerified: false } });
  assert.equal(r.datedEntries[0].identity.suppliedContext.status, 'brand_name_conflict');
  assert.deepEqual(r.datedEntries[0].explicitConflicts[0].details, { captionDate: '2024-04-18', footerDate: '2024-04-17' });
  assert.equal(r.datedEntries[0].reportedDateContext.reportedLocalTime, '09:00');
  assert.equal(r.datedEntries[0].reportedDateContext.reportedTimeZone, null);
  assert(r.conflicts.some(c => c.type === 'retained_explicit_conflict'));
});

test('two recovery statements on one report page are not a same-event date conflict', () => {
  const r = build({ id: 'A1', stability: { thirdPartyStatusReports: [{ id: 'report', kind: 'historical_third_party_service_status_claim', sourceIds: ['S1'], sourceUrl: 'https://example.test/report', canonicalSourceGroup: 'same-report', events: [{ kind: 'reported_recovery', date: '2025-12-28', quote: 'SYNTHETIC first recovery' }, { kind: 'reported_recovery', date: '2025-12-31', quote: 'SYNTHETIC later repair' }] }] } });
  assert.equal(r.datedEntries.length, 2); assert.equal(r.conflicts.length, 0);
  assert.equal(r.sourceGroups.length, 1); assert.equal(r.sourceGroups[0].independentSourceCount, null);
});
