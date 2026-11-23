'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),parser=require('../collection/url-collectors/edgenova-native-plans.cjs');
const row={id:1,name:'SYNTHETIC PLAN',show:1,transfer_enable:120,month_price:2200,quarter_price:6000,year_price:20400,onetime_price:null,reset_price:2000,content:'每月高速流量（120G）'};
const source=value=>({url:parser.url,body:JSON.stringify(value),evidenceId:'SYNTHETIC-EVIDENCE',observedAt:'2026-11-17T18:00:00Z',metadata:{representation:'original_native_plan_http_json',authenticationObserved:true}});
test('explicit native billing fields produce original totals; reset add-on is not a subscription and scale has a retained client contract',()=>{
 const s=source({data:[row]}),p=parser.extract(s,{recordId:'A168'});
 assert.deepEqual(p.pricing.plans.map(x=>[x.amount,x.billingPeriod]),[[22,'月付'],[60,'季付'],[204,'年付']]);
 for(const x of p.pricing.plans){assert.equal(x.amountBasis,'original_billing_period_total');assert.equal(x.currency,null);assert.equal(x.checkoutVerified,false);assert.equal(s.body.slice(x.sourceLocator.start,x.sourceLocator.end),x.quote);assert.equal(x.apiUnits.priceScale,100);assert.equal(x.apiUnits.clientArtifactSha256,parser.clientArtifactSha256);}
 assert.equal(p.website.operatorIdentityVerified,false);assert.match(p.website.relationship,/continuity_unverified/);
});
test('inactive and zero offers do not become zero-price products, contradictory quota is exposed and unobserved old periods remain',()=>{
 const old={name:'SYNTHETIC PLAN · 半年付',billingPeriod:'半年付',amount:110,observedAt:'2026-10-01T00:00:00Z'};
 const p=parser.extract(source({data:[{...row,quarter_price:0,content:'每月高速流量（150G）'},{...row,id:2,name:'HIDDEN',show:0}]}),{recordId:'A168',prior:{pricing:{plans:[old]}}});
 assert.equal(p.pricing.plans.length,3);assert.deepEqual(p.pricing.plans[0],old);
 for(const x of p.pricing.plans.slice(1)){assert.equal(x.quota,null);assert.equal(x.quotaStatus,'conflicting_operator_statements');}
});
test('wrong identity, missing account witness, negative envelope and secret fields are refused',()=>{
 for(const s of [source({status:false,data:[row]}),source({data:[{...row,token:'PRIVATE'}]}),{...source({data:[row]}),metadata:{representation:'original_native_plan_http_json'}},{...source({data:[row]}),url:'https://other.invalid/api/v1/user/plan/fetch'}])assert.equal(parser.extract(s,{recordId:'A168'}),null);
 assert.equal(parser.extract(source({data:[row]}),{recordId:'A020'}),null);
});
test('native channel labels remain nontransactional and disabled methods are not promoted',()=>{
 const s={...source({data:[{id:1,name:'支付宝',payment:'Alipay'},{id:2,name:'微信',payment:'Wechat',enable:0}]}),url:parser.paymentUrl,metadata:{representation:'original_native_payment_methods_json',authenticationObserved:true}};
 const p=parser.extract(s,{recordId:'A168'});assert.deepEqual(p.payment.methods,['支付宝']);assert.equal(p.payment.ordersCreated,0);assert.equal(p.payment.transactionVerified,false);
});
test('two-year and three-year refreshed totals replace the same old period instead of creating duplicate product rows',()=>{
 const old={name:'SYNTHETIC PLAN · 二年付',billingPeriod:'二年付',amount:390,observedAt:'2026-10-01T00:00:00Z'};
 const p=parser.extract(source({data:[{...row,two_year_price:40000}]}),{recordId:'A168',prior:{pricing:{plans:[old]}}}).pricing;
 const rows=p.plans.filter(x=>['两年付','2年付','二年付'].includes(x.billingPeriod));assert.equal(rows.length,1);assert.equal(rows[0].amount,400);assert.equal(rows[0].amountBasis,'original_billing_period_total');
});
test('real retained EdgeNova envelope yields nine products and thirty-five source-bound original period totals',()=>{
 const s=require('./fixtures/edgenova-current-native-plans-20261118.json'),p=parser.extract(s,{recordId:'A168'});
 assert.equal(p.pricing.plans.length,35);assert.equal(new Set(p.pricing.plans.map(x=>x.productName)).size,9);
 const rows=JSON.parse(s.body).data;
 for(const plan of p.pricing.plans){const row=rows.find(x=>x.name===plan.productName);assert.equal(row[plan.apiUnits.priceField]/100,plan.amount);assert.equal(s.body.slice(plan.sourceLocator.start,plan.sourceLocator.end),plan.quote);}
 assert.equal(p.pricing.plans.find(x=>x.productName==='限时年付'&&x.billingPeriod==='年付').amount,98);
 assert.equal(p.pricing.plans.find(x=>x.productName==='永久不限时100G').amount,100);
});

 test('new native payment evidence does not inherit historical checkout proof or quote',()=>{
 const s={...source({data:[{id:1,name:'支付宝',payment:'Alipay'}]}),url:parser.paymentUrl,metadata:{representation:'original_native_payment_methods_json',authenticationObserved:true}};
 const historic={quote:'OLD CHECKOUT',checkoutObserved:true,statementType:'authenticated_unpaid_order_payment_options',observations:[{quote:'OLD CHECKOUT'}]};
 const p=parser.extract(s,{recordId:'A168',prior:{payment:historic}}).payment;
 assert.equal(p.checkoutObserved,false);assert.equal(p.statementType,'authenticated_native_payment_methods_readonly');assert.equal(p.quote,s.body);assert.equal(s.body.slice(p.sourceLocator.start,p.sourceLocator.end),p.quote);assert.deepEqual(p.observations,historic.observations);
 });
