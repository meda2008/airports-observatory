'use strict';
const crypto=require('node:crypto'),origin='https://cloud.e-ix.com';
function extract(s,{recordId,prior={}}={}){
 if(recordId!=='A044'||!s.evidenceId||!Number.isFinite(Date.parse(s.observedAt)))return null;const u=new URL(s.url),body=s.body||s.text||'';
 if(u.origin!==origin||!['/','/#/'].includes(u.pathname+u.hash)||s.passwordForm||s.metadata?.passwordForm||/checkpoint/.test(s.kind||'')||!body.includes('Every limit, published up front')||!body.includes('One-time, 12 months'))return null;
 const hash=crypto.createHash('sha256').update(body).digest('hex');if(s.sha256&&s.sha256!==hash)return null;
 const matches=[...body.matchAll(/E-IX (256|512|1024)G\n(?:Most devices and bandwidth\n)?¥(\d+(?:\.\d{1,2})?)\n\/(mo|yr)(?=\s|$)/g)];if(matches.length!==3||new Set(matches.map(m=>m[1])).size!==3)return null;
 const plans=matches.map(m=>({name:'E-IX '+m[1]+'G',productName:'E-IX '+m[1]+'G',amount:Number(m[2]),billingPeriod:m[3]==='mo'?'月付':'年付',amountBasis:'original_billing_period_total',currency:null,currencySymbol:'¥',currencyStatus:'symbol_only_not_ISO_confirmed',quote:m[0],sourceIds:[s.evidenceId],sourceUrl:s.url,observedAt:s.observedAt,sourceBodySha256:hash,sourceLocator:{kind:'body_utf16_range',start:m.index,end:m.index+m[0].length},checkoutVerified:false,restrictions:[m[1]==='1024'?'站方称一次性流量额度、有效12个月；不是每月1024GB，未验证自动续费。':'站方称月度重置，未核实实际执行。','带宽上限和设备数为站方声明，不作为实测。']}));
 const old=(prior.coreInfo||prior).pricing||{};return{pricing:require('../../lib/current-public-price-catalog.cjs').currentPublicCatalog(old,{status:'advertised_not_checkout_verified',plans,sourceIds:[s.evidenceId],observedAt:s.observedAt,checkoutVerified:false,limitation:'仅官网当前公开套餐表原周期标价；1024G是有效12个月的一次性流量，未建单。其他旧报价单列历史资料。'},'current_anonymous_public_landing_offers')};
}
module.exports={origin,recordIds:['A044'],fields:['pricing'],extract};
