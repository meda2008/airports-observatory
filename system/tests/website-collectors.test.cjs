'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildWebsiteCollectors:build,readOnlyPolicyLink}=require('../lib/website-collectors.cjs');
const row=(id,url,missing=['refund'])=>({id,name:id,primary:true,missingFields:missing,coreInfo:{website:{url,status:'synthetic_fixture'}}});
const page={url:'https://one.example/',grade:'E1',recordIds:['A001'],sourceId:'synthetic-source',sha256:'a'.repeat(64),file:'synthetic.json',capturedAt:'2026-11-03T00:00:00Z',links:[{url:'https://one.example/refunds',label:'退款条款'}]};
test('missing-payment run does not mistake a client troubleshooting card mentioning plans for a billing article',()=>{const {routeFieldHints}=require('../lib/website-collectors.cjs');assert.deepEqual(routeFieldHints({url:'https://forest-01.com/help/connection-troubleshooting',label:'连接排查\n客户端无法连接或连接后打不开网页怎么办？\n先检查套餐和本地网络'}),['compatibility']);assert(routeFieldHints({url:'https://forest-01.com/help/purchase-not-arrived',label:'账号与套餐\n支付成功后套餐没有到账怎么办？'}).includes('payment'));assert(routeFieldHints({url:'https://official.example/terms',label:'服务条款'}).includes('refund'));assert.equal(routeFieldHints({url:'https://official.example/help',label:'帮助中心'}),null);});
test('public-only origin propagates credential prohibition and invalidates the recipe hash',()=>{const a=build({records:[row('A001',page.url)],pages:[page]}).collectors[0],b=build({records:[row('A001',page.url)],pages:[page],configs:[{recordId:'A001',entryUrl:page.url,publicOnly:true}]}).collectors[0];assert.equal(b.policy.publicOnly,true);assert.equal(b.policy.credentialOrigin,null);assert.equal(b.readTasks[0].credentialsAllowed,false);assert.notEqual(a.recipeHash,b.recipeHash);});
test('one origin has one collector; aliases remain distinct fact bindings',()=>{
 const r=build({records:[row('A001','https://one.example/'),row('A002','https://one.example/#/home',['payment']),row('A003','https://two.example/')],pages:[page]});assert.equal(r.collectors.length,2);const c=r.collectors.find(c=>c.origin==='https://one.example');assert.deepEqual(c.recordIds,['A001','A002']);assert.deepEqual(c.priorityFields,['payment','refund']);assert.deepEqual(c.readTasks[0].recordIds,['A001']);assert.equal(c.policy.allowPayment,false);
});
test('HTTP/search/unbound records do not obtain an HTTPS collector or invented origin',()=>{
 const r=build({records:[row('A001',null),row('A002','http://one.example/')]});assert.equal(r.collectors.length,0);assert.equal(r.unbound.length,2);assert.equal(r.dataComplete,false);
});
test('existing source or prior attempt prevents repeat navigation; unseen original link retains proof',()=>{
 const a=build({records:[row('A001',page.url)],pages:[page],attempts:[{url:'https://one.example/refunds'}]}).collectors[0];assert.equal(a.readTasks.length,0);assert.equal(a.status,'priority_gaps_need_new_sources');
 const b=build({records:[row('A001',page.url)],pages:[page]}).collectors[0];assert.equal(b.readTasks[0].proofSha256,page.sha256);assert.equal(b.readTasks[0].parentSourceId,page.sourceId);
 const c=build({records:[row('A001',page.url)],pages:[page,{...page,url:'https://one.example/refunds',links:[]}]}).collectors[0];assert.equal(c.readTasks.length,0);
});
test('cross-origin help is discovery without credential permission, not an approved same-origin task',()=>{
 const r=build({records:[row('A001',page.url)],pages:[{...page,links:[{url:'https://docs.example/terms',label:'服务条款'}]}]}).collectors[0];assert.equal(r.readTasks.length,0);assert.equal(r.crossOriginCandidates[0].credentialsAllowed,false);
});
test('configuration or generic adapter alone never claims a literal parser or data completion',()=>{
 const c=build({records:[row('A001',page.url)],configs:[{recordId:'A001',entryUrl:page.url,adapter:'generic'}]}).collectors[0];assert.equal(c.capabilities.literalParser,null);assert.equal(c.capabilities.authStatus,'generic_visible_form_only');assert.equal(c.status,'priority_gaps_need_new_sources');
});
test('conflicting login recipes are explicit, stable IDs survive alias/order changes',()=>{
 const records=[row('A001',page.url),row('A002',page.url)],configs=records.map((r,i)=>({recordId:r.id,entryUrl:page.url,auth:{emailSelector:'#email'+i}}));const a=build({records,configs}).collectors[0],b=build({records:[...records].reverse(),configs:[...configs].reverse()}).collectors[0];assert.equal(a.collectorId,b.collectorId);assert.equal(a.capabilities.authStatus,'conflicting_site_recipes');assert.equal(a.capabilities.auth,null);assert.equal(a.recipeHash,b.recipeHash);
});
test('read-only link selection rejects order/payment/account mutations, downloads and secret URLs',()=>{
 for(const link of [{url:'https://one.example/checkout',label:'退款'}, {url:'https://one.example/order/5',label:'条款'}, {url:'https://one.example/terms?token=private',label:'条款'}, {url:'javascript:alert(1)',label:'退款'}, {url:'https://one.example/help.exe',label:'帮助'}])assert.equal(readOnlyPolicyLink(link),false);
 assert(readOnlyPolicyLink({url:'https://one.example/#/knowledge',label:'知识库'}));
 assert.equal(readOnlyPolicyLink({url:'https://one.example/en/faq',label:' English'}),false);
 assert.equal(readOnlyPolicyLink({url:'https://one.example/help/example.jpg',label:'教程插图'}),false);
});

test('blank rendered error route is an error observation, not an absent business field or loading success',()=>{
 const E=require('../lib/collection-engine.cjs');assert.equal(E.classify({url:'https://one.example/error-page',title:'Example',text:''}),'error_page_observed');assert.equal(E.classify({url:'https://one.example/knowledge/52',title:'Example',text:''}),'empty_or_loading');
});
test('an actual document error defers siblings only in the same origin and route family',()=>{
 const {deferBrokenSiblings}=require('../lib/website-checkpoints.cjs');const tasks=[{taskId:'a',entryUrl:'https://one.example/knowledge/1'},{taskId:'b',recordIds:['A001'],entryUrl:'https://one.example/knowledge/2'},{taskId:'c',entryUrl:'https://one.example/terms'},{taskId:'d',entryUrl:'https://two.example/knowledge/2'}],state={results:{a:{emptyObservation:{url:'https://one.example/error-page'}}}};
 assert.equal(deferBrokenSiblings({tasks},state).length,1);assert.equal(state.results.b.status,'same_route_family_error_checkpoint');assert.equal(state.results.c,undefined);assert.equal(state.results.d,undefined);
});
test('login checkpoint defers sibling docs without claiming public terms are inaccessible',()=>{
 const {deferBrokenSiblings}=require('../lib/website-checkpoints.cjs');const tasks=[{taskId:'a',entryUrl:'https://one.example/docs?id=1'},{taskId:'b',recordIds:['A001'],entryUrl:'https://one.example/docs?id=2'},{taskId:'c',entryUrl:'https://one.example/terms'}],state={results:{a:{status:'login_required'}}};
 assert.equal(deferBrokenSiblings({tasks},state).length,1);assert.equal(state.results.b.status,'same_route_family_auth_checkpoint');assert.equal(state.results.c,undefined);
});
