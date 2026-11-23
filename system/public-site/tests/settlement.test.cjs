'use strict';

// All invented probabilities, dates, URLs, identities and outcomes in the
// factories below are SYNTHETIC test fixtures, never observations of a service.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { settleLedger, forecastFingerprint, TARGET } = require('../scripts/settle-ledger.cjs');

const AS_OF = '2026-04-12T00:00:00Z';
const HASH = 'a'.repeat(64);
function syntheticForecast(overrides = {}) {
  const entry = {
    forecastId: 'SYNTHETIC-F1', recordId: 'SYNTHETIC-R1', version: 1,
    status: 'issued', issuedAt: '2026-01-01T00:00:00Z', probabilityRecordedAt: '2026-01-01T00:00:00Z',
    horizonEnd: '2026-04-01T00:00:00Z', adjudicationNotBefore: '2026-04-08T00:00:00Z',
    target: TARGET, outcomeDefinition: 'SYNTHETIC ONLY: all declared core routes unavailable for at least 72 consecutive hours during the window; recovery later does not erase that event.', modelerIds: ['SYNTHETIC-MODELER'], pointProbability: 0.7,
    probabilityInterval: [0.6, 0.8], sourceIds: ['SYNTHETIC-SOURCE'], outcome: null,
    ...overrides
  };
  entry.freeze = { recordedAt: entry.issuedAt, forecastSha256: forecastFingerprint(entry), evidence: { url: 'https://synthetic.invalid/frozen-forecast', sha256: HASH, observedAt: entry.issuedAt } };
  return entry;
}
function syntheticOutcome(forecast, overrides = {}) {
  return {
    forecastId: forecast.forecastId, forecastSha256: forecastFingerprint(forecast), result: 'survived',
    observedAt: '2026-04-09T00:00:00Z', adjudicatedAt: '2026-04-10T00:00:00Z',
    coverageFrom: '2026-01-01T00:00:00Z', coverageThrough: '2026-04-01T00:00:00Z',
    adjudicator: { id: 'SYNTHETIC-INDEPENDENT-ADJUDICATOR', didNotParticipateInModeling: true, noDeclaredConflictOfInterest: true },
    evidence: [{ url: 'https://synthetic.invalid/observed-outcome', sha256: HASH, observedAt: '2026-04-09T00:00:00Z' }],
    ...overrides
  };
}
const run = (forecasts, outcomes = [], options = {}) => settleLedger({ items: forecasts }, { items: outcomes }, { asOf: AS_OF, ...options });

test('real public snapshot: 245 abstentions remain unscored with no invented outcomes', () => {
  const ledger = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/public-ledger.json'), 'utf8'));
  const before = JSON.stringify(ledger);
  const report = settleLedger(ledger, { items: [] }, { asOf: '2026-10-26T00:00:00Z' });
  assert.equal(report.summary.entries, 245);
  assert.equal(report.summary.counts.ABSTAIN, 245);
  assert.equal(report.summary.count, 0);
  assert.equal(report.summary.brier, null);
  assert.ok(report.summary.reliability.every(bin => bin.count === 0 && bin.observedSurvivalRate === null));
  assert.equal(report.summary.calibrationProven, false);
  assert.equal(JSON.stringify(ledger), before);
});

test('synthetic: independent mature outcomes yield Brier and reliability counts without changing inputs', () => {
  const a = syntheticForecast();
  const b = syntheticForecast({ forecastId: 'SYNTHETIC-F2', pointProbability: 0.2, probabilityInterval: [0.1, 0.3] });
  const outcomes = [syntheticOutcome(a), syntheticOutcome(b, { result: 'ceased', eventAt: '2026-02-01T00:00:00Z' })];
  const before = JSON.stringify([a, b, outcomes]);
  const report = run([a, b], outcomes);
  assert.equal(report.summary.counts.SCORED, 2);
  assert.ok(Math.abs(report.summary.brier - 0.065) < 1e-12);
  const bin = report.summary.reliability.find(row => row.lower === 0.7);
  assert.equal(bin.count, 1);
  assert.equal(bin.meanProbability, 0.7);
  assert.equal(bin.observedSurvivalRate, 1);
  assert.equal(bin.smallSample, true);
  assert.equal(report.summary.calibrationProven, false);
  assert.equal(report.summary.independenceVerifiedBeyondDeclarations, false);
  assert.equal(JSON.stringify([a, b, outcomes]), before);
});

