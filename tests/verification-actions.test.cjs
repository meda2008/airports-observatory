'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const now=()=>new Date().toISOString();
function fixture({type='image_captcha',changed=false,loaded=true}={}){
 let filled='',clicks=0,ready=false;const frame={src:'https://challenges.cloudflare.com/widget',title:'安全验证'};
 const snapshot=()=>ready?{text:'账号登录',passwordForm:true}:{text:type==='cloudflare'?'请验证您是真人':'验证码',passwordForm:true,captchaInputs:type==='image_captcha'?['captcha']:[],captchaImages:type==='image_captcha'?['验证码']:[],challengeFrames:type==='cloudflare'?[frame]:[]};
 const input={count:async()=>1,isVisible:async()=>true,getAttribute:async()=> 'text',fill:async value=>{filled=value;}};
 const image={count:async()=>1,isVisible:async()=>true,getAttribute:async()=> '/captcha',evaluate:async()=>({tag:'IMG',loaded,src:'/captcha',clip:{x:5,y:5,width:120,height:36}})};
 const checkbox={count:async()=>1,isVisible:async()=>true,click:async()=>{clicks++;ready=true;}};
 const tab={id:'SYNTHETIC-'+require('node:crypto').randomUUID(),url:async()=> 'https://example.org/login',screenshot:async()=>Buffer.from('SYNTHETIC_BYTES'),playwright:{
  evaluate:async fn=>fn.toString().includes('innerWidth')?{width:1280,height:720}:snapshot(),
  locator:selector=>selector==='img'?image:selector==='input'?input:{evaluateAll:async()=>[frame]},frameLocator:()=>({getByRole:()=>checkbox}),getByRole:()=>checkbox}};
 const ocr=async()=>({text:'4826',engine:'ddddocr',version:'SYNTHETIC',imageSha256:'same'});ocr.fingerprint=async()=>changed?'changed':'same';
 return {tab,ocr,captcha:{imageSelector:'img',inputSelector:'input',pattern:'^[0-9]{4}$'},confirmation:{tabId:tab.id,url:'https://example.org/login',action:type==='cloudflare'?'click_cloudflare_checkbox':'solve_image_captcha',confirmedAt:now()},filled:()=>filled,clicks:()=>clicks};
}
test('OCR fills only after page-bound confirmation, never marks server verification passed or exposes code',async()=>{
 const {performConfirmedVerification:run}=await import('../collection/verification-actions.mjs'),f=fixture();
 const r=await run(f);assert.equal(r.status,'captcha_filled');assert.equal(r.passed,false);assert.equal(f.filled(),'4826');assert(!JSON.stringify(r).includes('4826'));
 await assert.rejects(run(f),/already_used/);
});
test('missing, wrong-page, future and expired confirmations cannot run OCR',async()=>{
 const {performConfirmedVerification:run}=await import('../collection/verification-actions.mjs');
 for(const patch of [null,{url:'https://other.example/'},{confirmedAt:new Date(Date.now()+60000).toISOString()},{confirmedAt:new Date(Date.now()-16*60000).toISOString()}]){
  const f=fixture();f.confirmation=patch===null?null:{...f.confirmation,...patch};f.ocr=async()=>{throw Error('OCR must not run');};await assert.rejects(run(f),/confirmation_required/);assert.equal(f.filled(),'');
 }
});
test('another grant after two minutes cannot make a consumed 15-minute image grant reusable',async()=>{
 const {performConfirmedVerification:run}=await import('../collection/verification-actions.mjs'),first=fixture(),at=Date.parse(first.confirmation.confirmedAt);
 await run({...first,now:at});
 const later=fixture();later.confirmation.confirmedAt=new Date(at+121000).toISOString();
 await run({...later,now:at+121000});
 await assert.rejects(run({...first,now:at+122000}),/already_used/);
});
test('a server CAPTCHA rejection is terminal and never counted as verification passed',async()=>{
 const {authenticate,authenticationFailure}=require('../deploy-service/auth.cjs');let submits=0;
 const page={url:()=> 'https://example.org/login',evaluate:async()=>({text:'账号登录'}),waitForLoadState:async()=>{},locator:selector=>({count:async()=>1,isVisible:async()=>true,fill:async()=>{},click:async()=>{submits++;},innerText:async()=> '验证码错误，请重新输入'})};
 const r=await authenticate(page,{config:{auth:{emailSelector:'#email',passwordSelector:'#password',submitSelector:'#submit'}},credential:{origin:'https://example.org',email:'SYNTHETIC',password:'SYNTHETIC'}});
 assert.deepEqual(r,{status:'server_rejected_captcha',attempts:1,retryAutomatically:false});assert.equal(submits,1);
 assert.equal(authenticationFailure('请输入验证码'),null);assert.equal(authenticationFailure('邮箱或密码错误'),'server_rejected_credentials');
 assert.equal(authenticationFailure('该账户已被停止使用'),'account_disabled_by_server');
});
test('unloaded, changed and invalid-format images stay unfilled',async()=>{
 const {performConfirmedVerification:run}=await import('../collection/verification-actions.mjs');
 for(const options of [{loaded:false},{changed:true},{badText:true}]){const f=fixture(options);if(options.badText)f.ocr=async()=>({text:'unexpected',engine:'ddddocr'});const r=await run(f);assert.equal(r.actionTaken,false);assert.equal(f.filled(),'');}
});
test('CF normal visible checkbox has a separate fresh click grant and verifies resulting state',async()=>{
 const {performConfirmedVerification:run}=await import('../collection/verification-actions.mjs'),f=fixture({type:'cloudflare'});
 const r=await run(f);assert.equal(f.clicks(),1);assert.equal(r.passed,true);assert.equal(r.status,'clear');assert.equal(f.filled(),'');
});
test('CF grant expires after two minutes even though local OCR warm-up can use same-page grant for 15 minutes',async()=>{
 const {performConfirmedVerification:run}=await import('../collection/verification-actions.mjs'),f=fixture({type:'cloudflare'});
 f.confirmation.confirmedAt=new Date(Date.now()-121000).toISOString();await assert.rejects(run(f),/confirmation_required/);assert.equal(f.clicks(),0);
});
test('Cloudflare resource allowlist does not authorize top navigation or unrelated hosts',()=>{
 const {requestAllowed}=require('../deploy-service/collector.cjs'),allowed=new Set(['example.org']);
 assert.equal(requestAllowed('https://challenges.cloudflare.com/turnstile/v0/api.js',{allowed}),true);
 assert.equal(requestAllowed('https://challenges.cloudflare.com/',{allowed,isMainNavigation:true}),false);
 assert.equal(requestAllowed('https://challenges.cloudflare.com.evil.example/',{allowed}),false);
 assert.equal(requestAllowed('http://challenges.cloudflare.com/',{allowed}),false);
 assert.equal(requestAllowed('https://example.org/login',{allowed,isMainNavigation:true}),true);
});
test('vanishing password field does not establish authentication on an error page',async()=>{
 const {authenticate}=require('../deploy-service/auth.cjs');
 let submitted=false;
 const page={url:()=> 'https://example.org/login',evaluate:async()=>({text:'Unexpected error'}),waitForLoadState:async()=>{},locator:selector=>({count:async()=>1,isVisible:async()=>selector==='#password'?!submitted:true,fill:async()=>{},click:async()=>{submitted=true;},innerText:async()=> 'Unexpected error'})};
 const r=await authenticate(page,{config:{auth:{emailSelector:'#email',passwordSelector:'#password',submitSelector:'#submit'}},credential:{origin:'https://example.org',email:'SYNTHETIC',password:'SYNTHETIC'}});
 assert.equal(r.status,'authentication_success_unverified');
});
test('built-in browser login adapter shares server auth, respects origin and translates wait options',async()=>{
 const {loginWithSiteAdapter}=await import('../collection/builtin-auth.mjs');let signed=false,fills=0,wait,transitionWait;
 const tab={id:'synthetic',url:async()=>signed?'https://example.org/account':'https://example.org/login',playwright:{evaluate:async()=>({text:signed?'Sign out':'Login'}),waitForLoadState:async options=>{wait=options;},locator:selector=>({count:async()=>1,isVisible:async()=>selector==='#password'?!signed:true,fill:async()=>{fills++;},click:async()=>{signed=true;},innerText:async()=>signed?'Sign out':'Login',waitFor:async options=>{transitionWait=options;}})}};
 const config={auth:{emailSelector:'#email',passwordSelector:'#password',submitSelector:'#submit'}};
 const denied=await loginWithSiteAdapter({tab,config,credential:{origin:'https://other.example',email:'SYNTHETIC',password:'SYNTHETIC'}});assert.equal(denied.status,'login_credentials_missing');assert.equal(fills,0);
 const result=await loginWithSiteAdapter({tab,config,credential:{origin:'https://example.org',email:'SYNTHETIC',password:'SYNTHETIC'}});assert.equal(result.status,'authenticated');assert.equal(fills,2);assert.deepEqual(wait,{state:'networkidle',timeoutMs:5000});assert.deepEqual(transitionWait,{state:'hidden',timeoutMs:8000});
});
