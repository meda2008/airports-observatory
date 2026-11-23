'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {openMeasurementStore}=require('../deploy-service/measurement-store.cjs');
const {createMeasurementWorker}=require('../deploy-service/measurement-worker.cjs');
const profile={id:'executor-fixture',siteId:'TEST',kind:'stability',enabled:true,synthetic:true,intervalMs:1000,timeoutMs:100,maxBytes:100};
test('executor fence persists restart and ordinary enable cannot resurrect legacy writer',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'measurement-fence-')),filename=path.join(dir,'fixture.sqlite');
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 let store=openMeasurementStore({filename});store.configure(profile);store.setEnabled(true);
 store.setExecutor({owner:'docker-local',enabled:false});assert.equal(store.claim(),null);
 store.setEnabled(false);store.setEnabled(true);assert.equal(store.canExecute(),false);store.close();
 store=openMeasurementStore({filename});assert.equal(store.executionStatus().owner,'docker-local');assert.equal(store.claim(),null);
 let calls=0;assert.equal((await createMeasurementWorker({store,routeMeasure:async()=>{calls++;}}).runOne()).status,'fenced');assert.equal(calls,0);
 store.setExecutor({owner:'docker-local',enabled:true});assert.equal(store.claim(),null);store.close();
 store=openMeasurementStore({filename,executorId:'docker-local'});assert.equal(store.canExecute(),true);assert.ok(store.claim());store.close();
});
test('executor fencing drains active lease and expired restart preserves missing evidence',()=>{
 let now=1700000000000;const store=openMeasurementStore({filename:':memory:',now:()=>now});
 try{store.configure(profile);store.setEnabled(true);const claimed=store.claim();store.setExecutor({owner:'docker-local',enabled:true});
 const result=store.finish(claimed,{status:'ok',observedAt:new Date(now).toISOString()});assert.ok(result.id);assert.equal(store.claim(),null);
 store.setExecutor({owner:'legacy',enabled:true});now+=1000;const stale=store.claim();assert.ok(stale);now+=61000;
 assert.equal(store.claim(),null);assert.equal(store.observations().length,2);assert.equal(store.observations()[1].reason,'worker_lease_expired');assert.throws(()=>store.finish(stale,{status:'ok'}),/lease/);
 }finally{store.close();}
});
