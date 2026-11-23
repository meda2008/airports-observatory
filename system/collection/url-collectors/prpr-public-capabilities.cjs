'use strict';
const origin='https://prpr.96110.cn.com',url=origin+'/api/v1/platform/capabilities';
function extract(s,{recordId,observations=[],prior={}}={}){
 if(s.url===require('./prpr-public-plans.cjs').url)return require('./prpr-public-plans.cjs').extract(s,{recordId,observations,prior});
 if(recordId!=='A034'||s.url!==url||!s.evidenceId||s.metadata?.representation!=='original_native_public_capabilities_json')return null;
 const core=prior.coreInfo||prior;if(['authenticated_checkout','public_checkout'].includes(core.payment?.evidenceLevel))return null;
 const scripts=observations.filter(o=>o.evidenceId&&o.url.startsWith(origin+'/assets/')&&o.metadata?.representation==='original_declared_client_module');
 if(!scripts.some(o=>o.body.includes('`platform/capabilities`'))||!scripts.some(o=>o.body.includes('`/api/v1`')))return null;
 let data;try{data=JSON.parse(s.body).data}catch{return null}
 if(data?.site?.name!=='prprCloud'||data.billing?.hasPaymentGateway!==true||!Array.isArray(data.billing.gatewayList)||!data.billing.gatewayList.length||data.billing.gatewayList.length>30)return null;
 const channels=[];for(const [index,g] of data.billing.gatewayList.entries()){
  if(typeof g.id!=='string'||typeof g.method!=='string'||typeof g.displayName!=='string'||typeof g.displayNameZh!=='string')return null;
  const method=/^支付宝(?:\s|$)/.test(g.displayNameZh)&&/^Alipay(?:\s|$)/i.test(g.displayName)?'支付宝':/^微信支付(?:\s|$)/.test(g.displayNameZh)&&/^Weixin Pay(?:\s|$)/i.test(g.displayName)?'微信支付':null;
  channels.push({method,displayName:g.displayNameZh,processorClaim:g.apiType,minAmount:typeof g.minAmount==='string'?g.minAmount:null,quote:g.displayNameZh,sourceLocator:{kind:'json_pointer',pointer:'/data/billing/gatewayList/'+index},sourceIds:[s.evidenceId],observedAt:s.observedAt});
 }
 const methods=[...new Set(channels.map(c=>c.method).filter(Boolean))];if(!methods.length)return null;
 return{payment:{methods,status:'operator_public_gateway_configuration_observed',evidenceLevel:'public_text',statementType:'operator_public_capabilities_configuration',summary:'当前官网公开后台配置列出支付宝（PPay、ZPay）和微信支付（ZPay）；另有未说明具体渠道的“其他（PPay）”。未进入收银台或验证收款。',quote:channels.map(c=>c.quote).join('；'),configuredChannels:channels,unclassifiedChannels:channels.filter(c=>!c.method).map(c=>c.displayName),observedAt:s.observedAt,sourceUrl:url,sourceIds:[s.evidenceId,...scripts.map(o=>o.evidenceId)],sourceLocator:{kind:'json_pointer',pointer:'/data/billing/gatewayList'},checkoutObserved:false,checkoutVerified:false,transactionVerified:false,channelListComplete:false,conditions:['仅证明站方公开接口当前列出的渠道配置，不证明真实订单可用或交易成功。','“其他（PPay）”未指明实际付款方式，不推断银行卡、PayPal或数字货币。','最小金额保留为接口文本，不推定币种、手续费或执行结果。']}};
}
module.exports={origin,url,recordIds:['A034'],fields:['payment','pricing'],extract};
