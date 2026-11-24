'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),round=path.join(root,'work/performance-20261112-fifteenth');
const manifest=JSON.parse(fs.readFileSync(path.join(round,'reference-manifest.json'),'utf8')),baseline=JSON.parse(fs.readFileSync(path.join(round,'before.json'),'utf8'));
const {prepareReferences,stageReferences}=require('../lib/performance-reference-import.cjs'),registry=require('../collection/url-collectors/index.cjs'),policy=require('../lib/performance-source-policy.cjs'),runner=require('../deploy-service/performance-reference-runner.cjs');
const prepared=prepareReferences({root,manifest}),ids=[...new Set(prepared.map(e=>e.siteId))],priorFor=id=>require('./helpers/reviewed-business-history-fixture.cjs').withReviewedBusinessHistory(baseline.sites.find(s=>s.id===id).document,id);
function observationsFor(id){const seen=new Set();return prepared.filter(e=>e.siteId===id).flatMap(e=>{const material=e.materials.find(m=>m.key===e.primaryKey),r=material.ref;if(seen.has(r.file))return[];seen.add(r.file);const raw=JSON.parse(fs.readFileSync(path.join(root,r.file),'utf8'));return[{...raw,url:r.url,body:material.original.body,evidenceId:'FIFTEENTH-INTEGRATION-'+id+'-'+seen.size,observedAt:r.observedAt,representation:r.representation,originalFileSha256:r.fileSha256,kind:'public_performance_reference',metadata:{...raw.metadata,performanceReference:true,authenticationObserved:false},_verifiedMetadata:raw}];});}

test('final nine facts for six sites append only the intended collections and preserve every other prior field',()=>{
 assert.equal(prepared.length,9);assert.equal(ids.length,6);
 for(const id of ids){const prior=priorFor(id),frozen=structuredClone(prior),observations=observationsFor(id),expected=prepared.filter(e=>e.siteId===id),result=registry.extractKnown(observations,{recordId:id,prior});assert(result,id);assert.deepEqual(prior,frozen,'baseline mutation '+id);
  const fields=[...new Set(expected.map(e=>e.field))];assert.deepEqual(Object.keys(result.patch).sort(),fields.sort(),id);const combined={...prior,...result.patch};
  for(const key of Object.keys(prior).filter(k=>!fields.includes(k)))assert.deepEqual(combined[key],frozen[key],'unaffected field '+id+' '+key);
  for(const field of fields){const collections=[...new Set(expected.filter(e=>e.field===field).map(e=>e.collection))],value=result.patch[field];for(const key of Object.keys(prior[field]||{}).filter(k=>k!=='sourceIds'&&!collections.includes(k)))assert.deepEqual(value[key],prior[field][key],'unaffected nested field '+id+' '+field+'.'+key);
   for(const collection of collections){const old=prior[field]?.[collection]||[],added=expected.filter(e=>e.field===field&&e.collection===collection),current=value[collection];assert.deepEqual(current.slice(0,old.length),old);assert.equal(current.length,old.length+added.length,id+' '+collection);for(const e of added)assert(current.some(f=>f.id===e.fact.id),'missing '+e.fact.id);}
   for(const sourceId of prior[field]?.sourceIds||[])assert(value.sourceIds.includes(sourceId),'old source dropped '+id);
  }
  assert.deepEqual(combined.speed?.measured,frozen.speed?.measured,'original measured data '+id);for(const key of ['pricing','payment','refund','trial','privacy','promotions'])assert.deepEqual(combined[key],frozen[key],'finance/contract '+id+' '+key);
  assert.equal(registry.extractKnown(observations,{recordId:id,prior:combined}),null,'idempotent '+id);assert.equal(registry.extractKnown(observations,{recordId:'A999',prior}),null,'wrong record '+id);
 }
});

test('new public sources are exact per record and grant no hash, query, authentication or native registration destination permissions',()=>{
 for(const id of ids)for(const o of observationsFor(id)){assert(registry.forOrigin(o.url,{recordId:id}));assert(policy.registeredReference(o.url,id));assert(policy.publicReferenceCapture(o,id));
  for(const wrong of [...ids.filter(v=>v!==id),'A999'])assert.equal(policy.registeredReference(o.url,wrong),false,o.url+' '+wrong);
  for(const url of [o.url+'#post',o.url+'#/login',o.url+'?token=secret',o.url.replace('https:','http:'),o.url.replace('https://','https://user:pass@')]){assert.equal(policy.registeredReference(url,id),false,url);assert.equal(policy.publicReferenceCapture({...o,url},id),false,url);}
  assert.equal(policy.publicReferenceCapture({...o,authenticationObserved:true},id),false);assert.equal(policy.publicReferenceCapture({...o,metadata:{performanceReference:true,authenticationObserved:true}},id),false);
 }
 for(const e of prepared){for(const url of [e.fact.nativeOfficialLink,e.fact.currentNativeLink,e.fact.nativeDestinationUrl].filter(Boolean))assert.equal(policy.registeredReference(url,e.siteId),false,'association destination is not a public collection target '+url);}
});

