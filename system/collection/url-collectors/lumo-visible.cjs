'use strict';
const origin='https://lumonet.net';
function extract(s,{recordId,prior={}}={}){
 if(recordId!=='A220'||!s.evidenceId||s.kind!=='authorized_account_page'||s.metadata?.authenticationObserved!==true)return null;
 if(s.url===origin+'/dashboard/order/'&&['redacted_actual_unpaid_order_payment_selector','redacted_actual_cancelled_temporary_order'].includes(s.metadata?.representation)){
 let v;try{v=JSON.parse(s.body)}catch{return null}if(typeof v.visibleText!=='string'||![v.originalBodySha256,v.originalArtifactSha256,v.orderCorrelationSha256].every(x=>/^[a-f0-9]{64}$/.test(x||''))||!v.visibleText.includes('[private_order_id]')||s.metadata.orderSubmitted!==true||s.metadata.paymentExecuted!==false||!Number.isFinite(Date.parse(s.observedAt)))return null;
 const text=v.visibleText,old=(prior.coreInfo||prior).payment||{};
 if(s.metadata.representation==='redacted_actual_cancelled_temporary_order'){
  if(!old.methods?.length||old.orderCleanup?.orderCorrelationSha256!==v.orderCorrelationSha256||!text.includes('订单状态\n已取消')||text.includes('去支付')||Date.parse(s.observedAt)<Date.parse(old.observedAt))return null;
  return{payment:{...old,orderCleanup:{status:'cancelled',cancellationVerified:true,newOrderBlocked:false,orderCorrelationSha256:v.orderCorrelationSha256,quote:'已取消',sourceIds:[s.evidenceId],sourceUrl:s.url,checkedAt:s.observedAt,reason:'本轮同一临时订单页面明确显示已取消；未付款。'}}};
 }
 const quote='支付宝、微信';if(!text.includes('订单状态\n待支付')||!text.includes('支付方式\n'+quote)||!text.includes('Plus⭐')||!text.includes('应付金额\n\n¥29.00')||!text.includes('取消订单')||!text.includes('去支付'))return null;
 const start=s.body.indexOf(quote);return{payment:{methods:['支付宝','微信支付'],status:'operator_unpaid_order_payment_options_observed',evidenceLevel:'authenticated_checkout',statementType:'operator_unpaid_order_payment_selector',summary:'已登录的Plus月付29元未支付订单页列出“支付宝、微信”合并渠道；未点击去支付或验证交易。',quote,sourceIds:[s.evidenceId],sourceUrl:s.url,observedAt:s.observedAt,sourceLocator:{kind:'body_utf16_range',start,end:start+quote.length},checkoutObserved:true,checkoutVerified:false,transactionVerified:false,channelListComplete:false,configuredChannels:[{displayName:quote,methods:['支付宝','微信支付'],combinedSelector:true}],orderCleanup:{status:'cancellation_not_confirmed',cancellationVerified:false,newOrderBlocked:true,orderCorrelationSha256:v.orderCorrelationSha256},conditions:['来自本轮实际未支付订单选择器；未打开外部收银台、扫码、扣款或验证渠道真实可用。','“支付宝、微信”为同一个合并选项，不推断两个渠道都可独立选择。','支付证据与订单清理独立；不因取消待确认而删除已观察到的渠道。','私有订单号仅在本地原件中留存，入库证据使用同单哈希关联。']}};
 }
 if(s.url===origin+'/dashboard/plan/'&&s.metadata?.representation==='actual_authenticated_plan_cards'){
 let rows;try{rows=JSON.parse(s.body).cards}catch{return null}if(!Array.isArray(rows)||rows.length!==4)return null;
 const plans=[],resetPacks=[];for(const [index,r]of rows.entries()){
 if(typeof r.name!=='string'||typeof r.text!=='string'||!Array.isArray(r.buttons)||!r.text.startsWith(r.name+'\n'))return null;
 const quota=r.text.match(/每([年月]) (\d+) GiB 流量/),devices=r.text.match(/同时在线设备 (\d+) 台/),speed=r.text.match(/最高速率 (\d+) Mbps/);if(!quota||!devices||!speed)return null;
 for(const [buttonIndex,label]of r.buttons.entries()){const m=label.match(/^(月付|季付|半年|年付|流量重置包)¥(\d+\.\d{2})(?:-\d+%)?$/);if(!m)continue;const p={name:r.name+' · '+m[1],amount:Number(m[2]),amountBasis:'original_billing_period_total',currency:null,currencySymbol:'¥',currencyStatus:'not_confirmed',billingPeriod:m[1]==='半年'?'半年付':m[1],quota:quota[2]+' GiB/'+quota[1],maxDevices:Number(devices[1]),deviceLimit:devices[1]+'台同时在线',operatorRateLimitMbps:Number(speed[1]),restrictions:['页面最高速率为站方限速上限，不是实际测速。','未应用优惠码，未进入收银台核对。'],checkoutVerified:false,priceStatus:'advertised_not_checkout_verified',sourceIds:[s.evidenceId],sourceLocator:{kind:'json_pointer',pointer:'/cards/'+index+'/buttons/'+buttonIndex},quote:label,observedAt:s.observedAt};(m[1]==='流量重置包'?resetPacks:plans).push(p);}}
 if(plans.length!==13||resetPacks.length!==3)return null;
 const old=(prior.coreInfo||prior).website||{},history=[...(old.historicalWebsites||[])];if(old.url&&old.url!==origin+'/'){const{historicalWebsites:unused,...previous}=old;if(!history.some(x=>x.url===old.url))history.push(previous);}
 return{website:{url:origin+'/',status:'current_same_named_authenticated_portal_observed',identityAttribution:'current_same_named_service_only',operatorIdentityVerified:false,historicalContinuityVerified:false,historicalWebsites:history,sourceIds:[s.evidenceId],observedAt:s.observedAt},pricing:{status:'operator_authenticated_page_observed',scope:'authenticated_current_plan_catalog',plans,resetPacks,sourceIds:[s.evidenceId],sourceUrl:s.url,observedAt:s.observedAt,checkoutVerified:false}};
 }
 if(s.url===origin+'/dashboard/'&&s.metadata?.representation==='actual_authenticated_notice'){
 const quote='正式套餐购买并开通后不支持退款';if(!s.body.includes(quote)||!s.body.includes('新用户必读公告'))return null;const start=s.body.indexOf(quote);
 return{refund:{status:'stated_terms_not_execution_verified',scope:'formal_plan_purchased_and_activated',summary:'站内新用户公告说明：提供2小时、2GB免费试用；正式套餐购买并开通后不支持退款。',quote,sourceIds:[s.evidenceId],sourceUrl:s.url,observedAt:s.observedAt,sourceLocator:{kind:'body_utf16_range',start,end:start+quote.length},generalRefundPolicyVerified:true,executionVerified:false,conditions:['限定正式套餐购买并开通之后；未核实未开通订单、法定例外或实际退款执行。','公告显示日期不代表历史快照或连续运营起始日期。']}};
 }return null;
}
module.exports={origin,recordIds:['A220'],fields:['website','pricing','payment','refund'],extract};
