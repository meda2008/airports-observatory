'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {runCollectorRuntime,measurementPollDelay}=require('../deploy-service/collector-runtime.cjs');
const {createStandaloneWorker,retryDatabase}=require('../deploy-service/standalone-worker.cjs');

test('visible DOM uses the document URL for Wget filtering without a global location',async()=>{
 const {inspectDocument}=await import('../collection/visible-document.mjs');
 const shown={innerText:'a visible offer',getClientRects:()=>[{}],closest:()=>null};
 const hidden={innerText:'an offer inside a closed modal',getClientRects:()=>[{}],closest:()=>({})};
 const read=(url,baseURI)=>vm.runInNewContext(`(${inspectDocument})()`,{URL,getComputedStyle:()=>({visibility:'visible'}),document:{URL:url,baseURI,title:'Fixture',body:{innerText:'Catalog',contains:()=>false},querySelectorAll:selector=>selector.startsWith('[id^="product"]')?[shown,hidden]:[]}});
 const wget='https://b8cfff2a4jquxdbmwbaj.wgetcloud.org/user/shop',other='https://fixture.example/shop';
 assert.equal(read(wget,other).blocks.length,1);
 assert.equal(read(other,wget).blocks.length,2);
 assert.equal(read(undefined,wget).blocks.length,1);
});

test('WaveNet dispatch requires each exact supported URL and retains both evidence paths',()=>{
 const registry=require('../collection/url-collectors/index.cjs');
 const visible=require('./fixtures/wavenet-visible-cards-20261121.json');
 const spec=require('../collection/site-contracts/held-auth-public-catalogs.json').A165;
 const url=spec.origin+'/api/v1/guest/plan/fetch',observedAt=visible.observedAt,context={recordId:'A165'};
 const publicSource={url,observedAt,evidenceId:'plans',body:fs.readFileSync(path.join(__dirname,'fixtures/wavenet-public-plans-20261121.json'),'utf8'),metadata:{representation:'original_wavenet_public_plan_json'}};
 const unit={url:spec.contract.url,evidenceId:'unit',body:JSON.stringify(spec.contract),metadata:{representation:'original_wavenet_price_client_excerpts'}};
 const guest={url:spec.origin+'/api/v1/guest/comm/config',evidenceId:'guest',body:JSON.stringify({data:{app_url:spec.appUrl}})};
 const authenticated={url:visible.url,observedAt,evidenceId:'visible',body:visible.cards.map(c=>c.text).join('\n\n'),metadata:{title:visible.title,authenticationObserved:true,planCards:visible.cards}};
 assert.equal(registry.extractKnown([publicSource,unit,guest],context).patch.pricing.plans.length,9);
 assert.equal(registry.extractKnown([authenticated],context).patch.pricing.plans.length,9);
 for(const source of [publicSource,authenticated]){
  assert(registry.forOrigin(source.url,context).supportsUrl(source.url));
  for(const extra of ['?extra=1','#extra','/']){
   assert(!registry.forOrigin(source.url+extra,context)?.supportsUrl?.(source.url+extra));
   assert.equal(registry.extractKnown([{...source,url:source.url+extra},unit,guest],context),null);
  }
 }
});

test('measurement schedule ignores malformed dates and enforces a 250 ms floor',()=>{
 const now=Date.parse('2026-11-21T12:00:00Z'),due=(ms,enabled=true)=>({profile:{enabled},nextDueAt:new Date(now+ms).toISOString()});
 const malformed={profile:{enabled:true},nextDueAt:'invalid'};
 assert.equal(measurementPollDelay([malformed,due(-100,false)],now),1000);
 assert.equal(measurementPollDelay([malformed,due(430),due(5000)],now),430);
 assert.equal(measurementPollDelay([malformed,due(-1)],now),250);
});

