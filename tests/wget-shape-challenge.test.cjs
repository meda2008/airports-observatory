'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),m=require('../deploy-service/wget-shape-challenge.cjs');
test('retained real widget glyphs resolve to three distinct geometric targets',()=>{
 const fixture=require('./fixtures/wget-shapes/retained-glyphs.json');
 const points=m.locateShapes({...fixture,rgba:Buffer.from(fixture.pixels,'base64')});
 assert.deepEqual(points.filter(p=>p.shape).sort((a,b)=>a.x-b.x).map(p=>p.shape),fixture.expected);
 assert.equal(new Set(points.map(p=>p.shape)).size,3);
});
test('image bounds and incomplete payload cannot produce click coordinates',()=>{
 for(const p of [{width:9999,height:100,rgba:[]},{width:300,height:100,rgba:[]}])assert.throws(()=>m.locateShapes(p),/shape_image_invalid/);
 assert.deepEqual(m.locateShapes({width:100,height:80,rgba:Buffer.alloc(32000)}),[]);
});
test('native captcha write allowance is site-, origin-, path- and method-bound',()=>{
 const config={recordId:'A001',entryUrl:m.origin+'/user/shop'},request=(url,method='POST')=>({url:()=>url,method:()=>method,postData:()=>'',frame:()=>({url:()=>m.origin+'/login'})});
 assert.equal(m.requestAllowed(request(m.origin+'/clicaptcha'),config),true);
 for(const path of ['/login','/payment','/clicaptcha/other'])assert.equal(m.requestAllowed(request(m.origin+path),config),false);
 assert.equal(m.requestAllowed(request(m.origin+'/clicaptcha'),{...config,recordId:'A002'}),false);
 assert.equal(m.requestAllowed(request(m.origin+'/clicaptcha','DELETE'),config),false);
});
test('HTTP and in-process workers share the Wget email-recovery time budget',async()=>{
 const {collectWithReferences}=require('../deploy-service/standalone-worker.cjs');
 for(const [entryUrl,expected] of [[m.origin+'/user/shop',90000],['https://example.com/',35000]]){
  let observed;
  await collectWithReferences({id:'A001',config:{recordId:'A001',entryUrl}},{jobBudgetMs:35000,collect:async(site,options)=>{observed=options.jobBudgetMs;return {captures:[]};}});
  assert.equal(observed,expected);
 }
});
