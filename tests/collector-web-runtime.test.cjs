'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createWebCollector,createWebTransport,runCollectorLoop}=require('../deploy-service/collector-web-runtime.cjs');
test('scoped loop sends only requested site to claim and exits on shutdown',async()=>{
 const controller=new AbortController(),claimed=[];
 await runCollectorLoop({signal:controller.signal,siteId:'A159',request:async(op,input)=>{if(op==='control')return{engineEnabled:true,executionMode:'standalone'};if(op==='claim'){claimed.push(input.siteId);controller.abort();return{job:null};}return{};},browserFactory:async()=>{throw Error('idle claim must not open browser');},log:()=>{}});
 assert.deepEqual(claimed,['A159']);
});
test('transport uses internal authenticated API without following redirects',async()=>{
 let call;const request=createWebTransport({baseUrl:'http://api:8080',token:'test-secret',fetchImpl:async(...args)=>(call=args,{ok:true,json:async()=>({engineEnabled:false})})});
 assert.deepEqual(await request('control'),{engineEnabled:false});assert.equal(String(call[0]),'http://api:8080/internal/web-collector/control');assert.equal(call[1].headers.authorization,'Bearer test-secret');assert.equal(call[1].redirect,'error');
});
test('disabled engine never claims or opens browser',async()=>{
 const calls=[];const worker=createWebCollector({request:async(op)=>{calls.push(op);return{engineEnabled:false,executionMode:'standalone'};},browserFactory:()=>{throw Error('unexpected browser');},log:()=>{}});
 assert.equal((await worker.runOne()).status,'paused');assert.deepEqual(calls,['control','heartbeat']);await worker.stop();
});
test('failed API receive retains raw material and retries original packet before another claim',async()=>{
 const output=fs.mkdtempSync(path.join(os.tmpdir(),'collector-web-'));let receiveCount=0,claims=0,collectCount=0;const observedAt='2026-11-14T00:00:00.000Z',packets=[];
 const job={siteId:'A001',jobId:'job1',runId:'run1',token:'lease-secret',site:{id:'A001',config:{entryUrl:'https://example.com',collectPerformanceReferences:false}}};
 const request=async(op,input)=>{if(op==='control')return{engineEnabled:true,executionMode:'standalone'};if(op==='claim'){claims++;return{job,prior:{}};}if(op==='run')return{status:'running'};if(op==='receive'){packets.push(input);if(++receiveCount===1)throw Error('API unavailable');return{status:'completed'};}return{};};
 const worker=createWebCollector({request,output,browserFactory:async()=>({close:async()=>{}}),collect:async()=>{collectCount++;return{captures:[{url:'https://example.com',body:'retained body',kind:'operator_visible_page',observedAt}],capabilities:{},ordersCreated:0,paymentExecuted:false};},log:()=>{}});
 try{assert.equal((await worker.runOne()).status,'submission_deferred');const dir=path.join(output,'A001-job1-run1');assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'capture-0.json'))).body,'retained body');assert.equal((await worker.runOne()).status,'completed');assert.equal(claims,1);assert.equal(collectCount,1);assert.deepEqual(packets[1],JSON.parse(JSON.stringify(packets[0])));assert.equal(packets[1].captures[0].observedAt,observedAt);assert.ok(!fs.existsSync(path.join(dir,'pending-submission.json')));}finally{await worker.stop();fs.rmSync(output,{recursive:true,force:true});}
});

test('a disconnected browser is replaced before collecting the next job', async t => {
 const output=fs.mkdtempSync(path.join(os.tmpdir(),'collector-web-'));
 t.after(()=>fs.rmSync(output,{recursive:true,force:true}));
 let claims=0,launches=0;const used=[], completions=[];
 const worker=createWebCollector({output,log:()=>{},browserFactory:async()=>{
  const browser={number:++launches,connected:true,isConnected(){return this.connected;},async close(){}};
  return browser;
 },collect:async(_site,{browser})=>{
  used.push(browser.number);
  if(browser.number===1)browser.connected=false;
  return {captures:[]};
 },request:async(op,input)=>{
  if(op==='control')return {engineEnabled:true,executionMode:'standalone'};
  if(op==='claim'){const n=++claims;return {job:{siteId:'A001',jobId:'job'+n,runId:'run'+n,token:'lease',site:{id:'A001',config:{entryUrl:'https://example.com'}}}};}
  if(op==='receive')return {status:'completed'};
  if(op==='complete')completions.push(input);
  return {};
 }});
 assert.equal((await worker.runOne()).status,'failed');
 assert.equal(completions[0].blocker,'collector_browser_unavailable');
 assert.equal((await worker.runOne()).status,'completed');
 assert.deepEqual(used,[1,2]);
 await worker.stop();
});

