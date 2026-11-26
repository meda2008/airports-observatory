'use strict';
const { historicalCaptureOptions } = require('./helpers/historical-capture.cjs');
const historicalCapture = historicalCaptureOptions('work/A034-current-unit-and-plan-20261120.json');

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),crypto=require('crypto'),parser=require('../collection/url-collectors/prpr-public-plans.cjs');
const current=historicalCapture.skip ? undefined : JSON.parse(fs.readFileSync(require('path').join(__dirname,'../work/A034-current-unit-and-plan-20261120.json'),'utf8').replace(/^\uFEFF/,''));
test('reviewed current original module keeps exact cent conversion; observed base-period amounts and dates remain literal', historicalCapture,()=>{
 const unit=current.find(r=>r.url.includes('/assets/')),plans=current.find(r=>r.url.endsWith('/shop/plan')),identity={...require('../work/priority-payment-20261116/A034-platform-capabilities.json'),evidenceId:'retained-identity-fixture'};
 assert(unit.body.includes('function Q(e){return(e??0)/100}'));assert(unit.body.slice(unit.body.lastIndexOf('export{')).includes('Q as Fr'));
 const patch=parser.extract(plans,{recordId:'A034',observations:[unit,identity]}).pricing;
 assert.deepEqual(patch.plans.map(p=>p.amount),[15,45,90,180]);assert(patch.plans.every(p=>p.observedAt===plans.observedAt&&p.checkoutVerified===false));
 assert.equal(patch.clientUnitBinding.sha256,crypto.createHash('sha256').update(unit.body).digest('hex'));
 assert.equal(parser.extract(plans,{recordId:'A034',observations:[{...unit,body:unit.body+'changed'},identity]}),null);
 assert.equal(parser.extract(plans,{recordId:'A034',observations:[{...unit,body:unit.body.replace('(e??0)/100','(e??0)/10')},identity]}),null);
});
