'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createThreeServiceApi}=require('../deploy-service/three-service-api.cjs');
test('single API isolates UI and internal auth and shares canonical measurement storage',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'airports-three-api-')),file=path.join(dir,'one.sqlite');
 const app=createThreeServiceApi({filename:file,adminToken:'unit-admin-auth-9f8e7d6c5b4a3210-strong-key',internalToken:'unit-worker-rpc-1a2b3c4d5e6f7890-strong-key'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 try{
 for(const route of ['/api/admin/discovery/seeds','/api/admin/discovery/import-retained','/api/admin/discovery/reclassify-retained']){assert.equal((await fetch(base+route,{method:'POST',body:'{}'})).status,401);assert.equal((await fetch(base+route,{method:'POST',headers:{Authorization:'Bearer '+'unit-worker-rpc-1a2b3c4d5e6f7890-strong-key'},body:'{}'})).status,401);}
 const registered=await fetch(base+'/api/admin/discovery/seeds',{method:'POST',headers:{Authorization:'Bearer '+'unit-admin-auth-9f8e7d6c5b4a3210-strong-key','Content-Type':'application/json'},body:JSON.stringify({id:'api-dynamic-public-test',recordId:'A158',url:'https://example.org/',publisherConfigDiscovery:true})});assert.equal(registered.status,200);const seeds=await fetch(base+'/api/admin/discovery/seeds',{headers:{Authorization:'Bearer '+'unit-admin-auth-9f8e7d6c5b4a3210-strong-key'}}).then(r=>r.json());assert.ok(seeds.items.some(x=>x.id==='api-dynamic-public-test'));assert.equal((await fetch(base+'/api/admin/discovery/import-retained',{method:'POST',headers:{Authorization:'Bearer '+'unit-admin-auth-9f8e7d6c5b4a3210-strong-key','Content-Type':'application/json'},body:'{}'})).status,409);
 assert.equal((await fetch(base+'/api/admin/discovery/follow',{method:'POST',body:'{}'})).status,401);
 assert.equal((await fetch(base+'/api/admin/discovery/follow',{method:'POST',headers:{Authorization:'Bearer '+'unit-worker-rpc-1a2b3c4d5e6f7890-strong-key'},body:'{}'})).status,401);
 assert.equal((await fetch(base+'/api/admin/discovery/follow',{method:'POST',headers:{Authorization:'Bearer '+'unit-admin-auth-9f8e7d6c5b4a3210-strong-key','Content-Type':'application/json'},body:'{}'})).status,409);
 assert.equal((await fetch(base+'/api/admin/discovery/reclassify-retained',{method:'POST',headers:{Authorization:'Bearer '+'unit-admin-auth-9f8e7d6c5b4a3210-strong-key','Content-Type':'application/json'},body:'{}'})).status,409);
 assert.equal((await fetch(base+'/console.html')).status,404);assert.equal((await fetch(base+'/internal/measurement-worker',{method:'POST',body:'{}'})).status,401);
 const request=async(path,body)=>{const r=await fetch(base+path,{method:'POST',headers:{Authorization:'Bearer '+'unit-worker-rpc-1a2b3c4d5e6f7890-strong-key','Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,200);return r.json();};
 assert.equal((await request('/internal/measurement-worker',{method:'profiles',args:[]})).ok,true);
 assert.equal((await request('/internal/web-collector/control',{})).engineEnabled,false);
 app.measurements.setExecutor({owner:'collector',enabled:true});app.measurements.setEnabled(true);
 const state=await fetch(base+'/api/admin/measurements',{headers:{Authorization:'Bearer '+'unit-admin-auth-9f8e7d6c5b4a3210-strong-key'}}).then(r=>r.json());assert.equal(state.execution.owner,'collector');assert.equal(state.enabled,true);
 const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(file,{readOnly:true});assert(db.prepare("SELECT name FROM sqlite_master WHERE name='sites'").get());assert(db.prepare("SELECT name FROM sqlite_master WHERE name='measurement_observations'").get());db.close();
 }finally{await new Promise(r=>app.server.close(r));fs.rmSync(dir,{recursive:true});}
});
test('transient SQLite errors in internal RPC surface as 503 and recover on retry',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'airports-rpc-retry-')),filename=path.join(dir,'one.sqlite');
 const internalToken='unit-worker-rpc-1a2b3c4d5e6f7890-strong-key';
 const app=createThreeServiceApi({filename,adminToken:'unit-admin-auth-9f8e7d6c5b4a3210-strong-key',internalToken});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));fs.rmSync(dir,{recursive:true});});
 const request=(route,payload)=>fetch('http://127.0.0.1:'+app.server.address().port+route,{method:'POST',headers:{Authorization:'Bearer '+internalToken},body:JSON.stringify(payload)});
 const profiles=app.measurements.profiles;
 let calls=0;
 t.mock.method(app.measurements,'profiles',()=>{
  if(++calls===1)throw Object.assign(Error('local database busy'),{code:'ERR_SQLITE_ERROR',errcode:261});
  return profiles();
 });
 const input={method:'profiles',args:[]};
 const first=await request('/internal/measurement-worker',input);
 assert.equal(first.status,503);
 assert.deepEqual(await first.json(),{ok:false,error:'internal_storage_temporarily_unavailable'});
 assert.equal((await request('/internal/web-collector/control',{})).status,200);
 const second=await request('/internal/measurement-worker',input);
 assert.equal(second.status,200);
 assert.equal((await second.json()).ok,true);
 assert.equal((await request('/internal/measurement-worker',{method:'unsupported',args:[]})).status,409);
});

