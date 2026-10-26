'use strict';

// Offline, deterministic settlement. This checks the declared evidence contract;
// it cannot establish the truth of a URL, a timestamp or a person's independence.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SHA256 = /^[a-f0-9]{64}$/i;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const TARGET = 'NO_ADJUDICATED_MATERIAL_SERVICE_CESSATION_WITHIN_HORIZON';
const CORE_FIELDS = [
  'forecastId', 'recordId', 'version', 'status', 'issuedAt',
  'probabilityRecordedAt', 'horizonEnd', 'adjudicationNotBefore', 'target', 'outcomeDefinition',
  'modelerIds', 'pointProbability', 'probabilityInterval', 'sourceIds'
];

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  if (value === undefined) return 'null';
  return JSON.stringify(value);
}
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function forecastFingerprint(entry) {
  const core = Object.fromEntries(CORE_FIELDS.map(key => [key, entry[key] === undefined ? null : entry[key]]));
  return sha256(canonical(core));
}
function time(value) {
  if (typeof value !== 'string' || !ISO_TIME.test(value) || !Number.isFinite(Date.parse(value))) return null;
  const [year, month, day, hour, minute, second] = value.slice(0, 19).match(/\d+/g).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() || hour > 23 || minute > 59 || second > 59) return null;
  return Date.parse(value);
}
function nonempty(value) { return typeof value === 'string' && value.trim().length > 0; }
function idList(value) { return Array.isArray(value) && value.length > 0 && value.every(nonempty) && new Set(value.map(id => id.trim().toLowerCase())).size === value.length; }
function publicReference(value) {
  if (!nonempty(value)) return false;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}
function evidenceRecord(value, asOf) {
  return value && publicReference(value.url) && SHA256.test(value.sha256 || '') && time(value.observedAt) !== null && time(value.observedAt) <= asOf;
}
function collection(value, name) {
  const items = Array.isArray(value) ? value : value?.items;
  if (!Array.isArray(items)) throw new Error(name + ' must be an array or an object with items');
  return items;
}
function uniqueBy(items, field, name) {
  const map = new Map();
  for (const entry of items) {
    if (!entry || !nonempty(entry[field])) throw new Error(name + ' entry is missing ' + field);
    if (map.has(entry[field])) throw new Error('Duplicate ' + name + ' ' + entry[field] + '; append a version with a new forecastId instead');
    map.set(entry[field], entry);
  }
  return map;
}
function metrics(scored, binCount, minCalibrationBinSize) {
  const bins = Array.from({ length: binCount }, (_, index) => ({ lower: index / binCount, upper: (index + 1) / binCount, upperInclusive: index === binCount - 1, count: 0, sumProbability: 0, sumOutcome: 0, sumBrier: 0 }));
  for (const row of scored) {
    const bin = bins[Math.min(binCount - 1, Math.floor(row.pointProbability * binCount))];
    bin.count++; bin.sumProbability += row.pointProbability; bin.sumOutcome += row.outcome; bin.sumBrier += row.brierContribution;
  }
  return {
    count: scored.length,
    brier: scored.length ? scored.reduce((sum, row) => sum + row.brierContribution, 0) / scored.length : null,
    reliability: bins.map(bin => ({
      lower: bin.lower, upper: bin.upper, upperInclusive: bin.upperInclusive, count: bin.count,
      meanProbability: bin.count ? bin.sumProbability / bin.count : null,
      observedSurvivalRate: bin.count ? bin.sumOutcome / bin.count : null,
      brier: bin.count ? bin.sumBrier / bin.count : null,
      calibrationGap: bin.count ? bin.sumOutcome / bin.count - bin.sumProbability / bin.count : null,
      smallSample: bin.count < minCalibrationBinSize
    }))
  };
}

