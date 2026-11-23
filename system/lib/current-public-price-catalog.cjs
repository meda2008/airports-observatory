'use strict';
// Retain historical evidence without presenting unobserved old offers as current.
function currentPublicCatalog(previous={},fresh={},scope){if(!fresh.plans?.length)throw Error('Current public price rows required');const key=p=>(p.productName||p.name)+'|'+p.billingPeriod,keys=new Set(fresh.plans.map(key)),history=[...(previous.priorPlansNotRevalidated||[]),...(previous.plans||[]).filter(p=>!keys.has(key(p)))],priorPlansNotRevalidated=[...new Map(history.map(p=>[JSON.stringify([p.name,p.billingPeriod,p.amount,p.sourceIds]),p])).values()];return{...previous,...fresh,scope,plans:fresh.plans,summaryPlanIndex:0,priorPlansNotRevalidated,priorPlansLimitation:'未出现在本次公开目录的旧报价保留为历史资料，不据此认定全站停卖、旧账户不能续费或其他账号不可购买。'};}
module.exports={currentPublicCatalog};
