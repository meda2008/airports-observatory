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
 }finally{await new Promise(r=>app.server.close(r));await app.publisher.close();fs.rmSync(dir,{recursive:true});}
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
 }finally{await new Promise(r=>app.server.close(r));await app.publisher.close();fs.rmSync(dir,{recursive:true});}
});
test('compact admin status, bound evidence and background publication keep separate contracts',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'airports-publication-worker-')),filename=path.join(dir,'one.sqlite');
 const adminToken='unit-admin-auth-9f8e7d6c5b4a3210-strong-key',internalToken='unit-worker-rpc-1a2b3c4d5e6f7890-strong-key';
 const app=createThreeServiceApi({filename,adminToken,internalToken});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));await app.publisher.close();fs.rmSync(dir,{recursive:true,force:true});});
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
});
