'use strict';
const { historicalCaptureOptions } = require('./helpers/historical-capture.cjs');
const historicalCapture = historicalCaptureOptions(
  'work/performance-20261112-sixteenth/reference-manifest.json',
  'work/performance-20261112-sixteenth/before.json',
  'work/performance-20261112-seventeenth/retained-performance-history-entries.json',
  'work/performance-20261112-nineteenth/reference-manifest.json'
);

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),round=path.join(root,'work/performance-20261112-sixteenth');
const manifest=historicalCapture.skip ? undefined : JSON.parse(fs.readFileSync(path.join(round,'reference-manifest.json'))),baseline=historicalCapture.skip ? undefined : JSON.parse(fs.readFileSync(path.join(round,'before.json')));
const {prepareReferences}=require('../lib/performance-reference-import.cjs'),registry=require('../collection/url-collectors/index.cjs'),policy=require('../lib/performance-source-policy.cjs'),runner=require('../deploy-service/performance-reference-runner.cjs');
const {withReviewedPerformanceTestHistory}=historicalCapture.skip ? {} : require('./helpers/reviewed-business-history-fixture.cjs');
const {withRound19ReviewedFeedback}=require('./helpers/round19-reviewed-feedback-fixture.cjs');
const prepared=historicalCapture.skip ? undefined : prepareReferences({root,manifest}),ids=historicalCapture.skip ? undefined : [...new Set(prepared.map(e=>e.siteId))],priorFor=id=>withRound19ReviewedFeedback(withReviewedPerformanceTestHistory(baseline.sites.find(s=>s.id===id).document,id),id);
function observationsFor(id){const seen=new Set();return prepared.filter(e=>e.siteId===id).flatMap(e=>{const m=e.materials.find(m=>m.key===e.primaryKey),r=m.ref;if(seen.has(r.file))return[];seen.add(r.file);const raw=JSON.parse(fs.readFileSync(path.join(root,r.file)));return[{...raw,url:r.url,body:m.original.body,evidenceId:'SIXTEENTH-INTEGRATION-'+id+'-'+seen.size,observedAt:r.observedAt,representation:r.representation,originalFileSha256:r.fileSha256,kind:id==='A173'?'operator_visible_page':'public_performance_reference',metadata:{...raw.metadata,performanceReference:true,authenticationObserved:id==='A173'},_verifiedMetadata:raw}];});}
const single=e=>prepareReferences({root,manifest:{entries:[e]}});

test('eight final source-bound facts enter seven real registry records with append-only collections and preserved prior fields', historicalCapture,()=>{
 assert.equal(prepared.length,8);assert.equal(ids.length,7);
 for(const id of ids){const prior=priorFor(id),frozen=structuredClone(prior),observations=observationsFor(id),expected=prepared.filter(e=>e.siteId===id),result=registry.extractKnown(observations,{recordId:id,prior});assert(result,id);assert.deepEqual(prior,frozen,'input mutation '+id);
  const fields=[...new Set(expected.map(e=>e.field))];assert.deepEqual(Object.keys(result.patch).sort(),fields.slice().sort(),'patched fields '+id);const combined={...prior,...result.patch};
  for(const key of Object.keys(prior).filter(k=>!fields.includes(k)))assert.deepEqual(combined[key],frozen[key],'unaffected field '+id+' '+key);
  for(const field of fields){const collections=[...new Set(expected.filter(e=>e.field===field).map(e=>e.collection))],value=result.patch[field];for(const key of Object.keys(prior[field]||{}).filter(k=>k!=='sourceIds'&&!collections.includes(k)))assert.deepEqual(value[key],prior[field][key],'unaffected nested field '+id+' '+field+'.'+key);
   for(const collection of collections){const old=prior[field]?.[collection]||[],added=expected.filter(e=>e.field===field&&e.collection===collection),current=value[collection];assert.deepEqual(current.slice(0,old.length),old);assert.equal(current.length,old.length+added.length,id+' '+collection);for(const e of added)assert(current.some(f=>f.id===e.fact.id),'missing '+e.fact.id);}
   for(const sourceId of prior[field]?.sourceIds||[])assert(value.sourceIds.includes(sourceId),'old source dropped '+id);
  }
  assert.deepEqual(combined.speed?.measured,frozen.speed?.measured,'original measured data '+id);for(const key of ['pricing','payment','refund','trial','privacy','promotions'])assert.deepEqual(combined[key],frozen[key],'finance/contract '+id+' '+key);
  assert.equal(registry.extractKnown(observations,{recordId:id,prior:combined}),null,'idempotent '+id);assert.equal(registry.extractKnown(observations,{recordId:'A999',prior}),null,'wrong record '+id);
 }
});

