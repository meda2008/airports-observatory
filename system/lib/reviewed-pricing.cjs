'use strict';
const assert=require('node:assert/strict');
function validateReviewedPricing(value,quote){
 assert(value.plans?.length,'Plans required');
 for(const p of value.plans){
  assert(typeof p.amount==='number'&&Number.isFinite(p.amount)&&p.amount>0,'Positive plan amount required');
  if(p.currency!=null)assert(['CNY','USD','EUR','GBP','JPY','HKD','TWD'].includes(p.currency)&&quote.includes(p.currency),'Explicit ISO currency in quote required');
  else assert(p.currencyStatus==='not_confirmed'&&['¥','￥','$','€','£'].includes(p.currencySymbol)&&quote.includes(p.currencySymbol)&&typeof p.currencyReason==='string'&&p.currencyReason.trim(),'Symbol-only quote must preserve unknown ISO currency and explain it');
  assert(p.billingPeriod&&p.name,'Period and name required');
  assert(quote.includes(p.name)&&quote.includes(String(p.amount))&&quote.includes(p.billingPeriod),'Plan name, amount and billing period must occur in quote');
  assert.equal(p.checkoutVerified,false,'Page quote is not checkout evidence');
 }
 assert.equal(value.transactionVerified,false);
}
function mergeReviewedPricing(prior,next){
 assert.equal(prior.transactionVerified,false);assert.equal(next.transactionVerified,false);
 const plans=[...prior.plans,...next.plans],keys=new Set();
 for(const p of plans){
  const key=JSON.stringify([p.name,p.billingPeriod,p.addon?.requiredPlan||null]);
  assert(!keys.has(key),'Duplicate plan/cycle requires explicit revision, not silent merging');keys.add(key);
  assert(p.sourceIds?.length&&Number.isFinite(Date.parse(p.observedAt)),'Each merged plan must retain its own source and capture time');
 }
 return {...prior,plans,sourceIds:[...new Set([...prior.sourceIds,...next.sourceIds])],
  observedAt:[prior.observedAt,next.observedAt].sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1),
  limitation:[...new Set([prior.limitation,next.limitation].filter(Boolean))].join(' '),transactionVerified:false};
}
module.exports={validateReviewedPricing,mergeReviewedPricing};
