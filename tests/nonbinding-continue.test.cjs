const { historicalCaptureOptions } = require('./helpers/historical-capture.cjs');
const historicalCapture = historicalCaptureOptions('work/collection-runs/financial-20261109-v18/A041-candidate-merchant-final.json');
const test=require('node:test'),assert=require('node:assert/strict');
const real=historicalCapture.skip ? undefined : require('../work/collection-runs/financial-20261109-v18/A041-candidate-merchant-final.json').document;
test('observed ordinary notice is distinct from anti-abuse verification, agreements and payment controls', historicalCapture,async()=>{
 const {isNonbindingContinueNotice}=await import('../collection/nonbinding-notice.mjs');assert(isNonbindingContinueNotice(real));
 for(const change of [{text:real.text+'\n继续即表示同意服务条款'},{buttons:['支付']},{agreementCheckbox:true},{passwordForm:true},{verificationWidgetObserved:true},{formFields:[{type:'text'}]},{links:[{url:'https://example.org/terms'}]},{text:'访问验证 点击继续访问'}])assert.equal(isNonbindingContinueNotice({...real,...change}),false);
});
test('normal notice continuation clicks only the unique observed Continue button and records no agreement or CAPTCHA', historicalCapture,async()=>{
 const {continueNonbindingNotice}=await import('../collection/nonbinding-notice.mjs');let clicked=0;
 const tab={url:async()=>real.url,playwright:{getByRole:(role,opt)=>{assert.equal(role,'button');assert.equal(opt.name,'继续');return{count:async()=>1,isVisible:async()=>true,click:async()=>{clicked++},waitFor:async()=>{}};}}};
 const r=await continueNonbindingNotice({tab,snapshot:real,inspect:async()=>({...real,text:'创建账户',passwordForm:true})});assert.equal(clicked,1);assert.equal(r.observation.status,'nonbinding_notice_continued');assert.equal(r.observation.agreementAccepted,false);assert.equal(r.observation.captchaCompleted,false);assert.equal(r.observation.paymentExecuted,false);
});
