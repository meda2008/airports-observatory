'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
const runner=require('../deploy-service/performance-reference-runner.cjs');
const emptyTelegram={forOrigin:()=>null,sourceTargets:()=>[]};
const sourceTargets=(id,prior,options={})=>runner.sourceTargets(id,prior,{telegramParser:emptyTelegram,...options});
const collectPerformanceReferences=options=>runner.collectPerformanceReferences({telegramParser:emptyTelegram,...options});
const median=require('../collection/url-collectors/performance-reference-parsers.cjs'),regional=require('../collection/url-collectors/regional-performance-parsers.cjs');
const site=id=>({id,config:{recordId:id,entryUrl:'https://official.example/dashboard',allowedHosts:['official.example'],auth:{mode:'login',email:'SECRET',password:'SECRET'},recipes:true,entryContinue:{buttonText:'AGREE'},maxPages:8,accountReadOnly:true}});
const snapshot='https://jcnotes.com/airports/cyber/20260830_224707/';
test('container public reference sessions use persistent collector storage without importing account state',async()=>{
 const previous=process.env.STANDALONE_SESSION_DIR;
 process.env.STANDALONE_SESSION_DIR=path.resolve('work/collector-volume-session-fixture');
 let reads=0;
 try{await collectPerformanceReferences({site:site('A047'),collect:async(s,options)=>{
  reads++;assert.equal(options.sessionDir,path.join(process.env.STANDALONE_SESSION_DIR,'performance-public'));
  assert.equal(options.allowLogin,false);assert.equal(options.credentialsFile,undefined);
  return {captures:[],checkpoint:null};
 }});assert(reads>0);}finally{if(previous===undefined)delete process.env.STANDALONE_SESSION_DIR;else process.env.STANDALONE_SESSION_DIR=previous;}
});
function observed(url,links=[]){return{url,body:'公开第三方历史报告正文，仅测试运行器隔离与调度，不代表真实速度结果。',observedAt:'2026-11-11T05:00:00Z',kind:'operator_visible_page',metadata:{links}};}
function browserProbe(){const contexts=[];return{contexts,browser:{newContext:async options=>{contexts.push(options);return{close:async()=>{}};}}};}
async function withOfficial(sourceTargets,fn){const original=Module._load;Module._load=function(request,...args){if(request==='../collection/url-collectors/official-performance-parsers.cjs')return{sourceTargets};return original.call(this,request,...args);};try{return await fn();}finally{Module._load=original;}}
test('explicit 14 median and 12 regional mappings produce only their registered public URLs',()=>{
  for(const p of median.profiles){const targets=sourceTargets(p.recordId);assert(targets.some(t=>t.entryUrl===p.origin+`/airports/${p.slug}/`));assert(targets.length<=2);}
  for(const p of regional.profiles){const targets=sourceTargets(p.recordId);assert(targets.some(t=>t.entryUrl===p.origin+`/reviews/${p.slug}/`));assert(targets.length<=2);}
  assert.deepEqual(sourceTargets('invalid'),[]);assert.equal(sourceTargets('A005').some(t=>t.publisher==='jcnotes'),false);
  const prior={speed:{verifiedReports:[{sourceUrl:snapshot},{sourceUrl:'https://jcnotes.com/airports/fatcat/20260828_234317/'},{sourceUrl:snapshot+'?token=secret'}]}};assert.deepEqual(sourceTargets('A047',prior)[0].knownSnapshotUrls,[snapshot]);
});
test('public config is rebuilt and each read strips credentials, auth, recipes and official storage state',async()=>{
  const calls=[],probe=browserProbe(),s=site('A047');Object.defineProperty(s,'credentialsFile',{get(){throw Error('credentials must not be read');}});Object.defineProperty(s.config,'sessionDir',{get(){throw Error('official session must not be read');}});
  const lookup=async()=>[{address:'8.8.8.8'}];
  const result=await collectPerformanceReferences({site:s,browser:probe.browser,lookup,credentialsFile:'OFFICIAL-VAULT',sessionDir:'OFFICIAL-SESSIONS',publicSessionRoot:path.resolve('work/public-runner-test-no-files-created'),collect:async(publicSite,options)=>{
    calls.push({site:publicSite,options});assert.equal(options.lookup,lookup);assert.equal(options.credentialsFile,undefined);assert.equal(options.recipes,false);assert.equal(options.allowLogin,false);assert.equal(options.maxPages,1);assert(options.jobBudgetMs<=35000);assert.equal(options.sessionDir,path.resolve('work/public-runner-test-no-files-created/performance-public'));
    assert.deepEqual(publicSite.config.allowedHosts,['jcnotes.com']);assert.equal(publicSite.config.publicOnly,true);assert.equal(publicSite.config.accountReadOnly,false);assert.equal(publicSite.config.allowLogin,false);assert.equal(publicSite.config.auth,undefined);assert.equal(publicSite.config.entryContinue,undefined);assert(!JSON.stringify(publicSite).includes('SECRET'));
    const context=await options.browser.newContext({storageState:{cookies:[{name:'official-account',value:'SECRET'}]},ignoreHTTPSErrors:false});await context.close();return{captures:[observed(publicSite.config.entryUrl,publicSite.config.entryUrl.endsWith('/cyber/')?[{url:snapshot,label:'原生历史快照'}]:[])],ordersCreated:0,paymentExecuted:false};
  }});
  assert.equal(calls.length,2);assert.equal(probe.contexts.length,2);assert(probe.contexts.every(c=>!Object.hasOwn(c,'storageState')));assert.equal(result.pageCount,2);assert.equal(result.paymentExecuted,false);assert.equal(result.ordersCreated,0);
});
test('native overview discovery is exact-record and registry-bound, and selects at most latest one',async()=>{
  const old='https://jcnotes.com/airports/cyber/20260801_220000/',latest='https://jcnotes.com/airports/cyber/20260901_220000/',calls=[];
  const result=await collectPerformanceReferences({site:site('A047'),browser:{},collect:async s=>{calls.push(s.config.entryUrl);return{captures:[observed(s.config.entryUrl,[{url:old},{url:latest},{url:'https://jcnotes.com/airports/fatcat/20260910_220000/'},{url:'https://evil.example/airports/cyber/20261001_220000/'},{url:latest+'?token=secret'},{url:'https://jcnotes.com/airports/cyber/20261001_220000/'}])]}},registry:{forOrigin:(url,{recordId})=>recordId==='A047'&&url!=='https://jcnotes.com/airports/cyber/20261001_220000/'?median.forOrigin(url,{recordId}):null}});
  assert.deepEqual(calls,['https://jcnotes.com/airports/cyber/',latest]);assert.equal(result.captures.length,2);assert.equal(result.pageCount,2);
});
test('existing reports are not recaptured and unmatched overview produces explicit checkpoint',async()=>{
  let calls=0;const result=await collectPerformanceReferences({site:site('A047'),prior:{speed:{verifiedReports:[{sourceUrl:snapshot}]}},collect:async s=>{calls++;return{captures:[observed(s.config.entryUrl,[{url:snapshot},{url:'https://jcnotes.com/airports/fatcat/20260830_224707/'}])]};}});assert.equal(calls,1);assert.equal(result.checkpoints[0].type,'performance_reference_no_new_snapshot');
});
test('CF/auth checkpoint skips source without clicking or inheriting login actions',async()=>{
  const calls=[];const result=await collectPerformanceReferences({site:site('A047'),collect:async(s,o)=>{calls.push(s.config.entryUrl);assert.equal(s.config.auth,undefined);assert.equal(o.recipes,false);return{captures:[{...observed(s.config.entryUrl,[{url:snapshot}]),kind:'verification_checkpoint',metadata:{verificationWidgetObserved:true}}],checkpoint:{type:'cloudflare',url:s.config.entryUrl,reason:'CF verification'}};}});assert.equal(calls.length,1);assert.equal(result.checkpoints[0].type,'cloudflare');assert.equal(result.captures[0].kind,'verification_checkpoint');assert.equal(result.ordersCreated,0);assert.equal(result.paymentExecuted,false);
});
test('optional official targets keep exact URL/host, continue after partial source error, and cap total sources',async()=>{
  await withOfficial(id=>id==='A047'?[{url:'https://official.example/sla.html',sourceType:'operator_statement',fields:['stability']},{url:'https://third.example/sla',sourceType:'operator_statement'}]:[],async()=>{
    const calls=[],result=await collectPerformanceReferences({site:site('A047'),collect:async(s,o)=>{calls.push(s.config.entryUrl);if(calls.length===1)throw Error('net::ERR_CONNECTION_RESET');assert.deepEqual(s.config.allowedHosts,['official.example']);assert.equal(o.allowLogin,false);return{captures:[observed(s.config.entryUrl)]};}});
    assert.deepEqual(calls,['https://jcnotes.com/airports/cyber/','https://official.example/sla.html']);assert.equal(result.sourceCount,2);assert.equal(result.captures.length,1);assert.equal(result.checkpoints[0].type,'connection_closed_or_reset');
  });
});
test('page/time budgets remain bounded even when caller requests a larger run',async()=>{
  await withOfficial(()=>[{url:'https://official.example/sla.html',sourceType:'operator_statement'}],async()=>{
    let calls=0;const result=await collectPerformanceReferences({site:site('A047'),maxPages:999,maxSources:999,jobBudgetMs:999999,collect:async(s,o)=>{calls++;assert(o.jobBudgetMs<=35000);return{captures:[observed(s.config.entryUrl,s.config.entryUrl.endsWith('/cyber/')?[{url:snapshot}]:[])]};}});assert.equal(calls,3);assert.equal(result.pageCount,3);assert.equal(result.sourceCount,2);
    let now=0;calls=0;const timed=await collectPerformanceReferences({site:site('A047'),clock:()=>now,jobBudgetMs:10,collect:async s=>{calls++;now=11;return{captures:[observed(s.config.entryUrl,[{url:snapshot}])]};}});assert.equal(calls,1);assert.equal(timed.pageCount,1);assert(timed.checkpoints.some(c=>c.type==='performance_reference_budget_exhausted'));
  });
});
test('wrong record route and authenticated public state never become business captures',async()=>{
  let r=await collectPerformanceReferences({site:site('A028'),collect:async()=>({captures:[observed('https://jichangnote.com/reviews/firefly/')]})});assert.equal(r.captures.length,0);assert.equal(r.checkpoints[0].type,'public_reference_record_route_changed');
  r=await collectPerformanceReferences({site:site('A028'),collect:async s=>({captures:[{...observed(s.config.entryUrl),metadata:{authenticationObserved:true}}]})});assert.equal(r.captures.length,0);assert.equal(r.checkpoints[0].type,'public_reference_authenticated_state_observed');
});
test('operator cancellation and financial contract violations fail closed rather than masking them',async()=>{
  let called=0;await assert.rejects(collectPerformanceReferences({site:site('A028'),beforePage:async()=>{throw Error('lease lost');},collect:async()=>{called++;}}),/lease lost/);assert.equal(called,0);
  await assert.rejects(collectPerformanceReferences({site:site('A028'),collect:async()=>({captures:[],paymentExecuted:true})}),/read_only_contract_violated/);
  await assert.rejects(collectPerformanceReferences({site:site('A028'),collect:async()=>({captures:[],ordersCreated:1})}),/read_only_contract_violated/);
  await assert.rejects(collectPerformanceReferences({site:{id:'A028',config:{recordId:'A047'}},collect:async()=>{called++;}}),/site_identity_required/);
});
test('empty and excess capture returns retain explicit checkpoints and do not exceed one page per target',async()=>{
  let r=await collectPerformanceReferences({site:site('A028'),collect:async()=>({captures:[]})});assert.equal(r.checkpoints[0].type,'public_reference_no_capture');
  r=await collectPerformanceReferences({site:site('A028'),collect:async s=>({captures:[{...observed(s.config.entryUrl),body:''}]})});assert.equal(r.checkpoints[0].type,'public_reference_empty_capture');assert.equal(r.captures.length,0);
  r=await collectPerformanceReferences({site:site('A028'),collect:async s=>({captures:[observed(s.config.entryUrl),observed(s.config.entryUrl)]})});assert.equal(r.captures.length,1);assert.equal(r.checkpoints[0].type,'performance_reference_capture_budget_exceeded');
  let now=0,calls=0;r=await collectPerformanceReferences({site:site('A028'),clock:()=>now,jobBudgetMs:10,beforePage:async()=>{now=20;},collect:async()=>{calls++;}});assert.equal(calls,0);assert.equal(r.pageCount,0);assert.equal(r.checkpoints[0].type,'performance_reference_budget_exhausted');
});
test('configured Telegram historical targets pass prior and stay isolated with narrow before=20 query',async()=>{
  const telegramParser=require('../collection/url-collectors/telegram-history-parsers.cjs').createParser([{recordId:'A907',channel:'explicit_cloud',aliases:['ExampleCloud'],officialOrigins:['https://official.example']}]);
  const target=sourceTargets('A907',{}, {telegramParser})[0];assert.equal(target.entryUrl,'https://t.me/s/explicit_cloud?before=20');assert.deepEqual(target.fields,['operatingHistory']);
  const prior={operatingHistory:{historyStatements:[{kind:'platform_message_date',date:'2020-01-01T00:00:00Z'}]}};assert.equal(sourceTargets('A907',prior,{telegramParser})[0].entryUrl,'https://t.me/s/explicit_cloud');
  const calls=[],probe=browserProbe(),result=await collectPerformanceReferences({site:site('A907'),telegramParser,browser:probe.browser,collect:async(s,o)=>{calls.push(s.config.entryUrl);assert.deepEqual(s.config.allowedHosts,['t.me']);assert.equal(s.config.publicOnly,true);assert.equal(s.config.allowLogin,false);assert.equal(s.config.auth,undefined);assert.equal(o.recipes,false);assert.equal(o.credentialsFile,undefined);assert.equal(o.maxPages,1);assert(o.jobBudgetMs<=35000);await o.browser.newContext({storageState:{cookies:[{name:'secret'}]}});return{captures:[observed(s.config.entryUrl)]};}});
  assert.deepEqual(calls,['https://t.me/s/explicit_cloud?before=20']);assert.equal(result.captures.length,1);assert.equal(result.pageCount,1);assert.equal(probe.contexts[0].storageState,undefined);assert.equal(result.ordersCreated,0);assert.equal(result.paymentExecuted,false);
});
test('Telegram query redirects to another record/channel or arbitrary query are not accepted as same capture',async()=>{
  const telegramParser=require('../collection/url-collectors/telegram-history-parsers.cjs').createParser([{recordId:'A907',channel:'explicit_cloud',aliases:['ExampleCloud'],officialOrigins:['https://official.example']}]);
  for(const url of ['https://t.me/s/other_cloud?before=20','https://t.me.evil.example/s/explicit_cloud?before=20','https://t.me/s/explicit_cloud?before=200','https://t.me/s/explicit_cloud?before=20&foo=bar','invalid-url']){
    const result=await collectPerformanceReferences({site:site('A907'),telegramParser,collect:async()=>({captures:[observed(url)]})});assert.equal(result.captures.length,0,url);assert.equal(result.checkpoints[0].type,'public_reference_record_route_changed',url);
  }
});
test('missing history gets a source slot before two legacy official references; observations do not starve legacy sources',async()=>{
  const telegramParser=require('../collection/url-collectors/telegram-history-parsers.cjs').createParser([{recordId:'A907',channel:'explicit_cloud',aliases:['ExampleCloud'],officialOrigins:['https://official.example']}]);
  await withOfficial(()=>[{url:'https://official.example/sla',sourceType:'operator_statement'},{url:'https://other-official.example/history',sourceType:'operator_statement'}],async()=>{
    const missing=sourceTargets('A907',{}, {telegramParser});assert.equal(missing.length,2);assert.equal(missing[0].entryUrl,'https://t.me/s/explicit_cloud?before=20');assert.equal(missing[1].entryUrl,'https://official.example/sla');
    const prior={operatingHistory:{historyStatements:[{kind:'platform_message_date',date:'2020-01-01T00:00:00Z'}]}};
    assert.deepEqual(sourceTargets('A907',prior,{telegramParser}).map(t=>t.entryUrl),['https://official.example/sla','https://other-official.example/history']);
    assert.equal(sourceTargets('A907',prior,{telegramParser,findEarlier:true})[0].entryUrl,'https://t.me/s/explicit_cloud?before=20');
    const calls=[],result=await collectPerformanceReferences({site:site('A907'),telegramParser,collect:async s=>{calls.push(s.config.entryUrl);return{captures:[observed(s.config.entryUrl)],checkpoint:calls.length===1?{type:'cloudflare',reason:'blocked'}:null};}});assert.equal(calls.length,2);assert.equal(calls[0],'https://t.me/s/explicit_cloud?before=20');assert.equal(result.sourceCount,2);assert.equal(result.pageCount,2);
  });
});
test('historical latency and image sources retain separate exact-host public reads when no paired monitor is configured',async()=>{
 await withOfficial(()=>[],async()=>{for(const id of ['A016']){const expected=id==='A016'?['https://echoccc.online/posts/airport-review/','https://www.duyaoss.com/archives/2032/']:['https://echoccc.online/posts/airport-review/'],calls=[],result=await collectPerformanceReferences({site:site(id),collect:async(s,o)=>{assert(expected.includes(s.config.entryUrl));calls.push(s.config.entryUrl);assert.deepEqual(s.config.allowedHosts,[new URL(s.config.entryUrl).hostname]);assert.equal(s.config.auth,undefined);assert.equal(s.config.publicOnly,true);assert.equal(o.credentialsFile,undefined);assert.equal(o.recipes,false);assert.equal(o.maxPages,1);assert(o.jobBudgetMs<=35000);return{captures:[observed(s.config.entryUrl)]};}});assert.deepEqual(calls,expected);assert.equal(result.pageCount,expected.length);assert.equal(result.captures.length,expected.length);assert.equal(result.ordersCreated,0);assert.equal(result.paymentExecuted,false);}assert.equal(sourceTargets('A017').some(t=>t.publisher==='echoccc.online'),false);});
});
