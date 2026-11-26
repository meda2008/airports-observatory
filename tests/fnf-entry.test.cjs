'use strict';
const { historicalCaptureOptions } = require('./helpers/historical-capture.cjs');

const test=require('node:test'),assert=require('node:assert/strict');
const dir='../work/collection-runs/financial-gaps-20261104-v11-root/';
test('actual FnF entry distinguishes ordinary Continue from CF and credential rejection', historicalCaptureOptions('work/collection-runs/financial-gaps-20261104-v11-root/fnf-old-continue.json', 'work/collection-runs/financial-gaps-20261104-v11-root/fnf-after-continue.json', 'work/collection-runs/financial-gaps-20261104-v11-root/fnf-publisher.json'),async()=>{
 const {assessFnfEntry}=await import('../collection/site-recipes/fnf-entry.mjs');
 const before=require(dir+'fnf-old-continue.json'),after=require(dir+'fnf-after-continue.json'),empty=require(dir+'fnf-publisher.json');
 assert.equal(assessFnfEntry(before).status,'ordinary_continue_available');
 const error=assessFnfEntry(after);assert.equal(error.status,'entry_response_error_without_credential_submission');assert.equal(error.accountPasswordInvalid,null);assert.equal(error.credentialValidity,'not_tested');assert.equal(error.identityConfirmed,false);assert.deepEqual(error.financialFieldsConfirmed,[]);
 assert.equal(assessFnfEntry(empty).status,'empty_publisher_body');
 assert.equal(assessFnfEntry({...before,verificationWidgetObserved:true}).status,'verification_checkpoint');
 assert.equal(assessFnfEntry({...before,agreementCheckbox:true}).status,'agreement_checkpoint');
 assert.throws(()=>assessFnfEntry({...before,url:'https://unrelated.invalid/'}),/scope_mismatch/);
 assert.equal(require('../collection/url-collectors/index.cjs').extractKnown([after]),null);
});

test('restored FnF registration exposes native login separately from agreement and old route errors', historicalCaptureOptions('work/collection-runs/pricing-9-20261105-v14/A027-new-register-entry-recovery.json'),async()=>{
 const {assessFnfEntry}=await import('../collection/site-recipes/fnf-entry.mjs');
 const base='../work/collection-runs/pricing-9-20261105-v14/';
 const registration=require(base+'A027-new-register-entry-recovery.json').captures.at(-1),login=require(base+'A027-login-after-register-recovery.json');
 const assessed=assessFnfEntry(registration);assert.equal(assessed.status,'agreement_checkpoint');assert.equal(assessed.nativeLoginUrl,'https://33333.ifnf.xyz/seni/yes/auth/login');assert.equal(assessed.credentialsSubmitted,false);
 assert.equal(assessFnfEntry(login).status,'visible_login_requires_identity_review');
 assert.equal(assessFnfEntry({...registration,links:[{url:'https://unrelated.invalid/seni/yes/auth/login'}]}).nativeLoginUrl,undefined);
});

test('authorized live login request error is not a bad password or an authenticated price source', historicalCaptureOptions('work/collection-runs/fnf-login-20261105-v15/A027-login-result.json'),async()=>{
 const {assessFnfEntry}=await import('../collection/site-recipes/fnf-entry.mjs');
 const doc=require('../work/collection-runs/fnf-login-20261105-v15/A027-login-result.json');
 const result=assessFnfEntry(doc,{credentialsSubmitted:true});
 assert.equal(result.status,'login_request_failed');assert.equal(result.credentialValidity,'not_established');assert.equal(result.accountPasswordInvalid,null);assert.equal(result.automaticRetryAllowed,false);assert.equal(result.identityConfirmed,false);assert.deepEqual(result.financialFieldsConfirmed,[]);
 assert.equal(assessFnfEntry(doc).status,'entry_request_error_without_credential_submission');
 assert.equal(assessFnfEntry({...doc,buttons:['Login']},{credentialsSubmitted:true}).status,'visible_login_requires_identity_review');
 assert.equal(require('../collection/url-collectors/index.cjs').extractKnown([doc]),null);
});

test('FnF invitation failure does not claim email sent or account created; rejected login does not prove no account',async()=>{const {assessFnfEntry}=await import('../collection/site-recipes/fnf-entry.mjs');const invite=assessFnfEntry({url:'https://33333.ifnf.xyz/seni/yes/auth/register',text:'仅限邀请注册，请填写邀请码',buttons:['OK'],agreementCheckbox:true});assert.equal(invite.status,'invitation_required_before_email_send');assert.equal(invite.emailCodeSent,false);assert.equal(invite.registrationCreated,false);const d={url:'https://33333.ifnf.xyz/seni/yes/auth/login',text:'邮箱或者密码错误',passwordForm:true};assert.equal(assessFnfEntry(d,{credentialsSubmitted:true}).status,'login_rejected');assert.notEqual(assessFnfEntry(d).status,'login_rejected');});
