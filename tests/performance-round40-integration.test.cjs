'use strict';
const { historicalCaptureOptions } = require('./helpers/historical-capture.cjs');

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {publicFacts}=require('../deploy-service/server.cjs'),{performanceSummary}=require('../lib/performance-summary.cjs');
const { profiles: retainedStatusProfiles } = require('../collection/url-collectors/round40-retained-status-parsers.cjs');
test('new JMS collector has a routable exact live target',()=>{
 const prior={speed:{},stability:{}};const routes=require('../deploy-service/performance-reference-runner.cjs').sourceTargets('A023',prior,{fields:['speed']});
 assert.equal(routes[0].entryUrl,'https://bwgjms.com/post/justmysocks-speed-test/');assert(require('../lib/performance-source-policy.cjs').registeredReference(routes[0].entryUrl,'A023'));
});
test('literal historical JMS table survives public projection without becoming a current numerical score', historicalCaptureOptions('work/performance-docker-20261114/jms-review-research.json'),()=>{
 const source=require('../work/performance-docker-20261114/jms-review-research.json'),parser=require('../collection/url-collectors/round40-speed-parsers.cjs');
 const observation={url:source.url,body:source.text,observedAt:new Date().toISOString(),evidenceId:'fixture-JMS',kind:'public_performance_reference',metadata:{performanceReference:true,authenticationObserved:false,links:source.links,timeMetadata:[{dateTime:'2019-03-18 17:53',label:'2019-03-18 17:53'}]}};
 const patch=parser.extract(observation,{recordId:'A023',prior:{speed:{}}});assert(patch,JSON.stringify(parser.diagnose(observation,{recordId:'A023'})));
 const out=performanceSummary(publicFacts(patch));assert.equal(out.speed,'有第三方历史测速表（测试日期未明）');assert.equal(out.speedContext.rows.length,5);assert.equal(out.speedContext.testedAt,null);assert.equal(out.speedContext.sampleCount,null);assert.equal(out.speedContext.eligibleForSpeedRanking,false);
});
test('retained node snapshot and unresolved candidate notes keep temporal stability unknown', historicalCaptureOptions(...retainedStatusProfiles.map(profile => profile.ref.file)),()=>{
 const parser=require('../collection/url-collectors/round40-retained-status-parsers.cjs');
 for(const siteId of ['A001','A042']){let prior={stability:{}};for(const p of parser.profiles.filter(r=>r.recordId===siteId)){const raw=JSON.parse(fs.readFileSync(path.resolve(__dirname,'..',p.ref.file))),o={url:raw.url||p.url,body:raw.document?.text||raw.text||raw.body,observedAt:p.ref.observedAt,evidenceId:'fixture-'+p.id,metadata:{retainedReplayVerified:true,originalSourceId:p.ref.sourceId,retainedArtifactSha256:p.ref.fileSha256,currentCatalogHostname:p.currentCatalogHostname}};const patch=parser.extract(o,{recordId:siteId,prior});assert(patch);prior={...prior,...patch};}
  const out=performanceSummary(publicFacts(prior));if(siteId==='A001'){assert.equal(out.stability,'有历史节点连通快照（非长期稳定率）');assert.equal(out.stabilityContext.availabilityPct,null);}else{assert.equal(out.stability,'暂无实测');assert.equal(out.candidateIssueContext.currentCandidateOnly,true);}
 }
});
test('collector replays staged originals without launching a browser or changing capture times',async()=>{
 const {createWebCollector}=require('../deploy-service/collector-web-runtime.cjs'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'retained-worker-'));const captures=[{url:'https://example.com/',body:'retained original',observedAt:'2026-10-26T10:45:28.845Z',metadata:{retainedReplayVerified:true}}];let received;
 const request=async(op,input)=>op==='control'?{engineEnabled:true,executionMode:'standalone'}:op==='claim'?{job:{siteId:'A001',jobId:'retained-job',runId:'retained-run',token:'lease',retainedCaptures:captures,site:{id:'A001',config:{entryUrl:'https://example.com/'}}}}:op==='receive'?(received=input,{status:'completed'}):{};
 const worker=createWebCollector({request,output:dir,browserFactory:async()=>{throw Error('retained replay must not open a browser');},log:()=>{}});try{const result=await worker.runOne();assert.equal(result.status,'completed');assert.equal(received.observationBasis,'retained_reparse');assert.deepEqual(received.captures,captures.map(c=>({...c,sha256:require('node:crypto').createHash('sha256').update(c.body).digest('hex')})));}finally{await worker.stop();fs.rmSync(dir,{recursive:true,force:true});}
});
test('public-only lease admits only its staged original bytes; a marker or caller flag cannot forge retained admission',()=>{
 const crypto=require('node:crypto'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'retained-admission-')),filename=path.join(dir,'one.sqlite'),store=require('../deploy-service/store.cjs').createStore({filename}),control=require('../deploy-service/control-store.cjs').openControlStore({filename,store});let retained;
 try{const config={recordId:'A001',name:'OFFLINE FIXTURE',entryUrl:'https://official.example/',enabled:false,fields:['stability'],publicReferenceEnabled:true,publicReferenceFields:['stability']};store.seedSites([config]);control.initializeProfiles([config]);control.setControl({engineEnabled:true,executionMode:'standalone'});
  const raw={url:'https://historical.example/report',text:'OFFLINE ORIGINAL ACCOUNT/PUBLIC MATERIAL',observedAt:'2026-10-26T10:45:28.845Z'},bytes=Buffer.from(JSON.stringify(raw)),sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  retained=require('../deploy-service/retained-performance-inputs.cjs').createRetainedInputs({store,control,catalogDb:{detail:()=>({item:{sources:[{id:'original',url:raw.url,sha256,observedAt:raw.observedAt}]}})}});
  const staged=retained.enqueue({siteId:'A001',actor:'offline-fixture',artifacts:[{sourceId:'original',base64:bytes.toString('base64')}]});const lease=control.claimBridge({worker:'fixture',siteId:'A001',executionMode:'standalone'});assert.equal(lease.jobId,staged.jobId);const captures=retained.captures(lease.jobId);
  assert.throws(()=>control.acceptBridgeResult(lease.jobId,lease.token,{captures}),/Public reference/);
  assert.throws(()=>control.acceptBridgeResult(lease.jobId,lease.token,{captures:[{...captures[0],body:'FORGED'}],retainedSourceAdmission:true}),/Public reference/);
  const result=control.acceptBridgeResult(lease.jobId,lease.token,{captures,retainedSourceAdmission:true});assert.equal(result.status,'completed');assert.equal(store.listEvidence()[0].observations[0].observedAt,raw.observedAt);
 }finally{control.close();store.close();fs.rmSync(dir,{recursive:true,force:true});}
});
