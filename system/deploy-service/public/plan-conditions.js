'use strict';
(function(scope){
 const text=v=>v==null?'':Array.isArray(v)?v.map(text).filter(Boolean).join('；'):typeof v==='object'?[v.summary||v.statement,...(Array.isArray(v.conditions)?v.conditions:[])].filter(Boolean).join('；')||(v.amount!==undefined?String(v.amount)+' '+(v.currency||v.currencySymbol||'币种未知'):'详见来源条款'):String(v);
 function conditionLines(plan){
  const lines=[];for(const[key,label]of [['quotaReset','流量重置/叠加'],['deviceLimit','设备条件'],['maxDevices','同时使用设备上限'],['terms','套餐使用条款'],['additionalCharges','附加费用']]){
   if(plan[key]===undefined||plan[key]===null||plan[key]==='')continue;
   const archive=plan.retainedContractFields?.[key],historical=archive?.historical===true||plan[key]?.historical===true;
   lines.push(label+'：'+text(plan[key]));
   if(historical){const refs=archive?.sourceObservations||plan[key]?.sourceObservations||[],dates=[...new Set(refs.map(r=>r.observedAt).filter(Boolean))];if(archive?.observedAt&&!dates.includes(archive.observedAt))dates.push(archive.observedAt);lines.push('历史'+label+'：原来源采集 '+(dates.length?dates.join('、'):'日期未知')+'；本轮未重验，不能据此确认当前适用。');}
  }
  const dates=[...new Set((plan.retainedConditionEvidence||[]).map(e=>e.observedAt).filter(Boolean))];
  if(dates.length)lines.push('保留的历史限制：原观察 '+dates.join('、')+'；价格更新没有重新验证这些限制。');
  return lines;
 }
 if(typeof module==='object'&&module.exports)module.exports={conditionLines};else scope.PlanConditions={conditionLines};
})(typeof window==='object'?window:globalThis);
