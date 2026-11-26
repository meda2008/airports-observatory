'use strict';
const { historicalCaptureOptions } = require('./helpers/historical-capture.cjs');
const historicalCapture = historicalCaptureOptions('work/collection-runs/new-entries-20261104-v2/source-manifest.json');

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const d='work/collection-runs/new-entries-20261104-v2/',manifest=historicalCapture.skip ? undefined : JSON.parse(fs.readFileSync(d+'source-manifest.json')),raw=label=>JSON.parse(fs.readFileSync(d+manifest.find(s=>s.label===label).file));
test('XXF FAQ keeps IP limits separate from devices and supersedes only the old official client recommendation', historicalCapture,()=>{
 const parser=require('../collection/url-collectors/a01-xxfaffa01.cjs'),s={...raw('A061-plan-selection-faq'),evidenceId:'CURRENT'},prior=JSON.parse(fs.readFileSync(d+'review-xxf/review-candidates.json')).candidates[0].prior;
 const patch=parser.extract(s,{prior});assert.deepEqual(Object.keys(patch),['compatibility']);assert.match(patch.compatibility.summary,/3\/5\/10个IP/);assert.match(patch.compatibility.summary,/V7.2.5/);assert(patch.compatibility.historicalRequirements.some(x=>/3.1.8/.test(x.quote)));assert(patch.compatibility.requirements.some(x=>/公网IP数量不能等同终端设备数/.test(x)));assert.equal(parser.extract({...s,url:'https://other.invalid/#/help'},{prior}),null);
});
test('YinYun trial requires actual article body, exact three-day statement and explicit date; does not imply trial executed or old identity verified', historicalCapture,()=>{
 const parser=require('../collection/url-collectors/support-yinyun-ltd.cjs'),s={...raw('A180-official-quick-start-body-ready'),evidenceId:'CURRENT'},v=parser.extract(s);
 assert.deepEqual(Object.keys(v),['trial']);assert.equal(v.trial.pageUpdatedAt,'2026-02-05');assert.equal(v.trial.executionVerified,false);assert.match(v.trial.identityScope,/current_user_authorized/);assert.match(v.trial.conditions.join(' '),/法律主体及连续经营未独立核实/);
 assert.equal(parser.extract({...s,text:s.text.replace('3 × 24小时','7 × 24小时')}),null);assert.equal(parser.extract({...s,url:'https://support.yinyun.ltd/hc/help/zh_CN/categories/questions'}),null);
});

test('YinYun payment statement differences retain PayPal and source dates, with no checkout downgrade or repeat admission', historicalCapture,()=>{
 const parser=require('../collection/url-collectors/support-yinyun-ltd.cjs'),s={...raw('A180-official-quick-start-body-ready'),evidenceId:'CURRENT'},prior=JSON.parse(fs.readFileSync(d+'review-yinyun-payment/review-candidates.json')).candidates[0].prior;
 const patch=parser.extract(s,{prior});assert.deepEqual(Object.keys(patch),['payment']);assert(patch.payment.methods.includes('PayPal'));assert(patch.payment.methods.includes('USDT (TRC20)'));assert.equal(patch.payment.checkoutObserved,false);assert.equal(patch.payment.transactionVerified,false);assert.equal(patch.payment.statementObservations[0].observedAt,prior.payment.observedAt);assert.equal(patch.payment.statementObservations[1].pageUpdatedAt,'2026-02-05');assert.match(patch.payment.reason,/不据此认定PayPal下线/);assert.equal(parser.extract(s,{prior:{...prior,...patch}}),null);assert.equal(parser.extract(s,{prior:{...prior,payment:{...prior.payment,checkoutObserved:true}}}),null);
});
