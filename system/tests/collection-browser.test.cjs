'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'../work/collection-runs');
test('public-only candidate cannot read credentials or register even if a task requests registration',async()=>{
 const {runChunk}=await import('../collection/browser-driver.mjs');const dir=fs.mkdtempSync(path.join(base,'SYNTHETIC-')),runId=path.basename(dir);let credentials=0,registrations=0;
 fs.writeFileSync(path.join(dir,'plan.json'),JSON.stringify({tasks:[{taskId:'public',recordIds:['SYNTHETIC'],entryUrl:'https://public.example/',allowedHosts:['public.example'],maxPages:1,adapter:'auto',publicOnly:true,allowRegistration:true}]}));fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify({results:{},discovery:{}}));
 const tab={url:async()=> 'https://public.example/',close:async()=>{},playwright:{evaluate:async()=>({title:'Login',text:'Login to continue',passwordForm:true,passwordInputCount:1,links:[{url:'https://public.example/register',label:'Register'}]})}};
 try{const r=await runChunk({browser:{tabs:{new:async()=>tab}},runId,credentialsForOrigin:async()=>{credentials++;throw Error('must not access credential');},credentialsForRegistration:async()=>{registrations++;throw Error('must not register');}});assert.equal(r.statusCounts.login_required,1);assert.equal(credentials,0);assert.equal(registrations,0);}finally{fs.rmSync(dir,{recursive:true});}
});

