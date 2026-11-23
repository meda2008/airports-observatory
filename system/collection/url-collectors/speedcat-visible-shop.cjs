'use strict';
const crypto=require('node:crypto');
// Parse literal billing periods, never derive annual totals from the banner discounts.
function extract(s,{recordId,prior={}}={}){
 if(recordId!=='A006'||!s.evidenceId||!Number.isFinite(Date.parse(s.observedAt)))return null;
 const u=new URL(s.url),body=s.body||s.text||'';
 if(u.origin!=='https://speedcat.xyz'||u.pathname!=='/user/shop'||u.search||u.hash||s.passwordForm||s.metadata?.passwordForm||!body.includes('SPEEDCAT')||!body.includes('商店'))return null;
 const hash=crypto.createHash('sha256').update(body).digest('hex');if(s.sha256&&s.sha256!==hash)return null;
 const matches=[...body.matchAll(/(?:^|\n)([^\n]+)\n[¥￥](\d+(?:\.\d{1,2})?)\n(每年|每月|365天|一次性)\n/g)];
 if(matches.length!==11)return null;
 const plans=[],addons=[];
 for(let i=0;i<matches.length;i++){
  const m=matches[i],start=m.index+(m[0].startsWith('\n')?1:0),next=body.indexOf('下一步',start);if(next<start||i+1<matches.length&&next>=matches[i+1].index)return null;
  const quote=body.slice(start,next+'下一步'.length),addon=m[3]==='一次性';
  if(addon!==quote.includes('请不要单独购买，这不是套餐'))return null;
  const quota=quote.match(/每 30 天重置流量为 \d+GB|\d+GB 不重置流量，使用天数365天|流量充值包\d+G/);if(!quota)return null;
  const value={name:m[1],productName:m[1],amount:Number(m[2]),amountBasis:'original_billing_period_total',billingPeriod:m[3]==='每月'?'月付':m[3]==='每年'?'年付':m[3],currency:null,currencySymbol:'¥',quota:quota[0],quote,sourceIds:[s.evidenceId],sourceUrl:s.url,observedAt:s.observedAt,sourceBodySha256:hash,sourceLocator:{kind:'body_utf16_range',start,end:start+quote.length},checkoutVerified:false,restrictions:['官网商店原文标价，未核实结账；货币代码未在本页明确。','不限速及解锁为站方声明，不是独立测速。']};
  (addon?addons:plans).push(value);
 }
 if(plans.length!==7||addons.length!==4)return null;
 const old=(prior.coreInfo||prior).pricing||{},canonical=p=>({'每月':'月付','每年':'年付','12个月（商店称每年）':'年付'}[p]||p),keys=new Set(plans.map(p=>p.name+'|'+canonical(p.billingPeriod))),addonNames=new Set(addons.map(p=>p.name));
 return {pricing:{...old,status:'advertised_not_checkout_verified',plans:[...plans,...(old.plans||[]).filter(p=>!addonNames.has(p.productName||p.name)&&!keys.has((p.productName||p.name)+'|'+canonical(p.billingPeriod)))],addOns:addons,summaryPlanIndex:0,sourceIds:[s.evidenceId],observedAt:s.observedAt,checkoutVerified:false,limitation:'7档独立套餐与4档仅叠加流量包分开保留；不从折扣公告推算未显示周期总价。'}};
}
module.exports={origin:'https://speedcat.xyz',recordIds:['A006'],fields:['pricing'],extract};
