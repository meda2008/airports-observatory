'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {openMeasurementStore}=require('../deploy-service/measurement-store.cjs');
const {dispatch}=require('../deploy-service/measurement-rpc.cjs');
const {openRemoteMeasurementStore,readBackend}=require('../deploy-service/measurement-connection.cjs');
test('remote management and conclusion queries use one canonical database and preserve raw identity',()=>{
 const store=openMeasurementStore({filename:':memory:',executorId:'docker-local'});
 try{store.setExecutor({owner:'docker-local',enabled:true});const remote=openRemoteMeasurementStore({container:'measurement-test',transport:r=>({ok:true,value:dispatch(store,r)})});
 assert.equal(remote.status().execution.owner,'docker-local');remote.setEnabled(true);assert.equal(store.enabled(),true);
 remote.configure({id:'fixture-probe',siteId:'TEST-PROBE',kind:'stability',synthetic:true,enabled:true,endpoint:'http://127.0.0.1:1',intervalMs:1000});
 const claim=store.claim({id:'fixture-probe'});const o=store.finish(claim,{observedAt:new Date().toISOString(),status:'missing',reason:'test_missing'});
 assert.equal(remote.observations('fixture-probe')[0].id,o.id);assert.equal(remote.observations('fixture-probe')[0].sha256,store.observations('fixture-probe')[0].sha256);
 assert.equal(remote.db.prepare('SELECT id,scheduled_at,started_at FROM measurement_runs WHERE profile_id=? AND profile_revision=? ORDER BY scheduled_at').all('fixture-probe',1).length,1);
 remote.linkProposal('fixture-probe',[o.id],'proposal-test');assert.equal(remote.findProposal('fixture-probe',[o.id]),'proposal-test');
 assert.throws(()=>remote.db.prepare('DELETE FROM measurement_runs'),/not_allowed/);assert.throws(()=>dispatch(store,{method:'claim',args:[]}),/rejected/);
 }finally{store.close();}
});
test('remote failure never falls back to the old local database',()=>{
 const remote=openRemoteMeasurementStore({container:'measurement-test',transport(){throw Error('private transport detail');}});
 assert.throws(()=>remote.status(),e=>e.message==='measurement_docker_backend_unavailable');
 assert.throws(()=>openRemoteMeasurementStore({container:'bad;echo secret'}),/invalid/);
});
test('backend marker rejects malformed configuration instead of enabling legacy execution',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'measurement-connection-')),file=path.join(dir,'backend.json');
 assert.equal(readBackend(file).mode,'local');fs.writeFileSync(file,JSON.stringify({mode:'docker',container:'local-measurements-1'}));assert.equal(readBackend(file).mode,'docker');
 fs.writeFileSync(file,JSON.stringify({mode:'local'}));assert.throws(()=>readBackend(file),/invalid/);fs.rmSync(dir,{recursive:true});
});