function runtimeFixture(options={}){
 const child=new EventEmitter(),calls={closed:0,loops:0,kills:[]};
 child.kill=signal=>{calls.kills.push(signal);queueMicrotask(()=>child.emit('exit',0));};
 const loop=()=>{calls.loops++;};
 const run=changes=>runCollectorRuntime({token:'fixture',spawnImpl:()=>child,probeImpl:()=>new Promise(()=>{}),readinessTimeoutMs:40,killTimeoutMs:10,measurementLoop:loop,webLoop:loop,storeFactory:()=>({close:()=>calls.closed++}),...options,...changes});
 return{run,child,calls};
}
for(const event of ['exit','error'])test(`proxy ${event} interrupts a pending readiness probe`,{timeout:500},async()=>{
 const {run,child,calls}=runtimeFixture({readinessTimeoutMs:5000});
 const running=run();queueMicrotask(()=>child.emit(event,Error('private proxy detail')));
 await assert.rejects(running,{message:event==='exit'?'collector_proxy_exited':'collector_proxy_failed'});
 assert.deepEqual(calls,{closed:1,loops:0,kills:[]});
});
test('readiness timeout and external abort terminate the proxy during a hung probe',async()=>{
 const timed=runtimeFixture();
 await assert.rejects(timed.run(),{message:'collector_proxy_readiness_timeout'});
 assert.deepEqual(timed.calls,{closed:1,loops:0,kills:['SIGTERM']});
 const aborted=runtimeFixture(),controller=new AbortController();
 const running=aborted.run({signal:controller.signal});controller.abort();await running;
 assert.deepEqual(aborted.calls,{closed:1,loops:0,kills:['SIGTERM']});
 const spawnFailed=runtimeFixture();
 await assert.rejects(spawnFailed.run({spawnImpl:()=>{throw Error('fake spawn failure');}}),/fake spawn failure/);
 assert.equal(spawnFailed.calls.closed,1);
});

function temp(t,base=os.tmpdir()){
 fs.mkdirSync(base,{recursive:true});
 const directory=fs.mkdtempSync(path.join(base,'collector-fixture-'));
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 return directory;
}
function workerFixture(output,overrides={}){
 const job={jobId:'job',runId:'run',siteId:'A057',token:'fixture',site:{config:{recordId:'A057',entryUrl:'https://fixture.example/'}}};
 const calls={renew:0,complete:0,collect:0,receive:0};
 const control={getControl:()=>({engineEnabled:true,executionMode:'standalone'}),claimBridge:()=>job,renewBridge:()=>{calls.renew++;},completeBridge:()=>{calls.complete++;}};
 const runner=createStandaloneWorker({control,output,store:{setServiceHeartbeat:()=>{}},plane:{receive:()=>{calls.receive++;return{status:'completed'};}},browserFactory:async()=>({close:async()=>{}}),collect:async()=>{calls.collect++;return{captures:[]};},log:()=>{},...overrides});
 return{runner,calls,control};
}
test('receipt directory setup failure releases worker activity and the renewal timer',async t=>{
 t.mock.timers.enable({apis:['setInterval']});
 const output=path.join(temp(t),'regular-file');fs.writeFileSync(output,'fixture');
 const {runner,calls}=workerFixture(output);
 const result=await runner.runOne();t.mock.timers.tick(40000);
 assert.equal(result.status,'blocked');assert.equal(runner.status().active,0);
 assert.deepEqual(calls,{renew:0,complete:1,collect:0,receive:0});
 await runner.stop();
});

test('standalone page checks and heartbeat share renewal and release it before submission',async t=>{
 t.mock.timers.enable({apis:['setInterval']});
 let release,started;
 const collecting=new Promise(resolve=>{started=resolve;});
 const pending=new Promise(resolve=>{release=resolve;});
 const {runner,calls,control}=workerFixture(temp(t),{collect:async(_site,{beforePage})=>{
  const page=beforePage();await Promise.resolve();started();await page;
  return{captures:[]};
 }});
 control.renewBridge=()=>{calls.renew++;if(calls.renew===1)return pending;};
 const running=runner.runOne();await collecting;t.mock.timers.tick(40000);
 assert.equal(calls.renew,1);release();assert.equal((await running).status,'completed');
 t.mock.timers.tick(40000);assert.deepEqual(calls,{renew:2,complete:0,collect:0,receive:1});await runner.stop();
});

test('a renewal backoff cannot start a SQLite attempt after its retry deadline',async()=>{
 const busy=Error('SQLITE_BUSY');let now=0,calls=0;
 await assert.rejects(retryDatabase(()=>{calls++;throw busy;},{maxElapsedMs:100,delayMs:25,clock:()=>now,sleep:async()=>{now=100;}}),busy);
 assert.equal(calls,1);
});

