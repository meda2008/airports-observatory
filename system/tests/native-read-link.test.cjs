'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('native read fallback follows only the exact visible safe same-origin URL and waits for body',async()=>{
 const {safeNativeReadUrl,followNativeReadLink}=await import('../collection/native-read-link.mjs');const before='https://site.invalid/dashboard',target='https://site.invalid/docs';
 for(const href of ['/checkout','/docs?token=secret','https://other.invalid/docs','/docs?action=delete','javascript:void(0)','/register','/order'])assert.equal(safeNativeReadUrl(href,before),null);
 const calls=[];let url=before;const link={count:async()=>1,isVisible:async()=>true,getAttribute:async n=>n==='href'?'/docs':null,click:async()=>calls.push('click')};const tab={url:async()=>url,goto:async u=>{url=u;calls.push(u);},playwright:{getByRole:()=>link,waitForURL:async()=>{throw Error('timeout');}}};
 const r=await followNativeReadLink({tab,label:'文档中心',ready:async()=>calls.push('ready')});assert.equal(r.directFallback,true);assert.deepEqual(calls,['click',target,'ready']);assert.equal(r.paymentExecuted,false);
 await assert.rejects(()=>followNativeReadLink({tab,label:'文档中心'}),/readiness_required/);
});
test('unexpected destinations and new-tab links do not trigger a fallback navigation',async()=>{
 const {followNativeReadLink}=await import('../collection/native-read-link.mjs');let n=0,gotos=0,targetAttr=null;const tab={url:async()=>++n===1?'https://site.invalid/dashboard':'https://site.invalid/login',goto:async()=>gotos++,playwright:{getByRole:()=>({count:async()=>1,isVisible:async()=>true,getAttribute:async k=>k==='href'?'/docs':targetAttr,click:async()=>{}}),waitForURL:async()=>{throw Error('timeout');}}};
 await assert.rejects(()=>followNativeReadLink({tab,label:'文档中心',ready:async()=>{}}),/unexpected_destination/);assert.equal(gotos,0);n=0;targetAttr='_blank';await assert.rejects(()=>followNativeReadLink({tab,label:'文档中心',ready:async()=>{}}),/new_tab/);assert.equal(gotos,0);
});
