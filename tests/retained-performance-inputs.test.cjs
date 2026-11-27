'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {createRetainedInputs}=require('../deploy-service/retained-performance-inputs.cjs');
const {createStore}=require('../deploy-service/store.cjs'),{openControlStore}=require('../deploy-service/control-store.cjs');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function fixture(t,{raw,observedAt='2019-03-18T09:53:00.000Z'}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'retained-input-test-')),filename=path.join(dir,'retained.sqlite'),url='https://review.example/retained-report';
 const artifact=raw||{url,text:'OFFLINE FIXTURE ONLY: historical throughput table, no live measurement',observedAt,links:[{url:'https://official.example/'}],images:[],timeMetadata:[]},bytes=Buffer.from(JSON.stringify(artifact));
 const source={id:'catalog-source-fixture-A001',url,sha256:sha(bytes),observedAt},sources=[source];
 let now=Date.now();
 const store=createStore({filename}),db=new DatabaseSync(filename);
 const profile={recordId:'A001',name:'Fixture',entryUrl:'https://official.example/',enabled:true,fields:['pricing'],publicReferenceEnabled:true,publicReferenceFields:['speed']};
 store.seedSites([profile]);
 const control=openControlStore({filename,store,clock:()=>now});
 control.initializeProfiles([profile]);
 control.setControl({engineEnabled:true,executionMode:'standalone'});
 const catalogDb={detail:(id,options)=>{assert.deepEqual(options.facts(),{});return id==='A001'?{item:{id,sources}}:null;}};
 const inputs=createRetainedInputs({store,control,catalogDb});
 t.after(()=>{control.close();store.close();db.close();fs.rmSync(dir,{recursive:true,force:true});});
 return{dir,db,store,filename,inputs,source,bytes,sources,control,advance:ms=>now+=ms,item:()=>({sourceId:source.id,base64:bytes.toString('base64')}),enqueue:artifacts=>inputs.enqueue({siteId:'A001',actor:'offline-fixture',artifacts})};
}
function count(filename){const db=new DatabaseSync(filename,{readOnly:true});try{return db.prepare('SELECT COUNT(*) n FROM collector_retained_inputs').get().n;}finally{db.close();}}
test('catalog-bound original bytes retain original clock, body, source hash and public queue scope without network',t=>{
 const f=fixture(t),originalFetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('Network must not be used');};
 try{const result=f.enqueue([f.item()]);assert.equal(result.networkRequired,false);assert.equal(result.retained,true);assert.deepEqual(result.sources,[{originalSourceId:f.source.id,observedAt:f.source.observedAt,sha256:f.source.sha256}]);
  assert.deepEqual({...f.db.prepare('SELECT site_id,purpose,collection_scope,retained_only FROM jobs WHERE id=?').get(result.jobId)},{site_id:'A001',purpose:'validation',collection_scope:'public_references',retained_only:1});
  const [capture]=f.inputs.captures(result.jobId);assert.equal(capture.body,JSON.parse(f.bytes).text);assert.equal(capture.observedAt,'2019-03-18T09:53:00.000Z');assert.equal(capture.kind,'retained_performance_reference');assert.equal(capture.metadata.retainedArtifactSha256,sha(f.bytes));assert.equal(capture.metadata.originalSourceId,f.source.id);assert.equal(capture.metadata.currentCatalogHostname,'official.example');assert.equal(count(f.filename),1);assert.equal(f.inputs.captures('not-a-job'),null);
 }finally{globalThis.fetch=originalFetch;}
});
test('cross-site and fake artifact hashes are rejected before a queue job is created',t=>{
 const f=fixture(t);assert.throws(()=>f.enqueue([{...f.item(),sourceId:'catalog-source-fixture-A002'}]),/catalog_source/);
 assert.throws(()=>f.inputs.enqueue({siteId:'A002',actor:'fixture',artifacts:[f.item()]}),/site_missing/);
 const changed=Buffer.from(JSON.stringify({url:f.source.url,text:'changed bytes'})).toString('base64');assert.throws(()=>f.enqueue([{sourceId:f.source.id,base64:changed}]),/hash_mismatch/);
 f.source.sha256='0'.repeat(64);assert.throws(()=>f.enqueue([f.item()]),/hash_mismatch/);assert.equal(f.store.listJobs().length,0);assert.equal(count(f.filename),0);
});
test('mismatching original timestamp is rejected even when catalog artifact hash matches',t=>{
 const f=fixture(t,{raw:{url:'https://review.example/retained-report',text:'OFFLINE FIXTURE: clock mismatch',capturedAt:'2020-01-01T00:00:00.000Z'}});
 assert.throws(()=>f.enqueue([f.item()]),/clock_mismatch/);assert.equal(f.store.listJobs().length,0);assert.equal(count(f.filename),0);
});
test('invalid original clock is held instead of silently replaced by a catalog clock',t=>{
 const f=fixture(t,{raw:{url:'https://review.example/retained-report',text:'OFFLINE FIXTURE: invalid clock',observedAt:'not-an-observation-time'}});
 assert.throws(()=>f.enqueue([f.item()]),/clock/);assert.equal(f.store.listJobs().length,0);assert.equal(count(f.filename),0);
});
test('duplicate source and noncanonical base64 cannot create duplicate captures',t=>{
 const f=fixture(t);assert.throws(()=>f.enqueue([f.item(),f.item()]),/duplicate_retained_source/);assert.throws(()=>f.enqueue([{...f.item(),base64:f.item().base64+'\n'}]),/hash_mismatch/);assert.equal(f.store.listJobs().length,0);assert.equal(count(f.filename),0);
});
test('existing job is not overwritten or cancelled by another retained enqueue',t=>{
 const f=fixture(t),first=f.enqueue([f.item()]),before=f.inputs.captures(first.jobId);assert.throws(()=>f.enqueue([f.item()]),/existing_job/);assert.deepEqual(f.inputs.captures(first.jobId),before);assert.equal(count(f.filename),1);assert.equal(f.store.listJobs()[0].status,'queued');
});
test('unscoped, financial and excluded-site replay requests cannot stage originals',t=>{
 const f=fixture(t);for(const siteId of ['A159','A01','https://example.org/'])assert.throws(()=>f.inputs.enqueue({siteId,actor:'fixture',artifacts:[f.item()]}),/scope/);
 assert.throws(()=>f.inputs.enqueue({siteId:'A001',actor:'',artifacts:[f.item()]}),/scope/);
 const profile=f.control.getProfile('A001');f.control.getProfile=()=>({...profile,config:{...profile.config,publicReferenceFields:['pricing']}});assert.throws(()=>f.enqueue([f.item()]),/explicit_retained_performance_scope/);assert.equal(f.store.listJobs().length,0);
});
test('retained enqueue rolls back the job, material and event after interruption in a child process',t=>{
 const f=fixture(t);
 const command=`
  const {DatabaseSync}=require('node:sqlite');
  const {createStore}=require('./deploy-service/store.cjs');
  const {openControlStore}=require('./deploy-service/control-store.cjs');
  const {createRetainedInputs}=require('./deploy-service/retained-performance-inputs.cjs');
  const [filename,sourceJson,base64]=process.argv.slice(1);
  const store=createStore({filename}),control=openControlStore({filename,store});
  const inputs=createRetainedInputs({store,control,catalogDb:{detail:()=>({item:{sources:[JSON.parse(sourceJson)]}})}});
  const prepare=DatabaseSync.prototype.prepare;
  DatabaseSync.prototype.prepare=function(sql){
   if(sql.startsWith('INSERT INTO collector_retained_inputs'))return {run:()=>process.exit(71)};
   return prepare.call(this,sql);
  };
  inputs.enqueue({siteId:'A001',actor:'interrupted-fixture',artifacts:[{sourceId:JSON.parse(sourceJson).id,base64}]});
 `;
 const child=require('node:child_process').spawnSync(process.execPath,['-e',command,f.filename,JSON.stringify(f.source),f.item().base64],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'});
 assert.equal(child.status,71,child.stderr);
 for(const table of ['jobs','collector_runs','collector_retained_inputs'])assert.equal(f.db.prepare('SELECT count(*) n FROM '+table).get().n,0,table);
 assert.equal(f.db.prepare("SELECT count(*) n FROM collector_events WHERE type='job_enqueued'").get().n,0);
 assert.equal(f.control.claimBridge({worker:'fixture',executionMode:'standalone'}),null);
 const staged=f.enqueue([f.item()]);
 assert.equal(f.control.claimBridge({worker:'fixture',executionMode:'standalone'}).retainedCaptures[0].body,JSON.parse(f.bytes).text);
 assert.equal(f.store.listJobs()[0].jobId,staged.jobId);
});
test('pre-migration material remains bound and known jobs with missing material cannot be claimed or retried',t=>{
 const f=fixture(t),staged=f.enqueue([f.item()]);
 // Reproduce the prior schema and its original material row before reopening.
 f.db.exec('ALTER TABLE jobs DROP COLUMN retained_only');
 const reopened=openControlStore({filename:f.filename,store:f.store});

 assert.equal(f.db.prepare('SELECT retained_only FROM jobs WHERE id=?').get(staged.jobId).retained_only,1);
 assert.equal(reopened.retainedCaptures(staged.jobId)[0].metadata.originalSourceId,f.source.id);
 assert.equal(reopened.claimBridge({worker:'fixture',executionMode:'standalone',includeRetained:false}),null);
 const claimed=reopened.claimBridge({worker:'fixture',executionMode:'standalone'});
 assert.deepEqual(claimed.retainedCaptures,reopened.retainedCaptures(staged.jobId));
 f.db.prepare('DELETE FROM collector_retained_inputs WHERE job_id=?').run(staged.jobId);
 f.db.prepare('UPDATE jobs SET lease_until=0 WHERE id=?').run(staged.jobId);
 assert.throws(()=>reopened.retainedCaptures(staged.jobId),/retained_material_unavailable/);
 assert.equal(f.store.claim('legacy'),null);
 assert.equal(reopened.claimBridge({worker:'fixture',executionMode:'standalone'}),null);
 assert.equal(reopened.getRun(claimed.runId).status,'leased');
 reopened.cancelJob(staged.jobId);
 assert.throws(()=>reopened.retryJob(staged.jobId),/retained_material_unavailable/);
 reopened.close();
});
test('retained lease recovery pins the exact job, rolls back a failed receipt and returns the same lease after a lost response',t=>{
 const f=fixture(t),staged=f.enqueue([f.item()]),claim=f.control.claimBridge({worker:'fixture',executionMode:'standalone',leaseMs:100});
 f.db.prepare("INSERT INTO jobs(id,site_id,due_at,created_at,status,purpose) SELECT 'other-job',site_id,due_at-1,created_at,'queued',purpose FROM jobs WHERE id=?").run(staged.jobId);
 f.db.prepare("INSERT INTO collector_runs(id,job_id,site_id,profile_revision,config_json,config_hash,purpose,status) SELECT 'other-run','other-job',site_id,profile_revision,config_json,config_hash,purpose,'queued' FROM collector_runs WHERE id=?").run(staged.runId);
 f.advance(101);
 assert.throws(()=>f.inputs.recover({jobId:staged.jobId,token:'forged-token'}),/owned_lease/);
 const original=f.db.prepare('SELECT * FROM jobs WHERE id=?').get(staged.jobId);
 f.db.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON collector_retained_recoveries BEGIN SELECT RAISE(ABORT,'fixture receipt failure'); END");
 const args={jobId:staged.jobId,token:claim.token};
 assert.throws(()=>f.inputs.recover(args),/fixture receipt failure/);
 assert.deepEqual(f.db.prepare('SELECT * FROM jobs WHERE id=?').get(staged.jobId),original);
 assert.equal(f.control.getRun(claim.runId).status,'leased');
 assert.equal(f.control.listRuns().length,2);
 assert.equal(f.db.prepare('SELECT count(*) n FROM collector_retained_recoveries').get().n,0);
 f.db.exec('DROP TRIGGER fail_receipt');
 const first=f.inputs.recover(args);
 assert.equal(first.replayed,false);
 assert.equal(first.job.jobId,staged.jobId);
 assert.notEqual(first.job.token,claim.token);
 assert.deepEqual(first.job.retainedCaptures,claim.retainedCaptures);
 assert.equal(f.control.getRun('other-run').status,'queued');
 const retry=f.inputs.recover(args);
 assert.equal(retry.replayed,true);
 assert.deepEqual(retry.job,first.job);
 assert.equal(f.control.listRuns().length,3);
});
