'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {dispatchMeasurementWorker,authorizedMeasurementWorker,openHttpMeasurementStore}=require('./measurement-worker-http.cjs');
const {createMeasurementWorker}=require('./measurement-worker.cjs');
const {runCollectorRuntime,runMeasurementProxy}=require('./collector-runtime.cjs');
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
test('unexpected web loop exit fails runtime and terminates proxy',async()=>{
 const child=fakeChild();await assert.rejects(runCollectorRuntime({token:'x'.repeat(32),spawnImpl:()=>child,probeImpl:async()=>true,webLoop:async()=>{},measurementLoop:untilAbort,storeFactory:()=>({close(){}}),killTimeoutMs:50}),/collector_web_loop_exited/);assert.deepEqual(child.kills,['SIGTERM']);
});
test('unexpected measurement loop exit terminates the owned proxy before it can retry',async()=>{
 const child=fakeChild();await assert.rejects(runMeasurementProxy({token:'x'.repeat(32),spawnImpl:()=>child,probeImpl:async()=>true,measurementLoop:async()=>{},storeFactory:()=>({close(){}}),killTimeoutMs:50}),/collector_loop_exited/);assert.deepEqual(child.kills,['SIGTERM']);
});
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
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
test('outbox preserves packets and pauses claims when the API is temporarily unavailable',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'measurement-outbox-'));try{let claimCalls=0;const store=openHttpMeasurementStore({baseUrl:'http://api:8080',token:'x'.repeat(32),outboxDirectory:dir,fetchImpl:async(_u,o)=>{if(JSON.parse(o.body).method==='claim')claimCalls++;return{ok:false,status:503};}});await assert.rejects(store.finish({runId:'expired',token:'lease'},{status:'ok'}));await assert.rejects(store.claim({}));assert.equal(claimCalls,0);assert.equal(fs.readdirSync(dir).filter(x=>x.endsWith('.json')).length,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('expired finish records immutable missing plus separate original late body and allows future schedules',()=>{
 const store=openMeasurementStore({filename:':memory:'});try{store.configure({id:'fixture',siteId:'TEST',kind:'bandwidth',enabled:true,synthetic:true,endpoint:'http://127.0.0.1/',intervalMs:60000,timeoutMs:1000,maxBytes:1024,dailyBudgetBytes:100000});store.setEnabled(true);
 const claim=dispatchMeasurementWorker(store,{method:'claim',args:[{}]});store.db.prepare('UPDATE measurement_profiles SET lease_until=? WHERE id=?').run(Date.now()-1,'fixture');const body={status:'ok',observedAt:new Date().toISOString(),bytesRead:77};
 const result=dispatchMeasurementWorker(store,{method:'finish',args:[claim,body]});assert.equal(result.checkpoint,true);assert.equal(store.observations()[0].reason,'worker_lease_expired');assert.equal(store.observations()[0].bytesRead,null);assert.equal(JSON.parse(store.db.prepare('SELECT body FROM measurement_late_submissions').get().body).bytesRead,77);
 assert.equal(dispatchMeasurementWorker(store,{method:'finish',args:[claim,body]}).id,result.id);assert.equal(store.observations().length,1);store.requestRun('fixture');assert.ok(dispatchMeasurementWorker(store,{method:'claim',args:[{}]}));
 }finally{store.close();}
});

test('late transfer traffic counts once and exhausts the next run budget until its observation ages out', async t => {
 const observedAt = Date.UTC(2026, 10, 25);
 let now = observedAt;
 const store = openMeasurementStore({filename: ':memory:', now: () => now});
 t.after(() => store.close());
 const profile = {id: 'fixture', siteId: 'TEST', kind: 'bandwidth', enabled: true, synthetic: true,
  endpoint: 'http://127.0.0.1/', intervalMs: 1000, timeoutMs: 1000, maxBytes: 1024, dailyBudgetBytes: 2100};
 store.configure(profile);
 store.configure({...profile, id: 'other'});
 store.setEnabled(true);
 const remote = openHttpMeasurementStore({baseUrl: 'http://api:8080', token: 'x'.repeat(32), outboxDirectory: null,
  fetchImpl: async (_url, options) => ({ok: true, json: async () => ({
   ok: true, value: dispatchMeasurementWorker(store, JSON.parse(options.body)),
  })}),
 });
 const regular = await remote.claim({id: profile.id});
 await remote.finish(regular, {status: 'ok', observedAt: new Date(now - 1000).toISOString(), bytesRead: 20});
 now += 1000;
 const late = await remote.claim({id: profile.id});
 now = late.leaseUntil + 1;
 store.requestRun(profile.id);
 const checkpoint = store.observations(profile.id).find(observation => observation.runId === late.runId);
 assert.equal(checkpoint.reason, 'worker_lease_expired');
 assert.equal(await remote.trafficUsed(profile.id), 20);
 const body = {status: 'timeout', observedAt: new Date(observedAt + 1000).toISOString(), bytesRead: 7, trafficBudgetBytes: 77};
 assert.equal((await remote.finish(late, body)).id, checkpoint.id);
 assert.equal(await remote.trafficUsed(profile.id), 97);
 assert.equal((await remote.finish(late, body)).id, checkpoint.id);
 assert.equal(await remote.trafficUsed(profile.id), 97);
 assert.equal(await remote.trafficUsed('other'), 0);
 assert.deepEqual(store.observations(profile.id).find(observation => observation.runId === late.runId), checkpoint);

 let transfers = 0;
 const worker = createMeasurementWorker({store: remote, localMeasure: async () => {
  transfers++;
  return {status: 'ok', observedAt: new Date(now).toISOString(), bytesRead: 1};
 }});
 t.after(() => worker.stop());
 assert.equal((await worker.runOne({id: profile.id})).status, 'missing');
 assert.equal(store.observations(profile.id).at(-1).reason, 'daily_traffic_budget_exhausted');
 assert.equal(transfers, 0);
 now = observedAt + 1000 + 86400000 - 1;
 assert.equal(await remote.trafficUsed(profile.id), 77);
 now++;
 assert.equal(await remote.trafficUsed(profile.id), 0);
 assert.equal((await worker.runOne({id: profile.id})).status, 'ok');
 assert.equal(transfers, 1);
});

test('legacy late rows count by submitted observation time with the bytesRead fallback', t => {
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'measurement-budget-'));
 let reopened;
 t.after(() => {
  reopened?.close();
  fs.rmSync(dir, {recursive: true, force: true});
 });
 const filename = path.join(dir, 'measurements.sqlite');
 const start = Date.UTC(2026, 10, 25);
 let now = start;
 const profile = {id: 'fixture', siteId: 'TEST', kind: 'bandwidth', enabled: true, synthetic: true,
  intervalMs: 1000, timeoutMs: 1000, maxBytes: 1024};
 const store = openMeasurementStore({filename, now: () => now});
 try {
  store.configure(profile);
  store.setEnabled(true);
  const rows = [];
  const addLate = body => {
   const run = dispatchMeasurementWorker(store, {method: 'claim', args: [{}]});
   now = run.leaseUntil + 1;
   store.requestRun(profile.id);
   rows.push([run.runId, JSON.stringify({status: 'ok', ...body})]);
  };
  const end = start + 86400000;
  const inWindow = new Date(end).toISOString();
  addLate({observedAt: new Date(start).toISOString(), bytesRead: 11});
  addLate({observedAt: new Date(start + 1).toISOString(), bytesRead: 13});
  addLate({observedAt: inWindow, bytesRead: 19, trafficBudgetBytes: null});
  addLate({observedAt: inWindow, bytesRead: 29, trafficBudgetBytes: 0});
  addLate({observedAt: 'invalid date', bytesRead: 31});
  addLate({observedAt: 'now', bytesRead: 41});
  addLate({observedAt: inWindow, bytesRead: -50});
  addLate({observedAt: inWindow, bytesRead: '60'});
  addLate({observedAt: inWindow, trafficBudgetBytes: true});
  addLate({observedAt: new Date(end + 1).toISOString(), bytesRead: 71});
  store.db.exec('DROP INDEX IF EXISTS measurement_late_budget_window');
  const insert = store.db.prepare('INSERT INTO measurement_late_submissions VALUES(?,?,?,?)');
  now = end;
  for (const [runId, body] of rows) {
   const hash = createHash('sha256').update(body).digest('hex');
   insert.run(runId, body, hash, inWindow);
  }
 } finally { store.close(); }
 reopened = openMeasurementStore({filename, now: () => now});
 assert.equal(reopened.trafficUsed(profile.id), 32);
 assert.equal(reopened.db.prepare('SELECT count(*) AS n FROM measurement_late_submissions').get().n, 10);
});