test('actual priors select missing-field routes within two sources while default and speed-only diagnostics retain median and complete monitor pairs',()=>{
 // Exercise this retained group's field scope. Later registered speed routes
 // can legitimately take priority when the caller requests every field.
 for(const id of ids){const prior=priorFor(id),before=structuredClone(prior),entries=prepared.filter(e=>e.siteId===id),targets=runner.sourceTargets(id,prior,{fields:[...new Set(entries.map(e=>e.field))]}),urls=new Set(observationsFor(id).map(o=>o.url));assert(targets.length>0&&targets.length<=2,id);assert(targets.some(t=>urls.has(t.entryUrl)),id);
  for(const target of targets){assert.equal(target.recordId,id);assert.equal(target.allowedHost,new URL(target.entryUrl).hostname);assert(policy.registeredReference(target.entryUrl,id));if(urls.has(target.entryUrl))assert(entries.some(e=>target.fields.includes(e.field)));}
  assert.deepEqual(prior,before);for(const diagnostic of [{},{speed:prior.speed}])assert(runner.sourceTargets(id,diagnostic).length<=2);
 }
 const median=require('../collection/url-collectors/performance-reference-parsers.cjs'),monitor=require('../collection/url-collectors/third-party-monitor-parsers.cjs');
 for(const p of median.profiles){const overview=p.origin+'/airports/'+p.slug+'/';for(const prior of [{},{speed:priorFor(p.recordId).speed}]){const urls=runner.sourceTargets(p.recordId,prior).map(t=>t.entryUrl);assert(urls.length<=2);assert(urls.includes(overview),'median overview displaced '+p.recordId);}}
 const newUrls=new Set(ids.flatMap(id=>observationsFor(id).map(o=>o.url)));
 for(const p of monitor.profiles){const pair=monitor.sourceTargets(p.recordId).map(t=>t.url);assert.equal(pair.length,2);assert.deepEqual(runner.sourceTargets(p.recordId,{}).map(t=>t.entryUrl),pair,'default monitor pair '+p.recordId);
  // Existing higher-priority source contracts may replace the complete pair;
  // no new fifteenth-round route may take either slot in this diagnostic.
  for(const prior of [{},{speed:priorFor(p.recordId).speed}]){const selected=runner.sourceTargets(p.recordId,prior).map(t=>t.entryUrl),members=pair.filter(url=>selected.includes(url));assert(selected.length<=2);assert(members.length===0||members.length===2,'orphan monitor method/snapshot '+p.recordId);if(members.length)assert.deepEqual(selected,pair);assert(!selected.some(url=>newUrls.has(url)),'new route displaced legacy diagnostic '+p.recordId);}
 }
 // A partial speed diagnostic does not gain the newly added status/history lane.
 for(const id of ['A077','A184','A196','A039'])for(const prior of [{},{speed:priorFor(id).speed}]){const newUrls=new Set(observationsFor(id).map(o=>o.url));assert(!runner.sourceTargets(id,prior).some(t=>newUrls.has(t.entryUrl)),id);}
});

test('strict preparation requires all original image attachments, hashes and source-bound review proofs',()=>{
 for(const id of ['A146','A067']){const entry=manifest.entries.find(e=>e.siteId===id);assert(entry);assert.equal(prepareReferences({root,manifest:{entries:[entry]}}).length,1);
  const mutations=[e=>{for(const m of e.materials)delete m.attachments;},e=>{const m=e.materials.find(m=>m.attachments?.length);m.attachments[0].sha256='0'.repeat(64);},e=>{if(e.fact.imageArtifacts)e.fact.imageArtifacts[0].fileSha256='0'.repeat(64);else e.fact.imageCaptureProof.imageSha256='0'.repeat(64);},e=>{const proof=e.fact.reviewProof||e.fact.imageCaptureProof.metadata;proof.file='unbound-image-review.json';},e=>{const proof=e.fact.reviewProof||e.fact.imageCaptureProof.metadata;const material=e.materials.find(m=>m.ref.file===proof.file);e.sourceKeys=e.sourceKeys.filter(k=>k!==material.key);}];
  if(id==='A146')mutations.push(e=>{e.materials.find(m=>m.attachments?.length).attachments.pop();});
  for(const mutate of mutations){const e=structuredClone(entry);mutate(e);assert.throws(()=>prepareReferences({root,manifest:{entries:[e]}}),id+' missing/mutated/unbound image proof');}
 }
});

test('undated image import stages against original capture clock and keeps its test date null without approving data',t=>{
 const entry=manifest.entries.find(e=>e.siteId==='A146'),p=prepareReferences({root,manifest:{entries:[entry]}})[0],primary=p.materials.find(m=>m.key===p.primaryKey);assert.equal(p.fact.testedAt,null);assert.equal(p.fact.date,null);assert.equal(p.fact.observedAt,primary.original.observedAt);assert(Number.isFinite(Date.parse(p.fact.observedAt)));assert.equal(p.fact.measurementVerified,false);
 const store=require('../deploy-service/store.cjs').createStore({filename:':memory:'});t.after(()=>store.close());const measured={observations:[],status:'unknown'},pricing={plans:[{name:'retained contract',amount:23}]};store.seedSites([{id:'A146',initialDocument:{speed:{status:'not_measured',measured},pricing}}]);
 const result=stageReferences({root,store,manifest:{entries:[entry]}});assert.equal(result.failures.length,0);assert.equal(result.staged.length,1);assert.equal(result.automaticApproval,false);assert.equal(store.getSite('A146').revision,0);assert.deepEqual(store.getSite('A146').document.pricing,pricing);const proposal=store.listProposals()[0],fact=proposal.patch.speed.undatedImageReports[0];assert.equal(proposal.status,'pending');assert.equal(fact.testedAt,null);assert.equal(fact.date,null);assert.equal(fact.observedAt,primary.original.observedAt);assert.deepEqual(proposal.patch.speed.measured,measured);assert.equal(proposal.patch.pricing,undefined);for(const evidence of store.listEvidence())assert(evidence.observations.some(o=>o.observedAt===primary.original.observedAt));assert.equal(stageReferences({root,store,manifest:{entries:[entry]}}).staged.length,0);
});