test('admin snapshot has explicit minimal site scope and never exports retained evidence bodies',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'airports-three-snapshot-')),file=path.join(dir,'one.sqlite');
 const app=createThreeServiceApi({filename:file,adminToken:'unit-admin-auth-9f8e7d6c5b4a3210-strong-key',internalToken:'unit-worker-rpc-1a2b3c4d5e6f7890-strong-key'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 try{
  const headers={Authorization:'Bearer '+'unit-admin-auth-9f8e7d6c5b4a3210-strong-key'},route='/api/admin/performance/snapshot';
  app.store.saveEvidence({siteId:'A001',url:'https://example.org/private-retained-original',body:'SNAPSHOT-MUST-NOT-INCLUDE-THIS-EVIDENCE-BODY',observedAt:'2026-11-14T00:00:00Z',kind:'operator_visible_page'});
  assert.equal((await fetch(base+route)).status,401);assert.equal((await fetch(base+route,{headers:{Authorization:'Bearer '+'unit-worker-rpc-1a2b3c4d5e6f7890-strong-key'}})).status,401);
  const selected=await fetch(base+route+'?sites=A001,A002',{headers});assert.equal(selected.status,200);assert.equal(selected.headers.get('cache-control'),'no-store');const value=await selected.json();assert.deepEqual(Object.keys(value).sort(),['profiles','sites']);assert.deepEqual(value.profiles.map(p=>p.siteId).sort(),['A001','A002']);assert.deepEqual(value.sites.map(p=>p.id).sort(),['A001','A002']);
  for(const row of value.profiles)assert.deepEqual(Object.keys(row).sort(),['config','revision','siteId']);for(const row of value.sites)assert.deepEqual(Object.keys(row).sort(),['document','id','revision']);assert(!JSON.stringify(value).includes('SNAPSHOT-MUST-NOT-INCLUDE-THIS-EVIDENCE-BODY'));assert(!JSON.stringify(value).includes('private-retained-original'));
  for(const query of ['?sites=A001&sites=A002','?sites=A001,A001','?sites=A01','?sites=','?sites=https://example.org/','?extra=A001'])assert.equal((await fetch(base+route+query,{headers})).status,400,query);
  const all=await fetch(base+route,{headers}).then(r=>r.json());assert(all.profiles.length>=2);assert(all.sites.length>=2);
 }finally{await new Promise(r=>app.server.close(r));fs.rmSync(dir,{recursive:true});}
});
test('compact admin status, bound evidence and background publication keep separate contracts',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'airports-publication-worker-')),filename=path.join(dir,'one.sqlite');
 const adminToken='unit-admin-auth-9f8e7d6c5b4a3210-strong-key',internalToken='unit-worker-rpc-1a2b3c4d5e6f7890-strong-key';
 const app=createThreeServiceApi({filename,adminToken,internalToken});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise((resolve,reject)=>app.server.close(error=>error?reject(error):resolve()));fs.rmSync(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+app.server.address().port,headers={Authorization:'Bearer '+adminToken};
 const checkpoint=app.store.saveEvidence({siteId:'A001',url:'https://example.org/checkpoint',body:'SYNTHETIC checkpoint',kind:'verification_checkpoint',observedAt:'2026-11-14T00:00:00Z'});
 app.store.saveEvidence({siteId:'A001',url:'https://example.org/page',body:'SYNTHETIC original',kind:'operator_visible_page',observedAt:'2026-11-14T00:00:00Z'});
 const get=p=>fetch(base+p,{headers}).then(r=>r.json());
 const legacy=await get('/api/admin/status'),runtime=await get('/api/admin/status?view=runtime');
 assert.deepEqual(legacy.checkpoints.map(e=>e.id),[checkpoint.id]);
 assert.equal(legacy.checkpoints[0].observations[0].observedAt,'2026-11-14T00:00:00Z');
 assert.deepEqual(Object.keys(runtime).sort(),['database','updateService']);
 assert.equal(runtime.database.snapshotId,legacy.database.snapshotId);
 assert.equal((await get('/api/admin/evidence?id='+checkpoint.id)).item.body,'SYNTHETIC checkpoint');
 const [sync,list]=await Promise.all([fetch(base+'/api/admin/sync',{method:'POST',headers,body:'{}'}).then(r=>r.json()),get('/api/catalog?view=card')]);
 assert.ok(['published','unchanged'].includes(sync.result.status));
 assert.equal(list.snapshotId,sync.result.snapshotId);
 const catalogRoute=base+'/api/catalog?limit=12';
 const identity=await fetch(catalogRoute,{headers:{'Accept-Encoding':'gzip;q=0, *;q=1'}});
 const compressed=await fetch(catalogRoute,{headers:{'Accept-Encoding':'gzip'}});
 assert.equal(identity.headers.get('content-encoding'),null);
 assert.equal(compressed.headers.get('content-encoding'),'gzip');
 assert.equal(compressed.headers.get('vary'),'Accept-Encoding');
 assert.ok(Number(compressed.headers.get('content-length'))<Number(identity.headers.get('content-length')));
 assert.deepEqual(await compressed.json(),await identity.json());
 const oversized=await fetch(base+'/internal/web-collector/receive',{method:'POST',headers:{Authorization:'Bearer '+internalToken},body:JSON.stringify({text:'汉'.repeat(720000)})});
 assert.equal(oversized.status,413);
 const profile=app.control.getProfile('A001');
 app.control.updateProfile('A001',{expectedRevision:profile.revision,config:{enabled:true}});
 app.control.setControl({engineEnabled:true,executionMode:'standalone'});
 app.control.enqueue({siteId:'A001',purpose:'validation'});
 const job=app.control.claimBridge({siteId:'A001',worker:'fixture',executionMode:'standalone'});
 const origin=new URL(job.site.config.entryUrl).origin;
 const captures=Array.from({length:4},(_,i)=>({url:origin+'/synthetic-batches/'+i,body:'汉'.repeat(180000),kind:'operator_visible_page',observedAt:'2026-11-14T00:00:00Z'}));
 const transport=require('../lib/collector-submission.cjs').submissionPlan({jobId:job.jobId,token:job.token,captures});
 assert.equal(transport.op,'receivebatches');
 const submit=body=>fetch(base+'/internal/web-collector/'+transport.op,{method:'POST',headers:{Authorization:'Bearer '+internalToken,'Content-Type':'application/x-ndjson'},body});
 assert.equal((await submit(transport.body.replace('汉','字'))).status,409);
 assert.ok(app.store.listEvidenceMetadata().every(e=>!e.url.includes('/synthetic-batches/')));
 const accepted=await submit(transport.body);
 assert.equal(accepted.status,200,await accepted.clone().text());
 assert.equal(app.store.listEvidenceMetadata().filter(e=>e.url.includes('/synthetic-batches/')).length,4);
 const site=app.store.getSite('A001');
 for(let i=0;i<51;i++)app.store.createProposal({siteId:site.id,expectedRevision:site.revision,evidenceIds:[checkpoint.id],patch:{refund:{summary:'synthetic proposal '+i}}});
 const sql=new (require('node:sqlite').DatabaseSync)(filename);
 try{
  const insert=sql.prepare('INSERT INTO collector_checkpoints(id,run_id,job_id,site_id,status,material_json,created_at) VALUES(?,?,?,?,?,?,?)');
  for(let i=0;i<51;i++)insert.run('test-checkpoint-'+i,job.runId,job.jobId,site.id,'open','{}',Date.now());
 }finally{sql.close();}
 const proposals='/api/admin/proposals';
 const p1=await get(proposals+'?page=1'),p2=await get(proposals+'?page=2');
 assert.deepEqual([p1.items.length,p1.hasMore,p2.items.length,p2.hasMore],[50,true,1,false]);
 assert.ok(p1.items.every(p=>!Object.hasOwn(p,'patch')&&!Object.hasOwn(p,'evidenceIds')));
 assert.ok(p1.items.every(p=>p.id!==p2.items[0].id));
 assert.ok((await get(proposals+'/'+p2.items[0].id)).patch.refund.summary);
 assert.equal((await get(proposals)).items.length>=51,true);
 const status='/api/admin/collection/status?page=1&checkpointPage=';
 const c1=await get(status+'1'),c2=await get(status+'2');
 assert.deepEqual([c1.checkpoints.length,c1.checkpointPage.hasMore,c2.checkpointPage.hasMore],[50,true,false]);
 assert.ok(c2.checkpoints.some(c=>c.id==='test-checkpoint-0'));
 assert.ok(c1.checkpoints.every(c=>c2.checkpoints.every(other=>other.id!==c.id)));
 assert.equal((await fetch(base+status+'0',{headers})).status,400);
});

