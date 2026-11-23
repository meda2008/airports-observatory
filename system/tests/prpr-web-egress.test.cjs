'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{selectedProfile,context,runtimeProof}=require('../deploy-service/prpr-web-egress.cjs');
const config={recordId:'A034',publicOnly:true,webEgress:'authenticated_local_proxy',readOnlyRecipe:'prpr_public_capabilities'},profile={id:'fixture-probe',enabled:true,synthetic:false,identityVerified:true,kind:'stability',expectedEgressIp:'8.8.8.8',proxyUrl:'http://127.0.0.1:12345/',egressUrl:'https://echo.invalid/',allowedTargetOrigins:['https://echo.invalid']},route={profile,revision:2};
test('only a unique configured real probe can supply private exit binding; no silent fallback or unrelated site expansion',()=>{
 assert(selectedProfile(config,[route]));assert.equal(selectedProfile(config,[route,route]),null);assert.equal(selectedProfile({...config,recordId:'A016'},[route]),null);assert.equal(selectedProfile(config,[{profile:{...profile,enabled:false},revision:2}]),null);
});
test('each native read requires matching exit before and after, with TLS verification retained',async()=>{
 const calls=[];let mismatch=false;
 const ctx=await context({config,route,assertPublicUrl:async()=>{},egressOptions:{proxy:{server:'http://127.0.0.1:12345'}},createContext:async options=>{assert.equal(options.ignoreHTTPSErrors,false);return{get:async url=>{calls.push(url);return{status:()=>200,text:async()=>url===profile.egressUrl?JSON.stringify({ip:mismatch?'9.9.9.9':profile.expectedEgressIp}):'original'};},dispose:async()=>{}};}});
 await ctx.get('https://prpr.96110.cn.com/',{});assert.equal(calls.length,3);assert.equal(ctx.proof().matchedChecks,2);assert(runtimeProof(config,{webEgress:ctx.proof()}));
 mismatch=true;await assert.rejects(()=>ctx.get('https://prpr.96110.cn.com/',{}),/web_egress_check_failed/);assert.equal(calls.length,4);assert.equal(ctx.proof().guardedReads,1);
 assert.equal(runtimeProof({...config,recordId:'A016'},{webEgress:ctx.proof()}),null);await ctx.dispose();
});
test('anonymous native price scope needs public catalog extraction and exit proof, never just successful HTTP',()=>{
 const scope=require('../lib/anonymous-price-acceptance.cjs').anonymousPriceScope,p={siteId:'A034',config:{...config,entryUrl:'https://prpr.96110.cn.com/',fields:['pricing']}},r={executionMode:'standalone',capabilities:{dataBasis:{status:'standalone_native_api'},pageReadable:{status:'observed'},nativeContract:{status:'public_backend_readable',authenticationSupplied:false},login:{status:'not_verified'},plans:{status:'extracted_no_change'},webEgress:{status:'verified_before_and_after_each_read',guardedReads:7,matchedChecks:14,sourceProfileId:profile.id,sourceProfileRevision:2}}};
 assert.equal(scope(p,r),true);assert.equal(scope({...p,config:{...p.config,fields:['pricing','payment']}},r),false);
 assert.equal(scope(p,{...r,capabilities:{...r.capabilities,plans:{status:'not_verified'}}}),false);
 assert.equal(scope(p,{...r,capabilities:{...r.capabilities,webEgress:{...r.capabilities.webEgress,matchedChecks:13}}}),false);
});
test('JMS shares the verified transport but cannot read an order-creation URL',async()=>{
 const c={recordId:'A023',publicOnly:true,webEgress:'authenticated_local_proxy',readOnlyRecipe:'jms_public_catalog_readonly'},calls=[];
 assert(selectedProfile(c,[route]));const ctx=await context({config:c,route,assertPublicUrl:async()=>{},egressOptions:{proxy:{server:'http://127.0.0.1:12345'}},createContext:async()=>({get:async url=>{calls.push(url);return{status:()=>200,text:async()=>JSON.stringify({ip:profile.expectedEgressIp})};},dispose:async()=>{}})});
 await assert.rejects(()=>ctx.get('https://justmysocks.net/members/cart.php?a=add&pid=2',{}),/web_egress_site_route_rejected/);assert.equal(calls.length,0);await ctx.dispose();
});
test('a transient read can retry once and retains its first failure; exit mismatch never retries',async()=>{
 let calls=0;const ctx=await context({config,route,assertPublicUrl:async()=>{},egressOptions:{proxy:{server:'http://127.0.0.1:12345'}},createContext:async()=>({get:async url=>{calls++;if(calls===1)throw Error('ECONNRESET');return{status:()=>200,text:async()=>url===profile.egressUrl?JSON.stringify({ip:profile.expectedEgressIp}):'source'};},dispose:async()=>{}})});
 await ctx.get('https://prpr.96110.cn.com/',{timeout:1000});assert.equal(calls,4);assert.equal(ctx.proof().transportRetries,1);assert.equal(ctx.proof().failedReadAttempts[0].stage,'egress');assert.equal(ctx.proof().matchedChecks,2);await ctx.dispose();
});