test('candidate message date requires its exact kind, original source contract and retained candidate website scope', historicalCapture,()=>{
 const candidates=manifest.entries.filter(e=>e.fact.kind==='current_candidate_service_message_date');assert.deepEqual(candidates.map(e=>e.siteId).sort(),['A184','A196']);
 for(const entry of candidates){assert.equal(single(entry).length,1);assert(entry.fact.currentCandidateOnly);assert.equal(entry.fact.legacyRecordIdentityVerified,false);assert.equal(entry.fact.continuousOperationVerified,false);assert.equal(entry.fact.independentHistoricalArchiveVerified,false);
  const mutations=[e=>e.fact.kind='current_candidate_service_message_date_typo',e=>e.fact.kind='platform_message_date',e=>delete e.fact.websiteScopeProof,e=>e.fact.websiteScopeProof.file='unbound-scope.json',e=>e.fact.websiteScopeProof.fileSha256='0'.repeat(64),e=>{const key=e.materials.find(m=>m.ref.file===e.fact.websiteScopeProof.file).key;e.sourceKeys=e.sourceKeys.filter(k=>k!==key);},e=>delete e.fact.candidateServiceHostname,e=>e.fact.currentCandidateOnly=false,e=>e.fact.legacyRecordIdentityVerified=true];
  for(const mutate of mutations){const e=structuredClone(entry);mutate(e);assert.throws(()=>single(e),entry.siteId+' stripped/forged candidate scope');}
  const noProfile=structuredClone(entry);noProfile.siteId='A999';assert.throws(()=>single(noProfile),/New performance collection requires exact source contract/,'candidate kind must fail closed without exact profile');
  for(const key of ['foundedAt','establishedAt','yearsSinceStart','operatingYears','yearsActive','claimedFoundedAt','startYear']){const e=structuredClone(entry);e.fact[key]=key.toLowerCase().includes('year')?2025:e.fact.date;assert.throws(()=>single(e),'message date cannot establish '+key);}
  assert.equal(entry.fact.datePrecision,'second');assert.equal(entry.fact.dateEvidence.kind,'captured_telegram_time_attribute');assert.equal(entry.fact.dateEvidence.postUrl,entry.fact.postUrl);assert.equal(entry.fact.dateEvidence.value,entry.fact.date);
 }
});

test('dated image references require the retained binary attachments and exact file/source bindings', historicalCapture,()=>{
 for(const id of ['A197','A037']){const entry=manifest.entries.find(e=>e.siteId===id);assert.equal(single(entry).length,1);
  for(const mutate of [e=>{for(const m of e.materials)delete m.attachments;},e=>{e.materials.find(m=>m.attachments?.length).attachments[0].sha256='0'.repeat(64);},e=>{e.fact.imageCaptureProof.imageSha256='0'.repeat(64);},e=>{e.fact.imageCaptureProof.metadata.file='unbound-visual-review.json';},e=>{const key=e.materials.find(m=>m.ref.file===e.fact.imageCaptureProof.metadata.file).key;e.sourceKeys=e.sourceKeys.filter(k=>k!==key);}]){const e=structuredClone(entry);mutate(e);assert.throws(()=>single(e),id+' removed/forged original binary proof');}
 }
});

