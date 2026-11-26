'use strict';
const {QueryError,safeUrl}=require('./catalog-service.cjs');
const PERIODS={'每月':1,'每年':12,'半年':6,'每季':3,'月付':1,'月':1,'1个月':1,'季付':3,'季度':3,'半年付':6,'年付':12,'年':12};
function monthlyQuota(plan){
 const q=(plan.quota||'').trim(),r=plan.quotaReset||'';
 let m=q.match(/^每月\s*(\d+(?:\.\d+)?)\s*GB$/i);
 if(!m && /每月/.test(r))m=q.match(/^(\d+(?:\.\d+)?)\s*GB$/i);
 return m&&Number(m[1])>0?Number(m[1]):null;
}
function comparison(plan,currency){
 if(!Number.isFinite(plan.amount)||plan.amount<=0||plan.currency!==currency||plan.amountBasis!=='original_billing_period_total'||!plan.sourceIds?.length||!Number.isFinite(Date.parse(plan.observedAt))||plan.addon||plan.soldOut===true||plan.purchasable===false||plan.additionalCharges)return null;
 const months=PERIODS[plan.billingPeriod];if(!months)return null;
 const monthly=plan.amount/months,quota=monthlyQuota(plan);
 return {monthlyAmount:monthly,monthlyQuotaGB:quota,costPerGB:quota?monthly/quota:null,months,formula:`${plan.amount} / ${months}`,basis:'advertised_calendar_month_equivalent',checkoutVerified:false};
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
 return {search(query={}){
  for(const key of Object.keys(query))if(!['criterion','currency','q','maxMonthly','needs'].includes(key)||typeof query[key]!=='string')throw new QueryError('无效搜索参数：'+key);
  const parsed=parseNeeds(query.needs);const criterion=parsed.criterion||query.criterion||'cheap',currency=query.currency||parsed.currency||'CNY',q=(query.q||'').normalize('NFKC').trim().toLowerCase();
  if(!['cheap','value','speed','stability'].includes(criterion)||!['CNY','USD','EUR','GBP','JPY','HKD','TWD'].includes(currency)||q.length>200)throw new QueryError('无效搜索条件');
  const manualBudget=query.maxMonthly?Number(query.maxMonthly):null;if(manualBudget!==null&&(!/^\d+(?:\.\d{1,2})?$/.test(query.maxMonthly)||!Number.isFinite(manualBudget)||manualBudget<=0))throw new QueryError('月均预算必须为正数，最多两位小数');
  const budget=manualBudget===null?parsed.budget:parsed.budget===null?manualBudget:Math.min(manualBudget,parsed.budget);
  const rows=service.rawExport().catalog.filter(r=>!q||[r.id,r.name,r.officialUrl].join(' ').normalize('NFKC').toLowerCase().includes(q));
  const result={criterion,currency,maxMonthly:budget,status:'ranked_advertised_prices',items:[],excludedCount:0,evidenceAsOf:service.evidenceAsOf,limitations:['仅比较有来源的页面标价，不是结算价、服务质量或购买建议。','只比较同一币种、明确自然月周期；按天、起价、附加包、额外收费和售罄套餐不参与。','流量性价比仅纳入明确每月 GB 额度；G、TB、一次性与不明重置额度不换算。','保留采集日期；历史页面标价可能已变更，需访问入口核对。']};
  if(parsed.status==='unparsed'||parsed.currency&&parsed.currency!==currency)return {...result,status:'unparsed_needs',reason:'需求未完整解析，未按该需求推荐结果。'+(parsed.currency&&parsed.currency!==currency?'文本币种与手动币种冲突。':parsed.reason||'请使用便宜、性价比、速度、稳定或明确月预算。'),excludedCount:rows.length};
  if(parsed.status==='parsed')result.limitations.unshift(`文本需求已解析为：${{cheap:'便宜',value:'流量性价比',speed:'速度',stability:'稳定性'}[criterion]}${budget===null?'':`，月均预算不超过 ${budget} ${currency}`}。文本排序优先于下拉框；同时填写预算时取较低上限。`);
  if(['speed','stability'].includes(criterion))return {...result,status:'abstain',reason:'没有经过统一网络、地区、时段和样本口径验证的可比实测，不提供速度或稳定性排名。',excludedCount:rows.length};
  for(const record of rows){
   const plans=(record.coreInfo?.pricing?.plans||[]).map(plan=>({plan,comparison:comparison(plan,currency)})).filter(v=>v.comparison&&(criterion!=='value'||v.comparison.costPerGB!==null)&&(budget===null||v.comparison.monthlyAmount<=budget));
   const metric=v=>criterion==='value'?v.comparison.costPerGB:v.comparison.monthlyAmount;
   plans.sort((a,b)=>metric(a)-metric(b)||a.comparison.monthlyAmount-b.comparison.monthlyAmount);
   if(!plans.length){result.excludedCount++;continue;}
   result.items.push({id:record.id,name:record.name,...plans[0],matchingPlanCount:plans.length,link:outbound(record,verifiedReferralLinks)});
  }
  result.items.sort((a,b)=>(criterion==='value'?a.comparison.costPerGB-b.comparison.costPerGB:a.comparison.monthlyAmount-b.comparison.monthlyAmount)||a.id.localeCompare(b.id));
  if(!result.items.length)result.status='insufficient_evidence';return result;
 }};
}
module.exports={makeNeedsSearch,comparison,monthlyQuota,outbound,parseNeeds};
