'use strict';
const origin='https://guolicheng.cc';
async function collectMany(tab){
 const {readRenderedDocument}=await import('../visible-document.mjs');const before=await readRenderedDocument(tab),u=new URL(before.url);
 if(u.origin!==origin||!['/','/index.html'].includes(u.pathname)||before.passwordForm||before.agreementCheckbox)throw Error('orange_public_price_scope_changed');
 const native=(before.links||[]).find(l=>l.label==='价格'&&l.url===origin+'/#pric');if(!native)throw Error('orange_native_price_anchor_missing');
 await tab.playwright.getByRole('link',{name:'价格',exact:true}).click();
 const regions=tab.playwright.locator('#pric'),count=await regions.count();if(count<1||count>4)throw Error('orange_price_region_ambiguous');
 const parts=[];for(let i=0;i<count;i++){const region=regions.nth(i);if(typeof region.scrollIntoViewIfNeeded==='function')await region.scrollIntoViewIfNeeded({timeout:4000});else await tab.playwright.locator('body').press('PageDown');let text='';for(let n=0;n<12;n++){text=await region.innerText();if(/[¥￥$]\s*\d|\d\s*(?:元|CNY|USD)/.test(text))break;await tab.playwright.waitForTimeout(350);}if(!/[¥￥$]\s*\d|\d\s*(?:元|CNY|USD)/.test(text))throw Error('orange_public_price_region_not_ready');parts.push(text);}const text=parts.join('\n\n');
 const after=await readRenderedDocument(tab),at=new URL(after.url);if(at.origin!==origin||!['/','/index.html'].includes(at.pathname)||at.hash!=='#pric'||after.passwordForm||after.agreementCheckbox||!/[¥￥$]\s*\d|\d\s*(?:元|CNY|USD)/.test(text))throw Error('orange_public_price_region_not_ready');
 return{captures:[{...after,text,representation:'scoped_visible_official_price_anchor',planCards:[],capturedAt:new Date().toISOString()}],newOrdersCreated:0,paymentExecuted:false};
}
const crypto=require('node:crypto'),names=['一小口果粒橙(直连)','一大口果粒橙(直连)','亿大口果粒橙(直连)','舔一口果粒橙(中转)','一小口果粒橙(中转)','一大口果粒橙(中转)','喝一杯果粒橙(中转)','喝亿大桶果粒橙(中转)'];
function extract(s,{recordId,prior={},sourceRefs}={}){
 if(recordId!=='A069'||s.url!==origin+'/#pric'||!s.evidenceId||!Number.isFinite(Date.parse(s.observedAt))||s.metadata?.representation!=='scoped_visible_official_price_anchor'||s.metadata?.passwordForm||s.passwordForm)return null;
 const body=s.body||s.text||'',sha=crypto.createHash('sha256').update(body).digest('hex');if(s.sha256&&s.sha256!==sha)return null;
 const headers=[...body.matchAll(/^🍊([^\n]+)🍊\n￥(\d+(?:\.\d{1,2})?)\n\n每月\n/gm)];if(headers.length!==names.length)return null;
 const old=(prior.coreInfo||prior).pricing||{},key=p=>(p.productName||p.name)+'|'+p.billingPeriod,merged=new Map((old.plans||[]).map(p=>[key(p),p])),fresh=[];
 for(let i=0;i<headers.length;i++){const h=headers[i],start=h.index,quote=body.slice(start,headers[i+1]?.index??body.length).trimEnd(),quota=/包月(\d+)GB流量/.exec(quote);if(h[1]!==names[i]||!quota||!quote.includes('没有连接设备限制')||!quote.includes('立即购买'))return null;
  const plan={name:h[1],productName:h[1],amount:Number(h[2]),amountBasis:'original_billing_period_total',billingPeriod:'月付',currency:null,currencySymbol:'￥',quota:'每月'+quota[1]+'GB（官网宣传）',quotaReset:'公开价格区只称包月流量，未重新验证重置日、结转或商店实际计费。',deviceLimit:'官网称没有连接设备限制；未独立测试。',quote,sourceIds:[s.evidenceId],sourceUrl:s.url,observedAt:s.observedAt,sourceBodySha256:sha,sourceLocator:{kind:'body_utf16_range',start,end:start+quote.length},checkoutVerified:false,scope:'official_public_landing_advertisement_not_account_catalog',restrictions:['当前官网公开价格区宣传标价；未登录商店、下单或核对最终结账。','没有带宽限制、解锁和加速均为站方宣传，不是实测结果；未从￥符号推定ISO币种。']};
  const previous=merged.get(key(plan));if(previous&&Number(previous.amount)!==plan.amount)plan.priceConflict={previousAmount:previous.amount,previousObservedAt:previous.observedAt,previousSourceIds:previous.sourceIds,reason:'公开宣传价与历史商店价不同，未确认实际可购买价格。'};
  const value=require('./retained-plan-conditions.cjs').preservePlanConditions(previous,plan,{sourceRefs});merged.set(key(plan),value);fresh.push(value);
 }
 const result=[...fresh,...[...merged.values()].filter(p=>!fresh.some(x=>key(x)===key(p)))];
 return{pricing:{...old,status:'advertised_not_checkout_verified',plans:result,summaryPlanIndex:0,sourceIds:[...new Set([...(old.sourceIds||[]),...require('./retained-plan-conditions.cjs').retainedConditionSourceIds(fresh,s.evidenceId)])],observedAt:s.observedAt,checkoutVerified:false,scope:'official_public_landing_advertisement_not_account_catalog',limitation:'本次核实官网公开价格区8档月付宣传价，不代表登录商店或结账验证。其他周期和未在该区展示的套餐保留原采集时间；没有推算长期折扣。'}};
}
module.exports={origin,recordIds:['A069'],fields:['pricing'],collectMany,extract};
