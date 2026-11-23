'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const p=require('../collection/url-collectors/retained-business-history-parsers.cjs');
const {sha}=require('../lib/performance-evidence.cjs');
for(const profile of p.profiles){
 test(profile.recordId+' retained actual business date replays with exact clock and literal',()=>{
  const o=p.observationFor(profile,'CURRENT-IMPORT'),d=p.diagnose(o,{recordId:profile.recordId});assert.equal(d.accepted,true);const f=d.fact;
  assert.equal(f.date,profile.selected.date);assert.equal(f.observedAt,profile.ref.observedAt);assert.equal(f.sourceOriginalObservedAt,profile.ref.observedAt);assert.equal(f.datePrecision,profile.selected.datePrecision);assert.deepEqual(f.sourceIds,['CURRENT-IMPORT']);assert.equal(o.body.slice(f.sourceLocator.start,f.sourceLocator.end),f.quote);assert.equal(sha(f.quote),f.sourceLocator.quoteSha256);assert.equal(sha(o.body),f.bodySha256);assert.equal(f.continuousOperationVerified,false);assert.equal(f.operatorIdentityVerified,false);assert.equal(f.independentHistoricalArchiveVerified,false);assert.equal(f.legacyContinuityVerified,false);
  assert.equal(f.independentMeasurement,false);assert.equal(f.measurementVerified,false);
  for(const key of ['establishedAt','foundedAt','yearsSinceStart','operatingYears','yearsActive','claimedFoundedAt','startYear'])assert.equal(f[key],undefined);
  assert(f.identityProofs.length>=2);for(const r of f.identityProofs){assert(r.originalSourceId);assert.equal(r.sourceId,undefined);}
  const standard={...o,_verifiedMetadata:o.metadata,metadata:o.metadata.metadata};assert.deepEqual(p.diagnose(standard,{recordId:profile.recordId}).fact,f);
  const bad=structuredClone(standard);bad._verifiedMetadata.url='https://evil.example/';assert.equal(p.diagnose(bad,{recordId:profile.recordId}).accepted,false);
  const badClock=structuredClone(standard);badClock._verifiedMetadata.capturedAt='2000-01-01T00:00:00Z';assert.equal(p.diagnose(badClock,{recordId:profile.recordId}).accepted,false);
 });
 test(profile.recordId+' altered source, clock, native metadata and cross-record input fail closed',()=>{
  const mutations=[o=>o.body+='changed',o=>o.observedAt='2026-11-12T05:00:00Z',o=>o.originalFileSha256='0'.repeat(64),o=>o.representation='guessed',o=>delete o.evidenceId,o=>delete o.metadata,o=>o.passwordForm=true,o=>o.verificationWidgetObserved=true,o=>o.authenticationObserved=true,o=>o.metadata.url='https://evil.example/',o=>o.metadata.capturedAt='2020-01-01T00:00:00Z'];
  if(profile.selected.timeMetadataIndex!==undefined)mutations.push(o=>o.metadata.timeMetadata[profile.selected.timeMetadataIndex].dateTime='2000-01-01T00:00:00Z',o=>o.metadata.timeMetadata[profile.selected.timeMetadataIndex].text+='unbound',o=>o.metadata.timeMetadata.push({...o.metadata.timeMetadata[profile.selected.timeMetadataIndex]}));
  for(const mutate of mutations){const o=p.observationFor(profile);mutate(o);assert.equal(p.diagnose(o,{recordId:profile.recordId}).accepted,false);}
  assert.equal(p.extract(p.observationFor(profile),{recordId:'A999'}),null);assert.equal(p.forOrigin(profile.ref.url,{recordId:'A999'}),null);assert.equal(p.forOrigin('https://t.me.evil.example/s/test',{recordId:profile.recordId}),null);
 });
}
test('candidate records retain explicit BiuBiu/oixCloud scope, approved website proofs and no legacy upgrade',()=>{
 for(const [id,name,host] of [['A184','oixCloud','oixcloud.com'],['A196','BiuBiu','biubiux.online']]){const r=p.profiles.find(x=>x.recordId===id),f=p.diagnose(p.observationFor(r),{recordId:id}).fact;
  assert.equal(f.kind,'current_candidate_service_message_date');assert.equal(f.candidateServiceName,name);assert.equal(f.candidateServiceHostname,host);assert.equal(f.currentCandidateOnly,true);assert.equal(f.legacyRecordIdentityVerified,false);assert.equal(f.currentOperatingServiceIdentityVerified,false);assert.equal(f.websiteScopeOriginalSourceId,r.websiteScopeRef.sourceId);assert(f.identityProofs.some(v=>v.fileSha256===r.websiteScopeRef.fileSha256));assert.equal(f.websiteScopeProof.originalSourceId,r.websiteScopeRef.sourceId);
 }
 const biu=p.profiles.find(x=>x.recordId==='A196');assert.equal(biu.selected.postUrl,'https://t.me/biubiugroup/362');assert(biu.selected.quote.includes('biubiux.online'));
});
test('day precision announcement has its own explicit business date, not a channel timestamp',()=>{
 const r=p.profiles.find(x=>x.recordId==='A173'),f=p.diagnose(p.observationFor(r),{recordId:r.recordId}).fact;assert.equal(f.kind,'operator_announcement_date');assert.equal(f.date,'2026-10-19');assert.equal(f.dateEvidence.kind,'operator_publication_date_label');assert.equal(f.dateEvidence.quote,'2026年10月19日');assert.equal(f.postUrl,undefined);assert.equal(f.datePrecision,'day');
});
test('patch is additive and idempotent and preserves old null ages',()=>{
 const r=p.profiles[0],o=p.observationFor(r),prior={operatingHistory:{status:'not_confirmed',yearsSinceStart:null,startDate:null,notes:['preserve'],sourceIds:['OLD'],historyStatements:[]}},before=JSON.stringify(prior),patch=p.extract(o,{recordId:r.recordId,prior});assert.equal(JSON.stringify(prior),before);assert.equal(patch.operatingHistory.yearsSinceStart,null);assert.equal(patch.operatingHistory.startDate,null);assert.deepEqual(patch.operatingHistory.notes,['preserve']);assert.deepEqual(patch.operatingHistory.sourceIds,['OLD',o.evidenceId]);assert.equal(p.extract(o,{recordId:r.recordId,prior:patch}),null);
});