test('synthetic: point probability cannot be filled by interval midpoint', () => {
  const forecast = syntheticForecast({ pointProbability: null });
  const report = run([forecast], [syntheticOutcome(forecast)]);
  assert.equal(report.rows[0].state, 'INVALID_FORECAST');
  assert.match(report.rows[0].reasons.join(' '), /NO_INTERVAL_MIDPOINT/);
  assert.equal(report.summary.brier, null);
});

test('synthetic: invalid interval and missing prior operational definition are not scored', () => {
  const interval = syntheticForecast({ probabilityInterval: [0.1, 0.2] });
  assert.ok(run([interval]).rows[0].reasons.includes('INVALID_OR_CONFLICTING_PROBABILITY_INTERVAL'));
  const missing = syntheticForecast({ outcomeDefinition: '' });
  assert.ok(run([missing]).rows[0].reasons.includes('MISSING_PRIOR_OPERATIONAL_OUTCOME_DEFINITION'));
});

test('synthetic: abstention is not scored even if a result is supplied', () => {
  const forecast = syntheticForecast({ status: 'abstain', pointProbability: null });
  const report = run([forecast], [syntheticOutcome(forecast)]);
  assert.equal(report.rows[0].state, 'ABSTAIN');
  assert.equal(report.summary.count, 0);
  const contaminated = syntheticForecast({ status: 'abstain', pointProbability: 0.7 });
  assert.equal(run([contaminated]).rows[0].state, 'INVALID_FORECAST');
});

test('synthetic: wait until predetermined settlement date even for an early cessation', () => {
  const forecast = syntheticForecast();
  const outcome = syntheticOutcome(forecast, { result: 'ceased', eventAt: '2026-02-01T00:00:00Z', observedAt: '2026-02-02T00:00:00Z', adjudicatedAt: '2026-02-03T00:00:00Z' });
  const report = run([forecast], [outcome], { asOf: '2026-03-01T00:00:00Z' });
  assert.equal(report.rows[0].state, 'NOT_DUE');
  assert.equal(report.summary.brier, null);
  assert.equal(run([forecast], [outcome]).rows[0].state, 'INVALID_ADJUDICATION');
});

test('synthetic: unknown, no adjudication and lost followup stay outside the scored denominator', () => {
  const forecasts = ['UNKNOWN', 'LOST', 'MISSING'].map(suffix => syntheticForecast({ forecastId: 'SYNTHETIC-' + suffix }));
  const outcomes = [syntheticOutcome(forecasts[0], { result: 'unknown' }), syntheticOutcome(forecasts[1], { result: 'lost_to_followup' })];
  const report = run(forecasts, outcomes);
  assert.equal(report.summary.counts.UNKNOWN_OUTCOME, 2);
  assert.equal(report.summary.counts.LOST_TO_FOLLOWUP, 1);
  assert.equal(report.summary.count, 0);
  assert.equal(report.summary.brier, null);
});

test('synthetic: reject same modeler with case/space variation, missing attestation and missing evidence', () => {
  const forecast = syntheticForecast();
  for (const adjudicator of [
    { id: ' synthetic-modeler ', didNotParticipateInModeling: true, noDeclaredConflictOfInterest: true },
    { id: 'SYNTHETIC-OTHER', didNotParticipateInModeling: false, noDeclaredConflictOfInterest: true }
  ]) {
    const row = run([forecast], [syntheticOutcome(forecast, { adjudicator })]).rows[0];
    assert.equal(row.state, 'INVALID_ADJUDICATION');
    assert.ok(row.reasons.includes('INDEPENDENT_ADJUDICATOR_NOT_ESTABLISHED'));
  }
  assert.ok(run([forecast], [syntheticOutcome(forecast, { evidence: [] })]).rows[0].reasons.includes('MISSING_OR_INVALID_OUTCOME_EVIDENCE'));
});

test('synthetic: observed once at horizon does not substitute for coverage or an in-window event', () => {
  const forecast = syntheticForecast();
  const incomplete = syntheticOutcome(forecast, { coverageFrom: '2026-03-31T00:00:00Z' });
  assert.ok(run([forecast], [incomplete]).rows[0].reasons.includes('SURVIVAL_OBSERVATION_DOES_NOT_COVER_FORECAST_HORIZON'));
  const outside = syntheticOutcome(forecast, { result: 'ceased', eventAt: '2026-04-02T00:00:00Z' });
  assert.ok(run([forecast], [outside]).rows[0].reasons.includes('CESSATION_EVENT_OUTSIDE_FORECAST_WINDOW'));
  const stale = syntheticOutcome(forecast, { evidence: [{ url: 'https://synthetic.invalid/stale', sha256: HASH, observedAt: '2026-01-01T00:00:00Z' }] });
  assert.ok(run([forecast], [stale]).rows[0].reasons.includes('OUTCOME_EVIDENCE_DOES_NOT_REACH_REQUIRED_OBSERVATION_DATE'));
});

