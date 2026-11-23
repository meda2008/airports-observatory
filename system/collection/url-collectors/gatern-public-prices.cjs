'use strict';
const crypto=require('node:crypto'),origin='https://s.gtnb.net';
function extract(s,{recordId,prior={}}={}){
 if(recordId!=='A182'||s.url!==origin+'/intro'||!s.evidenceId||!Number.isFinite(Date.parse(s.observedAt))||s.passwordForm||s.metadata?.passwordForm||/checkpoint/.test(s.kind||''))return null;
 const body=s.body||'',hash=crypto.createHash('sha256').update(body).digest('hex');if(s.sha256&&s.sha256!==hash||!body.includes('© 2026 Gatern')||!body.includes('Available plans'))return null;
 const matches=[...body.matchAll(/(Nano|Micro|Small|Medium|Large|Lite|Pro|Ultra)\n\nTraffic allowance ([\d.]+) (GiB|TiB)\n(?:Resets monthly on the billing day of your initial purchase\n)?\nFrom CNY\s+(\d+\.\d{2})\n(1 month · Recurring payment|12 months · One payment covers one year; pay to renew for another year)/g)];
 if(matches.length!==8||new Set(matches.map(m=>m[1])).size!==8)return null;
 const plans=matches.map(m=>({name:m[1],productName:m[1],amount:+m[4],billingPeriod:m[5].startsWith('1 month')?'月付':'年付',amountBasis:'original_billing_period_total',currency:'CNY',priceQualifier:'from',quote:m[0],quota:m[2]+' '+m[3]+'（站方声明）',sourceIds:[s.evidenceId],sourceUrl:s.url,observedAt:s.observedAt,sourceBodySha256:hash,sourceLocator:{kind:'body_utf16_range',start:m.index,end:m.index+m[0].length},checkoutVerified:false,restrictions:[m[5].startsWith('1 month')?'周期套餐，官网声明按最初购买账单日每月重置。':'一次付款使用一年，可付费续费下一年；流量不是每月重置。','官网标为起价，未建单核实最终结算金额。']}));
 return{pricing:require('../../lib/current-public-price-catalog.cjs').currentPublicCatalog((prior.coreInfo||prior).pricing||{},{status:'advertised_not_checkout_verified',plans,sourceIds:[s.evidenceId],observedAt:s.observedAt,checkoutVerified:false,limitation:'官网原生导航到新门户的公开起价目录；不等于结算总价，旧报价保留历史资料。'},'current_anonymous_public_landing_offers')};
}
module.exports={origin,recordIds:['A182'],fields:['pricing'],extract};
