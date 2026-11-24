'use strict';
const crypto=require('node:crypto'),origin='https://apiapi.syjccloud.com',url=origin+'/api/v1/user/plan/fetch';
const periods={month_price:'月付',quarter_price:'季付',half_year_price:'半年付',year_price:'年付',two_year_price:'两年付',three_year_price:'三年付',onetime_price:'一次性'};
function extract(s,{recordId,prior={}}={}){
 if(s.url===require('./shunyun-native-payment.cjs').url)return require('./shunyun-native-payment.cjs').extract(s,{recordId,prior});
 if(recordId!=='A146'||s.url!==url||s.metadata?.representation!=='original_native_plan_http_json'||!s.evidenceId||!Number.isFinite(Date.parse(s.observedAt)))return null;
 let v;try{v=JSON.parse(s.body);}catch{return null;}if(!Array.isArray(v.data)||!v.data.length||v.data.length>100||Object.keys(v).some(k=>k!=='data'))return null;
 let ranges;try{ranges=require('./json-array-object-ranges.cjs').dataObjectRanges(s.body);}catch{return null;}
 const plans=[];for(const {value:row,quote,start} of ranges){if(row.show!==1)continue;if(typeof row.name!=='string'||!row.name||!Number.isSafeInteger(row.transfer_enable)||row.transfer_enable<0)return null;
  const content=typeof row.content==='string'?row.content:'',quotaText=/每月\s*(\d+)G\s*流量/.exec(content),quotaConflict=quotaText&&Number(quotaText[1])!==row.transfer_enable,deviceConflict=row.device_limit>0&&content.includes('不限制同时使用客户端数量');
  for(const[field,billingPeriod]of Object.entries(periods)){if(row[field]===null||row[field]===undefined)continue;if(!Number.isSafeInteger(row[field])||row[field]<=0)return null;
   plans.push({name:row.name,productName:row.name,amount:row[field]/100,amountBasis:'original_billing_period_total',currency:null,billingPeriod,quota:row.transfer_enable+' GB'+(quotaConflict?'（说明写'+quotaText[1]+'G，待核）':''),...(Number.isSafeInteger(row.device_limit)&&row.device_limit>0?{deviceCount:row.device_limit,deviceLimit:row.device_limit+' 台设备'+(deviceConflict?'（说明写不限，待核）':'')}:{deviceLimit:'官网未列明'}),quote,sourceIds:[s.evidenceId],sourceUrl:s.url,observedAt:s.observedAt,sourceBodySha256:crypto.createHash('sha256').update(s.body).digest('hex'),sourceLocator:{kind:'body_utf16_range',start,end:start+quote.length},checkoutVerified:false,priceStatus:'advertised_not_checkout_verified',apiUnits:{priceField:field,priceScale:100},restrictions:['官网原生前端getSelectedPrice使用金额字段除以100；未建单或核实结账价。','transfer_enable按接口产品配额记录；未将speed_limit当线路实测。',...(quotaConflict?['接口配额与同产品说明冲突，不能确认最终可用流量。']:[]),...(deviceConflict?['接口设备数与同产品说明冲突，不能确认最终设备限制。']:[])]});
  }
 }if(!plans.length||new Set(plans.map(p=>p.name+'|'+p.billingPeriod)).size!==plans.length)return null;
 const old=(prior.coreInfo||prior).pricing||{},patch={pricing:{...old,status:'advertised_not_checkout_verified',plans,sourceIds:[...new Set([...(old.sourceIds||[]),s.evidenceId])],observedAt:s.observedAt,checkoutVerified:false,scope:'current_authenticated_native_plan_api',operatorIdentityVerified:false}};
 const terms=ranges.filter(r=>r.value.show===1).map(r=>({...r,clause:/特殊商品不支持退换|不接受退款服务/.exec(r.value.content||'')?.[0]}));
 if(terms.length&&terms.every(r=>r.clause))patch.refund={status:'stated_terms_not_execution_verified',summary:'本次在售'+terms.length+'款产品说明均写明不支持退换或不接受退款；仅为这些产品的站方条款，实际执行未验证。',conditions:['未取得退款例外、申请时限或处理流程，不能推断其他产品均适用。'],policyStatements:terms.map(r=>({productName:r.value.name,summary:r.clause,quote:r.quote,sourceLocator:{kind:'body_utf16_range',start:r.start,end:r.end},sourceUrl:s.url,sourceIds:[s.evidenceId],observedAt:s.observedAt})),sourceIds:[s.evidenceId],sourceUrl:s.url,observedAt:s.observedAt,executionVerified:false};
 return patch;
}
module.exports={origin,recordIds:['A146'],fields:['pricing','refund','payment'],readOnlyRecipe:'shunyun_native_api_readonly',extract};