function outboxFixture(t){
 const output=fs.mkdtempSync(path.join(os.tmpdir(),'collector-web-outbox-'));
 t.after(()=>fs.rmSync(output,{recursive:true,force:true}));
 const job=(siteId,jobId,runId)=>({siteId,jobId,runId,token:'fixture-lease',site:{id:siteId,config:{entryUrl:'https://fixture.example/',collectPerformanceReferences:false}}});
 function pending(job,raw){
  const dir=path.join(output,[job.siteId,job.jobId,job.runId].join('-'));
  fs.mkdirSync(dir);
  const file=path.join(dir,'pending-submission.json');
  fs.writeFileSync(file,raw);
  return {dir,file};
 }
 const packet=job=>({jobId:job.jobId,token:job.token,captures:[{url:'https://fixture.example/',body:'original synthetic evidence'}]});
 return {output,job,pending,packet};
}

test('expired outbox entry preserves original bytes and does not block unrelated claims or recollect its job',async t=>{
 const {output,job,pending,packet}=outboxFixture(t);
 const old=job('A001','first-job','expired-run'),other=job('A002','second-job','next-run');
 const raw=JSON.stringify({...old,packet:packet(old)},null,2)+'\n';
 const {dir,file}=pending(old,raw);
 const queued=[other,{...old,runId:'replacement-run',token:'new-lease'}];
 const received=[],completed=[];
 let lookups=0,collections=0;
 const worker=createWebCollector({output,log:()=>{},browserFactory:async()=>({close:async()=>{}}),collect:async site=>{
  assert.equal(site.id,other.siteId);
  collections++;
  return {captures:[],capabilities:{}};
 },request:async(op,input)=>{
  if(op==='control')return {engineEnabled:true,executionMode:'standalone'};
  if(op==='run'){lookups++;return {status:'lease_expired'};}
  if(op==='claim')return {job:queued.shift()};
  if(op==='receive'){received.push(input);return {status:'completed'};}
  if(op==='complete'){completed.push(input);return {status:'blocked'};}
  return {};
 }});
 t.after(()=>worker.stop());
 assert.equal((await worker.runOne()).jobId,other.jobId);
 assert.equal((await worker.runOne()).status,'blocked');
 assert.equal(lookups,1);
 assert.equal(collections,1);
 assert.deepEqual(received.map(input=>input.jobId),[other.jobId]);
 assert.equal(completed[0].token,'new-lease');
 assert.equal(completed[0].checkpoint.type,'retained_submission_requires_recovery');
 assert.deepEqual(fs.readFileSync(file),Buffer.from(raw));
 assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'pending-submission-hold.json'))).reason,'lease_expired');
});

test('corrupt outbox JSON and structurally invalid packets do not stop the polling loop',async t=>{
 const {output,job,pending}=outboxFixture(t);
 const invalid=[Buffer.from([0xff,0x7b]),Buffer.from(JSON.stringify({packet:{captures:{}}}))];
 const retained=invalid.map((raw,i)=>pending(job('A001','damaged-job','damaged-run-'+i),raw));
 const controller=new AbortController(),claims=[];
 await runCollectorLoop({output,signal:controller.signal,siteId:'A002',log:()=>{},browserFactory:async()=>assert.fail('unexpected browser'),request:async(op,input)=>{
  if(op==='control')return {engineEnabled:true,executionMode:'standalone'};
  if(op==='run'||op==='receive')assert.fail('corrupt packet entered replay');
  if(op==='claim'){claims.push(input.siteId);controller.abort();return {job:null};}
  return {};
 }});
 assert.deepEqual(claims,['A002']);
 for(const [i,{dir,file}] of retained.entries()){
  assert.deepEqual(fs.readFileSync(file),invalid[i]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'pending-submission-hold.json'))).reason,'invalid_pending_submission');
 }
});

