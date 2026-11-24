'use strict';
const crypto=require('node:crypto'),origin='https://ss-id.com';
function extract(s,{recordId,prior={}}={}){
 if(recordId!=='A059'||!s.evidenceId||!Number.isFinite(Date.parse(s.observedAt)))return null;
 const u=new URL(s.url),body=s.body||s.text||'';
 if(u.origin!==origin||!['/','/#/'].includes(u.pathname+u.hash)||s.passwordForm||s.metadata?.passwordForm||/checkpoint/.test(s.kind||'')||!body.includes('SS-ID · Simple network service'))return null;
 const hash=crypto.createHash('sha256').update(body).digest('hex');if(s.sha256&&s.sha256!==hash)return null;
 const matches=[...body.matchAll(/(\d+)G Monthly\n\1 GB per month, resets on billing date · 5 devices at once · All apps and ticket support\n¥(\d+(?:\.\d{1,2})?)\/mo(?=\s|$)/g)];
 if(matches.length!==5||new Set(matches.map(m=>m[1])).size!==5)return null;
 const plans=matches.map(m=>({name:m[1]+'G Monthly',productName:m[1]+'G Monthly',amount:Number(m[2]),billingPeriod:'月付',quota:'每月 '+m[1]+' GB',maxDevices:5,deviceLimit:'5台同时在线（站方声明）',amountBasis:'original_billing_period_total',currency:null,currencySymbol:'¥',currencyStatus:'symbol_only_not_ISO_confirmed',quote:m[0],sourceIds:[s.evidenceId],sourceUrl:s.url,observedAt:s.observedAt,sourceBodySha256:hash,sourceLocator:{kind:'body_utf16_range',start:m.index,end:m.index+m[0].length},checkoutVerified:false,restrictions:['官网声明每月'+m[1]+'GB、账单日重置、最多5台设备同时使用；未验证实际执行。']}));
 return{pricing:require('../../lib/current-public-price-catalog.cjs').currentPublicCatalog((prior.coreInfo||prior).pricing||{},{status:'advertised_not_checkout_verified',plans,sourceIds:[s.evidenceId],observedAt:s.observedAt,checkoutVerified:false,limitation:'当前官网公开月付目录，未登录、未建单、未付款；旧报价保留为历史资料。'},'current_anonymous_public_landing_offers')};
}
module.exports={origin,recordIds:['A059'],fields:['pricing'],extract};