const listUrl='https://fixture.example/#/orders',id='R-123',detailUrl='https://fixture.example/#/order/'+id;
const retained=require('./fixtures/payment-lifecycle-20261102.json')[0];
function orderFiles(t,options={}){
 const dir=temp(t,path.resolve(__dirname,'../work/collection-runs')),file=name=>path.join(dir,name+'.json');
 const write=(name,value)=>fs.writeFileSync(file(name),JSON.stringify(value));
 const read=name=>JSON.parse(fs.readFileSync(file(name),'utf8'));
 write('plan',{unpaidOrderAuthorization:{paymentAllowed:false,createUnpaidAllowed:true},tasks:[{taskId:'job',recordIds:['A176'],allowedHosts:['fixture.example'],entryUrl:listUrl,...options}]});
 write('state',{results:{}});
 return{dir,runId:path.basename(dir),read,write};
}
function cleanupFixture(t,{entry={},before,after,redirects=false}){
 const f=orderFiles(t);
 f.write('unpaid-lifecycle-private',{job:{cleanupRequired:true,baselineUrl:listUrl,orderUrl:detailUrl,...entry},previous:{cleanupRequired:false,phase:'cancelled_verified'}});
 const calls={tabs:0,clicks:0,closes:0};let current;
 const empty={count:async()=>0,all:async()=>[],first:()=>empty,waitFor:async()=>{}};
 const close={isVisible:async()=>true,innerText:async()=> '关闭订单',click:async()=>{calls.clicks++;}};
 const playwright={waitForLoadState:async()=>{},getByText:()=>empty,getByRole:role=>role==='button'&&current?.hasClose?{all:async()=>[close],filter:()=>close}:empty,
  evaluate:async fn=>{
   if(fn.name==='inspectDocument')return{text:current.text};
   if(fn.name==='inspectWallet')return[];
   if(fn.name==='inspectOrderRows')return current.rows||[];
   assert.equal(fn.name,'inspectOrderId');
   return vm.runInNewContext(`(${fn})()`,{document:{body:{innerText:current.text},querySelectorAll:()=>[]}});
  }};
 const tab={url:async()=>current.url,goto:async url=>{assert.equal(url,detailUrl);current=redirects||calls.clicks?after:before;},getAXState:async()=>{},close:async()=>{calls.closes++;},playwright};
 const browser={tabs:{new:async()=>{calls.tabs++;return tab;}}};
 return{...f,browser,calls};
}
const detail=(raw,orderId=id,hasClose=false)=>({url:detailUrl,text:raw.text.replace('[order-id]',orderId),hasClose});
const list=(...rows)=>({url:listUrl,text:require('./fixtures/payment-lifecycle-20261102.json')[1].cancelled.text,rows});

test('unpaid recovery ignores cancelled list captions, other orders and conflicting rows',async t=>{
 const {resumeUnpaidCleanup}=await import('../collection/unpaid-orders.mjs');
 for(const observation of [list('#R-1234\n套餐\t已取消'),list('#'+id+'\n套餐\t已取消\t待支付'),detail(retained.cancelled,'OTHER')]){
  const f=cleanupFixture(t,{redirects:true,after:observation});
  assert.deepEqual(await resumeUnpaidCleanup(f),{cleanupRequired:true,recovered:0});
  assert.equal(f.calls.clicks,0);assert.equal(f.read('unpaid-lifecycle-private').job.cleanupRequired,true);
 }
});

test('unpaid recovery cancels only matching detail and proves completion on its exact list row',async t=>{
 const {resumeUnpaidCleanup}=await import('../collection/unpaid-orders.mjs');
 const f=cleanupFixture(t,{before:detail(retained.payment,id,true),after:list('#'+id+'\n套餐\t¥20.00\t已取消','#OTHER\n套餐\t待支付')});
 const source=()=>f.read('state').results.job.cancellationSource;
 assert.deepEqual(await resumeUnpaidCleanup(f),{cleanupRequired:false,recovered:1});
 assert.deepEqual(f.calls,{tabs:1,clicks:1,closes:1});
 const journal=f.read('unpaid-lifecycle-private');assert.equal(journal.job.orderId,id);assert.equal(journal.previous.phase,'cancelled_verified');
 assert.equal(f.read('state').results.job.cancelledVerified,true);
 assert(!fs.readFileSync(path.join(f.dir,source().file),'utf8').includes(id));
 assert.deepEqual(await resumeUnpaidCleanup(f),{cleanupRequired:false,recovered:0});
});

