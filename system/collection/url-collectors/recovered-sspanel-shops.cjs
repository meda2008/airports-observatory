'use strict';
const crypto=require('node:crypto'),{planKey}=require('./site-literal-profiles.cjs');
const {preservePlanConditions,retainedConditionSourceIds}=require('./retained-plan-conditions.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex'),esc=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),money='(?:0|[1-9]\\d*)(?:\\.\\d{1,2})?';
const specs=[
 {origin:'https://1yunti.com',recordIds:['A045','A205'],brand:'© 一云梯-最具性价比IPLC专线机场.',cards:[{name:'云梯小年包 - 限时热销',period:'年付'},...['VIP1套餐','VIP2套餐','VIP3套餐','VIP4套餐'].map(name=>({name,period:'月付'})),{name:'个性化定制套餐',period:'月付',custom:true,contact:'购买后需联系客服开通'}]},
 {origin:'https://inv06.lmaff01.cc',recordIds:['A142'],brand:'© 龙猫云机场-最具性价比IPLC专线机场.',cards:[...['VIP1套餐','VIP2套餐','VIP3套餐','VIP4套餐'].map(name=>({name,period:'月付'})),{name:'DIY定制套餐',period:'月付',custom:true,contact:'请工单或者私聊'}]}
];
function source(s,quote){const body=s.body||s.text,start=body.indexOf(quote);if(start<0)throw Error('recovered_shop_quote_not_bound');return{quote,sourceIds:[s.evidenceId],sourceUrl:s.url,observedAt:s.observedAt||s.capturedAt,sourceBodySha256:hash(body),sourceLocator:{kind:'body_utf16_range',start,end:start+quote.length,quoteSha256:hash(quote),bodySha256:hash(body)}};}
function extract(s,{recordId,prior={},sourceRefs}={}){
 if(!s?.evidenceId||!Number.isFinite(Date.parse(s.observedAt||s.capturedAt)))return null;
 let u;try{u=new URL(s.url);}catch{return null;}
 const spec=specs.find(p=>p.origin===u.origin&&p.recordIds.includes(recordId)),body=s.body||s.text;
 if(!spec||u.pathname!=='/shop'||u.search||u.hash||u.username||u.password||typeof body!=='string'||!body.includes(spec.brand)||!body.includes('更换套餐将覆盖当前套餐！请谨慎购买！')||/checkpoint/.test(s.kind||'')||s.passwordForm||s.metadata?.passwordForm||s.verificationWidgetObserved||s.metadata?.verificationWidgetObserved||s.sha256&&hash(body)!==s.sha256)return null;
 const starts=[];for(const card of spec.cards){const matches=[...body.matchAll(new RegExp('^'+esc(card.name)+'$','gm'))];if(matches.length!==1)return null;starts.push({card,start:matches[0].index});}if(starts.some((s,i)=>i&&s.start<=starts[i-1].start))return null;
 const plans=[];
 for(let i=0;i<starts.length;i++){
  const {card,start}=starts[i],segment=body.slice(start,starts[i+1]?.start??body.indexOf(spec.brand,start)),header=new RegExp('^'+esc(card.name)+'\\n¥('+money+') / ('+card.period+'[^\\n]*)\\n').exec(segment);if(!header)return null;
  const totals=[...segment.matchAll(new RegExp('^'+esc(header[2])+'\\n('+money+') CNY(?=\\n|$)','gm'))];if(totals.length!==1||Number(totals[0][1])!==Number(header[1]))return null;
  const end=totals[0].index+totals[0][0].length,quote=segment.slice(0,end).trim(),quota=/(\d+)GB\n周期流量/.exec(quote),monthly=/- 每月(\d+)G流量/.exec(quote);if(!quota||!quote.includes('立即购买'))return null;
  if(card.custom?quota[1]!=='0'||!quote.includes(card.contact):!monthly||monthly[1]!==quota[1]||Number(quota[1])<=0)return null;
  const unlimited=quote.includes('- 不限制客户端'),team=quote.includes('- 适合团队使用');if(!unlimited&&!team)return null;
  const currencyEvidence=source(s,totals[0][0]);
  plans.push({name:card.name,productName:card.name,amount:Number(totals[0][1]),amountBasis:'original_billing_period_total',currency:'CNY',currencySymbol:'¥',currencyStatus:'explicit_card_currency',currencyQuote:totals[0][0],currencySourceLocator:currencyEvidence.sourceLocator,billingPeriod:card.period,displayedBillingPeriod:header[2],quota:card.custom?'卡片占位0GB；实际定制额度未说明，需客服确认':'每月'+monthly[1]+'G；卡片另列周期流量'+quota[1]+'GB',quotaConfirmed:!card.custom,quotaReset:card.custom?'定制占位值不证明零流量、无限流量或通用流量包可用。':'正文称每月额度，卡片另标周期流量；未确认重置日或推断长期周期总流量。',deviceLimit:unlimited?'站方称不限制客户端，实际执行未验证':'站方称适合团队使用；未注明具体设备上限',requiresContact:!!card.custom,...(card.custom?{availability:'custom_service_requires_contact_confirmation',activationStatement:card.contact}:{}),...source(s,quote),checkoutVerified:false,priceStatus:'advertised_not_checkout_verified',restrictions:['当前账号商店原周期显示总价，币种仅据同卡周期价格行CNY；未建单、付款或验证库存/最终结账。','套餐更换会覆盖当前套餐（站方提醒）；未操作购买或更换。','设备、流量及其他卡片宣传是站方声明；未做测速、履约或法律主体连续性验证。',...(card.custom?['定制服务须联系客服确认实际额度与开通；0GB仅页面占位，不当作已确认通用套餐。']:[])]});
 }
 const core=prior.coreInfo||prior,old=core.pricing||{},merged=new Map((old.plans||[]).map(p=>[planKey(p),p]));for(const p of plans){const previous=merged.get(planKey(p));if(!previous||!(Date.parse(previous.observedAt)>Date.parse(p.observedAt)))merged.set(planKey(p),preservePlanConditions(previous,p,{sourceRefs}));}
 const at=s.observedAt||s.capturedAt;return{pricing:{...old,status:'advertised_not_checkout_verified',plans:[...merged.values()],sourceIds:retainedConditionSourceIds([...merged.values()],s.evidenceId),observedAt:Date.parse(old.observedAt)>Date.parse(at)?old.observedAt:at,sourceBodySha256:hash(body),checkoutVerified:false,operatorIdentityVerified:false,scope:'current_registered_entry_visible_prices',mergeScope:'same_named_product_and_explicit_period_aliases_only_preserve_unobserved_prior_cycles',limitation:'仅更新本次同卡明确CNY周期显示价；保留未观察旧周期。年包按年总额记录，不当月价。定制0GB为占位且需客服确认，不证明通用流量可用；无测速/购买/付款/履约/经营连续验收。'}};
}
const parsers=specs.map(spec=>({origin:spec.origin,recordIds:spec.recordIds,fields:['pricing'],extract}));
function forOrigin(url,recordId){try{return parsers.find(p=>p.origin===new URL(url).origin&&(!recordId||p.recordIds.includes(recordId)))||null;}catch{return null;}}
module.exports={parsers,forOrigin,extract};
