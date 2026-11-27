'use strict';
const {QueryError,safeUrl}=require('./catalog-service.cjs');
const PERIODS={'每月':1,'每年':12,'半年':6,'每季':3,'月付':1,'月':1,'1个月':1,'季付':3,'季度':3,'半年付':6,'年付':12,'年':12};
const DISPLAY_PERIODS={...PERIODS,'月卡':1,'季卡':3,'半年卡':6,'年卡':12,'二年付':24,'两年付':24,'三年付':36};
const CURRENCIES=['CNY','USD','EUR','GBP','JPY','HKD','TWD'];
const CURRENCY_SYMBOLS=['¥','￥','$','US$','HK$','NT$','€','£','円'];
const DAYS_PER_YEAR=365;
function monthlyQuota(plan){
 const q=typeof plan.quota==='string'?plan.quota.trim():'',r=plan.quotaReset||'';
 let m=q.match(/^每月\s*(\d+(?:\.\d+)?)\s*GB$/i);
 if(!m&&/每月/.test(r)&&!/(?:不按|不是|非|不推定|不假定|待核.{0,3})[^，。；]{0,12}每月/.test(r))m=q.match(/^(\d+(?:\.\d+)?)\s*GB$/i);
 return positiveNumber(m?.[1]);
}
function positiveNumber(value){const n=Number(value);return Number.isFinite(n)&&n>0?n:null;}
function hasComparablePrice(plan){
 return Number.isFinite(plan?.amount)&&plan.amount>0&&plan.amountBasis==='original_billing_period_total'&&Array.isArray(plan.sourceIds)&&plan.sourceIds.length&&Number.isFinite(Date.parse(plan.observedAt))&&!plan.addon&&plan.soldOut!==true&&plan.purchasable!==false&&!plan.additionalCharges&&plan.priceStatus!=='not_confirmed';
}
function duration(label){
 const period=typeof label==='string'?label.normalize('NFKC').trim():'';
 const monthsFor=text=>Object.hasOwn(DISPLAY_PERIODS,text)?DISPLAY_PERIODS[text]:positiveNumber(/^(\d+)\s*个月$/.exec(text)?.[1]);
 const fixed=/^(\d+)\s*[天日]$/.exec(period),annotated=/^(.+?)\s*(?:\/\s*(\d+)\s*[天日]|\(\s*(\d+)\s*[天日]\s*\))$/.exec(period);
 const days=positiveNumber(fixed?.[1]||(annotated&&monthsFor(annotated[1].trim())?(annotated[2]||annotated[3]):null));
 if(Number.isSafeInteger(days))return {billingDays:days,dayBasis:'explicit_days',months:null};
 const months=monthsFor(period);
 return Number.isSafeInteger(months)?{billingDays:months*DAYS_PER_YEAR/12,dayBasis:'365_day_year',months}:null;
}
function planUnitPrices(plan){
 if(!hasComparablePrice(plan))return null;
 const currency=CURRENCIES.includes(plan.currency)?plan.currency:null;
 const symbol=CURRENCY_SYMBOLS.includes(plan.currencySymbol)?plan.currencySymbol:null;
 if(!currency&&!symbol)return null;
 const term=duration(plan.billingPeriod),quota=typeof plan.quota==='string'?plan.quota.trim():'';
 const total=positiveNumber(/^(?:周期总量|套餐总量|总流量|总量)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*GB$/i.exec(quota)?.[1]);
 const fixedQuota=/^每\s*(\d+)\s*[天日]\s*(\d+(?:\.\d+)?)\s*GB$/i.exec(quota);
 const monthly=term?.months?monthlyQuota(plan):null;
 const allowance=total||(monthly?monthly*term.months:null)||
  (term?.dayBasis==='explicit_days'&&Number(fixedQuota?.[1])===term.billingDays?positiveNumber(fixedQuota[2]):null);
 const dailyAmount=term?positiveNumber(plan.amount/term.billingDays):null;
 const costPerGB=allowance?positiveNumber(plan.amount/allowance):null;
 if(dailyAmount===null&&costPerGB===null)return null;
 return {currency,currencySymbol:currency?null:symbol,dailyAmount,costPerGB,billingDays:term?.billingDays??null,dayBasis:term?.dayBasis??null,quotaGB:allowance??null};
}
function comparison(plan,currency){
 if(!CURRENCIES.includes(currency)||plan.currency!==currency||!hasComparablePrice(plan))return null;
 if(!Object.hasOwn(PERIODS,plan.billingPeriod))return null;
 const months=PERIODS[plan.billingPeriod];
 const monthly=plan.amount/months,quota=monthlyQuota(plan);
 return {monthlyAmount:monthly,monthlyQuotaGB:quota,costPerGB:quota?monthly/quota:null,months,formula:`${plan.amount} / ${months}`,basis:'advertised_calendar_month_equivalent',checkoutVerified:false};
}
// Compare the decimal representations before dividing or rounding the display price.
function decimal(value){
 const [mantissa,exponent='0']=String(value).split('e');
 const [whole,fraction='']=mantissa.split('.');
 return {digits:BigInt(whole+fraction),scale:fraction.length-Number(exponent)};
}
function withinBudget(amount,months,budget){
 if(budget===null)return true;
 const price=decimal(amount),scale=Math.max(price.scale,budget.scale);
 return price.digits*10n**BigInt(scale-price.scale)<=budget.digits*BigInt(months)*10n**BigInt(scale-budget.scale);
}
function outbound(record,links){
 let official=safeUrl(record.coreInfo?.website?.url||record.officialUrl);
 if(official){const clean=new URL(official);for(const k of [...clean.searchParams.keys()])if(/^(?:aff|affid|affiliate|ref|referral|invite|invite_code|code)$/i.test(k))clean.searchParams.delete(k);if(clean.hash.includes('?')){const[route,params]=clean.hash.split('?'),search=new URLSearchParams(params);for(const k of [...search.keys()])if(/^(?:aff|affid|affiliate|ref|referral|invite|invite_code|code)$/i.test(k))search.delete(k);clean.hash=route+(search.size?'?'+search:'');}official=clean.href;}
 const ref=links.find(v=>v.recordId===record.id&&v.status==='verified_user_referral'&&v.owner==='user'&&v.sourceIds?.length&&Number.isFinite(Date.parse(v.verifiedAt))&&typeof v.disclosure==='string'&&v.disclosure.trim());
 if(ref){try{const u=new URL(ref.url);if(u.protocol==='https:'&&!u.username&&!u.password&&official&&u.origin===new URL(official).origin)return {url:u.href,type:'verified_user_referral',label:'用户推荐链接',disclosure:ref.disclosure,verifiedAt:ref.verifiedAt,sourceIds:ref.sourceIds};}catch{}}
 return {url:official,type:official?'official_fallback':'unavailable',label:official?'查看留存入口':'暂无可核实入口',disclosure:'未配置已核实的用户推荐链接；入口不含本系统添加的推荐参数，归属与当前有效性请核对详情。'};
}
function parseNeeds(input=''){
 const text=input.normalize('NFKC').trim();if(text.length>300)throw new QueryError('需求文本最长300字');
 if(!text)return {status:'empty',criterion:null,budget:null,currency:null,unparsed:''};
 let rest=text,budget=null,currency=null;const budgets=[];
 rest=rest.replace(/(?:每月\s*(\d+(?:\.\d{1,2})?)\s*(?:元|人民币)\s*(?:以内|以下|之内)|月预算\s*(\d+(?:\.\d{1,2})?)\s*(?:元|人民币)?)/g,(match,a,b)=>{budgets.push(Number(a||b));if(/元|人民币/.test(match))currency='CNY';return ' ';});
 if(budgets.length)budget=Math.min(...budgets);
 const criteria=[];
 for(const [value,pattern]of [['value',/流量性价比|性价比/g],['cheap',/便宜|低价/g],['stability',/稳定性|稳定/g],['speed',/速度快|速度|网速快/g]])rest=rest.replace(pattern,()=>{criteria.push(value);return ' ';});
 rest=rest.replace(/我想要|我需要|帮我找|我想找|想要|需要|推荐|找个|一个|套餐|机场|服务|一点|一些|比较|更|的|高|好|请|和|且|又|，|。|、|,|\s/g,'');
 const unique=[...new Set(criteria)];const ambiguous=unique.length>1;
 return {status:rest||ambiguous||(!unique.length&&budget===null)||budget===0?'unparsed':'parsed',criterion:unique[0]||null,budget,currency,unparsed:rest,reason:ambiguous?'同时指定多个排序需求，请选择一个；速度和稳定性需实测证据。':rest?'含有暂不支持的需求片段：'+rest:budget===0?'月预算须大于零。':null};
}
function makeNeedsSearch(service,{verifiedReferralLinks=[]}={}){
 const rankings=new WeakMap();
 function offersFor(snapshot,currency,criterion){
  let byRanking=rankings.get(snapshot);
  if(!byRanking){byRanking=new Map();rankings.set(snapshot,byRanking);}
  const key=currency+'|'+criterion;
  if(byRanking.has(key))return byRanking.get(key);
  const offers=snapshot.catalog.flatMap(record=>{
   const recordText=[record.id,record.name,record.officialUrl].join(' ').normalize('NFKC').toLowerCase();
   return (record.coreInfo?.pricing?.plans||[]).flatMap((plan,index)=>{
    const rank=comparison(plan,currency);
    if(!rank||(criterion==='value'&&rank.costPerGB===null))return [];
    return [{record,recordText,planText:String(plan.name||'').normalize('NFKC').toLowerCase(),plan,index,rank}];
   });
  });
  const metric=criterion==='value'?'costPerGB':'monthlyAmount';
  offers.sort((a,b)=>a.rank[metric]-b.rank[metric]||a.rank.monthlyAmount-b.rank.monthlyAmount||a.record.id.localeCompare(b.record.id));
  byRanking.set(key,offers);
  return offers;
 }
 return {search(query={},links=verifiedReferralLinks){
  for(const key of Object.keys(query))if(!['criterion','currency','q','maxMonthly','needs','view','monthlyOnly','page'].includes(key)||typeof query[key]!=='string')throw new QueryError('无效搜索参数：'+key);
  const planView=query.view==='plans';
  if((query.view!==undefined&&!planView)||(!planView&&(query.monthlyOnly!==undefined||query.page!==undefined)))throw new QueryError('无效搜索展示类型');
  if(query.monthlyOnly!==undefined&&query.monthlyOnly!=='1')throw new QueryError('无效月付筛选');
  const requestedPage=Number(query.page??1),limit=12;
  if(query.page!==undefined&&(!/^\d+$/.test(query.page)||requestedPage<1||requestedPage>100000))throw new QueryError('无效套餐页码');
  const parsed=parseNeeds(query.needs);const criterion=parsed.criterion||query.criterion||'cheap',currency=query.currency||parsed.currency||'CNY',q=(query.q||'').normalize('NFKC').trim().toLowerCase();
  if(!['cheap','value','speed','stability'].includes(criterion)||!CURRENCIES.includes(currency)||q.length>200)throw new QueryError('无效搜索条件');
  const manualBudget=query.maxMonthly?Number(query.maxMonthly):null;if(manualBudget!==null&&(!/^\d+(?:\.\d{1,2})?$/.test(query.maxMonthly)||!Number.isFinite(manualBudget)||manualBudget<=0))throw new QueryError('月均预算必须为正数，最多两位小数');
  const budget=manualBudget===null?parsed.budget:parsed.budget===null?manualBudget:Math.min(manualBudget,parsed.budget);
  const decimalBudget=budget===null||!Number.isFinite(budget)?null:decimal(budget);
  const matches=text=>!q||text.normalize('NFKC').toLowerCase().includes(q);
  const exported=service.rawExport();
  const rows=planView?exported.catalog:exported.catalog.filter(r=>matches([r.id,r.name,r.officialUrl].join(' ')));
  const result={criterion,currency,maxMonthly:budget,status:'ranked_advertised_prices',items:[],excludedCount:0,evidenceAsOf:exported.evidenceAsOf??service.evidenceAsOf,limitations:['仅比较有来源的页面标价，不是结算价、服务质量或购买建议。','只比较同一币种、明确自然月周期；按天、起价、附加包、额外收费和售罄套餐不参与。','流量性价比仅纳入明确每月 GB 额度；G、TB、一次性与不明重置额度不换算。','保留采集日期；历史页面标价可能已变更，需访问入口核对。']};
  if(planView)Object.assign(result,{page:1,pages:1,total:0,snapshotId:exported.snapshotId});
  if(parsed.status==='unparsed'||parsed.currency&&parsed.currency!==currency)return {...result,status:'unparsed_needs',reason:'需求未完整解析，未按该需求推荐结果。'+(parsed.currency&&parsed.currency!==currency?'文本币种与手动币种冲突。':parsed.reason||'请使用便宜、性价比、速度、稳定或明确月预算。'),excludedCount:rows.length};
  if(parsed.status==='parsed')result.limitations.unshift(`文本需求已解析为：${{cheap:'便宜',value:'流量性价比',speed:'速度',stability:'稳定性'}[criterion]}${budget===null?'':`，月均预算不超过 ${budget} ${currency}`}。文本排序优先于下拉框；同时填写预算时取较低上限。`);
  if(['speed','stability'].includes(criterion))return {...result,status:'abstain',reason:'没有经过统一网络、地区、时段和样本口径验证的可比实测，不提供速度或稳定性排名。',excludedCount:rows.length};
  if(planView){
   const matchingCounts=new Map();
   const offers=offersFor(exported,currency,criterion).filter(({record,recordText,planText,plan,rank})=>{
    if(!withinBudget(plan.amount,rank.months,decimalBudget)||(query.monthlyOnly&&rank.months!==1)||(q&&!recordText.includes(q)&&!planText.includes(q)))return false;
    matchingCounts.set(record.id,(matchingCounts.get(record.id)||0)+1);
    return true;
   });
   const total=offers.length,pages=Math.max(1,Math.ceil(total/limit)),page=Math.min(pages,requestedPage);
   const items=offers.slice((page-1)*limit,page*limit).map(({record,plan,index,rank})=>({
    id:record.id,name:record.name,plan,comparison:rank,matchingPlanCount:matchingCounts.get(record.id),
    planKey:record.id+'-'+index,unitPrices:planUnitPrices(plan),link:outbound(record,links)
   }));
   return {...result,total,pages,page,items,excludedCount:rows.length-matchingCounts.size,status:total?result.status:'insufficient_evidence'};
  }
  const metric=v=>criterion==='value'?v.comparison.costPerGB:v.comparison.monthlyAmount;
  const compare=(a,b)=>metric(a)-metric(b)||a.comparison.monthlyAmount-b.comparison.monthlyAmount;
  for(const record of rows){
   const plans=(record.coreInfo?.pricing?.plans||[])
    .map(plan=>({plan,comparison:comparison(plan,currency)}))
    .filter(v=>v.comparison&&(criterion!=='value'||v.comparison.costPerGB!==null)&&withinBudget(v.plan.amount,v.comparison.months,decimalBudget));
   if(!plans.length){result.excludedCount++;continue;}
   const [{plan,comparison:rank}]=plans.sort(compare);
   result.items.push({id:record.id,name:record.name,plan,comparison:rank,matchingPlanCount:plans.length,unitPrices:planUnitPrices(plan),link:outbound(record,links)});
  }
  result.items.sort((a,b)=>metric(a)-metric(b)||a.id.localeCompare(b.id));
  if(!result.items.length)result.status='insufficient_evidence';return result;
 }};
}
module.exports={makeNeedsSearch,comparison,monthlyQuota,planUnitPrices,outbound,parseNeeds};
