'use strict';
const sha=s=>require('crypto').createHash('sha256').update(s).digest('hex');
const origin='https://oixcloud.com',captureKind='oix_visible_selected_period_cards_v1';
const names=new Set(['Pass Iron','Pass Alu','Pass Bronze','Pass Silver','Pass Gold','Pass Platinum','Pass Diamond','Pass Titanium','Team Licenses','Enterprise Licenses','Real-time payment','Developer Licenses']);
const currencyQuote='美元金额仅供参考，账户余额、订单确认与实际扣款均以人民币 CNY 为准';
function extract(snapshot,{prior={}}={}){
 const normalized=typeof snapshot.body==='string'&&!!snapshot.observedAt,s={...snapshot.metadata,...snapshot,text:snapshot.text||snapshot.body||'',capturedAt:snapshot.capturedAt||snapshot.observedAt};
 const financial=require('./oixcloud-financial.cjs').extract(s,{prior});if(financial)return financial;
 const u=new URL(s.url),text=s.text||'',observedAt=s.capturedAt,core=prior.coreInfo||prior,old=core.pricing||{};
 if(u.origin!==origin||u.pathname!=='/user/shop'||s.captureKind!==captureKind||(s.recordId&&!['A015','A184'].includes(s.recordId))||!Number.isFinite(Date.parse(observedAt))||!text.includes(currencyQuote)&&!text.includes('USD prices are estimates. Balances, order confirmation and charges remain in CNY.')||!Array.isArray(s.cards)||!s.cards.length||s.passwordForm||s.verificationWidgetObserved)return null;
 const englishCurrencyQuote='USD prices are estimates. Balances, order confirmation and charges remain in CNY.';const english=text.includes(englishCurrencyQuote)&&s.billingSelection?.scope==='visible_global_aria_pressed'&&s.billingSelection.currency==='CNY'&&text.includes(s.billingSelection.label);
 const plans=[];
 for(const c of s.cards){
  if(!names.has(c.name)||typeof c.text!=='string'||!text.includes(c.text.trim()))return null;
  if(c.name==='Developer Licenses')continue; // Eligibility is not a zero-price public offer.
  let m=c.text.match(/(?:^|\n)CN¥\s*\n(\d+\.\d{2})\s*\n\/ (月付|季付|半年付|年付)\s*(?:\n|$)/);
  if(!m&&english){const e=c.text.match(/(?:^|\n)CN¥\s*\n(\d+\.\d{2})\s*\n\/ (Monthly|Quarterly|Semiannual|Annual)\s*(?:\n|$)/);if(e&&e[2]===s.billingSelection.label)m=[e[0],e[1],s.billingSelection.period];}
  if(!m)return null;const period=m[2],metered=c.name==='Real-time payment';
  if(metered?c.selectedPeriod?.length!==0:c.selectedPeriod?.length!==1||c.selectedPeriod[0]!==period)return null;
  const quota=c.text.match(/(?:高速流量|High-speed data)\s*\n([\d.]+) GiB/),unit=c.text.match(/流量单价\s*\nCN¥([\d.]+) \/ GiB/);
  if(!metered&&!quota||metered&&(!unit||!c.text.includes('账户余额 ≥ ¥1200')))return null;
  const p={name:c.name+' · '+period,productName:c.name,amount:Number(m[1]),amountBasis:'original_billing_period_total',currency:'CNY',currencySymbol:'CN¥',currencyStatus:'explicit_store_settlement_currency',currencyQuote:english?englishCurrencyQuote:currencyQuote,billingPeriod:period,quota:metered?'按实际流量计费；开通费不包含预付流量':quota[1]+' GiB（此周期卡片显示额度）',quotaReset:'仅记录选中周期的卡片额度；不推断为每月重置。',soldOut:/^(?:售罄|Sold Out)\s*$/m.test(c.text),quote:c.text.trim(),observedAt,sourceUrl:s.url,sourceIds:[s.evidenceId].filter(Boolean),checkoutVerified:false,priceStatus:'advertised_not_checkout_verified',displayScope:'current_authenticated_account_store_not_legacy_service_continuity',restrictions:['当前已登录账号的商店显示价；折扣资格、到期、续费价和最终结账金额未核实。','原dler.io文档子域原生链接此商店，只证明本次页面关联，不证明原Dler经营主体、权益继承或恢复运营。','与A015为同一oixCloud商店来源，不计作独立信源；临界值不是设备数量。']};
  if(normalized){const start=text.indexOf(p.quote);if(start<0||text.lastIndexOf(p.quote)!==start)return null;p.sourceBodySha256=sha(text);p.sourceLocator={kind:'body_utf16_range',start,end:start+p.quote.length,quoteSha256:sha(p.quote)};}
  if(p.soldOut)p.restrictions.push('采集时卡片标注售罄，不能视为当前可购买。');
  if(metered){p.additionalCharges={perGiB:Number(unit[1]),currency:'CNY',minimumAccountBalance:1200,openingFee:Number(m[1]),quote:c.text.slice(0,c.text.indexOf('单端限速')).trim(),basis:'opening_fee_plus_metered_traffic_not_all_in_subscription'};p.restrictions.push('卡片显示年开通费 '+p.amount+' CNY，另按 '+unit[1]+' CNY/GiB 扣费；账户余额须 ≥1200 CNY。开通费不包含流量，不能视为全年总支出。');}
  plans.push(p);
 }
 if(!plans.length)return null;
 const key=p=>p.productName+'|'+p.billingPeriod,merged=new Map((old.plans||[]).map(p=>[key(p),p]));for(const p of plans)merged.set(key(p),p);
 return{pricing:{...old,status:'advertised_not_checkout_verified',plans:normalized?plans:[...merged.values()],...(normalized?{priorPlansNotRevalidated:require('../../lib/current-public-price-catalog.cjs').currentPublicCatalog(old,{plans},'oix_current_visible').priorPlansNotRevalidated}:{}),sourceIds:[s.evidenceId].filter(Boolean),observedAt,checkoutVerified:false,sourceGroupId:'oixcloud_current_authenticated_store',legacyContinuityVerified:false,operatorIdentityVerified:false,limitation:'仅原dler.io文档子域原生链接的oixCloud商店当前账号显示价；不是旧Dler恢复、同经营主体或历史权益继承的证明。CNY总额按选中周期记录，售罄、按量开通费与流量单价分别保留；与A015同源。'}};
}
async function collectMany(tab){return(await import('../site-recipes/oixcloud-shop.mjs')).collectOixReadOnly(tab);}
module.exports={origin,recordIds:['A015','A184'],fields:['pricing','payment','refund','privacy','compatibility'],captureKind,currencyQuote,extract,collectMany,readOnlyRecipe:'oix_store_or_financial_readonly_no_order'};
