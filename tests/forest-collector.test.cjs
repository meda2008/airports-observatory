'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),sources=require('./fixtures/forest-rendered-redacted.json'),parser=require('../collection/url-collectors/forest-01.cjs');
test('Forest current candidate public tabs retain four original totals, unknown currency and historical identity boundary',()=>{
 let prior={};for(const [i,s] of sources.entries()){const value=parser.extract({...s,evidenceId:'SYNTHETIC_SOURCE_'+i},{prior});assert(value);prior={...prior,...value};}
 assert.deepEqual(prior.pricing.plans.map(p=>p.amount),[29.88,68.88,188.88,388.88]);assert.deepEqual(prior.pricing.plans.map(p=>p.maxDevices),[2,3,3,3]);assert.equal(prior.pricing.plans[3].quota,'200GB总量');assert.equal(prior.pricing.plans[0].quota,'每月200GB');assert(prior.pricing.plans.every(p=>p.currency===null));assert.equal(prior.website.operatorIdentityVerified,false);assert.match(prior.pricing.identityScope,/not_Nutbit/);assert.equal(prior.pricing.plans.length,4);
});
test('Forest cancellation policy preserves its exception/conflict and distinguishes page date from capture time',()=>{
 const p=parser.extract({...sources[2],evidenceId:'SYNTHETIC_POLICY'});assert.equal(p.refund.pageUpdatedAt,'2018-02-13');assert.equal(p.refund.observedAt,sources[2].capturedAt);assert.equal(p.refund.executionVerified,false);assert.equal(p.refund.scopeConflicts.length,1);assert.match(p.refund.summary,/主动退款.*未说明/);assert.match(p.refund.conditions.join(' '),/不写成所有购买一律不可退款/);assert.equal(p.privacy.retentionPeriod,null);assert.equal(p.privacy.independentlyAudited,false);assert.match(p.privacy.summary,/政策片段/);
});
test('Forest stale/changed tab contents, wrong origin and missing card prices cannot become new facts',()=>{
 assert.equal(parser.extract({...sources[0],selectedTab:'按流量购买'}),null);assert.equal(parser.extract({...sources[0],planCards:sources[0].planCards.slice(1)}),null);assert.equal(parser.extract({...sources[0],planCards:sources[0].planCards.map(c=>({...c,text:c.text.replace(/¥[\d.]+/,'待定')}))}),null);assert.throws(()=>parser.extract({...sources[0],url:'https://other.invalid/plan'}),/forest_origin/);
});
test('renewal help refines monthly reset only, preserves price capture date and never replenishes the one-time quota',()=>{let prior={};for(const [i,s]of sources.entries())prior={...prior,...parser.extract({...s,evidenceId:'SYNTHETIC_'+i},{prior})};const before=prior.pricing.plans.map(p=>p.observedAt),s=require('./fixtures/forest-renewal-rendered.json'),p=parser.extract({...s,evidenceId:'SYNTHETIC_RENEWAL'},{prior}).pricing;assert.deepEqual(p.plans.map(p=>p.observedAt),before);assert(p.plans.slice(0,3).every(p=>p.quotaReset.includes('每月1日')));assert.equal(p.plans[3].quotaReset,prior.pricing.plans[3].quotaReset);assert.equal(p.plans[3].quota,'200GB总量');assert.equal(p.changeNotices[0].observedAt,s.capturedAt);assert.match(p.changeNotices[0].effectiveScope,/不把不限时/);});
test('Forest repeated tab extraction updates identical plan names without duplicating plan or device rows',()=>{
 let prior={};for(let k=0;k<2;k++)for(const [i,s]of sources.entries())prior={...prior,...parser.extract({...s,evidenceId:'SYNTHETIC_'+i},{prior})};assert.equal(prior.pricing.plans.length,4);assert.equal(prior.compatibility.conditionObservations.length,4);
});
test('Forest wallet preview retains raw gateway labels without inventing fees or creating orders',()=>{const s=require('./fixtures/forest-wallet-rendered.json'),p=parser.extract({...s,evidenceId:'SYNTHETIC_WALLET'});assert.deepEqual(Object.keys(p),['payment']);assert.deepEqual(p.payment.methods,['支付宝','微信','USDT-Trc20']);assert.equal(p.payment.methodOptions.length,5);assert.equal(p.payment.checkoutObserved,false);assert.equal(p.payment.transactionVerified,false);assert.match(p.payment.conditions.join(' '),/数字2.*不是|数字2.*不能/);assert.equal(parser.extract({...s,paymentOptions:[...s.paymentOptions,{label:'Unknown'}]}),null);assert.equal(parser.extract({...s,paymentActionClicked:true}),null);});
test('Forest closes the wallet preview even when changed options stop extraction; no payment control is used',async()=>{
 const {collectForestWalletPreview}=await import('../collection/site-recipes/forest.mjs');
 const source=require('./fixtures/forest-wallet-rendered.json');let open=false,closed=0;
 const dialog={
  count:async()=>open?1:0,isVisible:async()=>open,
  waitFor:async({state})=>assert.equal(state,open?'visible':'hidden'),
  getByRole(role,{name}={}){
   if(role==='radio')return{
    nth:index=>({waitFor:async({state})=>{assert.equal(index,4);assert.equal(state,'visible');assert(open);}}),
    evaluateAll:async()=>[...source.paymentOptions,{label:'SYNTHETIC_NEW_GATEWAY'}]
   };
   assert.equal(role,'button');assert.equal(name,'取消');return{click:async()=>{open=false;closed++;}};
  }
 };
 const tab={url:async()=>source.url,playwright:{evaluate:async()=>source,getByRole:(role,{name})=>{
  if(role==='dialog')return name==='网络波动公告'?{count:async()=>0}:dialog;
  assert.equal(role,'button');assert.equal(name,'余额充值');return{click:async()=>{open=true;}};
 }}};
 await assert.rejects(collectForestWalletPreview(tab),/options_changed/);assert.equal(closed,1);assert.equal(open,false);
});
test('Forest read-only recipe reads both tabs and discovers policy from homepage; no purchase or login',async()=>{
 const {collectForestReadOnly}=await import('../collection/site-recipes/forest.mjs');
 const plan='https://forest-01.com/plan',policy='https://forest-01.com/policy';
 const home={url:'https://forest-01.com/download',text:'Forest',links:[{url:policy,label:'网站政策'}]};
 let current=plan,selected='按周期购买',product,period;
 const visited=[],clicks=[],checks=[],wait=async()=>{};
 const tab={url:async()=>current,goto:async url=>{visited.push(url);assert.equal(url,'https://forest-01.com/');current=home.url;},playwright:{
  getByRole(role,{name}){
   if(role==='radio'){
    const products=sources[selected==='按周期购买'?0:1].planCards;
    const label=name==='月付'?name:products.find(card=>name.test(card.name))?.name;
    return{count:async()=>label?1:0,check:async()=>{assert(label);checks.push(label);if(label==='月付')period=label;else product=label;}};
   }
   if(role==='tab')return{waitFor:wait,getAttribute:async()=>String(name===selected),click:async()=>{clicks.push(name);selected=name;period='一次性';}};
   if(role==='tabpanel')return{getByRole:(heading,options)=>{assert.equal(heading,'heading');assert.equal(options.name,selected==='按周期购买'?'轻量':'不限时200G');return{waitFor:wait};}};
   if(role==='link'&&name==='网站政策')return{waitFor:wait,click:async()=>{assert.equal(current,home.url);clicks.push(name);current=policy;}};
   if(role==='heading'&&name==='ForestNetwork 服务条款')return{waitFor:wait};
   throw Error('unexpected_action '+role+' '+name);
  },
  evaluate:async fn=>{
   const rendered=current===policy?sources[2]:current===home.url?home:sources[selected==='按周期购买'?0:1];
   if(fn.name==='inspectForestSelection')return{productName:product,period,purchaseClicked:false};
   assert(['inspectDocument','inspectForestPlans'].includes(fn.name));return rendered;
  }
 }};
 const result=await collectForestReadOnly(tab);
 assert.equal(result.captures.length,6);
 assert.deepEqual(result.captures.slice(0,4).map(s=>[s.selectedTab,s.forestSelection.productName,s.forestSelection.period]),[['按周期购买','轻量','月付'],['按周期购买','高级','月付'],['按周期购买','旗舰','月付'],['按流量购买','不限时200G','一次性']]);
 assert.deepEqual(checks,['轻量','月付','高级','月付','旗舰','月付','不限时200G']);
 assert.deepEqual(clicks,['按流量购买','网站政策']);assert.deepEqual(visited,['https://forest-01.com/']);
 assert.equal(result.paymentExecuted,false);assert.equal(result.newOrdersCreated,0);
});