test('bounded outbox replay cannot reclaim the third retained job through the real claim endpoint',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'airports-claim-exclusion-')),filename=path.join(dir,'fixture.sqlite');
 const internalToken='unit-worker-rpc-1a2b3c4d5e6f7890-strong-key';
 const app=createThreeServiceApi({filename,adminToken:'unit-admin-auth-9f8e7d6c5b4a3210-strong-key',internalToken});
 const db=new (require('node:sqlite').DatabaseSync)(filename);
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{db.close();await new Promise(resolve=>app.server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});});
 const baseUrl='http://127.0.0.1:'+app.server.address().port;
 const {createWebCollector,createWebTransport}=require('../deploy-service/collector-web-runtime.cjs');
 const transport=createWebTransport({baseUrl,token:internalToken});
 const output=path.join(dir,'outbox');
 fs.mkdirSync(output);
 app.control.setControl({engineEnabled:true,executionMode:'standalone'});
 const ids=['A001','A002','A003','A004'];
 const staged=ids.map(siteId=>{
  const p=app.control.getProfile(siteId);
  app.control.updateProfile(siteId,{expectedRevision:p.revision,config:{publicReferenceEnabled:true,publicReferenceFields:['speed']}});
  const hostname=new URL(app.store.getSite(siteId).document?.website?.url||p.config.entryUrl).hostname;
  const captures=[{url:'https://fixture.example/'+siteId,observedAt:'2026-11-14T00:00:00Z',body:'synthetic original '+siteId,kind:'retained_performance_reference',metadata:{retainedReplayVerified:true,currentCatalogHostname:hostname,originalSourceId:'fixture-'+siteId,retainedArtifactSha256:'a'.repeat(64)}}];
  return app.control.enqueueRetainedInput({siteId,actor:'fixture'},()=>captures);
 });
 const expired=ids.slice(0,3).map((siteId,index)=>{
  const job=app.control.claimBridge({siteId,executionMode:'standalone',worker:'fixture',leaseMs:10000});
  assert.equal(job?.jobId,staged[index].jobId);
  const {token}=job;
  db.prepare('UPDATE jobs SET lease_until=0,due_at=? WHERE id=?').run(index,job.jobId);
  const runDir=path.join(output,[siteId,job.jobId,job.runId].join('-'));
  fs.mkdirSync(runDir);
  const file=path.join(runDir,'pending-submission.json');
  const original=JSON.stringify({siteId,jobId:job.jobId,runId:job.runId,packet:{jobId:job.jobId,token,captures:staged[index].captures}});
  fs.writeFileSync(file,original);
  fs.utimesSync(file,index+1,index+1);
  return {...job,token,runDir,original};
 });
 const recoveries=[],claims=[],completions=[];
 let lostRecoveryResponse=false;
 let outboxClock=0;
 const worker=createWebCollector({output,clock:()=>outboxClock,log:()=>{},browserFactory:async()=>assert.fail('retained-only collection attempted browser access'),request:async(op,input,body)=>{
  if(op==='recoverretained'){
   recoveries.push(input.jobId);
   if(input.jobId!==expired[2].jobId)throw Object.assign(Error('fixture transient failure'),{status:503});
   if(!lostRecoveryResponse){
    await transport(op,input,body);
    lostRecoveryResponse=true;
    throw Object.assign(Error('fixture lost success response'),{status:503});
   }
  }
  if(op==='claim')claims.push(input.pendingJobIds);
  if(op==='complete')completions.push(input.jobId);
  return transport(op,input,body);
 }});
 t.after(()=>worker.stop());
 const first=await worker.runOne();
 assert.equal(first.jobId,staged[3].jobId);
 assert.deepEqual(recoveries,expired.slice(0,2).map(job=>job.jobId));
 assert.deepEqual(new Set(claims[0]),new Set(expired.map(job=>job.jobId)));
 assert.equal(db.prepare('SELECT token FROM jobs WHERE id=?').get(expired[2].jobId).token,expired[2].token);
 assert.equal(fs.existsSync(path.join(expired[2].runDir,'pending-submission-hold.json')),false);
 assert.equal((await worker.runOne()).status,'submission_deferred');
 assert.equal(lostRecoveryResponse,true);
 const replacementToken=db.prepare('SELECT token FROM jobs WHERE id=?').get(expired[2].jobId).token;
 assert.notEqual(replacementToken,expired[2].token);
 outboxClock=1000;
 const second=await worker.runOne({siteId:'A003'});
 assert.equal(second.jobId,expired[2].jobId);
 assert.equal(second.acceptanceRecoveredFromApi,true);
 assert.deepEqual(recoveries,[...expired.map(job=>job.jobId),expired[2].jobId]);
 assert.deepEqual(completions,[]);
 assert.equal(fs.readFileSync(path.join(expired[2].runDir,'original-pending-submission.json'),'utf8'),expired[2].original);
 assert.ok(app.store.listEvidenceMetadata().some(item=>item.url==='https://fixture.example/A003'));
 assert.equal(db.prepare('SELECT count(*) n FROM collector_retained_recoveries WHERE job_id=?').get(expired[2].jobId).n,1);
 assert.equal((await transport('claim',{siteId:'A001',pendingJobIds:[expired[0].jobId]})).job,null);
 await assert.rejects(transport('claim',{pendingJobIds:['invalid/id']}),error=>error.status===400);
 const admin=async(route,body)=>{
  const response=await fetch(baseUrl+'/api/admin/discovery'+route,{method:'POST',headers:{authorization:'Bearer unit-admin-auth-9f8e7d6c5b4a3210-strong-key'},body:JSON.stringify(body)});
  assert.equal(response.status,200);
  return response.json();
 };
 await admin('/seeds',{id:'fixture-claim-skip',recordId:'A004',url:'https://fixture.example/'});
 const discovery=await admin('',{seedId:'fixture-claim-skip'});
 assert.equal((await transport('claim',{siteId:'A004',pendingJobIds:[discovery.jobId]})).job,null);
 assert.equal((await transport('claim',{siteId:'A004'})).job.jobId,discovery.jobId);
 app.control.cancelJob(expired[0].jobId);
 await transport('claim',{siteId:'A004'});
 outboxClock=1000;
 assert.equal((await worker.runOne({siteId:'A001'})).status,'cancelled');
 assert.equal(fs.readFileSync(path.join(expired[0].runDir,'cancelled-pending-submission.json'),'utf8'),expired[0].original);
 assert.equal(fs.existsSync(path.join(expired[0].runDir,'pending-submission.json')),false);
 assert.deepEqual(recoveries,[...expired.map(job=>job.jobId),expired[2].jobId]);
});
