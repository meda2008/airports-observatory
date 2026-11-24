'use strict';
const origin='https://fdsh.kuajiecloudtttt.xyz';
function extract(snapshot){
 if(new URL(snapshot.url).origin!==origin)throw Error('collector_origin_mismatch');
 const body=snapshot.body||snapshot.text||'',start=body.lastIndexOf('五、优惠码和价格'),end=body.indexOf('六、忘记密码',start);
 if(start<0||end<0)return null;const quote=body.slice(start,end).trim();
 if(!quote.includes('优惠码 kuajie：打 8 折')||!quote.includes('月付到三年付各周期和流量重置')||!quote.includes('以下两档不参加优惠码')||!quote.includes('跨界年付版（¥96 / 60GB）')||!quote.includes('跨界·不限时包（¥200 / 300GB，一次性）')||!quote.includes('最终价格以结算页为准'))return null;
 return {promotions:[{status:'stated_offer_not_checkout_verified',type:'coupon',code:'kuajie',summary:'站方FAQ称 kuajie 打8折，不限新老用户；月付至三年付及流量重置适用，年付96元档和一次性200元档除外。',discountText:'打 8 折',quote,conditions:[quote],sourceUrl:snapshot.url,amount:null,expiresAt:null,affiliateBinding:null,checkoutVerified:false,expiryVerified:false,sourceIds:[snapshot.evidenceId].filter(Boolean),observedAt:snapshot.observedAt||snapshot.capturedAt}]};
}
module.exports={origin,recordIds:['A162'],fields:['promotions'],extract};
