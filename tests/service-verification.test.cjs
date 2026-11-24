'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {advance,protectionRequestAllowed}=require('../deploy-service/service-verification.cjs');
test('protection POST qualification excludes payment, foreign origins and methods',()=>{
 const origin='https://example.com';
 const request=(url,method='POST',frameOrigin=origin)=>({url:()=>url,method:()=>method,frame:()=>({url:()=>frameOrigin})});
 assert.equal(protectionRequestAllowed(request(origin+'/cdn-cgi/challenge-platform/test'),origin),true);
 for(const url of [origin+'/payment',origin+'/login','https://foreign.example/cdn-cgi/challenge-platform/a'])assert.equal(protectionRequestAllowed(request(url),origin),false);
 assert.equal(protectionRequestAllowed(request(origin+'/cdn-cgi/challenge-platform/a','DELETE'),origin),false);
 assert.equal(protectionRequestAllowed(request(origin+'/cdn-cgi/challenge-platform/a','POST','https://foreign.example'),origin),false);
});
test('one visible access control can clear verification; no purchase control selected',async()=>{
 let clicks=0,t=0;
 const source={url:'https://example.com/',type:'access_gate',buttons:['点击继续访问','购买']};
 const page={url:()=>source.url,getByRole:(role,options)=>{assert.equal(options.name,'点击继续访问');return {count:async()=>1,isVisible:async()=>true,click:async()=>{clicks++;}};},waitForTimeout:async()=>{t+=350;}};
 const r=await advance({page,source,observe:async()=>({...source,type:null}),beforePage:async()=>{},deadline:10000,clock:()=>t});
 assert.equal(clicks,1);assert.equal(r.receipt.passed,true);
});
test('puzzle without adapter remains explicit, no invented solve',async()=>{
 const r=await advance({source:{url:'https://example.com/',type:'interactive_captcha'},page:{},deadline:10000});
 assert.equal(r.receipt.status,'interactive_solver_unavailable');assert.equal(r.receipt.attempts,0);assert.equal(r.receipt.passed,false);
});
test('click alone does not establish success and attempt stays bounded',async()=>{
 let t=0,clicks=0;const source={url:'https://example.com/',type:'access_gate',buttons:['我不是恶意刷站']};
 const page={url:()=>source.url,getByRole:()=>({count:async()=>1,isVisible:async()=>true,click:async()=>{clicks++;}}),waitForTimeout:async()=>{t+=350;}};
 const r=await advance({page,source,observe:async()=>source,beforePage:async()=>{},deadline:10000,clock:()=>t});
 assert.equal(clicks,1);assert.equal(r.receipt.status,'verification_not_cleared');assert.equal(r.receipt.passed,false);
});
test('native shop gate waits through the empty redirect document before returning to login flow',async()=>{let t=0,reads=0,clicks=0;const origin='https://a32.qytaff03.cc',config={recordId:'A141',entryUrl:origin+'/shop'},source={url:origin+'/verify?next=%2Fshop',type:'access_gate',buttons:['继续访问']};const control={count:async()=>1,isVisible:async()=>true,evaluate:async()=>({action:origin+'/verify',method:'post',fields:[{name:'next',type:'hidden'}]}),click:async()=>clicks++};const page={url:()=>source.url,getByRole:()=>control,waitForResponse:async()=>({status:()=>302}),waitForTimeout:async()=>{t+=350;}};const result=await advance({page,config,source,observe:async()=>++reads===1?{url:origin+'/login',type:null,text:''}:{url:origin+'/login',type:null,text:'邮箱 密码 登录',passwordForm:true},beforePage:async()=>{},deadline:10000,clock:()=>t});assert.equal(result.receipt.passed,true);assert.equal(reads,2);assert.equal(clicks,1);assert.equal(result.source.passwordForm,true);});