function settleLedger(ledger, adjudications, options = {}) {
  const asOf = time(options.asOf);
  if (asOf === null) throw new Error('asOf must be an explicit ISO timestamp with a timezone');
  const binCount = options.binCount ?? 10;
  const minCalibrationBinSize = options.minCalibrationBinSize ?? 30;
  if (!Number.isInteger(binCount) || binCount < 1 || binCount > 100) throw new Error('binCount must be an integer from 1 to 100');
  if (!Number.isInteger(minCalibrationBinSize) || minCalibrationBinSize < 1) throw new Error('minCalibrationBinSize must be a positive integer');
  const forecasts = collection(ledger, 'ledger');
  const forecastMap = uniqueBy(forecasts, 'forecastId', 'forecast');
  const outcomeMap = uniqueBy(collection(adjudications, 'adjudications'), 'forecastId', 'adjudication');
  for (const id of outcomeMap.keys()) if (!forecastMap.has(id)) throw new Error('Adjudication references unknown forecastId: ' + id);
  const rows = [];
  for (const entry of forecasts) {
    const row = { forecastId: entry.forecastId, recordId: entry.recordId ?? null, forecastSha256: forecastFingerprint(entry), state: null, scorable: false, pointProbability: null, outcome: null, brierContribution: null, reasons: [] };
    const outcome = outcomeMap.get(entry.forecastId);
    const abstain = typeof entry.status === 'string' && entry.status.toLowerCase() === 'abstain';
    if (abstain) {
      if (entry.pointProbability !== null && entry.pointProbability !== undefined) { row.state = 'INVALID_FORECAST'; row.reasons.push('ABSTAIN_HAS_NUMERIC_PROBABILITY'); }
      else { row.state = 'ABSTAIN'; row.reasons.push('NO_POINT_PROBABILITY_ISSUED'); if (outcome) row.reasons.push('ADJUDICATION_RETAINED_BUT_NOT_SCORED'); }
      rows.push(row); continue;
    }
    const invalid = [];
    if (entry.status !== 'issued') invalid.push('UNSUPPORTED_NUMERIC_FORECAST_STATUS');
    if (!nonempty(entry.recordId) || !Number.isInteger(entry.version) || entry.version < 1) invalid.push('MISSING_RECORD_ID_OR_VERSION');
    const p = entry.pointProbability;
    if (typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 1) invalid.push('MISSING_OR_INVALID_POINT_PROBABILITY_NO_INTERVAL_MIDPOINT_SUBSTITUTION');
    if (entry.probabilityInterval !== null && entry.probabilityInterval !== undefined) {
      const interval = entry.probabilityInterval;
      if (!Array.isArray(interval) || interval.length !== 2 || !interval.every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1) || interval[0] > interval[1] || p < interval[0] || p > interval[1]) invalid.push('INVALID_OR_CONFLICTING_PROBABILITY_INTERVAL');
    }
    const issued = time(entry.issuedAt), horizon = time(entry.horizonEnd), notBefore = time(entry.adjudicationNotBefore), probabilityRecorded = time(entry.probabilityRecordedAt);
    if (issued === null || horizon === null || notBefore === null || probabilityRecorded === null || !(issued < horizon && horizon <= notBefore && probabilityRecorded <= issued && issued <= asOf)) invalid.push('INVALID_FORECAST_TIMING');
    if (entry.target !== TARGET) invalid.push('UNSUPPORTED_OR_UNDEFINED_OUTCOME_TARGET');
    if (!nonempty(entry.outcomeDefinition)) invalid.push('MISSING_PRIOR_OPERATIONAL_OUTCOME_DEFINITION');
    if (!idList(entry.modelerIds)) invalid.push('MISSING_MODEL_PARTICIPANT_IDENTITIES');
    if (!idList(entry.sourceIds)) invalid.push('MISSING_PREDICTION_SOURCE_REFERENCES');
    const freeze = entry.freeze;
    if (!freeze || time(freeze.recordedAt) === null || time(freeze.recordedAt) > issued || freeze.forecastSha256 !== row.forecastSha256 || !evidenceRecord(freeze.evidence, issued)) invalid.push('MISSING_OR_MISMATCHED_PRIOR_FREEZE_RECEIPT');
    if (['outcome', 'result', 'resolvedAt', 'brierContribution'].some(key => entry[key] !== undefined && entry[key] !== null)) invalid.push('OUTCOME_CONTAMINATES_FROZEN_PREDICTION');
    if (invalid.length) { row.state = 'INVALID_FORECAST'; row.reasons = invalid; rows.push(row); continue; }
    row.pointProbability = p;
    if (asOf < notBefore) { row.state = 'NOT_DUE'; row.reasons.push('WAIT_UNTIL_DECLARED_ADJUDICATION_DATE'); rows.push(row); continue; }
    if (!outcome) { row.state = 'UNKNOWN_OUTCOME'; row.reasons.push('NO_ADJUDICATION_AVAILABLE'); rows.push(row); continue; }
    if (outcome.forecastSha256 !== row.forecastSha256) { row.state = 'INVALID_ADJUDICATION'; row.reasons.push('FORECAST_SNAPSHOT_HASH_MISMATCH'); rows.push(row); continue; }
    if (outcome.result === 'unknown' || outcome.result === 'lost_to_followup') {
      row.state = outcome.result === 'unknown' ? 'UNKNOWN_OUTCOME' : 'LOST_TO_FOLLOWUP';
      row.reasons.push('UNRESOLVED_RESULT_NOT_IMPUTED_AS_SURVIVAL_OR_FAILURE'); rows.push(row); continue;
    }
    const errors = [];
    if (!['survived', 'ceased'].includes(outcome.result)) errors.push('INVALID_BINARY_OUTCOME');
    const observed = time(outcome.observedAt), adjudicated = time(outcome.adjudicatedAt);
    if (observed === null || adjudicated === null || observed > adjudicated || adjudicated > asOf || adjudicated < notBefore) errors.push('INVALID_OR_PREMATURE_ADJUDICATION_TIME');
    const judge = outcome.adjudicator;
    const modelers = new Set(entry.modelerIds.map(id => id.trim().toLowerCase()));
    if (!judge || !nonempty(judge.id) || modelers.has(judge.id.trim().toLowerCase()) || judge.didNotParticipateInModeling !== true || judge.noDeclaredConflictOfInterest !== true) errors.push('INDEPENDENT_ADJUDICATOR_NOT_ESTABLISHED');
    if (!Array.isArray(outcome.evidence) || outcome.evidence.length === 0 || !outcome.evidence.every(item => evidenceRecord(item, adjudicated))) errors.push('MISSING_OR_INVALID_OUTCOME_EVIDENCE');
    else if (outcome.evidence.some(item => time(item.observedAt) > observed) || !outcome.evidence.some(item => time(item.observedAt) >= (outcome.result === 'survived' ? horizon : time(outcome.eventAt)))) errors.push('OUTCOME_EVIDENCE_DOES_NOT_REACH_REQUIRED_OBSERVATION_DATE');
    if (outcome.result === 'survived' && (time(outcome.coverageFrom) === null || time(outcome.coverageThrough) === null || time(outcome.coverageFrom) > issued || time(outcome.coverageThrough) < horizon || observed < horizon || time(outcome.coverageThrough) > observed)) errors.push('SURVIVAL_OBSERVATION_DOES_NOT_COVER_FORECAST_HORIZON');
    if (outcome.result === 'ceased' && (time(outcome.eventAt) === null || time(outcome.eventAt) < issued || time(outcome.eventAt) > horizon || time(outcome.eventAt) > observed)) errors.push('CESSATION_EVENT_OUTSIDE_FORECAST_WINDOW');
    if (errors.length) { row.state = 'INVALID_ADJUDICATION'; row.reasons = errors; rows.push(row); continue; }
    row.state = 'SCORED'; row.scorable = true; row.outcome = outcome.result === 'survived' ? 1 : 0;
    row.brierContribution = (p - row.outcome) ** 2;
    row.adjudicatorId = judge.id; row.adjudicatedAt = outcome.adjudicatedAt;
    row.target = entry.target; row.horizonSeconds = (horizon - issued) / 1000;
    row.outcomeEvidence = outcome.evidence.map(item => ({ url: item.url, sha256: item.sha256, observedAt: item.observedAt }));
    rows.push(row);
  }
  const scored = rows.filter(row => row.scorable);
  const cohorts = new Map();
  for (const row of scored) {
    const key = row.target + '|' + row.horizonSeconds;
    if (!cohorts.has(key)) cohorts.set(key, []);
    cohorts.get(key).push(row);
  }
  const counts = Object.fromEntries(['ABSTAIN', 'NOT_DUE', 'UNKNOWN_OUTCOME', 'LOST_TO_FOLLOWUP', 'INVALID_FORECAST', 'INVALID_ADJUDICATION', 'SCORED'].map(state => [state, rows.filter(row => row.state === state).length]));
  return {
    schemaVersion: 'airports-settlement-report.v1', asOf: new Date(asOf).toISOString(),
    ledgerSha256: sha256(canonical(ledger)), adjudicationsSha256: sha256(canonical(adjudications)),
    summary: { entries: rows.length, counts, ...metrics(scored, binCount, minCalibrationBinSize), cohortCount: cohorts.size, calibrationProven: false, evidenceTruthVerified: false, independenceVerifiedBeyondDeclarations: false },
    cohorts: [...cohorts.values()].map(group => ({ target: group[0].target, horizonSeconds: group[0].horizonSeconds, ...metrics(group, binCount, minCalibrationBinSize) })),
    policy: { binCount, minCalibrationBinSize, probabilityConvention: 'P(no adjudicated material service cessation within the declared horizon)', outcomeConvention: 'survived=1; ceased=0', independentAdjudicationRequired: true, intervalMidpointSubstitutionAllowed: false, unresolvedOutcomeImputationAllowed: false },
    limitations: [
      'Structural validation and arithmetic only; an independent human must check original snapshots, prior-publication evidence and adjudicator independence.',
      'Content hashes establish byte agreement, not a trusted timestamp, source truth or operator identity.',
      'Reliability bins are descriptive. The configurable minimum bin count is a warning rule, not a statistical proof of calibration; even larger samples may be biased or dependent.',
      'Overall scores may mix horizons; compare the separate target/horizon cohorts and report missing and abstained outcomes alongside the score.',
      'No input forecast is modified; corrections require a separately retained version and receipt.'
    ], rows
  };
}

