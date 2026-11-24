'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {createRetainedInputs}=require('../deploy-service/retained-performance-inputs.cjs');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function fixture(t,{raw,observedAt='2019-03-18T09:53:00.000Z'}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'retained-input-test-')),filename=path.join(dir,'retained.sqlite'),url='https://review.example/retained-report';
 const artifact=raw||{url,text:'OFFLINE FIXTURE ONLY: historical throughput table, no live measurement',observedAt,links:[{url:'https://official.example/'}],images:[],timeMetadata:[]},bytes=Buffer.from(JSON.stringify(artifact));
 const source={id:'catalog-source-fixture-A001',url,sha256:sha(bytes),observedAt},sources=[source],calls={enqueue:[],cancel:[]};let existing=false;
 const control={getProfile:id=>id==='A001'?{config:{entryUrl:'https://official.example/',publicReferenceEnabled:true,publicReferenceFields:['speed']}}:null,enqueue:value=>{calls.enqueue.push(value);return{jobId:'retained-fixture-job',status:'queued',existing};},cancelJob:(id,value)=>calls.cancel.push({id,value})};
 const store={getSite:id=>id==='A001'?{document:{website:{url:'https://official.example/'}}}:null};
 const catalogDb={detail:(id,options)=>{assert.deepEqual(options.facts(),{});return id==='A001'?{item:{id,sources}}:null;}};
 const inputs=createRetainedInputs({filename,store,control,catalogDb});
 t.after(()=>{inputs.close();fs.rmSync(dir,{recursive:true,force:true});});
 return{filename,inputs,calls,source,bytes,sources,control,setExisting:()=>{existing=true;},item:()=>({sourceId:source.id,base64:bytes.toString('base64')}),enqueue:artifacts=>inputs.enqueue({siteId:'A001',actor:'offline-fixture',artifacts})};
}
function count(filename){const db=new DatabaseSync(filename,{readOnly:true});try{return db.prepare('SELECT COUNT(*) n FROM collector_retained_inputs').get().n;}finally{db.close();}}
test('catalog-bound original bytes retain original clock, body, source hash and public queue scope without network',t=>{
 const f=fixture(t),originalFetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('Network must not be used');};
 try{const result=f.enqueue([f.item()]);assert.equal(result.networkRequired,false);assert.equal(result.retained,true);assert.deepEqual(result.sources,[{originalSourceId:f.source.id,observedAt:f.source.observedAt,sha256:f.source.sha256}]);
  assert.deepEqual(f.calls.enqueue,[{siteId:'A001',purpose:'validation',collectionScope:'public_references',actor:'offline-fixture'}]);
  const [capture]=f.inputs.captures(result.jobId);assert.equal(capture.body,JSON.parse(f.bytes).text);assert.equal(capture.observedAt,'2019-03-18T09:53:00.000Z');assert.equal(capture.kind,'retained_performance_reference');assert.equal(capture.metadata.retainedArtifactSha256,sha(f.bytes));assert.equal(capture.metadata.originalSourceId,f.source.id);assert.equal(capture.metadata.currentCatalogHostname,'official.example');assert.equal(count(f.filename),1);assert.equal(f.inputs.captures('not-a-job'),null);
 }finally{globalThis.fetch=originalFetch;}
});
test('cross-site and fake artifact hashes are rejected before a queue job is created',t=>{
 const f=fixture(t);assert.throws(()=>f.enqueue([{...f.item(),sourceId:'catalog-source-fixture-A002'}]),/catalog_source/);
 assert.throws(()=>f.inputs.enqueue({siteId:'A002',actor:'fixture',artifacts:[f.item()]}),/site_missing/);
 const changed=Buffer.from(JSON.stringify({url:f.source.url,text:'changed bytes'})).toString('base64');assert.throws(()=>f.enqueue([{sourceId:f.source.id,base64:changed}]),/hash_mismatch/);
 f.source.sha256='0'.repeat(64);assert.throws(()=>f.enqueue([f.item()]),/hash_mismatch/);assert.equal(f.calls.enqueue.length,0);assert.equal(count(f.filename),0);
});
test('mismatching original timestamp is rejected even when catalog artifact hash matches',t=>{
 const f=fixture(t,{raw:{url:'https://review.example/retained-report',text:'OFFLINE FIXTURE: clock mismatch',capturedAt:'2020-01-01T00:00:00.000Z'}});
 assert.throws(()=>f.enqueue([f.item()]),/clock_mismatch/);assert.equal(f.calls.enqueue.length,0);assert.equal(count(f.filename),0);
});
test('invalid original clock is held instead of silently replaced by a catalog clock',t=>{
 const f=fixture(t,{raw:{url:'https://review.example/retained-report',text:'OFFLINE FIXTURE: invalid clock',observedAt:'not-an-observation-time'}});
 assert.throws(()=>f.enqueue([f.item()]),/clock/);assert.equal(f.calls.enqueue.length,0);assert.equal(count(f.filename),0);
});
test('duplicate source and noncanonical base64 cannot create duplicate captures',t=>{
 const f=fixture(t);assert.throws(()=>f.enqueue([f.item(),f.item()]),/duplicate_retained_source/);assert.throws(()=>f.enqueue([{...f.item(),base64:f.item().base64+'\n'}]),/hash_mismatch/);assert.equal(f.calls.enqueue.length,0);assert.equal(count(f.filename),0);
});
test('existing job is not overwritten or cancelled by another retained enqueue',t=>{
 const f=fixture(t),first=f.enqueue([f.item()]),before=f.inputs.captures(first.jobId);f.setExisting();assert.throws(()=>f.enqueue([f.item()]),/existing_job/);assert.deepEqual(f.inputs.captures(first.jobId),before);assert.equal(count(f.filename),1);assert.equal(f.calls.cancel.length,0);
});
test('unscoped, financial and excluded-site replay requests cannot stage originals',t=>{
 const f=fixture(t);for(const siteId of ['A159','A01','https://example.org/'])assert.throws(()=>f.inputs.enqueue({siteId,actor:'fixture',artifacts:[f.item()]}),/scope/);
 assert.throws(()=>f.inputs.enqueue({siteId:'A001',actor:'',artifacts:[f.item()]}),/scope/);
 const profile=f.control.getProfile('A001');f.control.getProfile=()=>({...profile,config:{...profile.config,publicReferenceFields:['pricing']}});assert.throws(()=>f.enqueue([f.item()]),/explicit_retained_performance_scope/);assert.equal(f.calls.enqueue.length,0);
});
test('expired retained lease recovery preserves bytes and retries idempotently without reclaiming twice',t=>{
 const f=fixture(t);f.enqueue([f.item()]);
 const db=new DatabaseSync(f.filename);db.exec('CREATE TABLE jobs(id TEXT,site_id TEXT,token TEXT,status TEXT,lease_until INTEGER,profile_revision INTEGER)');db.prepare('INSERT INTO jobs VALUES(?,?,?,?,?,?)').run('retained-fixture-job','A001','original-token','leased',Date.now()-1000,4);
 f.control.getProfile=()=>({revision:4,config:{entryUrl:'https://official.example/'}});let claims=0;f.control.claimBridge=()=>{claims++;return{jobId:'retained-fixture-job',runId:'recovered-run',token:'replacement-token'};};
 assert.throws(()=>f.inputs.recover({jobId:'retained-fixture-job',token:'forged-token'}),/owned_lease/);
 const first=f.inputs.recover({jobId:'retained-fixture-job',token:'original-token'});assert.equal(first.job.retainedCaptures[0].observedAt,f.source.observedAt);assert.equal(first.job.retainedCaptures[0].body,JSON.parse(f.bytes).text);
 const retry=f.inputs.recover({jobId:'retained-fixture-job',token:'original-token'});assert.equal(retry.replayed,true);assert.deepEqual(retry.job,first.job);assert.equal(claims,1);db.close();
});