test('unpaid recovery verifies the recorded detail and preserves a legacy hold without a usable identity',async t=>{
 const {resumeUnpaidCleanup}=await import('../collection/unpaid-orders.mjs');
 const exact=cleanupFixture(t,{before:detail(retained.cancelled)});
 assert.deepEqual(await resumeUnpaidCleanup(exact),{cleanupRequired:false,recovered:1});
 assert.equal(exact.calls.clicks,0);
 const ambiguous=cleanupFixture(t,{entry:{orderUrl:'https://fixture.example/#/order'}});
 assert.deepEqual(await resumeUnpaidCleanup(ambiguous),{cleanupRequired:true,recovered:0});
 assert.equal(ambiguous.calls.tabs,0);
});

test('unpaid creation records cleanup before dispatch and stops after an ambiguous click',async t=>{
 const {runUnpaidChunk}=await import('../collection/unpaid-orders.mjs');
 const f=orderFiles(t,{recordIds:['SYNTHETIC']}),walletUrl='https://fixture.example/#/profile',shopUrl='https://fixture.example/#/shop';
 const pages={
  [walletUrl]:{text:retained.wallet.text,authenticationObserved:true,accountManagementObserved:true},
  [listUrl]:{text:'订单列表\n暂无订单\n'+('当前账户尚无历史账单。'.repeat(8)),authenticationObserved:true},
  [shopUrl]:{text:retained.config.text+'\n点击下单后将创建订单\n立即下单',authenticationObserved:true,buttons:['立即下单']}
 };
 let current=listUrl,handedOff=0,opened=0,clicked=0;
 const empty={count:async()=>0,all:async()=>[],first:()=>empty,waitFor:async()=>{}};
 const link=url=>({count:async()=>1,isVisible:async()=>true,evaluate:async()=>url,click:async()=>{current=url;}});
 const menus={'个人中心':link(walletUrl),'用户中心':link(walletUrl),'订单列表':link(listUrl),'购买订阅':link(shopUrl)};
 const create={count:async()=>1,isVisible:async()=>true,innerText:async()=> '立即下单',click:async()=>{
  clicked++;
  const job=f.read('unpaid-lifecycle-private').job;
  assert.equal(job.phase,'create_dispatched_cleanup_required');assert.equal(job.cleanupRequired,true);assert.equal(job.orderUrl,null);
  throw Error('fixture click response lost');
 }};
 const playwright={
  waitForLoadState:async()=>{},waitForURL:async url=>assert.equal(current,url),getByText:()=>empty,
  getByRole:(role,options)=>role!=='button'?empty:options?menus[options.name]||empty:current===shopUrl?{all:async()=>[create],filter:()=>create}:empty,
  evaluate:async fn=>fn.name==='inspectDocument'?{buttons:[],links:[],...pages[current]}:fn.name==='inspectOrderId'?null:[]
 };
 const tab={id:'fixture-tab',url:async()=>current,getAXState:async()=>{},playwright,markHandoff:async()=>{handedOff++;}};
 const browser={tabs:{new:async()=>{opened++;return tab;}}};
 const outcome=await runUnpaidChunk({browser,runId:f.runId});
 assert.deepEqual(outcome,{processed:1,remaining:0,cleanupRequired:true},JSON.stringify(f.read('state').results.job));
 assert.equal(clicked,1);assert.equal(handedOff,1);
 assert.equal(f.read('state').results.job.errors[0],'fixture click response lost');
 assert.equal(f.read('unpaid-lifecycle-private').job.cleanupRequired,true);
 assert.equal((await runUnpaidChunk({browser,runId:f.runId})).cleanupRequired,true);
 assert.equal(opened,1);
});