function usage() {
  return 'Usage: node scripts/settle-ledger.cjs --ledger FILE --adjudications FILE --as-of ISO_TIME --output NEW_FILE [--bins 10] [--min-bin-count 30]\n' +
    'Inputs: public ledger object with items; separate adjudications object with items. Output must not exist. See examples/settlement.README.md.\n';
}
function main(argv) {
  if (argv.includes('--help')) { process.stdout.write(usage()); return; }
  const allowed = new Set(['--ledger', '--adjudications', '--as-of', '--output', '--bins', '--min-bin-count']);
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!allowed.has(argv[i]) || args[argv[i]] !== undefined || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('Invalid arguments. ' + usage());
    args[argv[i]] = argv[i + 1];
  }
  for (const key of ['--ledger', '--adjudications', '--as-of', '--output']) if (!args[key]) throw new Error('Missing ' + key + '. ' + usage());
  const ledgerPath = path.resolve(args['--ledger']), adjudicationsPath = path.resolve(args['--adjudications']), outputPath = path.resolve(args['--output']);
  if ([ledgerPath, adjudicationsPath].includes(outputPath)) throw new Error('Output cannot replace an input');
  const ledgerBytes = fs.readFileSync(ledgerPath), outcomeBytes = fs.readFileSync(adjudicationsPath);
  const parse = bytes => JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
  const report = settleLedger(parse(ledgerBytes), parse(outcomeBytes), { asOf: args['--as-of'], binCount: args['--bins'] === undefined ? undefined : Number(args['--bins']), minCalibrationBinSize: args['--min-bin-count'] === undefined ? undefined : Number(args['--min-bin-count']) });
  report.inputFiles = { ledgerSha256: sha256(ledgerBytes), adjudicationsSha256: sha256(outcomeBytes) };
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
  process.stdout.write(JSON.stringify({ status: 'COMPUTED_NOT_INDEPENDENTLY_VERIFIED', output: outputPath, entries: report.summary.entries, counts: report.summary.counts, brier: report.summary.brier, calibrationProven: false }) + '\n');
}

module.exports = { settleLedger, forecastFingerprint, canonical, TARGET };
if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
