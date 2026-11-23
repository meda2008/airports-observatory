'use strict';
const crypto=require('node:crypto');
const origin='https://dhues.jilianat.homes';
const names=['限时年付套餐体验','极连云 · 基础套餐','极连云 · 进阶套餐','极连云 · 旗舰套餐','极连云 · 尊享套餐'];
function extract(s,{recordId,prior={}}={}){
 if(recordId!=='A147'||!s.evidenceId||!Number.isFinite(Date.parse(s.observedAt)))return null;
 const u=new URL(s.url),body=s.body||s.text||'';
 if(u.origin!==origin||u.pathname+u.hash!=='/#/plans'||s.passwordForm||s.metadata?.passwordForm||/checkpoint/.test(s.kind||'')||!body.includes('选择您的订阅计划'))return null;
 const hash=crypto.createHash('sha256').update(body).digest('hex');if(s.sha256&&s.sha256!==hash)return null;
 const plans=[];
 for(const name of names){const start=body.indexOf(name+'\n');if(start<0||body.indexOf(name+'\n',start+name.length)!==-1)return null;const end=body.indexOf('立即订阅',start);if(end<0)return null;const quote=body.slice(start,end+'立即订阅'.length),m=/¥\s*(\d+(?:\.\d{1,2})?)\s*\/\s*(年|月)(?:\s|$)/.exec(quote);if(!m||!quote.includes('不接受退款服务'))return null;plans.push({name,productName:name,amount:Number(m[1]),billingPeriod:m[2]==='年'?'年付':'月付',amountBasis:'original_billing_period_total',currency:null,currencySymbol:'¥',currencyStatus:'symbol_only_not_ISO_confirmed',quote,sourceIds:[s.evidenceId],sourceUrl:s.url,observedAt:s.observedAt,sourceBodySha256:hash,sourceLocator:{kind:'body_utf16_range',start,end:start+quote.length},checkoutVerified:false,restrictions:['站方标称速率、专线与稳定性不作为实测。','未根据折扣比例推算其他周期总价。']});}
 const old=(prior.coreInfo||prior).pricing||{},keys=new Set(plans.map(p=>p.name+'|'+p.billingPeriod));const conflictStart=body.indexOf('极连云 · 不限时套餐\n'),conflictEnd=body.indexOf('立即订阅',conflictStart);const conflicts=conflictStart>=0&&conflictEnd>conflictStart?[{name:'极连云 · 不限时套餐',quote:body.slice(conflictStart,conflictEnd+4),reason:'卡片与说明价格及重置费算式冲突，不采用本轮一次性报价',sourceIds:[s.evidenceId],sourceUrl:s.url,observedAt:s.observedAt}]:[];
 return{pricing:{...old,status:'advertised_not_checkout_verified',plans:[...plans,...(old.plans||[]).filter(p=>!keys.has((p.productName||p.name)+'|'+p.billingPeriod))],summaryPlanIndex:0,sourceIds:[s.evidenceId],observedAt:s.observedAt,checkoutVerified:false,conflicts,limitation:'本次核实5项原周期标价；不限时产品标价冲突，保留冲突原文，旧资料保留原采集时间。'}};
}
module.exports={origin,recordIds:['A147'],fields:['pricing'],extract};
