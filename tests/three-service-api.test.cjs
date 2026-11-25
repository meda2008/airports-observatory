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
