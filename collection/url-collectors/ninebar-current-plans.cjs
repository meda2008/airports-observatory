'use strict';
const crypto=require('crypto');
function create({origin,recordIds}){
function extract(s,{recordId,prior={}}={}){
 if(!recordIds.includes(recordId)||!s.evidenceId||!Number.isFinite(Date.parse(s.observedAt))||s.metadata?.authenticationObserved!==true||/checkpoint/.test(s.kind||''))return null;
 let u;try{u=new URL(s.url);}catch{return null;}if(u.origin!==origin||u.pathname!=='/purchase'||u.search||u.hash)return null;
 const body=s.body||'',hash=crypto.createHash('sha256').update(body).digest('hex');
 const headers=[...body.matchAll(/^([^\n]*九九@[^\n]*)\n(\d+(?:\.\d+)? (?:GiB|TiB))\n(\d+) Mbps\n(\d+) 台设备/gm)],plans=[],cards=[];
 if(!headers.length||headers.length>40)return null;
 const ref=(quote,start)=>({quote,sourceIds:[s.evidenceId],sourceUrl:s.url,observedAt:s.observedAt,sourceBodySha256:hash,sourceLocator:{kind:'body_utf16_range',start,end:start+quote.length,quoteSha256:crypto.createHash('sha256').update(quote).digest('hex')}});
 for(const h of headers){const end=body.indexOf('\n购买套餐',h.index+h[0].length);if(end<0)return null;const text=body.slice(h.index,end+'\n购买套餐'.length);if(headers.some(x=>x.index>h.index&&x.index<end))return null;const periods=[...text.matchAll(/^(月付|季付|半年付|年付|按流量（不限时）)\n¥(\d+\.\d{2})(?=\n|$)/gm)];if(!periods.length||new Set(periods.map(m=>m[1])).size!==periods.length)return null;const name=h[1].trim();cards.push({name,text,start:h.index});for(const m of periods){const total=Number(m[2]);if(!Number.isFinite(total)||total<=0)return null;plans.push({name:name+' · '+m[1],productName:name,amount:total,amountBasis:'original_billing_period_total',billingPeriod:m[1]==='按流量（不限时）'?'一次性（不限时）':m[1],currency:null,currencySymbol:'¥',currencyStatus:'symbol_only_not_ISO_confirmed',quota:h[2]+'（卡片显示）',quotaReset:null,maxDevices:Number(h[4]),deviceLimit:h[4]+'台设备（站方卡片声明）',checkoutVerified:false,priceStatus:'advertised_not_checkout_verified',...ref(text,h.index),restrictions:['仅读取当前账号可见的原周期价签，不使用宣传文案、折算月价或优惠码推算。','GiB/TiB卡片与GB宣传说明的换算口径未核实；999 Mbps属于站方限速声明，不是独立测速。','试用及当前套餐的展示占位价不作为普通可购买套餐报价；未点击订购或付款。']});}}
 const pricing=require('../../lib/current-public-price-catalog.cjs').currentPublicCatalog((prior.coreInfo||prior).pricing||{},{status:'advertised_not_checkout_verified',plans,observedAt:s.observedAt,sourceIds:[s.evidenceId],checkoutVerified:false,observedPeriodPriceCount:plans.length,observedProductCount:cards.length,limitation:'当前登录账号可见的命名套餐价签；未验证结账、优惠和交付；旧报价保留历史。'},'authenticated_visible_named_ninebar_plan_cards');
 const patch={pricing};const q='🚫 暂不支持退款';if(cards.every(c=>c.text.includes(q))){const start=body.indexOf(q,cards[0].start);patch.refund={status:'stated_terms_not_execution_verified',summary:'本次展示的'+cards.length+'款普通套餐均声明“暂不支持退款”；仅指这些套餐卡片，未验证实际执行。',scope:'observed_plan_cards_only',planNames:cards.map(c=>c.name),conditions:['仅保留站方原文，不推断全站其他产品、例外或实际退款处理结果。'],executionVerified:false,...ref(q,start)};}return patch;
}
return{origin,recordIds,fields:['pricing','refund'],extract};
}
module.exports={...create({origin:'https://home.99ba2026.best',recordIds:['A143']}),create};
