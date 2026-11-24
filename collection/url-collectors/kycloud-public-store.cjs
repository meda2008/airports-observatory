"use strict";
const crypto=require('node:crypto'),origin='https://my.ihcloud.cc',names=['Mini','Basic','Silver','Platinum','Ultimate 1','Ultimate 2','Team 1','Team 2','Custom Traffic'],sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function extract(s,{recordId,prior={}}={}){
 if(recordId!=='A026'||!s.evidenceId||!Number.isFinite(Date.parse(s.observedAt))||/checkpoint/.test(s.kind||'')||s.passwordForm||s.metadata?.passwordForm||s.verificationWidgetObserved||s.metadata?.verificationWidgetObserved)return null;
 const u=new URL(s.url),body=s.body||s.text;if(u.origin!==origin||u.pathname!=='/store/accelerate'||u.search||u.hash||typeof body!=='string'||!body.includes('KyCloud. All Rights Reserved.')||s.sha256&&s.sha256!==sha(body))return null;
 const starts=names.map(n=>[...body.matchAll(new RegExp('^'+n+'$','gm'))]);if(starts.some((x,i)=>x.length!==1||i&&x[0].index<=starts[i-1][0].index))return null;
 const plans=[];for(let i=0;i<8;i++){
  const start=starts[i][0].index,end=starts[i+1][0].index,quote=body.slice(start,end).trimEnd(),m=/^[^\n]+\n￥(\d+\.\d{2}) CNY\n(每年|每季)\n每月(\d+)(G|TB)流量，购买日重置流量/.exec(quote);if(!m||!quote.endsWith('立即订购')||!quote.includes('不限同时在线'))return null;
  const bind={quote,sourceIds:[s.evidenceId],sourceUrl:s.url,observedAt:s.observedAt,sourceBodySha256:sha(body),sourceLocator:{kind:'body_utf16_range',start,end:start+quote.length,quoteSha256:sha(quote)}};
  const add=(amount,period,basis)=>plans.push({name:names[i]+' · '+period,amount,currency:'CNY',currencySymbol:'￥',currencyStatus:'explicit_visible_ISO',billingPeriod:period,amountBasis:'original_billing_period_total',quota:'每月'+m[3]+m[4]+'（购买日重置；站方声明）',deviceLimit:'不限同时在线（站方声明，非实测）',checkoutVerified:false,priceStatus:'advertised_not_checkout_verified',...bind,restrictions:[basis,'只读公开目录；未验证结账、账户折扣、解锁或线路性能。','未在本页观察的旧周期保留原时间，不按季价推算半年价。']});
  add(Number(m[1]),m[2]==='每年'?'年付':'季付','目录卡片明确周期及原周期总价。');
  const annual=[...quote.matchAll(/^省钱攻略：年费(\d+(?:\.\d+)?)元$/gm)];if(annual.length>1)return null;if(annual.length&&m[2]==='每季')add(Number(annual[0][1]),'年付','目录说明明确“年费”金额；属于站方报价，非结账确认。');
 }
 const core=prior.coreInfo||prior,old=core.pricing||{},key=p=>JSON.stringify([p.name,p.billingPeriod]),map=new Map((old.plans||[]).map(p=>[key(p),p]));for(const p of plans){const before=map.get(key(p));if(!before||Date.parse(before.observedAt)<=Date.parse(p.observedAt)||!Number.isFinite(Date.parse(before.observedAt)))map.set(key(p),p);}
 return{pricing:{...old,status:'advertised_not_checkout_verified',observedAt:s.observedAt,plans:[...map.values()],sourceIds:[s.evidenceId],limitation:'KyCloud公开原生目录的固定套餐周期总价及明确年费说明。自选流量起价不升级为已确认总额，未观察旧周期保留原采集时间；没有建单或付款。'}};
}
module.exports={origin,recordIds:['A026'],fields:['pricing'],extract};
