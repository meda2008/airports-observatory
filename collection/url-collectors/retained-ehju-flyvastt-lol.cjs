'use strict';
const retained=require('./retained-rule.cjs').createRetainedExtractor(require('./retained-ehju-flyvastt-lol.json'));
const clauses=['🔥 新用户首单享 8 折优惠！','🎟️ 优惠码：fly20','💰 优惠力度： 立减 20% / 8折','📦 适用套餐： 入门、进阶、高端及商业方案','每位用户每月限使用 1 次，具体优惠以结算页面为准。'];
module.exports={...retained,fields:[...new Set([...retained.fields,'promotions'])],extract(snapshot,context={}){
 const result=retained.extract(snapshot,context),body=snapshot.body||snapshot.text||'';
 if(new URL(snapshot.url).hash!=='#/dashboard'||!body.includes('🚀 FlyV 官方公告｜全新升级 · 新用户专属福利')||!clauses.every(c=>body.includes(c)))return result;
 const prior=context.prior?.coreInfo||context.prior||{};
 return{...result,promotions:[...(prior.promotions||[]).filter(p=>p.code!=='fly20'),{status:'operator_advertised_not_checkout_verified',code:'fly20',summary:'FlyV候选现面板公告：新用户首单8折，优惠码fly20。',quote:clauses.join('\n'),conditions:['原文同时限定新用户首单和每用户每月1次，二者适用关系未核，不能推定可每月重复享首单优惠。','适用入门、进阶、高端及商业方案；以实际结算为准。','仅绑定当前候选面板；与旧flyv.org的连续经营关系尚未证实。'],active:null,expiresAt:null,observedAt:snapshot.observedAt||snapshot.capturedAt,sourceUrl:snapshot.url,sourceIds:[snapshot.evidenceId].filter(Boolean),affiliateBinding:null,expiryVerified:false,checkoutVerified:false}]};
}};