test('collector browser: FAQ aliases and retained slash variants are not fetched again; SPA details remain distinct',async()=>{
 const {runChunk,readRouteKey}=await import('../collection/browser-driver.mjs');
 assert.equal(readRouteKey('https://allowed.example/faq/#'),readRouteKey('https://allowed.example/faq'));
 assert.notEqual(readRouteKey('https://allowed.example/#/docs/8'),readRouteKey('https://allowed.example/#/docs/62'));
 const dir=fs.mkdtempSync(path.join(base,'SYNTHETIC-')),runId=path.basename(dir),navigated=[];let current;
 fs.writeFileSync(path.join(dir,'plan.json'),JSON.stringify({tasks:[{taskId:'fixture',recordIds:['SYNTHETIC'],entryUrl:'https://allowed.example/faq',allowedHosts:['allowed.example'],maxPages:4,adapter:'auto',skipUrls:['https://allowed.example/pricing/']}]}));
 fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify({results:{},discovery:{}}));
 const tab={id:'fixture',goto:async url=>{navigated.push(url);current=url;},url:async()=>current,close:async()=>{},playwright:{expectNavigation:async f=>f(),waitForLoadState:async()=>{},evaluate:async()=>({title:'FAQ',text:'Public help article with actual payment troubleshooting and clear business context. '.repeat(3),links:[{label:'FAQ',url:'https://allowed.example/faq/#'},{label:'套餐',url:'https://allowed.example/pricing'}]}),getByText:()=>({count:async()=>0})}};
 try{await runChunk({browser:{tabs:{new:async()=>tab}},runId,limit:1});assert.deepEqual(navigated,['https://allowed.example/faq']);const state=JSON.parse(fs.readFileSync(path.join(dir,'state.json')));assert.equal(state.results.fixture.sources.length,1);}
 finally{assert.equal(path.dirname(path.resolve(dir)),base);fs.rmSync(dir,{recursive:true});}
});
test('collector browser: redirects never receive credentials; checkpoint prevents duplicate work',async()=>{
 const {runChunk}=await import('../collection/browser-driver.mjs');
 fs.mkdirSync(base,{recursive:true});const dir=fs.mkdtempSync(path.join(base,'SYNTHETIC-')),runId=path.basename(dir);
 const task={taskId:'fixture',recordIds:['SYNTHETIC'],entryUrl:'https://allowed.example/',allowedHosts:['allowed.example'],maxPages:2,adapter:'auto'};
 fs.writeFileSync(path.join(dir,'plan.json'),JSON.stringify({tasks:[task]}));fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify({results:{},discovery:{}}));
 let logins=0,closed=0,created=0;const browser={tabs:{new:async()=>{created++;return {id:'fixture-tab',goto:async()=>{},url:async()=> 'https://different.example/login',playwright:{expectNavigation:async action=>action(),waitForLoadState:async()=>{},evaluate:async()=>({title:'Login',text:'sign in',passwordForm:true,passwordInputCount:1,links:[]})},close:async()=>{closed++;}};}}};
 try{const out=await runChunk({browser,runId,credentialsForOrigin:async()=>{logins++;throw Error('Must not transmit');}});assert.equal(out.remaining,0);assert.equal(out.statusCounts.needs_identity_review,1);assert.equal(logins,0);assert.equal(closed,1);assert.equal((await runChunk({browser,runId})).processed,0);assert.equal(created,1);}
 finally{assert.equal(path.dirname(path.resolve(dir)),base);assert(path.basename(dir).startsWith('SYNTHETIC-'));fs.rmSync(dir,{recursive:true});}
});
test('collector browser: challenge requires current exact page confirmation and never clicks on stale consent',async()=>{
 const {completeConfirmedAccessGate}=await import('../collection/browser-driver.mjs');let clicks=0;
 const tab={id:'fixture',url:async()=> 'https://allowed.example/',playwright:{evaluate:async()=>({title:'访问验证',text:'我不是恶意刷站',buttons:['我不是恶意刷站']}),getByRole:()=>({click:async()=>{clicks++;}})}};
 await assert.rejects(completeConfirmedAccessGate({tab,confirmation:{tabId:'other',url:'https://allowed.example/',confirmedAt:new Date().toISOString(),action:'click_access_button'}}),/Fresh confirmation/);assert.equal(clicks,0);
});
test('collector browser: non-anchor read-only menus wait for price cards and completed run is not rescanned',async()=>{
 const {runChunk}=await import('../collection/browser-driver.mjs');
 const dir=fs.mkdtempSync(path.join(base,'SYNTHETIC-')),runId=path.basename(dir);let route='dashboard',ready=false,created=0,closed=0;
 fs.writeFileSync(path.join(dir,'plan.json'),JSON.stringify({tasks:[{taskId:'fixture',recordIds:['SYNTHETIC'],entryUrl:'https://allowed.example/',allowedHosts:['allowed.example'],maxPages:4,adapter:'v2board'}]}));fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify({results:{},discovery:{}}));
 const tab={id:'fixture',url:async()=> 'https://allowed.example/#/'+route,goto:async()=>{},getAXState:async()=>'',close:async()=>{closed++;},playwright:{expectNavigation:async f=>f(),waitForLoadState:async()=>{},evaluate:async()=>({title:'Store',text:(route==='购买订阅'&&ready?'Annual plan 99 CNY per year with clearly stated billing cycle and synthetic service terms.':'Visible navigation and normal page content for this synthetic fixture only.').repeat(2),links:[],buttons:[]}),getByText:label=>({count:async()=>1,isVisible:async()=>true,click:async()=>{route=label;}}),locator:selector=>({waitFor:async()=>{assert.match(selector,/立即订阅/);ready=true;}})}};
 const browser={tabs:{new:async()=>{created++;return tab;}}};
 try{await runChunk({browser,runId});const state=JSON.parse(fs.readFileSync(path.join(dir,'state.json')));assert.equal(state.results.fixture.sources.length,3);assert.equal(ready,true);assert.equal(closed,1);assert.equal((await runChunk({browser,runId})).processed,0);assert.equal(created,1);}
 finally{assert.equal(path.dirname(path.resolve(dir)),base);assert(path.basename(dir).startsWith('SYNTHETIC-'));fs.rmSync(dir,{recursive:true});}
});
test('collector browser: known landing hash alias reuses original evidence without opening a tab',async()=>{
 const {runChunk}=await import('../collection/browser-driver.mjs');const dir=fs.mkdtempSync(path.join(base,'SYNTHETIC-')),runId=path.basename(dir);let opened=0;
 fs.mkdirSync(path.join(dir,'evidence'));fs.writeFileSync(path.join(dir,'evidence/old.json'),JSON.stringify({text:'Previously captured dashboard',links:[]}));
 const source={file:'evidence/old.json',url:'https://allowed.example/#/dashboard',capturedAt:'2026-01-01T00:00:00Z'};
 fs.writeFileSync(path.join(dir,'plan.json'),JSON.stringify({tasks:[{taskId:'fixture',recordIds:['SYNTHETIC'],entryUrl:'https://allowed.example/',allowedHosts:['allowed.example'],maxPages:3,seedSources:[source],skipUrls:[source.url]}]}));fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify({results:{},discovery:{}}));
 try{const result=await runChunk({browser:{tabs:{new:async()=>{opened++;throw Error('Duplicate scan');}}},runId});assert.equal(opened,0);assert.equal(result.statusCounts.retained_gap_no_new_route,1);const saved=JSON.parse(fs.readFileSync(path.join(dir,'state.json')));assert.equal(saved.results.fixture.sources[0].capturedAt,source.capturedAt);}
 finally{assert.equal(path.dirname(path.resolve(dir)),base);assert(path.basename(dir).startsWith('SYNTHETIC-'));fs.rmSync(dir,{recursive:true});}
});
test('collector browser: immediate-login label is handled; unconfirmed default account can enter authorized free signup',async()=>{
 const {runChunk}=await import('../collection/browser-driver.mjs');
 for(const accountKnown of [true,false]){const dir=fs.mkdtempSync(path.join(base,'SYNTHETIC-')),runId=path.basename(dir);let url='https://allowed.example/login',loginClicks=0,registrations=0;
 fs.writeFileSync(path.join(dir,'plan.json'),JSON.stringify({tasks:[{taskId:'fixture',recordIds:['SYNTHETIC'],entryUrl:url,allowedHosts:['allowed.example'],maxPages:2,allowRegistration:true,adapter:'generic'}]}));fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify({results:{},discovery:{}}));
 const tab={id:'fixture',url:async()=>url,goto:async next=>{url=next;},getAXState:async()=>'',close:async()=>{},playwright:{expectNavigation:async fn=>fn(),waitForLoadState:async()=>{},evaluate:async()=>({title:url.endsWith('/register')?'注册':'Login',text:'普通登录与免费注册表单说明'.repeat(10),passwordForm:true,passwordInputCount:url.endsWith('/register')?2:1,emailInputCount:1,buttons:['立即登录'],links:[{url:'https://allowed.example/register',label:'注册'}]}),locator:()=>({fill:async()=>{},waitFor:async()=>{}}),getByRole:(role,o)=>({count:async()=>1,click:async()=>{assert(o.name.test('立即登录'));loginClicks++;}})}};
 try{await runChunk({browser:{tabs:{new:async()=>tab}},runId,preserveChallenges:0,credentialsForOrigin:async origin=>({origin,email:'authorized@example.test',password:'synthetic-only',accountKnown}),credentialsForRegistration:async()=>({}),registrationHandler:async({snapshot})=>{registrations++;return{snapshot,status:'registration_requires_verification'};}});assert.equal(loginClicks,1);assert.equal(registrations,accountKnown?0:1);}
 finally{assert.equal(path.dirname(path.resolve(dir)),base);assert(path.basename(dir).startsWith('SYNTHETIC-'));fs.rmSync(dir,{recursive:true});}}
});