test('synthetic: refuse post-issue probability, forged freeze hash and result-contaminated prediction', () => {
  const late = syntheticForecast({ probabilityRecordedAt: '2026-02-01T00:00:00Z' });
  assert.ok(run([late]).rows[0].reasons.includes('INVALID_FORECAST_TIMING'));
  const altered = syntheticForecast(); altered.pointProbability = 0.99;
  assert.ok(run([altered]).rows[0].reasons.includes('MISSING_OR_MISMATCHED_PRIOR_FREEZE_RECEIPT'));
  const contaminated = syntheticForecast({ result: 'survived' });
  assert.ok(run([contaminated]).rows[0].reasons.includes('OUTCOME_CONTAMINATES_FROZEN_PREDICTION'));
});

test('synthetic: reject cross-snapshot outcomes, future evidence and malformed dates', () => {
  const forecast = syntheticForecast();
  const wrong = syntheticOutcome(forecast, { forecastSha256: 'b'.repeat(64) });
  assert.equal(run([forecast], [wrong]).rows[0].state, 'INVALID_ADJUDICATION');
  const future = syntheticOutcome(forecast, { adjudicatedAt: '2026-05-01T00:00:00Z' });
  assert.ok(run([forecast], [future]).rows[0].reasons.includes('INVALID_OR_PREMATURE_ADJUDICATION_TIME'));
  assert.throws(() => run([forecast], [], { asOf: '2026-02-30T00:00:00Z' }), /explicit ISO/);
  assert.throws(() => run([forecast], [], { asOf: '2026-04-12' }), /explicit ISO/);
});

test('synthetic: stable fingerprint keys; separate horizon cohorts and p=1 boundary', () => {
  const a = syntheticForecast({ pointProbability: 1, probabilityInterval: [0.9, 1] });
  const b = syntheticForecast({ forecastId: 'SYNTHETIC-F2', horizonEnd: '2026-03-01T00:00:00Z' });
  const reordered = Object.fromEntries(Object.entries(a).reverse());
  assert.equal(forecastFingerprint(a), forecastFingerprint(reordered));
  const report = run([a, b], [syntheticOutcome(a), syntheticOutcome(b)]);
  assert.equal(report.summary.cohortCount, 2);
  assert.equal(report.summary.reliability.at(-1).count, 1);
  assert.equal(report.summary.reliability.at(-1).meanProbability, 1);
  assert.equal(report.cohorts.length, 2);
});

test('synthetic: duplicate and unknown references fail instead of selecting a convenient outcome', () => {
  const forecast = syntheticForecast(); const outcome = syntheticOutcome(forecast);
  assert.throws(() => run([forecast, forecast]), /Duplicate forecast/);
  assert.throws(() => run([forecast], [outcome, outcome]), /Duplicate adjudication/);
  assert.throws(() => run([forecast], [{ forecastId: 'SYNTHETIC-UNKNOWN' }]), /unknown forecastId/);
});

test('CLI binds real input bytes and refuses to overwrite inputs or an existing receipt', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'airports-settlement-test-'));
  const cli = path.join(__dirname, '../scripts/settle-ledger.cjs');
  const ledger = path.join(__dirname, '../data/public-ledger.json');
  const adjudications = path.join(__dirname, '../examples/empty-adjudications.json');
  const output = path.join(dir, 'report.json');
  const args = ['--ledger', ledger, '--adjudications', adjudications, '--as-of', '2026-10-26T00:00:00Z', '--output', output];
  try {
    const first = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', windowsHide: true });
    assert.equal(first.status, 0, first.stderr);
    const report = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.equal(report.summary.counts.ABSTAIN, 245);
    assert.match(report.inputFiles.ledgerSha256, /^[a-f0-9]{64}$/);
    assert.notEqual(spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', windowsHide: true }).status, 0);
    assert.match(spawnSync(process.execPath, [cli, ...args.slice(0, -1), ledger], { encoding: 'utf8', windowsHide: true }).stderr, /cannot replace/);
  } finally {
    for (const file of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, file));
    fs.rmdirSync(dir);
  }
});
