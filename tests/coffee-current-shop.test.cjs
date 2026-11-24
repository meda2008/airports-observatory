'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),parser=require('../collection/url-collectors/site-literal-profiles.cjs');
const source=require('./fixtures/coffee-current-shop-20261118.json');
test('Coffee four original monthly totals retain literal quota and fees while SLA and bandwidth remain claims',()=>{
 const patch=parser.extract(source,{recordId:'A078',prior:{}});assert.deepEqual(Object.keys(patch),['pricing']);
 assert.deepEqual(patch.pricing.plans.map(x=>x.amount),[16,28,53,78]);
 for(const x of patch.pricing.plans){assert.equal(x.billingPeriod,'月付');assert.equal(x.currency,null);assert.equal(x.checkoutVerified,false);assert.equal(source.body.slice(x.sourceLocator.start,x.sourceLocator.end),x.quote);assert(x.restrictions.some(t=>t.includes('手续费金额未确认')));assert(x.restrictions.some(t=>t.includes('非实测')));}
});
test('Coffee missing fees or changed cycle fails closed without guessing other totals',()=>{
 for(const changed of [{...source,body:source.body.replace('本价格不含手续费','费用未说明')},{...source,body:source.body.replace('月付','年付')},{...source,url:'https://aicoffee.app/#/dashboard'},{...source,kind:'auth_checkpoint'}])assert.equal(parser.extract(changed,{recordId:'A078',prior:{}}),null);
});
test('Coffee current monthly refresh leaves an unobserved annual quote and its date untouched',()=>{
 const old={name:'来杯美式 · 年付',billingPeriod:'年付',amount:180,observedAt:'2026-10-01T00:00:00Z',sourceIds:['SYNTHETIC_PRIOR']};
 const plans=parser.extract(source,{recordId:'A078',prior:{pricing:{plans:[old]}}}).pricing.plans;assert.deepEqual(plans[0],old);assert.equal(plans.length,5);
});
