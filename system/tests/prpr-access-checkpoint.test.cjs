'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const collector=require('../deploy-service/collector.cjs');
const native=require('../deploy-service/prpr-public-capabilities.cjs');
const config={recordId:'A034',readOnlyRecipe:'prpr_public_capabilities',entryUrl:'https://prpr.96110.cn.com/',allowedHosts:['prpr.96110.cn.com'],fields:['pricing']};
test('official HTTP denial preserves exact evidence and stops before any plan or login request',async()=>{
 const original=collector.assertPublicUrl,urls=[];let disposed=false;
 collector.assertPublicUrl=async value=>new URL(value);
 try{const body='<html>Access denied by site</html>',at=Date.UTC(2026,10,20);
 const r=await native.collectNative({config,clock:()=>at,transportFactory:async()=>({get:async url=>{urls.push(url);return{status:()=>403,text:async()=>body};},dispose:async()=>{disposed=true;}})});
 assert.deepEqual(urls,[config.entryUrl]);assert(disposed);
 assert.equal(r.checkpoint.type,'public_source_access_denied');assert.equal(r.checkpoint.url,config.entryUrl);
 assert.equal(r.captures[0].body,body);assert.equal(r.captures[0].observedAt,new Date(at).toISOString());
 assert.equal(r.captures[0].metadata.httpStatus,403);assert.equal(r.ordersCreated,0);assert.equal(r.paymentExecuted,false);
 }finally{collector.assertPublicUrl=original;}
});
