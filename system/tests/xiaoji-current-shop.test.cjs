'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const parser=require('../collection/url-collectors/site-literal-profiles.cjs');
const source=require('./fixtures/xiaoji-current-shop-20261118.json');
const extract=s=>parser.extract(s,{recordId:'A062',prior:{}});
test('eight explicit native catalog totals preserve annual billing and do not turn name monthly equivalent into another price',()=>{const p=extract(source).pricing.plans;assert.deepEqual(p.map(x=>x.amount),[108,15,30,60,120,240,360,680]);assert.equal(p[0].billingPeriod,'年付');assert(!p.some(x=>x.amount===9));for(const x of p){assert.equal(x.currency,null);assert.equal(x.quotaReset,null);assert.equal(x.checkoutVerified,false);assert.equal(source.body.slice(x.sourceLocator.start,x.sourceLocator.end),x.quote);}assert.equal(p[7].quota,null);});
test('dashboard old order amount and changed annual period never qualify as current catalog prices',()=>{assert.equal(extract({...source,url:source.url.replace('payment','dashboard')}),null);assert.equal(extract({...source,body:source.body.replace('￥108/年','￥108/月')}),null);assert.equal(extract({...source,kind:'auth_checkpoint'}),null);});
test('native catalog refresh preserves unobserved prior periods and original dates',()=>{const old={name:'VIP1套餐 100G · 季付',amount:42,billingPeriod:'季付',observedAt:'2026-10-01T00:00:00Z',sourceIds:['ORIGINAL']},p=parser.extract(source,{recordId:'A062',prior:{pricing:{plans:[old]}}}).pricing;assert.deepEqual(p.plans.find(x=>x.billingPeriod==='季付'),old);assert.equal(p.plans.length,9);});
