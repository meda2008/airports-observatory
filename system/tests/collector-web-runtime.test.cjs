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
