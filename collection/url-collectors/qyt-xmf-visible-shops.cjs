'use strict';
const crypto=require('node:crypto');
const specs=[{id:'A141',origin:'https://a32.qytaff03.cc',brand:'青云梯',names:['青云梯·年付小包','青云·VIP1','青云·VIP2','青云·VIP3','青云·VIP4'],inquiry:'定制节点请联系客服，好用！'},{id:'A144',origin:'https://a30.xmfvipaffa01.cc',brand:'小蜜蜂',names:['大黄蜂特惠年付版','小蜜蜂畅游版','工蜂极速版','蜂王尊享版','蜂群无界版','备用首选·不限时流量包'],inquiry:'补单'}];
function extract(s,{recordId,prior={}}={},spec){
 if(recordId!==spec.id||!s.evidenceId||!Number.isFinite(Date.parse(s.observedAt))||s.metadata?.passwordForm||s.passwordForm||/checkpoint/.test(s.kind||''))return null;
 const u=new URL(s.url),body=s.body||s.text||'';if(u.origin!==spec.origin||u.pathname!=='/shop'||u.search||u.hash||!body.includes('© '+spec.brand)||!body.includes('更换套餐将覆盖当前套餐！请谨慎购买！'))return null;
 const hash=crypto.createHash('sha256').update(body).digest('hex');if(s.sha256&&hash!==s.sha256)return null;
 const headers=[...body.matchAll(/^([^\n]+)\n(?:爆款限时热销\n)?¥(\d+(?:\.\d{1,2})?) \/ (月付|年付|一次性)[^\n]*/gm)];if(headers.length!==spec.names.length+1)return null;
 const plans=[],inquiries=[],seen=new Set();
 for(let i=0;i<headers.length;i++){const h=headers[i],name=h[1],start=h.index,end=headers[i+1]?.index??body.indexOf('© ',start),quote=body.slice(start,end).trimEnd();if(end<=start||seen.has(name)||!quote.includes('立即购买'))return null;seen.add(name);
  const unit=quote.match(/(?:^|\n)(\d+(?:\.\d{1,2})?) CNY(?:\n|$)/),quota=quote.match(/(?:^|\n)(\d+)GB\n(周期流量|一次性流量)(?:\n|$)/);if(!unit||Number(unit[1])!==Number(h[2])||!quota)return null;
  const monthly=/\u6bcf\u6708\s*(\d+)\s*G(?:B)?\u6d41\u91cf/.exec(quote);if(monthly&&Number(monthly[1])!==Number(quota[1]))return null;const unlimited=quote.includes('\u4e0d\u9650\u5236\u540c\u65f6\u4f7f\u7528\u5ba2\u6237\u7aef\u6570\u91cf')||quote.includes('\u4e0d\u9650\u5236\u5ba2\u6237\u7aef');const p={name,productName:name,amount:Number(h[2]),amountBasis:'original_billing_period_total',currency:'CNY',currencySymbol:'¥',billingPeriod:h[3],quota:monthly?'每月'+monthly[1]+'GB（站方声明）':quota[1]+'GB（'+quota[2]+'；站方声明）',deviceLimit:unlimited?'站方称不限制客户端，未独立测试。':null,quote,sourceIds:[s.evidenceId],sourceUrl:s.url,observedAt:s.observedAt,sourceBodySha256:hash,sourceLocator:{kind:'body_utf16_range',start,end:start+quote.length},checkoutVerified:false,restrictions:['只读官网商店卡片与同卡CNY总额，不打开结账或创建订单。','长期折扣不推算总价；不限速、专线和解锁均为站方声明，不是独立实测。']};
  if(name===spec.inquiry){if(!quote.includes('请联系客服'))return null;inquiries.push({...p,purchasable:false,amountBasis:'advertised_inquiry_display',purchaseLimitation:'定制或补单需联系客服，不作为普通可直接购买套餐。'});}else{if(!spec.names.includes(name))return null;plans.push(p);}
 }
 if(plans.length!==spec.names.length)return null;
 const old=(prior.coreInfo||prior).pricing||{},key=p=>(p.productName||p.name).replace(/ · (?:月付|年付|一次性)$/,'')+'|'+p.billingPeriod,keys=new Set(plans.map(key));
 return{pricing:{...old,status:'advertised_not_checkout_verified',plans:[...plans,...(old.plans||[]).filter(p=>!keys.has(key(p))&&p.purchasable!==false&&!/定制节点|补单/.test(p.name))],inquiryOffers:inquiries,summaryPlanIndex:0,sourceIds:[...new Set([...(old.sourceIds||[]),s.evidenceId])],observedAt:s.observedAt,checkoutVerified:false,limitation:'本次仅核实商店直接显示的周期总价；定制和补单单列，旧的其他周期保留原时间，不推算折扣。'}};
}
module.exports={specs,parsers:specs.map(spec=>({origin:spec.origin,recordIds:[spec.id],fields:['pricing'],extract:(s,c)=>extract(s,c,spec)}))};
