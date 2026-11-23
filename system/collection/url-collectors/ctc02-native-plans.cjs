'use strict';
const origin='https://www.ctc.run',base=origin+'/api/v1',sha=s=>require('crypto').createHash('sha256').update(s).digest('hex'),periods={month_price:'月付',quarter_price:'季付',half_year_price:'半年付',year_price:'年付',two_year_price:'两年付',three_year_price:'三年付',onetime_price:'一次性'};
function extract(s,{recordId,prior={},observations=[]}={}){
 if(recordId!=='A226'||!s.evidenceId||!Number.isFinite(Date.parse(s.observedAt))||s.metadata?.authenticationObserved!==true)return null;
 let rows;try{rows=require('./json-array-object-ranges.cjs').dataObjectRanges(s.body)}catch{return null;}
 if(s.url===base+'/user/order/getPaymentMethod'&&s.metadata.representation==='original_native_payment_methods_json'){
  if(!rows.length||rows.some(r=>typeof r.value.name!=='string'||Object.keys(r.value).some(k=>/password|secret|token|key/i.test(k))))return null;
  const methods=rows.flatMap(r=>/支付宝.*微信/.test(r.value.name)?['支付宝','微信']:[r.value.name]);
  return{payment:{status:'authenticated_payment_options_not_transaction_verified',methods:[...new Set(methods)],nativeOptions:rows.map(r=>({operatorLabel:r.value.name,provider:r.value.payment,handlingFeePercent:r.value.handling_fee_percent===null?null:Number(r.value.handling_fee_percent),quote:r.quote,sourceLocator:{kind:'body_utf16_range',start:r.start,end:r.end},sourceIds:[s.evidenceId],observedAt:s.observedAt})),summary:'后台列出USDT及“支付宝/微信-02-金额大于500”，后者接口手续费5%；金额门槛与实际结账未验证。',sourceIds:[s.evidenceId],sourceUrl:s.url,observedAt:s.observedAt,checkoutVerified:false,transactionVerified:false}};
 }
 if(s.url!==base+'/user/plan/fetch'||s.metadata.representation!=='original_native_plan_http_json')return null;
 const unit=observations.find(require('../../deploy-service/ctc02-price-contract.cjs').unitEvidence),guest=observations.find(o=>{try{return o.evidenceId&&o.url===base+'/guest/comm/config'&&JSON.parse(o.body).data.app_url===origin}catch{return false}});if(!unit||!guest)return null;
 const sourceIds=[s.evidenceId,unit.evidenceId,guest.evidenceId],plans=[],notices=[];
 for(const r of rows){const x=r.value;if(x.show!==1)continue;if(typeof x.name!=='string'||typeof x.content!=='string'||!Number.isSafeInteger(x.id))return null;
  if(x.name==='注意事项'){if(!x.content.includes('续费不立即重置流量')||!x.content.includes('返回至账户余额'))return null;notices.push({name:x.name,quote:r.quote,sourceIds:[s.evidenceId],observedAt:s.observedAt,notAProduct:true});continue;}
  const field=Object.keys(periods).find(k=>x[k]!==null&&x[k]!==undefined);if(!field||!Number.isSafeInteger(x[field])||x[field]<=0)return null;
  const text=x.content.replace(/<[^>]*>/g,''),quota=/每月\s*(\d+)G/.exec(text),ip=/IP\s*限制：最大\s*(\d+)\s*个\s*IP/.exec(text),rate=/套餐限速：\s*(\d+Mbps|不限速)/.exec(text);if(!quota||!ip||!rate||Number(quota[1])!==x.transfer_enable)return null;
  plans.push({name:x.name,productName:x.name,amount:x[field]/100,amountBasis:'original_billing_period_total',billingPeriod:periods[field],currency:null,currencySymbol:'¥',currencyStatus:'symbol_only_not_ISO_confirmed',quota:quota[1]+'GB/月',quotaReset:'站方称每月重置；续费本身不立即重置。',maxDevices:null,ipLimit:Number(ip[1]),deviceLimit:ip[1]+'个IP同时在线（不等同设备数量）',advertisedRate:rate[1],quote:r.quote,sourceIds,sourceUrl:s.url,observedAt:s.observedAt,sourceBodySha256:sha(s.body),sourceLocator:{kind:'body_utf16_range',start:r.start,end:r.end,quoteSha256:sha(r.quote)},apiUnits:{priceField:field,rawValue:x[field],divisor:100,sourceIds:[unit.evidenceId]},checkoutVerified:false,restrictions:['只取官网当前目录默认展示的首个可用周期；未点击订阅、建单或付款。','套餐速率与线路说明均为站方声明，不是实测。',...(x.device_limit!==+ip[1]?['接口device_limit与正文IP限制不一致，不裁定为设备数量。']:[])]});
 }
 if(!plans.length)return null;
 const pricing=require('../../lib/current-public-price-catalog.cjs').currentPublicCatalog((prior.coreInfo||prior).pricing||{},{status:'advertised_not_checkout_verified',plans,sourceIds,observedAt:s.observedAt,checkoutVerified:false,catalogNotices:notices,limitation:'当前账号目录默认周期价；999999元“注意事项”卡不作为套餐。其它接口周期保留原文，未冒充本轮界面已选报价。'},'ctc02_authenticated_native_default_visible_catalog');
 const productRows=rows.filter(r=>plans.some(p=>p.productName===r.value.name));const patch={pricing};if(productRows.every(r=>r.value.content.includes('不支持退款')))patch.refund={status:'stated_terms_not_execution_verified',summary:'已观察的套餐均注明不支持退款；套餐更换的剩余价值转账户余额属于站内抵扣，不等同现金退款。',conditions:['部分套餐注明USDT只支持POL链，转错无退款；未实际转账验证。','未把账户余额抵扣80%/50%写成现金退款比例。'],quote:productRows[0].quote,sourceIds:[s.evidenceId],sourceUrl:s.url,observedAt:s.observedAt,executionVerified:false};return patch;
}
module.exports={origin,recordIds:['A226'],fields:['pricing','payment','refund'],extract};
