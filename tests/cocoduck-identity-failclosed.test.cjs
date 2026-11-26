'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {collectStandalone}=require('../deploy-service/standalone-collector.cjs');
test('warm COCODUCK Logout cannot override a mismatching protected account identity',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coco-identity-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const credentialsFile=path.join(dir,'creds.json'),origin='https://home.cocoduck.co';fs.writeFileSync(credentialsFile,JSON.stringify({accounts:[{url:origin,email:'expected@example.invalid',password:'SYNTHETIC'}]}));let current='about:blank',writes=0,posts=0;
 const text='SYNTHETIC authenticated catalog Logout '.repeat(8),snapshot={url:origin+'/user/product',title:'SYNTHETIC',text,links:[],authenticationObserved:true,passwordForm:false,buttons:['Logout'],formFields:[]};
 const page={url:()=>current,setDefaultTimeout:()=>{},goto:async u=>{current=u;},evaluate:async fn=>fn.name==='inspectDocument'?snapshot:String(fn).includes('mainText')?{mainText:text,hasMain:true,title:'SYNTHETIC'}:snapshot,locator:()=>({evaluateAll:async()=>[]})};
 const context={routeWebSocket:async()=>{},route:async()=>{},newPage:async()=>page,close:async()=>{},storageState:async()=>{writes++;},request:{get:async()=>({status:()=>200,text:async()=>'<div>other@example.invalid Logout</div>'}),post:async()=>{posts++;throw Error('must not authenticate');}}};
 const result=await collectStandalone({config:{recordId:'A083',entryUrl:origin+'/user/product',allowedHosts:['home.cocoduck.co'],auth:{mode:'login'},readOnlyRecipe:'cocoduck_cookie_login_readonly',maxPages:1}},{browser:{newContext:async()=>context},recipes:false,credentialsFile,sessionDir:dir,lookup:async()=>[{address:'8.8.8.8',family:4}]});
 assert.equal(result.checkpoint?.type,'cocoduck_profile_identity_unverified');assert.equal(writes,0);assert.equal(posts,0);assert.equal(result.paymentExecuted,false);
});
