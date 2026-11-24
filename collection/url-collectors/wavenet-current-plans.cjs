'use strict';
const crypto=require('node:crypto'),sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const origin='https://eqxmg.wavenetttt.homes',url=origin+'/#/plans';
function extract(s,{recordId,prior={}}={}){
 const body=s?.body,m=s?.metadata||{},cards=m.planCards;
 if(recordId!=='A165'||s.url!==url||m.title!=='WaveNet'||!m.authenticationObserved||m.passwordForm||m.verificationWidgetObserved||!s.evidenceId||!Number.isFinite(Date.parse(s.observedAt))||typeof body!=='string'||s.sha256&&sha(body)!==s.sha256||!Array.isArray(cards)||cards.length!==9)return null;
 const names=new Set(),plans=[];
 for(const c of cards){const q=c.text?.trim(),start=body.indexOf(q);if(!q||!c.name?.startsWith('浪网 ')||names.has(c.name)||!q.startsWith(c.name+'\n')||!q.endsWith('立即订阅')||start<0||body.lastIndexOf(q)!==start)return null;names.add(c.name);
 const p=/^¥(\d+(?:\.\d{1,2})?)\n\/(年|月|一次性)\n月流量\n(\d+(?:\.\d+)?)\s*(GB|TB)\n/.exec(q.slice(c.name.length+1));if(!p||Number(p[1])<=0||Number(p[3])<=0)return null;
 const once=p[2]==='一次性',unlimited=/永不限时|没有时间限制/.test(q),restrictions=['页面默认周期标价，未打开订阅配置或验证结账金额。','带宽、稳定性及解锁文案为站方自述，不是实测。'];
 if(once)restrictions.push('一次性价格与通用“月流量”标签同时出现，原文保留；仅有明确不限时文案才认定为不限时包。');
 if(c.name==='浪网 年付标准')restrictions.push('年付119与文案“折算约8元/月”不一致，以年付总价119为报价，不采纳折算数。');
 plans.push({name:c.name+' · '+p[2],productName:c.name,amount:Number(p[1]),amountBasis:'original_billing_period_total',billingPeriod:p[2],currency:null,currencySymbol:'¥',currencyStatus:'symbol_only_not_ISO_confirmed',quota:p[3]+p[4]+(once?(unlimited?'总流量（原页同时标月流量）':'（原页标月流量，周期待核）'):'/月'),quotaReset:once?(unlimited?'站方明确称不限时；原卡片月流量标签存在冲突。':'未取得有效期或重置说明，不能推定为不限时总流量。'):(q.includes('每 30 天自动刷新')?'每30天自动刷新。':'页面标月流量，具体重置规则未说明。'),quote:q,sourceUrl:url,sourceIds:[s.evidenceId],observedAt:s.observedAt,sourceBodySha256:sha(body),sourceLocator:{kind:'body_utf16_range',start,end:start+q.length,quoteSha256:sha(q)},checkoutVerified:false,priceStatus:'advertised_not_checkout_verified',restrictions});}
 return{pricing:require('../../lib/current-public-price-catalog.cjs').currentPublicCatalog((prior.coreInfo||prior).pricing||{},{status:'advertised_not_checkout_verified',plans,sourceIds:[s.evidenceId],observedAt:s.observedAt,checkoutVerified:false,collectionMethod:m.captureMethod||'authenticated_visible_cards',autonomousCollectionVerified:m.autonomousCollectionVerified===true,limitation:'默认周期可见标价；浏览器正常登录成功不等同于Oracle独立登录成功。'},'wavenet_authenticated_visible_default_periods')};
}
module.exports={origin,url,recordIds:['A165'],fields:['pricing'],extract,readOnlyRecipe:'wavenet_authorized_plans_readonly'};
