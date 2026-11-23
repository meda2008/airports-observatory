const test=require('node:test'),assert=require('node:assert/strict');
test('native SPA menu navigation does not hard-reload startup or submit twice',async()=>{
 const {followObservedMenu}=await import('../collection/route-readiness.mjs');let url='https://merchant.test/dashboard',clicks=0;
 const tab={url:async()=>url,goto:()=>assert.fail('hard reload'),playwright:{waitForURL:async expected=>assert.equal(url,expected)}};
 await followObservedMenu(tab,{click:async()=>{clicks++;url='https://merchant.test/profile';}},'https://merchant.test/profile');assert.equal(clicks,1);
});
test('route reset and cross-origin navigation are blocked before order creation',async()=>{
 const {followObservedMenu,requireCurrentRoute,sameBusinessRoute}=await import('../collection/route-readiness.mjs');let clicks=0;
 const tab={url:async()=>'https://merchant.test/dashboard',playwright:{waitForURL:async()=>{}}},control={click:async()=>clicks++};
 await assert.rejects(followObservedMenu(tab,control,'https://merchant.test/profile'),/route_reset/);
 await assert.rejects(followObservedMenu(tab,control,'https://other.test/profile'),/unconfirmed_navigation_host/);assert.equal(clicks,1);
 await assert.rejects(requireCurrentRoute(tab,{url:'https://merchant.test/profile'}),/route_changed_before_submit/);
 assert.equal(sameBusinessRoute('https://merchant.test/#/shop','https://merchant.test/#/profile'),false);
 assert.equal(sameBusinessRoute('https://merchant.test/index.php?a=order','https://merchant.test/index.php?a=profile'),false);
});

test('document disclosures are native controls; route drift stops before the next click',async()=>{
 const {expandObservedDocumentDetails}=await import('../collection/route-readiness.mjs');let url='https://merchant.test/#/knowledge',clicks=0,drift=false;
 const controls=[0,1].map(()=>({evaluate:async()=>({native:true,open:false,interactive:false}),click:async()=>{clicks++;if(drift)url='https://merchant.test/#/plan';}}));
 const drawer={waitFor:async()=>{},count:async()=>1,isVisible:async()=>true,locator:()=>({first:()=>({waitFor:async()=>{}}),all:async()=>controls})};const tab={url:async()=>url,playwright:{locator:()=>drawer}};
 assert.equal((await expandObservedDocumentDetails({tab,expectedUrl:url})).expanded,2);
 clicks=0;drift=true;await assert.rejects(expandObservedDocumentDetails({tab,expectedUrl:url}),/route_changed_during_expand/);assert.equal(clicks,1);
 await assert.rejects(expandObservedDocumentDetails({tab,expectedUrl:'https://merchant.test/#/order'}),/document_route_required/);
 controls[0].evaluate=async()=>({native:true,open:false,interactive:true});url='https://merchant.test/#/knowledge';clicks=0;await assert.rejects(expandObservedDocumentDetails({tab,expectedUrl:url}),/control_unconfirmed/);assert.equal(clicks,0);
});
