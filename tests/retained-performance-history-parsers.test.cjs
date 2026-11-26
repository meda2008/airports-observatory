'use strict';
const { historicalCaptureOptions, isHistoricalCapture } = require('./helpers/historical-capture.cjs');

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const mod=require('../collection/url-collectors/retained-performance-history-parsers.cjs'),{sha}=require('../lib/performance-evidence.cjs');
function captureFiles(profile) {
  const identity = profile.validationProfile;
  return [profile.ref, identity?.identity, identity?.route, identity?.imageReview]
    .map(ref => ref?.file?.replaceAll('\\', '/')).filter(isHistoricalCapture);
}
for(const p of mod.profiles){
 test(p.recordId+' explicit retained test date preserves provenance and wrappers', historicalCaptureOptions(...captureFiles(p)),()=>{
  const o=mod.observationFor(p,'CURRENT-REIMPORT'),d=mod.diagnose(o,{recordId:p.recordId});assert.equal(d.accepted,true);const f=d.fact;
  assert.equal(f.date,p.selected.date);assert.equal(f.datePrecision,'day');assert.equal(f.observedAt,p.ref.observedAt);assert.equal(f.sourceOriginalObservedAt,p.ref.observedAt);assert.deepEqual(f.sourceIds,['CURRENT-REIMPORT']);assert.equal(o.body.slice(f.sourceLocator.start,f.sourceLocator.end),f.quote);assert.equal(sha(f.quote),f.sourceLocator.quoteSha256);
  for(const flag of ['operatorIdentityVerified','historicalIdentityVerified','legacyRecordIdentityVerified','legacyContinuityVerified','legalEntityContinuityVerified','continuousOperationVerified','independentHistoricalArchiveVerified','independentMeasurement','measurementVerified'])assert.equal(f[flag],false);
  for(const k of ['establishedAt','foundedAt','startDate','startYear','yearsSinceStart','operatingYears','yearsActive'])assert.equal(f[k],undefined);
  for(const r of f.identityProofs){assert(r.originalSourceId);assert.equal(r.sourceId,undefined);}
  const wrapped={...o,_verifiedMetadata:o.metadata,metadata:o.metadata.metadata};assert.deepEqual(mod.diagnose(wrapped,{recordId:p.recordId}).fact,f);
  const altered=structuredClone(wrapped);altered._verifiedMetadata.url='https://evil.invalid/';assert.equal(mod.diagnose(altered,{recordId:p.recordId}).accepted,false);
 });
 test(p.recordId+' modified body clock file inventory or checkpoint fails closed', historicalCaptureOptions(...captureFiles(p)),()=>{
  const mutations=[o=>o.body+='x',o=>o.observedAt='2026-11-12T08:00:00Z',o=>o.originalFileSha256='0'.repeat(64),o=>o.representation='guessed',o=>delete o.metadata,o=>delete o.evidenceId,o=>o.authenticationObserved=true,o=>o.passwordForm=true,o=>o.verificationWidgetObserved=true,o=>o.metadata.url='https://evil.invalid/',o=>o.metadata.capturedAt='2000-01-01T00:00:00Z'];
  if(p.kind==='third_party_test_record_date')mutations.push(o=>o.metadata.images=[],o=>o.metadata.links=[]);
  for(const mutate of mutations){const o=mod.observationFor(p);mutate(o);assert.equal(mod.diagnose(o,{recordId:p.recordId}).accepted,false);}
  assert.equal(mod.extract(mod.observationFor(p),{recordId:'A003'}),null);assert.equal(mod.forOrigin(p.ref.url,{recordId:'A999'}),null);assert.equal(mod.forOrigin('https://evil.invalid/',{recordId:p.recordId}),null);
  const edited=structuredClone(p);edited.selected.date='2000-01-01';assert.deepEqual(mod.normalizeProfiles([edited]),[]);assert.deepEqual(mod.normalizeProfiles([p,p]),[]);
 });
 test(p.recordId+' additive idempotent history keeps existing null age and notes', historicalCaptureOptions(...captureFiles(p)),()=>{
  const o=mod.observationFor(p),prior={operatingHistory:{status:'not_confirmed',startDate:null,yearsSinceStart:null,notes:['keep'],sourceIds:['OLD'],historyStatements:[]}},before=JSON.stringify(prior),patch=mod.extract(o,{recordId:p.recordId,prior});assert.equal(JSON.stringify(prior),before);assert.equal(patch.operatingHistory.startDate,null);assert.equal(patch.operatingHistory.yearsSinceStart,null);assert.deepEqual(patch.operatingHistory.notes,['keep']);assert.equal(mod.extract(o,{recordId:p.recordId,prior:patch}),null);
 });
}
test('image date retains alias and time-zone uncertainty without publication-date inference', historicalCaptureOptions(...captureFiles(mod.profiles.find(profile => profile.recordId === 'A037'))),()=>{
 const p=mod.profiles.find(p=>p.recordId==='A037'),f=mod.diagnose(mod.observationFor(p),{recordId:p.recordId}).fact;
 assert.equal(f.kind,'third_party_test_record_date');assert.equal(f.date,'2025-04-27');assert.equal(f.dateEvidence.exactTestInstant,null);assert.equal(f.dateEvidence.timeZoneOffset,null);assert.equal(f.currentOfficialHostname,'access.shandiancn.com');assert(f.limitations.some(x=>x.includes('0113.sd04-bmbb7vmk.top')&&x.includes('未闭合')));
 const m=f.dateEvidence.sourceLocator;assert.equal(sha(fs.readFileSync(path.resolve(__dirname,'..',m.imageFile))),m.imageSha256);assert(m.review.originalSourceId);assert.equal(m.review.sourceId,undefined);
});
test('operator date is bound to complete same-report window and exact current host', historicalCaptureOptions(...captureFiles(mod.profiles.find(profile => profile.recordId === 'A170'))),()=>{
 const p=mod.profiles.find(p=>p.recordId==='A170'),f=mod.diagnose(mod.observationFor(p),{recordId:p.recordId}).fact;assert.equal(f.kind,'operator_historical_test_statement_date');assert.equal(f.date,'2026-10-17');assert.equal(f.dateEvidence.windowStart,'2026-10-17T06:46:00+08:00');assert.equal(f.dateEvidence.windowEnd,'2026-10-17T07:38:00+08:00');assert.equal(f.currentOfficialHostname,'www.bianjiecloud.com');assert(f.limitations.some(x=>x.includes('A003')));
});
test('E-IX image footer date belongs to current exact host without founding or historic continuity promotion', historicalCaptureOptions(...captureFiles(mod.profiles.find(profile => profile.recordId === 'A044'))),()=>{
 const p=mod.profiles.find(p=>p.recordId==='A044'),f=mod.diagnose(mod.observationFor(p),{recordId:p.recordId}).fact;
 assert.equal(f.kind,'third_party_test_record_date');assert.equal(f.date,'2025-04-17');assert.equal(f.dateEvidence.quote,'测试时间：2025-04-17 16:23:14 (CST)');assert.equal(f.currentOfficialHostname,'cloud.e-ix.com');assert.equal(f.dateEvidence.exactTestInstant,null);assert.equal(f.dateEvidence.timeZoneOffset,null);assert.equal(f.dependencyGroup,'publisher:clashx.pro');assert.equal(f.historicalIdentityVerified,false);assert.equal(f.legalEntityContinuityVerified,false);assert.equal(f.continuousOperationVerified,false);assert.equal(f.identityProofs.length,4);assert(f.limitations.some(x=>x.includes('不证明2025年')));assert(f.relatedTestReportId.startsWith('continuation-dated-image-A044-'));
});