test('opaque API rejection stays retryable while other jobs can claim',async t=>{
 const {output,job,pending,packet}=outboxFixture(t);
 const initial=job('A001','pending-job','pending-run'),original=packet(initial);
 const {dir,file}=pending(initial,JSON.stringify({...initial,packet:original}));
 const sent=[];
 let claims=0,renewals=0,now=0;
 const worker=createWebCollector({output,clock:()=>now,log:()=>{},browserFactory:async()=>assert.fail('unexpected browser'),request:async(op,input)=>{
  if(op==='control')return {engineEnabled:true,executionMode:'standalone'};
  if(op==='run')return {status:'leased'};
  if(op==='renew'&&++renewals===1)throw Object.assign(Error('internal_request_rejected'),{status:409});
  if(op==='claim'){claims++;return {job:null};}
  if(op==='receive'){sent.push(input);return {status:'completed'};}
  return {};
 }});
 t.after(()=>worker.stop());
 assert.equal((await worker.runOne()).status,'submission_deferred');
 assert.ok(!fs.existsSync(path.join(dir,'pending-submission-hold.json')));
 assert.equal((await worker.runOne()).status,'idle');
 assert.equal(renewals,1);
 now=1000;
 assert.equal((await worker.runOne()).status,'completed');
 assert.equal(claims,2);
 assert.deepEqual(sent,[original]);
 assert.ok(!fs.existsSync(file));
});

test('reclaim after an opaque renewal rejection keeps the discovery run directory and submits only a checkpoint',async t=>{
 const {output,job,pending,packet}=outboxFixture(t);
 const old=job('A001','discovery-job','discovery-job');
 const bytes=JSON.stringify({...old,packet:packet(old)});
 const {dir,file}=pending(old,bytes);
 const receipt=path.join(dir,'receipt.json');
 fs.writeFileSync(receipt,'original receipt');
 const calls=[];
 const worker=createWebCollector({output,log:()=>{},browserFactory:async()=>assert.fail('unexpected browser'),request:async(op,input)=>{
  calls.push(op);
  if(op==='control')return {engineEnabled:true,executionMode:'standalone'};
  if(op==='run')return {status:'running'};
  if(op==='renew')throw Object.assign(Error('internal_request_rejected'),{status:409});
  if(op==='claim')return {job:{...old,token:'reclaimed-lease',discoveryOnly:true}};
  if(op==='complete'){
   assert.equal(input.token,'reclaimed-lease');
   assert.equal(input.checkpoint.type,'retained_submission_requires_recovery');
   return {status:'blocked'};
  }
  return {};
 }});
 t.after(()=>worker.stop());
 assert.equal((await worker.runOne()).status,'blocked');
 assert.deepEqual(calls,['control','run','renew','claim','complete']);
 assert.equal(fs.readFileSync(file,'utf8'),bytes);
 assert.equal(fs.readFileSync(receipt,'utf8'),'original receipt');
 assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'pending-submission-hold.json'))).reason,'lease_reclaimed');
});

test('retained lease replacement still replays its packet after a transient receive failure',async t=>{
 const {output,job,pending,packet}=outboxFixture(t);
 const old=job('A001','retained-job','expired-run');
 const original=packet(old);
 original.captures[0].metadata={retainedReplayVerified:true};
 const bytes=JSON.stringify({...old,packet:original});
 const {dir,file}=pending(old,bytes);
 const replacement={...old,runId:'recovered-run',token:'replacement-lease'};
 const sent=[];
 let recoveries=0,now=0;
 const worker=createWebCollector({output,clock:()=>now,log:()=>{},browserFactory:async()=>assert.fail('unexpected browser'),request:async(op,input)=>{
  if(op==='control')return {engineEnabled:true,executionMode:'standalone'};
  if(op==='run')return {status:input.runId===old.runId?'lease_expired':'leased'};
  if(op==='recoverretained'){recoveries++;return {job:replacement};}
  if(op==='receive'){
   sent.push(input);
   if(sent.length===1)throw Object.assign(Error('temporarily unavailable'),{status:503});
   return {status:'completed'};
  }
  if(op==='claim')return {job:null};
  return {};
 }});
 t.after(()=>worker.stop());
 assert.equal((await worker.runOne()).status,'submission_deferred');
 assert.equal(JSON.parse(fs.readFileSync(file)).runId,replacement.runId);
 assert.equal(fs.readFileSync(path.join(dir,'original-pending-submission.json'),'utf8'),bytes);
 now=1000;
 assert.equal((await worker.runOne()).status,'completed');
 assert.equal(recoveries,1);
 assert.deepEqual(sent,Array(2).fill({...original,token:replacement.token}));
 assert.ok(!fs.existsSync(file));
});

