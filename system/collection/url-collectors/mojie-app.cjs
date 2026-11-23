'use strict';
const crypto=require('node:crypto'),{planKey,mergePaymentStatement}=require('./site-literal-profiles.cjs');
const {preservePlanConditions,retainedConditionSourceIds}=require('./retained-plan-conditions.cjs');
const origin='https://mojie.app',names=['130G流量-不限时间','210G流量-不限时间','420G流量-不限时间','1G流量-不限时间','750G流量-不限时间','1660G流量-不限时间','3600G流量-不限时间','5500GB-不限时间','10T流量-不限时间'],rule='所有套餐无到期时间，仅以流量为唯一计费值。套餐流量会自动叠加到总流量！',paymentQuote='收款的支付宝微信是合作商家 是无法联系到我们的';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex'),esc=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),money='(?:0|[1-9]\\d*)(?:\\.\\d{1,2})?';
const mojiePlanKey=p=>planKey({...p,billingPeriod:p.billingPeriod==='一次性流量包（站方称不限时间，用尽到期）'?'一次性':p.billingPeriod});
function source(s,quote){const body=s.body||s.text,start=body.indexOf(quote);if(start<0)throw Error('mojie_quote_not_bound');return{quote,sourceIds:[s.evidenceId],sourceUrl:s.url,observedAt:s.observedAt||s.capturedAt,sourceBodySha256:hash(body),sourceLocator:{kind:'body_utf16_range',start,end:start+quote.length,quoteSha256:hash(quote),bodySha256:hash(body)}};}
function pricing(s,prior,{sourceRefs}={}){
 const body=s.body||s.text;if(!body.includes(rule))return null;const starts=[];for(const name of names){const all=[...body.matchAll(new RegExp('^'+esc(name)+'$','gm'))];if(all.length!==1)return null;starts.push({name,start:all[0].index});}if(starts.some((p,i)=>i&&p.start<=starts[i-1].start))return null;
 const plans=[];for(let i=0;i<starts.length;i++){
  const {name,start}=starts[i],segment=body.slice(start,starts[i+1]?.start??body.indexOf('© 魔戒.net.',start)),header=new RegExp('^'+esc(name)+'\\n(?: 推荐\\n)?¥('+money+') / 一次性\\n').exec(segment);if(!header)return null;
  const totals=[...segment.matchAll(new RegExp('^一次性(?:[ \\t]+|\\n[ \\t]*)('+money+') CNY(?=\\n|$)','gm'))],quota=/(\d+)GB(?:[ \t]+|\n[ \t]*)周期流量/.exec(segment);if(totals.length!==1||Number(totals[0][1])!==Number(header[1])||!quota||!segment.includes('不限制到期时间')||!segment.includes('不限制使用人数'))return null;
  const quote=segment.slice(0,totals[0].index+totals[0][0].length).trim(),currency=source(s,totals[0][0]);
  if(name==='1G流量-不限时间'&&!quote.includes('本套餐无法续费'))return null;
  const namedGB=name==='10T流量-不限时间'?10240:Number(/^\d+/.exec(name)[0]);if(Number(quota[1])!==namedGB)return null;
  plans.push({name,productName:name,amount:Number(totals[0][1]),amountBasis:'original_billing_period_total',currency:'CNY',currencySymbol:'¥',currencyStatus:'explicit_card_currency',currencyQuote:totals[0][0],currencySourceLocator:currency.sourceLocator,billingPeriod:'一次性',displayedBillingPeriod:'一次性',quota:'一次性总量 '+quota[1]+' GB',quotaReset:'站方称无到期时间、仅以流量计费且流量自动叠加；不推断重置或经营存续保证。',quotaQuote:rule,quotaSourceLocator:source(s,rule).sourceLocator,deviceLimit:'站方称不限制使用人数；未实测客户端数量或实际执行。',...(name==='1G流量-不限时间'?{renewable:false,renewalStatement:'本套餐无法续费'}:{}),...source(s,quote),checkoutVerified:false,priceStatus:'advertised_not_checkout_verified',restrictions:['当前商店同卡一次性CNY标价；未建单、付款或验证库存/结账价。','不限时间为站方流量包使用规则声明，不保证长期经营、服务持续或履约。','人数、媒体和网络速度宣传只作为原文保留，没有测速或解锁效果验收。',...(name==='1G流量-不限时间'?['体验卡明确无法续费，不当作可续订长期方案。']:[])]});
 }
 const old=prior.pricing||{},merged=new Map((old.plans||[]).map(p=>[mojiePlanKey(p),p]));for(const p of plans){const previous=merged.get(mojiePlanKey(p));if(!previous||!(Date.parse(previous.observedAt)>Date.parse(p.observedAt)))merged.set(mojiePlanKey(p),preservePlanConditions(previous,p,{sourceRefs}));}
 const at=s.observedAt||s.capturedAt;return{pricing:{...old,status:'advertised_not_checkout_verified',plans:[...merged.values()],sourceIds:retainedConditionSourceIds([...merged.values()],s.evidenceId),observedAt:Date.parse(old.observedAt)>Date.parse(at)?old.observedAt:at,sourceBodySha256:hash(body),checkoutVerified:false,operatorIdentityVerified:false,scope:'current_registered_entry_visible_prices',mergeScope:'mojie_exact_once_period_alias_preserve_unobserved_prior_cycles',limitation:'本次只观察9张一次性流量卡；无本次年/月周期报价。不删除未观察旧周期，不将不限时或不限速宣传提升为经营存续或测速结果。'}};
}
function extract(s,{recordId,prior={},sourceRefs}={}){
 if(recordId!=='A010'||!s?.evidenceId||!Number.isFinite(Date.parse(s.observedAt||s.capturedAt)))return null;let u;try{u=new URL(s.url);}catch{return null;}const body=s.body||s.text;
 if(u.origin!==origin||u.username||u.password||u.search||u.hash||typeof body!=='string'||!body.includes('© 魔戒.net.')||/checkpoint/.test(s.kind||'')||s.passwordForm||s.metadata?.passwordForm||s.verificationWidgetObserved||s.metadata?.verificationWidgetObserved||s.sha256&&hash(body)!==s.sha256)return null;
 const core=prior.coreInfo||prior;if(u.pathname==='/shop')return pricing(s,core,{sourceRefs});
 if(u.pathname==='/dashboard'&&body.includes('寻找人工客服')&&body.includes(paymentQuote)){
  const statement={status:'operator_payment_statement_observed',methods:['支付宝','微信支付'],summary:'客服公告称收款的支付宝/微信是合作商家，不能通过收款商家联系本站；这是收款协作声明，不是当前收银台通道复核。',scope:'operator_customer_service_notice',evidenceLevel:'authenticated_text_statement',label:'客服公告收款合作商家声明（非收银台复核）',statementType:'operator_customer_service_notice_payment_recipient_statement',...source(s,paymentQuote),checkoutObserved:false,transactionVerified:false};
  return{payment:mergePaymentStatement(core.payment||{},statement)};
 }
 return null;
}
module.exports={origin,recordIds:['A010'],fields:['pricing','payment'],extract,mojiePlanKey};
