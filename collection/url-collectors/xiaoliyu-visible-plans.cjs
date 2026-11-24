'use strict';
const crypto=require('node:crypto');
const origin='https://www.xiaoliyu.me';
function extract(s,{recordId,prior={}}={}){
 if(recordId!=='A201'||!s.evidenceId||!Number.isFinite(Date.parse(s.observedAt)))return null;
 const u=new URL(s.url),body=s.body||s.text||'';if(u.origin!==origin||u.pathname+u.hash!=='/#/plan'||u.search||s.passwordForm||s.verificationWidgetObserved||s.metadata?.passwordForm||s.metadata?.verificationWidgetObserved||/checkpoint/.test(s.kind||'')||s.sha256&&s.sha256!==crypto.createHash('sha256').update(body).digest('hex'))return null;
 const cards=s.metadata?.planCards||s.planCards||[];if(cards.length!==4||new Set(cards.map(c=>c.name)).size!==4||cards.some(c=>c.headingCount!==1))return null;const plans=[];
 for(const c of cards){const quote=c.text?.trim();if(!quote||!body.includes(quote)||body.indexOf(quote)!==body.lastIndexOf(quote)||!quote.startsWith(c.name+'\n'))return null;
 const m=/^[^\n]+\n\s*¥(\d+(?:\.\d{1,2})?)\n\s*月付\n\s*每月可用(\d+)G流量/m.exec(quote);if(!m||!quote.includes('立即订阅')||!quote.includes('不限设备数，全平台通用'))return null;
 const start=body.indexOf(quote);plans.push({name:c.name,productName:c.name,amount:Number(m[1]),billingPeriod:'月付',amountBasis:'original_billing_period_total',currency:null,currencySymbol:'¥',currencyStatus:'symbol_only_not_ISO_confirmed',quota:'每月 '+m[2]+'G（原文G，未明确GB/GiB）',deviceLimit:'站方称不限设备数，实际执行未验证。',quote,sourceIds:[s.evidenceId],sourceUrl:s.url,observedAt:s.observedAt,sourceLocator:{kind:'body_utf16_range',start,end:start+quote.length},sourceBodySha256:crypto.createHash('sha256').update(body).digest('hex'),checkoutVerified:false,restrictions:['只记录当前可见月付总价；不限速、协议、解锁与专线是站方宣传，未作为实测。']});}
 const old=(prior.coreInfo||prior).pricing||{},keys=new Set(plans.map(p=>p.name+'|'+p.billingPeriod));return{pricing:{...old,status:'advertised_not_checkout_verified',plans:[...(old.plans||[]).filter(p=>!keys.has((p.productName||p.name)+'|'+p.billingPeriod)),...plans],sourceIds:[s.evidenceId],observedAt:s.observedAt,checkoutVerified:false,scope:'current_registered_entry_visible_prices'}};
}
module.exports={origin,recordIds:['A201'],fields:['pricing'],extract};
