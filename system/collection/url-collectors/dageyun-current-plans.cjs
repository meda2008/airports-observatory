'use strict';
const crypto=require('node:crypto'),origin='https://aff01.zygbx.com';
function extract(s,{recordId,prior={}}={}){
 if(recordId!=='A073'||!s.evidenceId||!Number.isFinite(Date.parse(s.observedAt))||s.metadata?.authenticationObserved!==true||/checkpoint/.test(s.kind||''))return null;
 let u;try{u=new URL(s.url);}catch{return null;}if(u.origin!==origin||u.pathname!=='/'||u.hash!=='#/plan'||u.search)return null;
 const body=s.body||'',cards=s.metadata.planCards;if(!Array.isArray(cards)||!cards.length||cards.length>30)return null;const hash=crypto.createHash('sha256').update(body).digest('hex'),seen=new Set(),plans=[];
 for(const card of cards){if(card.headingCount!==1||card.buttonLabel!=='立即订阅'||typeof card.name!=='string'||!card.name.trim()||typeof card.text!=='string'||!card.text.startsWith(card.name+'\n')||seen.has(card.name))return null;seen.add(card.name);const start=body.indexOf(card.text);if(start<0||body.indexOf(card.text,start+1)>=0)return null;
 const m=/^\n*¥ (\d+\.\d{2})\n+((?:月|季|半年|年|两年|三年)付)\n/.exec(card.text.slice(card.name.length));const quota=/^可用流量：([^\n]+)$/m.exec(card.text),reset=/^流量重置：([^\n]+)$/m.exec(card.text);if(!m||Number(m[1])<=0||!quota||!reset)return null;
 plans.push({name:card.name,productName:card.name,amount:Number(m[1]),amountBasis:'original_billing_period_total',billingPeriod:m[2],currency:null,currencySymbol:'¥',currencyStatus:'symbol_only_not_ISO_confirmed',quota:quota[1]+'（站方原文）',quotaReset:reset[1],checkoutVerified:false,priceStatus:'advertised_not_checkout_verified',sourceIds:[s.evidenceId],sourceUrl:s.url,observedAt:s.observedAt,quote:card.text,sourceBodySha256:hash,sourceLocator:{kind:'body_utf16_range',start,end:start+card.text.length,quoteSha256:crypto.createHash('sha256').update(card.text).digest('hex')},restrictions:['仅读取当前登录目录标价；未套用优惠码、折算月价、下单或付款。','可达到的最大带宽是站方声明，不是测速；“不支持原路退款”不等于不允许任何退款。',...(card.text.includes('新疆地区不可用')?['套餐卡片注明新疆地区不可用。']:[])]});
 }
 return{pricing:require('../../lib/current-public-price-catalog.cjs').currentPublicCatalog((prior.coreInfo||prior).pricing||{},{status:'advertised_not_checkout_verified',plans,observedAt:s.observedAt,sourceIds:[s.evidenceId],checkoutVerified:false,observedPeriodPriceCount:plans.length,observedProductCount:cards.length,limitation:'当前登录账号可见套餐目录原周期标价；未验证结账、优惠或实际交付；旧报价保留历史。'},'authenticated_dageyun_visible_plan_cards')};
}
module.exports={origin,recordIds:['A073'],fields:['pricing'],extract};
