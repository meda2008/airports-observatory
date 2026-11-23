'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {dispatchMeasurementWorker,authorizedMeasurementWorker,openHttpMeasurementStore}=require('./measurement-worker-http.cjs');
const {createMeasurementWorker}=require('./measurement-worker.cjs');
const {runCollectorRuntime}=require('./collector-runtime.cjs');
test('worker HTTP interface limits methods, arguments and authorization',async()=>{
 const token='x'.repeat(32);assert.equal(authorizedMeasurementWorker('Bearer '+token,token),true);assert.equal(authorizedMeasurementWorker('Bearer bad',token),false);assert.equal(authorizedMeasurementWorker('Bearer short','short'),false);
 assert.throws(()=>dispatchMeasurementWorker({}, {method:'setEnabled',args:[true]}));assert.throws(()=>dispatchMeasurementWorker({}, {method:'enabled',args:[true]}));
 const calls=[];const remote=openHttpMeasurementStore({baseUrl:'http://api:8080',token,fetchImpl:async(url,options)=>{calls.push({url:String(url),...JSON.parse(options.body)});return{ok:true,json:async()=>({ok:true,value:false})};}});
 assert.equal(await remote.enabled(),false);assert.deepEqual(calls,[{url:'http://api:8080/internal/measurement-worker',method:'enabled',args:[]}]);
});
test('async store preserves measurement observation identity and body',async()=>{
 const claim={runId:'run-original',token:'lease',profileRevision:4,profile:{id:'synthetic',synthetic:true,endpoint:'http://127.0.0.1/',maxBytes:100,dailyBudgetBytes:10000}};let saved;
 const store={claim:async()=>claim,enabled:async()=>true,canExecute:async()=>true,observations:async()=>[],finish:async(c,b)=>{assert.equal(c,claim);saved=b;return{id:'original-observation'};},heartbeat:async()=>{}};
 const worker=createMeasurementWorker({store,localMeasure:async()=>({status:'ok',bytesRead:10})});const result=await worker.tick({limit:1});assert.equal(result[0].observationId,'original-observation');assert.equal(saved.synthetic,true);assert.equal(saved.measurementVerified,false);worker.stop();
});
function fakeChild(){const child=new EventEmitter();child.kills=[];child.kill=signal=>{child.kills.push(signal);queueMicrotask(()=>child.emit('exit',0));};return child;}
const untilAbort=({signal})=>new Promise(resolve=>{if(signal.aborted)resolve();else signal.addEventListener('abort',resolve,{once:true});});
test('combined runtime owns proxy child and aborts both loops on stop',async()=>{
 const child=fakeChild(),controller=new AbortController();let starts=0;const loop=async({signal})=>{starts++;if(starts===2)queueMicrotask(()=>controller.abort());await untilAbort({signal});};
 await runCollectorRuntime({token:'x'.repeat(32),signal:controller.signal,spawnImpl:()=>child,probeImpl:async()=>true,webLoop:loop,measurementLoop:loop,storeFactory:()=>({close(){}}),killTimeoutMs:50});
 assert.equal(starts,2);assert.deepEqual(child.kills,['SIGTERM']);
});
test('unexpected loop exit fails runtime and terminates proxy',async()=>{
 const child=fakeChild();await assert.rejects(runCollectorRuntime({token:'x'.repeat(32),spawnImpl:()=>child,probeImpl:async()=>true,webLoop:untilAbort,measurementLoop:async()=>{},storeFactory:()=>({close(){}}),killTimeoutMs:50}),/collector_loop_exited/);assert.deepEqual(child.kills,['SIGTERM']);
});
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {openMeasurementStore}=require('./measurement-store.cjs');
test('authoritative finish rejects tampered claim and replays exact finish idempotently',()=>{
 const store=openMeasurementStore({filename:':memory:'});try{
 store.configure({id:'fixture',siteId:'TEST',kind:'bandwidth',enabled:true,synthetic:true,endpoint:'http://127.0.0.1/',intervalMs:60000,timeoutMs:1000,maxBytes:1024,dailyBudgetBytes:100000});store.setEnabled(true);const claim=store.claim();
 const body={status:'ok',observedAt:new Date().toISOString(),bytesRead:10,synthetic:false,measurementVerified:true};
 assert.throws(()=>dispatchMeasurementWorker(store,{method:'finish',args:[{...claim,profile:{...claim.profile,synthetic:false}},body]}),/claim_mismatch/);
 const first=dispatchMeasurementWorker(store,{method:'finish',args:[claim,body]}),again=dispatchMeasurementWorker(store,{method:'finish',args:[claim,body]});assert.equal(first.id,again.id);assert.equal(first.synthetic,true);assert.equal(first.measurementVerified,false);assert.equal(store.observations().length,1);
 assert.throws(()=>dispatchMeasurementWorker(store,{method:'finish',args:[claim,{...body,bytesRead:11}]}),/finish_conflict/);
 }finally{store.close();}
});
test('durable finish outbox survives lost response and flushes before next claim without rerunning',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'measurement-outbox-'));try{let lost=true,finishCalls=0,claimCalls=0;
 const fetchImpl=async(_url,options)=>{const request=JSON.parse(options.body);if(request.method==='finish'){finishCalls++;if(lost)throw Error('response_lost');}else if(request.method==='claim')claimCalls++;return{ok:true,json:async()=>({ok:true,value:{id:'same-observation'}})};};
 const options={baseUrl:'http://api:8080',token:'x'.repeat(32),outboxDirectory:dir,fetchImpl};const first=openHttpMeasurementStore(options);await assert.rejects(first.finish({runId:'original-run',token:'lease'},{status:'ok'}));assert.equal(fs.readdirSync(dir).filter(x=>x.endsWith('.json')).length,1);
 lost=false;const restarted=openHttpMeasurementStore(options);await restarted.claim({});assert.equal(finishCalls,2);assert.equal(claimCalls,1);assert.equal(fs.readdirSync(dir).length,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('outbox preserves lease-lost checkpoint and prevents new claims',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'measurement-outbox-'));try{let claimCalls=0;const store=openHttpMeasurementStore({baseUrl:'http://api:8080',token:'x'.repeat(32),outboxDirectory:dir,fetchImpl:async(_u,o)=>{if(JSON.parse(o.body).method==='claim')claimCalls++;return{ok:false};}});await assert.rejects(store.finish({runId:'expired',token:'lease'},{status:'ok'}));await assert.rejects(store.claim({}));assert.equal(claimCalls,0);assert.equal(fs.readdirSync(dir).filter(x=>x.endsWith('.json')).length,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('expired finish records immutable missing plus separate original late body and allows future schedules',()=>{
 const store=openMeasurementStore({filename:':memory:'});try{store.configure({id:'fixture',siteId:'TEST',kind:'bandwidth',enabled:true,synthetic:true,endpoint:'http://127.0.0.1/',intervalMs:60000,timeoutMs:1000,maxBytes:1024,dailyBudgetBytes:100000});store.setEnabled(true);
 const claim=dispatchMeasurementWorker(store,{method:'claim',args:[{}]});store.db.prepare('UPDATE measurement_profiles SET lease_until=? WHERE id=?').run(Date.now()-1,'fixture');const body={status:'ok',observedAt:new Date().toISOString(),bytesRead:77};
 const result=dispatchMeasurementWorker(store,{method:'finish',args:[claim,body]});assert.equal(result.checkpoint,true);assert.equal(store.observations()[0].reason,'worker_lease_expired');assert.equal(store.observations()[0].bytesRead,null);assert.equal(JSON.parse(store.db.prepare('SELECT body FROM measurement_late_submissions').get().body).bytesRead,77);
 assert.equal(dispatchMeasurementWorker(store,{method:'finish',args:[claim,body]}).id,result.id);assert.equal(store.observations().length,1);store.requestRun('fixture');assert.ok(dispatchMeasurementWorker(store,{method:'claim',args:[{}]}));
 }finally{store.close();}
});
