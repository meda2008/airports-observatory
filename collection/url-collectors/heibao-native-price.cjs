'use strict';
const crypto=require('node:crypto'),sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const origin='https://h.ahahub.net';
function extract(s,{recordId,prior={}}={}){
 const portal={A217:'https://user.heibaojiasu.com',A031:'https://user.dowancheng.com'}[recordId];
 if(!portal||s.url!==origin+'/light/dispatch/v2'||!s.evidenceId||!Number.isFinite(Date.parse(s.observedAt))||s.metadata?.portalOrigin!==portal||s.metadata?.command!=='price'||s.metadata?.app!=='cham')return null;
 let v;try{v=JSON.parse(s.body);}catch{return null;}if(v.reason||!Array.isArray(v.prices)||!v.prices.length||v.prices.length>64)return null;
 const periods={'月卡':'月付','季卡':'季付','半年卡':'半年付','年卡':'年付'},plans=[];
 for(const row of v.prices){let name,p;try{name=JSON.parse(row.name).cn;p=JSON.parse(row.price);}catch{return null;}
  const base=name?.replace(/^VIP/,''),quote=JSON.stringify(row),start=s.body.indexOf(quote);
  if(!periods[base]||row.app!=='cham'||row.method!=='buy'||!['regular','vip'].includes(row.type)||name.startsWith('VIP')!==(row.type==='vip')||!Number.isSafeInteger(p.rmb)||p.rmb<=0||!Number.isSafeInteger(p.rmb_display)||p.rmb_display<p.rmb||!Number.isInteger(row.time/1440)||!Number.isInteger(p.time_display/1440)||row.time<p.time_display||!Number.isInteger(row.link)||row.link<1||start<0||s.body.indexOf(quote,start+1)>=0)return null;
  plans.push({name,productName:name,amount:p.rmb/100,originalAmount:p.rmb_display/100,amountBasis:'original_billing_period_total',originalAmountBasis:'native_reference_display_price_not_current_charge',currency:null,currencySymbol:'¥',billingPeriod:periods[base],billingDays:row.time/1440,giftDays:(row.time-p.time_display)/1440,deviceCount:row.link,deviceLimit:row.link+' 台设备',quota:row.flow<0?'站方标注流量无限':'流量待核',quote,sourceIds:[s.evidenceId],sourceUrl:s.url,observedAt:s.observedAt,sourceBodySha256:sha(s.body),sourceLocator:{kind:'body_utf16_range',start,end:start+quote.length},checkoutVerified:false,priceStatus:'advertised_not_checkout_verified',apiUnits:{priceField:'rmb',priceScale:100,timeUnit:'minutes'},restrictions:['正常账号认证后只读price操作，未调用订单或支付。','金额和分钟单位与已保留的原生页面8档标价、天数和设备限制交叉复核；不把参考展示价当售价。']});
 }
 if(new Set(plans.map(p=>p.name)).size!==plans.length)return null;
 const old=(prior.coreInfo||prior).pricing||{};return{pricing:{...old,status:'advertised_not_checkout_verified',plans,sourceIds:[...new Set([...(old.sourceIds||[]),s.evidenceId])],observedAt:s.observedAt,checkoutVerified:false,scope:'current_authenticated_native_quote_api',operatorIdentityVerified:false}};
}
module.exports={origin,recordIds:['A217','A031'],fields:['pricing'],extract,readOnlyRecipe:'heibao_native_api_readonly'};
