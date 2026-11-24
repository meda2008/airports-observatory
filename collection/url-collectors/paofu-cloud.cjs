'use strict';
const crypto=require('node:crypto'),{planKey}=require('./site-literal-profiles.cjs');
const {preservePlanConditions,retainedConditionSourceIds}=require('./retained-plan-conditions.cjs');
const origin='https://www.paofu.cloud';
const key=p=>planKey({...p,billingPeriod:p.billingPeriod==='1个月'?'月付':p.billingPeriod});
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function extract(s,{recordId,prior={},sourceRefs}={}){
 if(!['A025','A198'].includes(recordId)||!s?.evidenceId||!Number.isFinite(Date.parse(s.observedAt||s.capturedAt)))return null;
 let u;try{u=new URL(s.url);}catch{return null;}
 const body=s.body||s.text||'';if(u.origin!==origin||u.pathname!=='/user/shop'||u.search||u.hash||/checkpoint/.test(s.kind||'')||s.passwordForm||s.metadata?.passwordForm||!/^泡芙云$/m.test(body)||!body.includes('选择合适的会员订阅计划'))return null;
 const rows=[];
 for(const name of ['旗舰','进阶','轻量','旗舰团队']){
  const m=new RegExp('^'+name+'\\n(?:热门推荐\\n)?¥(\\d+(?:\\.\\d{1,2})?)\\n每月\\n(\\d+)GB 流量\\n(\\d+)个在线设备\\n不限制速率\\nAI工具&流媒体\\n高速优选线路\\n旗舰精品线路\\n购买(?:\\n|$)','m').exec(body);if(!m)return null;
  const quote=m[0].trim(),start=body.indexOf(quote);rows.push({name:name+' · 月付',productName:name,amount:Number(m[1]),amountBasis:'original_billing_period_total',billingPeriod:'月付',currency:null,currencySymbol:'¥',currencyStatus:'symbol_only_not_ISO_confirmed',quota:'每月 '+m[2]+' GB',deviceLimit:m[3]+'个在线设备（站方声明）',maxDevices:Number(m[3]),quote,sourceIds:[s.evidenceId],sourceUrl:s.url,observedAt:s.observedAt||s.capturedAt,sourceLocator:{kind:'body_utf16_range',start,end:start+quote.length,quoteSha256:sha(quote)},checkoutVerified:false,priceStatus:'advertised_not_checkout_verified',restrictions:['仅当前商店卡片的每月显示价；未使用优惠码、创建订单、付款或验证可用性。','不限制速率、AI与流媒体是站方声明，不是测量结果；¥符号不确认ISO币种。']});
 }
 const old=(prior.coreInfo||prior).pricing||{},merged=new Map((old.plans||[]).map(p=>[key(p),p]));
 for(const p of rows){const previous=merged.get(key(p));if(previous&&Date.parse(previous.observedAt)>Date.parse(p.observedAt))continue;merged.set(key(p),preservePlanConditions(previous,p,{sourceRefs}));}
 const at=s.observedAt||s.capturedAt;return{pricing:{...old,status:'advertised_not_checkout_verified',plans:[...merged.values()],sourceIds:retainedConditionSourceIds([...merged.values()],s.evidenceId),observedAt:Date.parse(old.observedAt)>Date.parse(at)?old.observedAt:at,checkoutVerified:false,scope:'current_registered_entry_visible_prices',limitation:'仅更新当前可见4档月价；未观察的季、半年、年周期保留原资料及原日期，未将折扣或额外赠送月份套入卡片价格。'}};
}
module.exports={origin,recordIds:['A025','A198'],fields:['pricing'],extract};
