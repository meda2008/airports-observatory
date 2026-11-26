'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {makeNeedsSearch,comparison,planUnitPrices,outbound}=require('../lib/needs-search.cjs');
const plan={name:'SYNTHETIC',amount:120,currency:'CNY',billingPeriod:'年付',amountBasis:'original_billing_period_total',quota:'每月100GB',sourceIds:['synthetic'],observedAt:'2026-11-01T00:00:00Z'};
const record=(id,p=plan)=>({id,name:id,officialUrl:'https://example.com/',coreInfo:{pricing:{plans:[p]}}});
test('deterministic needs parsing applies text intent and bounded monthly budgets',()=>{const s=makeNeedsSearch({rawExport:()=>({catalog:[record('A001'),record('A002',{...plan,amount:360})]})});const r=s.search({needs:'我想要便宜的，每月20元以内',criterion:'value'});assert.equal(r.criterion,'cheap');assert.deepEqual(r.items.map(i=>i.id),['A001']);assert.ok(r.limitations[0].includes('20 CNY'));assert.equal(s.search({needs:'性价比高，月预算20'}).criterion,'value');assert.equal(s.search({needs:'月预算20',maxMonthly:'5'}).items.length,0);assert.equal(s.search({needs:'稳定'}).status,'abstain');assert.equal(s.search({needs:'速度快'}).status,'abstain');});
test('unsupported, negated, conflicting and partial needs never masquerade as fulfilled',()=>{const s=makeNeedsSearch({rawExport:()=>({catalog:[record('A001')]})});for(const needs of ['解锁Netflix','便宜，支持游戏','不需要便宜','稳定且便宜','月预算0','每月20元以上']){const r=s.search({needs});assert.equal(r.status,'unparsed_needs',needs);assert.equal(r.items.length,0);assert.ok(r.reason.includes('未完整解析'));}assert.equal(s.search({needs:'每月20元以内',currency:'USD'}).status,'unparsed_needs');assert.throws(()=>s.search({needs:'a'.repeat(301)}));assert.equal(s.search({criterion:'value',maxMonthly:'20'}).items.length,1);});
test('calendar annual arithmetic uses independent expected 10 per month and 0.1 per GB',()=>{assert.equal(comparison(plan,'CNY').monthlyAmount,10);assert.equal(comparison(plan,'CNY').costPerGB,0.1);});
test('ambiguous or noncomparable prices cannot enter ranking',()=>{for(const change of [{currency:null},{amount:NaN},{amount:-1},{amountBasis:'advertised_starting_price_not_period_total'},{billingPeriod:'31天'},{soldOut:true},{addon:{name:'extra'}},{additionalCharges:{amount:1}},{sourceIds:[]},{observedAt:null}])assert.equal(comparison({...plan,...change},'CNY'),null);assert.equal(comparison(plan,'USD'),null);});
test('G and one-off or ambiguous quotas never become GB denominators',()=>{for(const quota of ['每月100G','100GB','总量100GB','每月1TB'])assert.equal(comparison({...plan,quota},'CNY').costPerGB,null);});
test('display unit prices use original periods, explicit days and qualified quotas',()=>{
 const annual=planUnitPrices(plan);
 assert.equal(annual.dailyAmount,120/365);
 assert.equal(annual.dayBasis,'365_day_year');
 assert.equal(annual.costPerGB,120/1200);
 const fixed=planUnitPrices({...plan,billingPeriod:'月付（31天）',quota:'每31天200GB'});
 assert.equal(fixed.dailyAmount,120/31);
 assert.equal(fixed.dayBasis,'explicit_days');
 assert.equal(fixed.costPerGB,.6);
 assert.equal(planUnitPrices({...plan,billingPeriod:'三年付'}).dailyAmount,120/1095);
 assert.equal(planUnitPrices({...plan,quota:'200GB',quotaReset:'不按每月重置'}).costPerGB,null);
 assert.equal(planUnitPrices({...plan,quota:'每月100G'}).costPerGB,null);
 const total=planUnitPrices({...plan,billingPeriod:'一次性（不限时）',quota:'总流量200GB'});
 assert.equal(total.dailyAmount,null);
 assert.equal(total.costPerGB,.6);
 assert.equal(planUnitPrices({...plan,currency:null}),null);
 const symbol=planUnitPrices({...plan,currency:null,currencySymbol:'¥'});
 assert.deepEqual([symbol.currency,symbol.currencySymbol],[null,'¥']);
 assert.equal(comparison({...plan,currency:null,currencySymbol:'¥'},'CNY'),null);
 assert.equal(planUnitPrices({...plan,priceStatus:'not_confirmed'}),null);
});
test('search selects cheapest plan per service and respects budget without using legacy',()=>{const a=record('A001');a.coreInfo.pricing.plans.push({...plan,amount:60});const s=makeNeedsSearch({rawExport:()=>({catalog:[a,record('A002',{...plan,amount:24})]})});assert.deepEqual(s.search().items.map(i=>i.id),['A002','A001']);assert.equal(s.search({maxMonthly:'3'}).items.length,1);assert.equal(s.search({criterion:'speed'}).status,'abstain');assert.equal(s.search({criterion:'stability'}).items.length,0);assert.throws(()=>s.search({currency:['CNY']}));assert.throws(()=>s.search({maxMonthly:'Infinity'}));});
test('only sourced user-owned same-origin verified referrals are used and disclosed',()=>{const r=record('A001'),ref={recordId:'A001',status:'verified_user_referral',owner:'user',sourceIds:['synthetic'],verifiedAt:'2026-11-01',disclosure:'测试推荐利益披露',url:'https://example.com/register?ref=synthetic'};assert.equal(outbound(r,[]).type,'official_fallback');assert.equal(outbound(r,[ref]).url,ref.url);for(const change of [{owner:'third-party'},{status:'unknown'},{sourceIds:[]},{url:'javascript:alert(1)'},{url:'https://evil.example/'},{disclosure:''}])assert.equal(outbound(r,[{...ref,...change}]).type,'official_fallback');});
test('real catalog offers remain advertised, source backed, and no referral is invented',()=>{const service=require('../lib/catalog-service.cjs').makeCatalogService(),result=makeNeedsSearch(service).search();assert.ok(result.items.length);for(const item of result.items){assert.equal(item.comparison.checkoutVerified,false);assert.ok(item.plan.sourceIds.length);assert.notEqual(item.link.type,'verified_user_referral');}});

test('plan view paginates individual sourced offers and filters by plan name and monthly billing', () => {
 const first=record('A001');
 first.coreInfo.pricing.plans.push(...Array.from({length:12},(_,index)=>({
  ...plan,name:`Monthly ${index}`,billingPeriod:'月付',amount:15+index
 })));
 const search=makeNeedsSearch({rawExport:()=>({catalog:[first]})}).search;
 assert.equal(search().items.length,1);
 const page=search({view:'plans',page:'9'});
 assert.deepEqual([page.page,page.pages,page.total,page.items.length],[2,2,13,1]);
 assert.equal(page.items[0].planKey,'A001-12');
 const filtered=search({view:'plans',monthlyOnly:'1',q:'Monthly 0',maxMonthly:'15'});
 assert.equal(filtered.total,1);
 assert.equal(filtered.items[0].unitPrices.dailyAmount,15/(365/12));
 assert.equal(search({view:'plans',monthlyOnly:'1',maxMonthly:'10'}).total,0);
 assert.equal(search({view:'plans',criterion:'speed'}).status,'abstain');
 assert.throws(()=>search({view:'plans',page:'0'}));
 assert.throws(()=>search({monthlyOnly:'1'}));
});
