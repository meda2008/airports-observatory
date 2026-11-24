'use strict';
const crypto=require('node:crypto'),origin='https://erfdd.lonka.click',url=origin+'/api/v1/user/plan/fetch',paymentUrl=origin+'/api/v1/user/order/getPaymentMethod';
const clientArtifactSha256='021d317d22e66f0ddb4007719153b0eda19d8f8a0c6719223ef29145a3fd55d1';
const periods={month_price:'月付',quarter_price:'季付',half_year_price:'半年付',year_price:'年付',two_year_price:'两年付',three_year_price:'三年付',onetime_price:'一次性'};
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function binding(s,r){return{quote:r.quote,sourceIds:[s.evidenceId],sourceUrl:s.url,observedAt:s.observedAt,sourceBodySha256:sha(s.body),sourceLocator:{kind:'body_utf16_range',start:r.start,end:r.end,quoteSha256:sha(r.quote)}};}
function extract(s,{recordId,prior={}}={}){
 if(recordId!=='A168'||![url,paymentUrl].includes(s.url)||!s.evidenceId||!Number.isFinite(Date.parse(s.observedAt))||s.metadata?.authenticationObserved!==true)return null;
 let v,ranges;try{v=JSON.parse(s.body);if(!v||!Array.isArray(v.data)||!v.data.length||v.data.length>100)return null;if(v.error!==undefined&&v.error!==null&&v.error!==false)return null;if(v.status!==undefined&&!['true','1','200','ok','success'].includes(String(v.status).trim().toLowerCase()))return null;ranges=Object.keys(v).length===1?require('./json-array-object-ranges.cjs').dataObjectRanges(s.body):require('./feihou-native-payment.cjs').rows(s.body);if(!ranges)return null;}catch{return null;}
 const old=prior.coreInfo||prior;
 if(s.url===paymentUrl){
  if(s.metadata.representation!=='original_native_payment_methods_json')return null;
  const options=[];for(const r of ranges){const x=r.value;if(x.enable===0||x.enabled===false)continue;if(typeof x.name!=='string'||!x.name.trim()||Object.keys(x).some(k=>/secret|token|password|authorization|api.?key/i.test(k)))return null;options.push({operatorLabel:x.name.trim(),provider:typeof x.payment==='string'?x.payment:null,...binding(s,r)});}
  if(!options.length)return null;
  const methods=[...new Set(options.map(x=>/支付宝|alipay/i.test(x.operatorLabel)?'支付宝':/微信|wechat/i.test(x.operatorLabel)?'微信支付':x.operatorLabel))];
  return{payment:{...(old.payment||{}),...binding(s,{quote:s.body,start:0,end:s.body.length}),label:'登录后原生渠道列表（未建单）',statementType:'authenticated_native_payment_methods_readonly',checkoutObserved:false,reason:'本次正常登录后只读渠道列表，历史订单观察保留在observations中；不证明当前结账或到账。',status:'authenticated_payment_options_not_transaction_verified',evidenceLevel:'authenticated_native_payment_methods',methods,nativeOptions:options,sourceIds:[s.evidenceId],sourceUrl:s.url,observedAt:s.observedAt,checkoutVerified:false,transactionVerified:false,ordersCreated:0,summary:'已批准备用入口正常登录后的渠道列表；未建单、发起支付或验证到账。'}};
 }
 if(s.metadata.representation!=='original_native_plan_http_json')return null;
 const plans=[];for(const r of ranges){const x=r.value;if(x.show===0||x.show===false)continue;if(![1,true].includes(x.show)||typeof x.name!=='string'||!x.name.trim()||!Number.isSafeInteger(x.transfer_enable)||x.transfer_enable<0||Object.keys(x).some(k=>/secret|token|password|authorization|api.?key/i.test(k)))return null;
  const content=typeof x.content==='string'?x.content:'',monthly=/每月高速流量[（(](\d+)G[）)]/.exec(content),conflict=monthly&&Number(monthly[1])!==x.transfer_enable;
  for(const[field,period]of Object.entries(periods)){const value=x[field];if(value===null||value===undefined||value===0)continue;if(!Number.isSafeInteger(value)||value<0)return null;
   plans.push({name:x.name+' · '+period,productName:x.name,amount:value/100,amountBasis:'original_billing_period_total',billingPeriod:period,currency:null,currencySymbol:'¥',currencyStatus:'symbol_only_not_ISO_confirmed',quota:conflict?null:(period==='一次性'?'一次性总量 ':monthly?'每月 ':'接口配额 ')+x.transfer_enable+' GB',quotaStatus:conflict?'conflicting_operator_statements':period==='一次性'?'one_time_total':monthly?'operator_monthly_quota_stated':'reset_not_confirmed',deviceLimit:'接口设备限制与说明均保留在原文，未验证并发或共享许可',...binding(s,r),checkoutVerified:false,priceStatus:'advertised_not_checkout_verified',apiUnits:{priceField:field,priceScale:100,quotaField:'transfer_enable',quotaUnit:'GB',clientArtifactSha256},restrictions:['官网客户端直接以该周期字段除以100显示价格，不使用卡片STARTING FROM推算其他周期。','优惠码、折扣、手续费及实际结账金额未验证，不额外套用折扣。','2.5Gbps、IPLC、解锁及不限设备均为站方声明，非实测。未创建订单或付款。']});
  }
 }
 if(!plans.length||new Set(plans.map(x=>x.productName+'|'+x.billingPeriod)).size!==plans.length)return null;
 const patch=require('./site-literal-profiles.cjs').mergeCurrentPlans(s,plans,prior);patch.pricing.scope='authenticated_native_explicit_period_totals_preserve_unobserved_prior_quotes';
 patch.website={...(old.website||{}),url:origin+'/',status:'authenticated_named_candidate_service_observed',relationship:'user_authorized_known_alternate_entry_normal_account_and_plans_read_operator_continuity_unverified',basis:'本次在用户此前已批准的备用入口正常认证后读取官方套餐接口；原TLS失败入口仍保留历史证据，不推定法律主体或历史连续经营。',operatorIdentityVerified:false,sourceIds:[s.evidenceId],observedAt:s.observedAt};
 return patch;
}
module.exports={origin,url,paymentUrl,recordIds:['A168'],fields:['pricing','payment','website'],readOnlyRecipe:'edgenova_native_api_readonly',extract,clientArtifactSha256};
