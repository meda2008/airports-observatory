'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('shared driver preflight scopes the real PQJC account route before any whole-page read',async()=>{
 const {readRenderedDocument}=await import('../collection/visible-document.mjs');let wholePageReads=0,scopedReads=0,formattedAmountReady=false;
 const card={getClientRects:()=>[{}],innerText:'当前余额\n¥ 0.00\n余额充值\n自动续费',querySelectorAll:()=>[{getClientRects:()=>[{}],checked:false}]};
 const label={tagName:'SPAN',getClientRects:()=>[{}],innerText:'当前余额',parentElement:{parentElement:card}};
 const tab={url:async()=> 'https://xn--mes358aby2apfg.com/profile',playwright:{evaluate:async()=>{wholePageReads++;throw Error('whole account page must not be read');},getByText:(text,options)=>{if(text instanceof RegExp){assert(text.test('¥ 0.00'));return{filter:()=>({waitFor:async()=>{formattedAmountReady=true;},count:async()=>1})};}assert.equal(text,'当前余额');assert.equal(options.exact,true);return{waitFor:async()=>{},count:async()=>1,evaluate:async fn=>{scopedReads++;assert(formattedAmountReady);return fn(label);}};}}};
 const result=await readRenderedDocument(tab);assert.equal(wholePageReads,0);assert.equal(scopedReads,1);assert.equal(result.autoRenewChecked,false);assert.equal(result.privateSecurityValuesExcluded,true);assert.equal(result.representation,'scoped_visible_balance_card_only');assert.equal(result.passwordInputCount,0);assert.equal(result.accountManagementObserved,true);assert.equal(result.text,card.innerText);assert.deepEqual(result.links,[]);
 card.innerText+='\nTOTP security fixture must be excluded';await assert.rejects(()=>readRenderedDocument(tab),/not_minimal/);assert.equal(wholePageReads,0);
});
test('a scoped account read does not publish a snapshot after the route changes',async()=>{
 const {readRenderedDocument}=await import('../collection/visible-document.mjs');let urls=0;
 const tab={url:async()=>++urls===1?'https://xn--mes358aby2apfg.com/profile':'https://xn--mes358aby2apfg.com/login',playwright:{getByText:text=>text instanceof RegExp?{filter:()=>({waitFor:async()=>{},count:async()=>1})}:({waitFor:async()=>{},count:async()=>1,evaluate:async()=>({text:'当前余额\n¥ 0.00\n余额充值\n自动续费'})})}};
 await assert.rejects(()=>readRenderedDocument(tab),/route_changed/);
});
