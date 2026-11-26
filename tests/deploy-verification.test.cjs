'use strict';
const { historicalCaptureOptions } = require('./helpers/historical-capture.cjs');

const test=require('node:test'),assert=require('node:assert/strict');
const shared=()=>import('../collection/challenge.mjs');
test('visible controls distinguish image CAPTCHA from help mentioning captcha',async()=>{
 const {classifyVisibleChallenge:classify}=await shared();
 assert.equal(classify({text:'帮助文档：captcha 是验证码，可以刷新后重试。'}),null);
 assert.equal(classify({text:'登录',captchaInputs:['captcha'],captchaImages:['验证码']}),'image_captcha');
 assert.equal(classify({text:'登录',captchaInputs:['captcha'],captchaImages:[]}),'captcha_input');
 assert.equal(classify({challengeFrames:[{src:'https://challenges.cloudflare.com/widget'}]}),'cloudflare');
 assert.equal(classify({text:'向右拖动滑块，完成拼图'}),'interactive_captcha');
});
function tabFixture({before,after=before,checkbox=false,expired=false}){
 let waited=false,clicks=0;
 const control={count:async()=>1,isVisible:async()=>true,click:async()=>{clicks++;},waitFor:async()=>{waited=true;if(expired)throw Error('Timeout');}};
 return {tab:{url:async()=> 'https://example.org/login',playwright:{evaluate:async()=>waited?after:before,
  getByRole:role=>role==='checkbox'?{...control,count:async()=>checkbox?1:0}:control,
  locator:()=>({evaluateAll:async()=>[]})}},clicks:()=>clicks};
}
test('passive CF clearance continues without clicking or demanding confirmation',async()=>{
 const {observeVerification}=await shared(),f=tabFixture({before:{text:'正在进行安全验证'},after:{text:'账号登录',passwordForm:true}});
 const r=await observeVerification(f.tab);assert.equal(r.type,null);assert.equal(r.status,'clear');assert.equal(r.passed,true);assert.equal(f.clicks(),0);
});
test('CF timeout and interactive checkbox remain blocked with bounded wait',async()=>{
 const {observeVerification}=await shared();
 for(const options of [{expired:true},{checkbox:true}]){
  const f=tabFixture({before:{text:'正在进行安全验证'},...options}),r=await observeVerification(f.tab);
  assert.equal(r.type,'cloudflare');assert.equal(r.status,'challenge_requires_current_confirmation');assert.equal(f.clicks(),0);
 }
});

test('real CF 1005 ASN denial is an access error, never a solvable CAPTCHA or permission request', historicalCaptureOptions('work/collection-runs/pricing-9-20261109-v16/A032-new-nozomi-asn-denied.json'),async()=>{
 const raw=require('../work/collection-runs/pricing-9-20261109-v16/A032-new-nozomi-asn-denied.json').document;
 const shared=await import('../collection/challenge.mjs');
 assert.equal(shared.classifyVisibleChallenge(raw),'network_policy_block');
 assert.equal(require('../lib/collection-engine.cjs').classify(raw),'error_page_observed');
 const f=tabFixture({before:raw});const result=await shared.observeVerification(f.tab);
 assert.equal(result.status,'access_blocked_by_network_policy');assert.equal(result.actionTaken,false);assert.equal(result.automaticRetryAllowed,false);
 const {ensureVerification,checkpointFor}=require('../deploy-service/verification.cjs');let confirmations=0;
 const guarded=await ensureVerification({}, {initial:result,confirmationProvider:async()=>{confirmations++;throw Error('Must not ask to solve a network policy block');}});
 assert.equal(guarded.status,'access_blocked_by_network_policy');assert.equal(confirmations,0);
 const checkpoint=checkpointFor(result,{stage:'public_entry',redact:x=>x});assert.equal(checkpoint.status,'access_blocked_by_network_policy');assert.match(checkpoint.nextAction,/continue other sites/);
});
test('login never fills credentials or submits when an image CAPTCHA is visible',async()=>{
 const {authenticate}=require('../deploy-service/auth.cjs');
 const page={url:()=> 'https://example.org/login',evaluate:async()=>({text:'登录',captchaInputs:['captcha'],captchaImages:['验证码']}),locator:()=>{throw Error('Must not fill or submit');}};
 const r=await authenticate(page,{config:{auth:{emailSelector:'#email',passwordSelector:'#password',submitSelector:'#login'}},credential:{origin:'https://example.org',email:'synthetic@example.org',password:'SYNTHETIC'}});
 assert.equal(r.status,'challenge_requires_current_confirmation');assert.equal(r.verification.type,'image_captcha');
});
test('checkpoint strips query and fragment and retains capture time with redacted body',()=>{
 const {checkpointFor}=require('../deploy-service/verification.cjs');
 const result=checkpointFor({type:'image_captcha',snapshot:{url:'https://example.org/login?token=secret#private',text:'user@example.org 验证码'}},{stage:'before_auth',redact:require('../deploy-service/collector.cjs').redact});
 assert.equal(result.url,'https://example.org/login');assert(!result.body.includes('user@example.org'));assert(Number.isFinite(Date.parse(result.observedAt)));assert.equal(result.status,'awaiting_current_confirmation');
 assert.equal(checkpointFor({type:null},{}),null);
});
test('worker persists challenge separately, skips extraction, scheduler proceeds to next site',async t=>{
 const store=require('../deploy-service/store.cjs').createStore({filename:':memory:'});t.after(()=>store.close());
 store.seedSites([{id:'A001'},{id:'A002'}]);let extracted=0,visited=[];
 const collect=async site=>{visited.push(site.id);return{observations:[],discovery:[],blocker:'challenge_requires_current_confirmation',checkpoints:[{url:'https://example.org/login',body:'验证码',type:'image_captcha',observedAt:'2026-11-03T00:00:00Z'}]};};
 const worker=require('../deploy-service/worker.cjs').createCollector({store,collect,extract:async()=>{extracted++;throw Error('No business evidence');}});
 const scheduler=require('../deploy-service/scheduler.cjs').createScheduler({store,collect:worker});
 assert.equal((await scheduler.tick({siteId:'A001'})).status,'blocked');
 assert.equal((await scheduler.tick({siteId:'A002'})).status,'blocked');
 assert.deepEqual(visited,['A001','A002']);assert.equal(extracted,0);assert.equal(store.listProposals().length,0);
 assert.equal(store.listEvidence().length,2);assert(store.listEvidence().every(e=>e.kind==='verification_checkpoint'));
});