test('a capture too large to frame retains the original and lets another site claim',async t=>{
 const {output,job}=outboxFixture(t);
 const oversized=job('A001','large-job','large-run'),other=job('A002','normal-job','normal-run');
 const capture={url:'https://example.test/',body:'汉'.repeat(720000),observedAt:'2026-11-14T00:00:00Z',kind:'operator_visible_page'};
 const completed=[],received=[],queue=[oversized,other];
 const worker=createWebCollector({output,log:()=>{},browserFactory:async()=>({close:async()=>{}}),
  collect:async site=>({captures:site.id==='A001'?[capture]:[]}),request:async(op,input)=>{
  if(op==='control')return {engineEnabled:true,executionMode:'standalone'};
  if(op==='claim')return {job:queue.shift()};
  if(op==='complete'){completed.push(input);return {status:'blocked'};}
  if(op==='receive'){received.push(input);return {status:'completed'};}
  return {};
 }});
 t.after(()=>worker.stop());
 assert.equal((await worker.runOne()).checkpoint,'submission_payload_too_large');
 assert.equal((await worker.runOne()).jobId,other.jobId);
 assert.deepEqual(received.map(x=>x.jobId),[other.jobId]);
 const dir=path.join(output,'A001-large-job-large-run');
 const retained=JSON.parse(fs.readFileSync(path.join(dir,'pending-submission.json'),'utf8'));
 const hold=JSON.parse(fs.readFileSync(path.join(dir,'pending-submission-hold.json'),'utf8'));
 assert.equal(retained.state,'submission_held');
 assert.equal(retained.packet.captures.length,1);
 assert.equal(retained.packet.captures[0].body,capture.body);
 assert.equal(hold.bytes,Buffer.byteLength(JSON.stringify(retained.packet)));
 assert.ok(hold.bytes>hold.maxBytes);
 assert.equal(completed[0].checkpoint.type,'submission_payload_too_large');
});

test('four 180,000-character captures use verified batches and retry the same original packet',async t=>{
 const {readSubmissionBatches}=require('../lib/collector-submission.cjs');
 const {output,job}=outboxFixture(t),claimed=job('A001','batch-job','batch-run');
 const captures=Array.from({length:4},(_,index)=>({url:'https://fixture.example/'+index,body:'汉'.repeat(180000),observedAt:'2026-11-14T00:00:00Z',kind:'operator_visible_page'}));
 let claims=0;
 const received=[];
 const worker=createWebCollector({output,log:()=>{},browserFactory:async()=>({close:async()=>{}}),collect:async()=>({captures}),request:async(op,input,body)=>{
  if(op==='control')return {engineEnabled:true,executionMode:'standalone'};
  if(op==='claim'){claims++;return {job:claimed};}
  if(op==='run')return {status:'leased'};
  if(op==='receive')assert.fail('single request exceeds UTF-8 budget');
  if(op==='receivebatches'){
   const bytes=Buffer.from(body);
   const decoded=await readSubmissionBatches([bytes.subarray(0,4096),bytes.subarray(4096)]);
   assert.deepEqual(decoded,JSON.parse(JSON.stringify(input)));
   received.push(decoded);
   if(received.length===1)throw Error('temporarily unavailable');
   const changed=Buffer.from(body.replace('汉','字'));
   await assert.rejects(readSubmissionBatches([changed]),/internal_payload_invalid/);
   return {status:'completed'};
  }
  return {};
 }});
 t.after(()=>worker.stop());
 assert.equal((await worker.runOne()).status,'submission_deferred');
 assert.equal((await worker.runOne()).status,'completed');
 assert.equal(claims,1);
 assert.deepEqual(received[0],received[1]);
 assert.deepEqual(received[1].captures.map(({sha256,...capture})=>capture),captures);
});
