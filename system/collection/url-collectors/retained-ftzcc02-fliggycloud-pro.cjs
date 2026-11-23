'use strict';
const legacy=require('./retained-rule.cjs').createRetainedExtractor(require('./retained-ftzcc02-fliggycloud-pro.json'));
module.exports={...legacy,fields:['pricing','compatibility'],extract(s,{prior={}}={}){
 const u=new URL(s.url),text=s.text||'',old=prior.coreInfo||prior;
 if(u.origin===legacy.origin&&u.hash==='#/plan'&&!s.passwordForm&&!s.verificationWidgetObserved&&Number.isFinite(Date.parse(s.capturedAt))){
 const matches=[...text.matchAll(/(Fliggy轻量套餐|Fliggy-VIP[1-4])\s*\n¥\s*(\d+)\s*\/(年付|月付)([\s\S]*?)(?=Fliggy(?:轻量套餐|-VIP)|$)/g)];
 if(matches.length===5&&new Set(matches.map(x=>x[1])).size===5){const plans=[];for(const m of matches){const quota=m[4].match(/每月提供\s*(\d+)G/);if(!quota||!m[4].includes('立即订阅'))return null;const previous=(old.pricing?.plans||[]).find(p=>p.name===m[1]&&p.billingPeriod===m[3]);plans.push({...previous,name:m[1],amount:Number(m[2]),billingPeriod:m[3],amountBasis:'original_billing_period_total',currency:null,currencySymbol:'¥',currencyStatus:'not_confirmed',currencyReason:'仅见¥符号，不推断ISO币种。',quota:quota[1]+'G/月',quotaReset:'每月提供，精确重置日未说明',quote:m[0].trim(),observedAt:s.capturedAt,sourceUrl:s.url,sourceIds:[s.evidenceId].filter(Boolean),checkoutVerified:false});}
 return{pricing:{...old.pricing,status:'advertised_not_checkout_verified',plans,observedAt:s.capturedAt,checkoutVerified:false,previousObservations:[...(old.pricing?.previousObservations||[]),{observedAt:old.pricing?.observedAt,plans:old.pricing?.plans||[]}],limitation:'当前官网五档标价；ISO币种、其他周期和实际结账未核实。旧观察保留，不把刷新采集时间当成新增套餐。'}};
 }}return legacy.extract(s,{prior});
}};
