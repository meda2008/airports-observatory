'use strict';
const crypto=require('node:crypto'),origin='https://t01.xiaomicf.com',url=origin+'/v1/p_getPlanList';
function extract(s,{recordId,prior={}}={}){
 if(recordId!=='A053'||s.url!==url||!s.evidenceId||!Number.isFinite(Date.parse(s.observedAt))||s.metadata?.representation!=='original_native_plan_http_json')return null;
 let v,ranges;try{v=JSON.parse(s.body);const header=/^\s*\{\s*"status"\s*:\s*1\s*,\s*"code"\s*:\s*100\s*,\s*"msg"\s*:\s*"done"\s*,\s*"data"\s*:\s*(?=\[)/.exec(s.body);if(!header)return null;const start=header[0].length,end=s.body.lastIndexOf(']');if(!/^\s*}\s*$/.test(s.body.slice(end+1)))return null;ranges=require('./json-array-object-ranges.cjs').dataObjectRanges('{"data":'+s.body.slice(start,end+1)+'}').map(r=>({...r,start:r.start+start-8,end:r.end+start-8}));}catch{return null;}
 if(v.code!==100||v.status!==1||!Array.isArray(v.data)||!v.data.length||v.data.length>30)return null;
 const hash=crypto.createHash('sha256').update(s.body).digest('hex');if(s.sha256&&s.sha256!==hash)return null;
 const plans=[];for(const {value:r,quote,start}of ranges){if(r.show!==1)continue;if(typeof r.name!=='string'||!Number.isSafeInteger(r.month_price)||r.month_price<=0)return null;
  const quota=/每月\s*(\d+)G流量/.exec(r.content||'');
  plans.push({name:r.name,productName:r.name,amount:r.month_price/100,amountBasis:'original_billing_period_total',billingPeriod:'月付',currency:null,currencySymbol:'￥',quota:quota?'每月'+quota[1]+'G（产品原文）':'官网未列明',quote,sourceIds:[s.evidenceId],sourceUrl:s.url,observedAt:s.observedAt,sourceBodySha256:hash,sourceLocator:{kind:'body_utf16_range',start,end:start+quote.length},checkoutVerified:false,apiUnits:{priceField:'month_price',priceScale:100},restrictions:['官网 products.html 明确按 month_price/100 显示；仅发布该页面显示的月价。','接口其他周期字段未核实配置页可选性，不作为当前可选报价；不限速及IPLC声明不是实测。']});
 }
 if(!plans.length||new Set(plans.map(p=>p.name)).size!==plans.length)return null;
 const old=(prior.coreInfo||prior).pricing||{},names=new Set(plans.map(p=>p.name));return {pricing:{...old,status:'advertised_not_checkout_verified',plans:[...plans,...(old.plans||[]).filter(p=>!names.has((p.productName||p.name).replace(/ \u00b7 \u6708\u4ed8$/,''))||!['月付','每月'].includes(p.billingPeriod))],summaryPlanIndex:0,observedAt:s.observedAt,sourceIds:[...new Set([...(old.sourceIds||[]),s.evidenceId])],checkoutVerified:false,limitation:'只确认官网产品页显示的月付标价，未下单；旧周期保留原时间与来源。'}};
}
module.exports={origin,recordIds:['A053'],fields:['pricing'],extract};
