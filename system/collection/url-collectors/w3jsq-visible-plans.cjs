'use strict';
const crypto = require('node:crypto');
const origin = 'https://w3jsq.com';
const periods = [['月付',31],['季付',91],['年付',366]];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function route(value) {
  try { const u=new URL(value); return u.origin===origin&&u.pathname==='/services'&&!u.hash&&[...u.searchParams.keys()].every(k=>k==='cycle')&&[...u.searchParams].length<=1&&(!u.search||periods.some(([,days])=>u.searchParams.get('cycle')==='days-'+days)); } catch { return false; }
}
function key(p) {
  const name=(p.productName||p.name).replace(/ · (月付|季付|年付)$/,'');
  return /^流量(?:补充)?包【50G】$/.test(name)?'addon:50G':name+'|'+p.billingPeriod;
}
function cycleControlMatches(c,period,days){return c?.tag==='A'&&c.role==='tab'&&c.label===period&&c.controls==='shop-panel-days-'+days&&[origin+'/services?cycle=days-'+days,'/services?cycle=days-'+days].includes(c.href);}
async function collectMany(tab,{readDocument}={}) {
  if(!route(await tab.url())) return null;
  const readRenderedDocument=readDocument||(await import('../visible-document.mjs')).readRenderedDocument;
  const captures=[];let invalidCycle=null;
  for(const [period,days] of periods) {
    const before=await readRenderedDocument(tab);
    if(!route(before.url)||before.passwordForm||before.agreementCheckbox) throw Error('web3_store_scope_changed');
    const link=tab.playwright.getByRole('tab',{name:period,exact:true}).filter({visible:true});
    if(await link.count()!==1||!await link.isVisible()||!cycleControlMatches(await link.evaluate(e=>({tag:e.tagName,role:e.getAttribute('role'),label:e.innerText.trim(),href:e.getAttribute('href'),controls:e.getAttribute('aria-controls')})),period,days)) throw Error('web3_native_cycle_link_changed');
    await link.click({timeout:5000});
    let doc;
    for(let n=0;n<12;n++) {
      doc=await readRenderedDocument(tab);
      if(route(doc.url)&&new URL(doc.url).searchParams.get('cycle')==='days-'+days&&doc.text.includes(period+'套餐 · 有效期 '+days+' 天')&&!doc.passwordForm) break;
      await tab.playwright.waitForTimeout(250);
    }
    if(!doc||await link.getAttribute('aria-selected')!=='true'||!route(doc.url)||new URL(doc.url).searchParams.get('cycle')!=='days-'+days||!doc.text.includes(period+'套餐 · 有效期 '+days+' 天')||doc.passwordForm||doc.agreementCheckbox) throw Error('web3_cycle_document_not_ready');
    if(!cycleParts(doc.text))invalidCycle ||= doc.url;
    captures.push(doc);
  }
  return {captures,...(invalidCycle?{checkpoint:{type:'web3_native_cycle_card_schema_changed',url:invalidCycle,stage:'extract_readiness',reason:'周期切换成功但有价卡结构未匹配；所有已读原文保留，不宣称完整。'}}:{})};
}
function cycleParts(body){if(typeof body!=='string')return null;
  const selected=periods.find(([p,days])=>body.includes(p+'套餐 · 有效期 '+days+' 天')&&body.includes(p+'，共 3 款在售套餐'));
  if(!selected) return null;
  const [period,days]=selected;
  const cards=[...body.matchAll(/^(VIP[123])\n(?:热销套餐\n)?\n([^\n]+)\n\n¥\n(\d+(?:\.\d{1,2})?)\n\/ (\d+) 天\n\n一次支付 ¥(\d+(?:\.\d{1,2})?)\n\n([\s\S]*?)\n选择套餐/gm)];
  if(cards.length!==3||cards.some((m,i)=>m[1]!=='VIP'+(i+1)||Number(m[4])!==days||Number(m[3])!==Number(m[5]))) return null;
  if(cards.some(m=>!/每周期流量\n(\d+(?:\.\d+)?)GB/.test(m[6])||!/最多 (\d+) 个 IP 同时在线/.test(m[6])||!m[6].includes('每 30 天自动重置')))return null;
  const addon=/^流量包【50G】\n\n额外流量 50GB\n\n[\s\S]*?\n¥(\d+(?:\.\d{1,2})?)\n购买流量包/m.exec(body);
  if(!addon||!addon[0].includes('只能是在买了套餐之后购买，直接购买流量包无法使用。')) return null;
  return {period,days,cards,addon};
}
function extract(s,{prior={},sourceRefs=[]}={}) {
  try { const u=new URL(s.url);if(u.origin===origin&&u.pathname==='/article/1'&&!u.search&&!u.hash)return require('./site-literal-profiles-v2.cjs').extract(s,{recordId:'A081',prior,sourceRefs}); } catch { return null; }
  const body=s.body||s.text,at=s.observedAt||s.capturedAt;
  if(!route(s.url)||!s.evidenceId||!Number.isFinite(Date.parse(at))||typeof body!=='string'||s.passwordForm||s.metadata?.passwordForm||s.verificationWidgetObserved||s.metadata?.verificationWidgetObserved) return null;
  const parts=cycleParts(body);if(!parts)return null;
  const {period,days,cards,addon}=parts,u=new URL(s.url);
  if(u.search?u.searchParams.get('cycle')!=='days-'+days:period!=='月付')return null;
  const old=(prior.coreInfo||prior).pricing||{},merged=new Map((old.plans||[]).map(p=>[key(p),p])),fresh=[],sha=hash(body);
  function put(p) {
    const previous=merged.get(key(p)),literalName=p.name,device=p.deviceLimit;
    if(previous&&Date.parse(previous.observedAt)>Date.parse(at)) return false;
    if(previous&&previous.amount!==p.amount) p.priceConflict={previousAmount:previous.amount,previousObservedAt:previous.observedAt,previousSourceIds:previous.sourceIds,reason:'当前门户标价与历史周期资料不同；未验证结账。'};
    else if(previous?.priceConflict) p.priceConflict=previous.priceConflict;
    p=require('./retained-plan-conditions.cjs').preservePlanConditions(previous,p,{sourceRefs});
    p.name=literalName;
    if(device){p.deviceLimit=device;p.maxDevices=null;}
    merged.set(key(p),p);fresh.push(p);return true;
  }
  const base=quote=>({quote,sourceIds:[s.evidenceId],sourceUrl:s.url,observedAt:at,sourceBodySha256:sha,sourceLocator:{kind:'body_utf16_range',start:body.indexOf(quote),end:body.indexOf(quote)+quote.length},currency:null,currencySymbol:'¥',amountBasis:'original_billing_period_total',checkoutVerified:false,scope:'registered_web3_portal_visible_prices'});
  for(const m of cards) {
    const quota=/每周期流量\n(\d+(?:\.\d+)?)GB/.exec(m[6]),ips=/最多 (\d+) 个 IP 同时在线/.exec(m[6]);
    if(!quota||!ips||!m[6].includes('每 30 天自动重置')) return null;
    if(!put({...base(m[0]),name:m[1],productName:m[1],amount:Number(m[3]),billingPeriod:period+' / '+days+' 天',serviceDurationDays:days,quota:'每周期'+quota[1]+'GB（卡片原文；另称每30天重置）',quotaReset:'站方称每30天自动重置；服务有效期为'+days+'天，分别保留，未验证实际执行。',deviceLimit:'最多'+ips[1]+'个IP同时在线；IP数不是设备数。',maxSimultaneousIps:Number(ips[1]),restrictions:['只确认可见标价，不是结账或可用性实测。','每周期流量、每月描述及每30天重置原文保留；不把计费天数当成重置周期。','晚高峰速率和封锁期保证为站方宣传，不是实测速度或稳定率。']})) return null;
  }
  if(!put({...base(addon[0]),name:'流量包【50G】',productName:'流量包【50G】',amount:Number(addon[1]),billingPeriod:'流量补充包；有效期未确认',quota:'额外50GB',quotaReset:'仅补充现有套餐流量，有效期未在此卡核实。',addon:{name:'50GB流量补充包',requiresActiveSubscription:true,standaloneSubscription:false,sourceIds:[s.evidenceId]},restrictions:['必须先有套餐，不能直接作为独立订阅使用。','购买条件和有效期需订单确认页核实；本流程未进入购买页。']})) return null;
  return {pricing:{...old,status:'advertised_not_checkout_verified',plans:[...merged.values()],sourceIds:[...new Set([...(old.sourceIds||[]),s.evidenceId])],observedAt:at,checkoutVerified:false,scope:'registered_web3_portal_visible_prices',limitation:'只更新本次原生周期链接实际展示的标价，未读周期保留旧时间。31/91/366天服务有效期与30天流量重置分开；IP不作设备数，补充包不作独立订阅。'}};
}
module.exports={origin,recordIds:['A081'],fields:['pricing','refund'],collectMany,extract,route,key,cycleControlMatches,cycleParts};