test('new public routes are exact record contracts and never expand authentication, host, query or registration permissions', historicalCapture,()=>{
 for(const id of ids)for(const o of observationsFor(id)){
  assert(registry.forOrigin(o.url,{recordId:id}),id);if(id==='A173'){assert.equal(policy.registeredReference(o.url,id),false,'retained dashboard must not become a public hash route');assert.equal(policy.publicReferenceCapture(o,id),false);continue;}
  assert(policy.registeredReference(o.url,id),o.url);assert(policy.publicReferenceCapture(o,id));for(const wrong of [...ids.filter(v=>v!==id),'A999'])assert.equal(policy.registeredReference(o.url,wrong),false,o.url+' '+wrong);
  const extra=o.url.includes('?')?'&token=secret':'?token=secret',variants=[o.url+'#post',o.url+'#/login',o.url+extra,o.url.replace('https:','http:'),o.url.replace('https://','https://user:pass@'),o.url.replace(new URL(o.url).hostname,new URL(o.url).hostname+'.evil.example')];
  if(id==='A039')variants.push(o.url.replace('before=84','before=85'),o.url.replace('before=84','before=084'),o.url+'&before=84',o.url.replace('before=84','q=peiqianjichang.com'));
  if(id==='A196')variants.push(o.url.replace('q=biubiux.online','q=email@example.com'),o.url.replace('q=biubiux.online','q=other.example'),o.url+'&q=biubiux.online',o.url.replace('q=biubiux.online','before=84'));
  for(const url of variants){assert.equal(policy.registeredReference(url,id),false,url);assert.equal(policy.publicReferenceCapture({...o,url},id),false,url);}
  for(const poisoned of [{...o,authenticationObserved:true},{...o,metadata:{performanceReference:true,authenticationObserved:true}}])assert.equal(policy.publicReferenceCapture(poisoned,id),false,'public marker must not permit authenticated state');
 }
 for(const id of ['A197','A037']){const e=prepared.find(e=>e.siteId===id);assert.equal(policy.registeredReference(e.fact.nativeOfficialLink,id),false,'native affiliate identity route is not a public research permission');const registration=id==='A197'?'https://renzhe.cloud/auth/register':'https://access.shandiancn.com/#/register';assert.equal(policy.registeredReference(registration,id),false);}
});

test('actual complete priors select scoped missing fields within two routes, while retained A173 dashboard is never publicly scheduled', historicalCapture,()=>{
 for(const id of ids){const prior=priorFor(id),frozen=structuredClone(prior),targets=runner.sourceTargets(id,prior);assert(targets.length<=2,id);assert.deepEqual(prior,frozen);for(const t of targets){assert.equal(t.recordId,id);assert.equal(t.allowedHost,new URL(t.entryUrl).hostname);assert(policy.registeredReference(t.entryUrl,id),t.entryUrl);}
  const urls=new Set(observationsFor(id).map(o=>o.url));if(id==='A173'){assert(!targets.some(t=>urls.has(t.entryUrl)),'A173 retained-only dashboard must not be scheduled');continue;}assert(targets.some(t=>urls.has(t.entryUrl)),'missing field route '+id);for(const t of targets.filter(t=>urls.has(t.entryUrl)))assert(prepared.filter(e=>e.siteId===id).some(e=>t.fields.includes(e.field)),'route field '+id);
 }
});

test('default and partial diagnostics preserve legacy monitor pairs atomically and exclude unrelated new lanes', historicalCapture,()=>{
 const monitor=require('../collection/url-collectors/third-party-monitor-parsers.cjs'),median=require('../collection/url-collectors/performance-reference-parsers.cjs'),newUrls=new Set(ids.flatMap(id=>observationsFor(id).map(o=>o.url)));
 for(const p of monitor.profiles){const pair=monitor.sourceTargets(p.recordId).map(t=>t.url);assert.equal(pair.length,2);assert.deepEqual(runner.sourceTargets(p.recordId,{}).map(t=>t.entryUrl),pair,'default monitor pair '+p.recordId);for(const diagnostic of [{},{speed:priorFor(p.recordId).speed}]){const selected=runner.sourceTargets(p.recordId,diagnostic).map(t=>t.entryUrl),members=pair.filter(u=>selected.includes(u));assert(selected.length<=2);assert(members.length===0||members.length===2,'orphan monitor method/snapshot '+p.recordId);if(members.length)assert.deepEqual(selected,pair);assert(!selected.some(u=>newUrls.has(u)),'new unrelated route displaced monitor '+p.recordId);}}
 for(const p of median.profiles){const overview=p.origin+'/airports/'+p.slug+'/';for(const diagnostic of [{},{speed:priorFor(p.recordId).speed}]){const urls=runner.sourceTargets(p.recordId,diagnostic).map(t=>t.entryUrl);assert(urls.length<=2);assert(urls.includes(overview),'legacy median overview displaced '+p.recordId);}}
 for(const id of ids){const urls=new Set(observationsFor(id).map(o=>o.url));assert(!runner.sourceTargets(id,{}).some(t=>urls.has(t.entryUrl)),'default gained new field lane '+id);if(!['A197','A037'].includes(id))assert(!runner.sourceTargets(id,{speed:priorFor(id).speed}).some(t=>urls.has(t.entryUrl)),'speed-only diagnostic gained unrelated status/history '+id);}
});
