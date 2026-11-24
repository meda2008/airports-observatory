'use strict';
// Concise customer-facing facts. No collection clocks, provenance or inferred scores.
function representativePlan(plans=[]){
 const eligible=plans.filter(p=>Number.isFinite(p.amount)&&p.amount>0&&p.amountBasis==='original_billing_period_total'&&!p.addon&&p.soldOut!==true&&p.purchasable!==false);
 const first=eligible[0];if(!first)return null;
 return eligible.filter(p=>p.currency===first.currency&&p.currencySymbol===first.currencySymbol&&p.billingPeriod===first.billingPeriod).reduce((a,p)=>p.amount<a.amount?p:a,first);
}
function customerSummary(core={},facts=core){
 const originals=core.pricing?.plans||[],original=representativePlan(originals),selected=original?facts.pricing?.plans?.[originals.indexOf(original)]:null;
 return{price:selected?{name:selected.name,amount:selected.amount,currency:selected.currency||null,currencySymbol:selected.currencySymbol||null,billingPeriod:selected.billingPeriod,quota:selected.quota||null}:null,paymentMethods:Array.isArray(facts.payment?.methods)?facts.payment.methods.filter(v=>typeof v==='string'):[],refund:!facts.refund||['not_confirmed','unknown'].includes(facts.refund.status)?null:facts.refund.summary||null,...require('./performance-summary.cjs').performanceSummary(facts)};
}
module.exports={customerSummary,representativePlan};
