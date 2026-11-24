'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('native target-blank href is followed exactly rather than guessing a display breadcrumb URL',async()=>{
 const {followObservedReadOnlyLink}=await import('../collection/observed-link-navigation.mjs');let requested,waited=false;
 const tab={goto:async u=>{requested=u},url:async()=> 'https://hq.al/p/fnf/',playwright:{waitForLoadState:async()=>{waited=true}}};
 const r=await followObservedReadOnlyLink({browser:{tabs:{new:async()=>tab}},sourceTab:{url:async()=> 'https://www.google.com.hk/search?q=fnf'},link:{count:async()=>1,getAttribute:async()=>'/goto?url=publicSearchReference'}});
 assert.equal(requested,'https://www.google.com.hk/goto?url=publicSearchReference');assert(waited);assert.equal(r.observation.finalUrl,'https://hq.al/p/fnf/');assert.equal(r.observation.credentialsSubmitted,false);
});
test('blank/error navigation never masquerades as a merchant observation or a password rejection',async()=>{
 const {followObservedReadOnlyLink}=await import('../collection/observed-link-navigation.mjs');const tab={goto:async()=>{},url:async()=> 'about:blank',playwright:{waitForLoadState:async()=>{}}};
 const r=await followObservedReadOnlyLink({browser:{tabs:{new:async()=>tab}},sourceTab:{url:async()=> 'https://reference.invalid/'},link:{count:async()=>1,getAttribute:async()=>'/go/provider'}});assert.equal(r.observation.status,'navigation_not_landed');assert.equal(r.observation.finalUrl,null);
});
test('ambiguous, credential-bearing and consequential links are rejected before creating a tab',async()=>{
 const {followObservedReadOnlyLink}=await import('../collection/observed-link-navigation.mjs');let opened=0;for(const href of ['javascript:go()','http://example.invalid/','https://user:password@example.invalid/','/checkout','/payment/123','/logout','/page?token=secret'])await assert.rejects(()=>followObservedReadOnlyLink({browser:{tabs:{new:async()=>{opened++}}},sourceTab:{url:async()=> 'https://example.invalid/'},link:{count:async()=>1,getAttribute:async()=>href}}));assert.equal(opened,0);
});

test('slow navigation intent and tab identity are checkpointed before navigation starts',async()=>{
 const {followObservedReadOnlyLink}=await import('../collection/observed-link-navigation.mjs');const events=[];
 const tab={id:'new-tab',goto:async()=>{assert.deepEqual(events,['navigation_pending','navigation_started']);throw Error('navigation deadline');},url:async()=> 'about:blank',playwright:{waitForLoadState:async()=>{}}};
 const r=await followObservedReadOnlyLink({browser:{tabs:{new:async()=>tab}},sourceTab:{url:async()=> 'https://directory.invalid/'},link:{count:async()=>1,getAttribute:async()=>'/go/merchant'},onCheckpoint:async c=>{events.push(c.status);if(c.status==='navigation_started')assert.equal(c.tabId,'new-tab');}});
 assert.equal(r.observation.status,'navigation_not_landed');assert.deepEqual(events,['navigation_pending','navigation_started','navigation_not_landed']);
});
