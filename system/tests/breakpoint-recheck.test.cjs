'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('account password-change form and demo shell do not become login or business recovery',async()=>{
 const {recheckDisposition}=await import('../collection/breakpoint-recheck.mjs');
 assert.equal(recheckDisposition({url:'https://www.kuromis.com/account',passwordForm:true,accountManagementObserved:true,text:'修改密码'}),'authenticated_account_management_read_only');
 assert.equal(recheckDisposition({url:'https://syjccloud.com/',title:'EZ-DEMO-TITLE',text:'v0.3.8'}),'demo_shell_not_business_evidence');
 assert.equal(recheckDisposition({url:'https://site.example',passwordForm:true,text:'请填写验证码'}),'login_with_verification');
});
test('stable-route retry only rereads current DOM; bounded redirects fail without navigation or input',async()=>{
 const {readStableRecheckDocument}=await import('../collection/breakpoint-recheck.mjs');let calls=0;
 const tab={url:async()=>++calls===1?'https://site.example/':'https://site.example/dashboard',playwright:{evaluate:async()=>({text:'actual visible content'})}};
 const r=await readStableRecheckDocument(tab);assert.equal(r.snapshot.url,'https://site.example/dashboard');assert.equal(r.transitions.length,1);
 let n=0;await assert.rejects(()=>readStableRecheckDocument({url:async()=>`https://site.example/${n++}`,playwright:{evaluate:async()=>({text:'shell'})}}),/did_not_stabilize/);assert.equal(n,9);
});
test('nonbinding continue is distinct from acceptance, CAPTCHA, login and an ambiguous button',async()=>{
 const {isNonbindingContinueNotice,continueNonbindingNotice}=await import('../collection/nonbinding-notice.mjs');
 const s={url:'https://site.example/',text:'温馨提示\n为了您的安全和更好的体验，请点击继续\n继续',buttons:['继续'],links:[],formFields:[]};assert(isNonbindingContinueNotice(s));
 for(const changed of [{text:s.text+'\n继续即表示同意服务条款'}, {verificationWidgetObserved:true}, {passwordForm:true},{buttons:['继续','同意']},{agreementCheckbox:true}])assert.equal(isNonbindingContinueNotice({...s,...changed}),false);
 const actions=[],control={count:async()=>1,isVisible:async()=>true,click:async()=>actions.push('click'),waitFor:async()=>{}};
 const r=await continueNonbindingNotice({tab:{url:async()=>s.url,playwright:{getByRole:()=>control}},snapshot:s,inspect:async()=>({...s,text:'登录页',passwordForm:true})});assert.deepEqual(actions,['click']);assert.equal(r.observation.agreementAccepted,false);assert.equal(r.observation.captchaCompleted,false);
});
test('expired standing skip is rechecked only under explicit run scope; default skip remains',()=>{
 const skips=require('../lib/collection-user-skips.cjs');assert(skips.isUserSkipped('A033'));
 assert.throws(()=>require('../scripts/prepare-breakpoint-recheck.cjs').prepare('SYNTHETIC-missing-recheck-authorization'),/Explicit recheck/);
});