test('reconfiguration settles an expired lease and retains an exact late replay alongside the new claim',()=>{
 let now=Date.UTC(2026,10,25);
 const store=openMeasurementStore({filename:':memory:',now:()=>now});
 try{
  const profile={id:'fixture',siteId:'TEST',kind:'bandwidth',enabled:true,synthetic:true,endpoint:'http://127.0.0.1/',intervalMs:60000,timeoutMs:1000,maxBytes:1024,dailyBudgetBytes:100000};
  const claim=()=>dispatchMeasurementWorker(store,{method:'claim',args:[{}]});
  store.configure(profile);store.setEnabled(true);
  const original=claim();now=original.leaseUntil+1;
  store.configure({...profile,network:'replacement'});
  const replacement=claim();
  assert.equal(replacement.profileRevision,2);
  const body={status:'ok',observedAt:new Date(now).toISOString(),bytesRead:77};
  const finish=()=>dispatchMeasurementWorker(store,{method:'finish',args:[original,body]});
  assert.equal(finish().id,finish().id);
  assert.equal(store.observations()[0].reason,'worker_lease_expired');
  assert.equal(store.observations()[0].profileRevision,1);
  assert.equal(store.db.prepare('SELECT lease_token FROM measurement_profiles').get().lease_token,replacement.token);
  assert.equal(store.db.prepare('SELECT count(*) n FROM measurement_late_submissions').get().n,1);
 }finally{store.close();}
});

test('a permanently rejected result is retained for review and the next measurement can claim',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'measurement-outbox-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const outbox=openHttpMeasurementStore({baseUrl:'http://api:8080',token:'x'.repeat(32),outboxDirectory:dir,fetchImpl:async(_url,options)=>{
  if(JSON.parse(options.body).method==='finish')return {ok:false,status:409};
  return {ok:true,json:async()=>({ok:true,value:{runId:'next'}})};
 }});
 const old={runId:'expired',token:'lease'};
 assert.equal((await outbox.finish(old,{status:'ok'})).status,'submission_review_required');
 assert.equal((await outbox.claim({})).runId,'next');
 const [held]=fs.readdirSync(dir);assert.match(held,/review-required\.json$/);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,held),'utf8')).args[0],old);
});
