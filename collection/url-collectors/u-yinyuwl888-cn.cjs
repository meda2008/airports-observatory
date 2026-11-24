'use strict';
const crypto=require('node:crypto');
const origin='https://u.yinyuwl888.cn';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const allowedNames=['月卡','季卡','半年卡','年卡','VIP月卡','VIP季卡','VIP半年卡','VIP年卡'];
function extract(s,{recordId,prior={}}={}){
 if(recordId&&recordId!=='A217')return null;
 const u=new URL(s.url);if(u.origin!==origin||u.pathname!=='/purchase-plan'||!s.evidenceId||!Number.isFinite(Date.parse(s.observedAt)))return null;
 const body=s.body||s.text||'',category=body.split('\n')[0],cards=s.metadata?.planCards;
 if(!['普通付费套餐','VIP付费套餐'].includes(category)||!Array.isArray(cards)||cards.length!==4)return null;
 const plans=[];
 for(const c of cards){const m=/^(VIP)?(月卡|季卡|半年卡|年卡)\n¥(\d+(?:\.\d{1,2})?)\n¥(\d+(?:\.\d{1,2})?)\n\n流量: 无限\n\n天数: (\d+)(?: \(赠: (\d+)天\))?\n\n设备数: (\d+)$/.exec(c.quote||'');
  if(!m||!allowedNames.includes(m[1]?m[1]+m[2]:m[2])||Boolean(m[1])!==(category==='VIP付费套餐')||c.struckPrices?.length!==1||c.struckPrices[0]!=='¥'+m[4]||Number(m[3])>=Number(m[4]))return null;
  const start=body.indexOf(c.quote);if(start<0||body.indexOf(c.quote,start+1)>=0)return null;
  const period={'月卡':'月付','季卡':'季付','半年卡':'半年付','年卡':'年付'}[m[2]],name=(m[1]||'')+m[2];
  plans.push({name,productName:name,amount:Number(m[3]),amountBasis:'original_billing_period_total',originalAmount:Number(m[4]),originalAmountBasis:'visible_struck_reference_price_not_current_charge',currency:null,currencySymbol:'¥',currencyStatus:'symbol_only_not_ISO_confirmed',billingPeriod:period,billingDays:Number(m[5]),giftDays:Number(m[6]||0),quota:'站方标注流量无限',quotaQuote:'流量: 无限',deviceLimit:m[7]+' 台设备',deviceCount:Number(m[7]),quote:c.quote,sourceIds:[s.evidenceId],sourceUrl:s.url,observedAt:s.observedAt,sourceBodySha256:sha(body),sourceLocator:{kind:'body_utf16_range',start,end:start+c.quote.length,quoteSha256:sha(c.quote),bodySha256:sha(body)},checkoutVerified:false,priceStatus:'advertised_not_checkout_verified',restrictions:['仅登录后商店当前标价，未建单、付款或验证结账价。','划线金额仅为参考原价，不用作当前售价；保留原文天数和赠送天数。','当前登记官网原生用户中心的报价，不证明历史经营主体连续、独立测速或服务效果。']});
 }
 if(new Set(plans.map(p=>p.name)).size!==4)return null;
 const old=(prior.coreInfo||prior).pricing||{},merged=new Map((old.plans||[]).map(p=>[p.productName||p.name,p]));for(const p of plans){const previous=merged.get(p.productName);if(!previous||Date.parse(previous.observedAt)<=Date.parse(p.observedAt))merged.set(p.productName,p);}
 return{pricing:{...old,status:'advertised_not_checkout_verified',plans:[...merged.values()],sourceIds:[...new Set([...(old.sourceIds||[]),s.evidenceId])],observedAt:s.observedAt,checkoutVerified:false,scope:'current_native_linked_account_portal_prices',operatorIdentityVerified:false,limitation:'官网原生用户中心可见报价；仅价格与列明条件已按原文核对，未证明法律主体或历史经营连续。'}};
}
async function collectMany(tab){
 let u=new URL(await tab.url());
 if(u.origin===origin&&['/','/my-account'].includes(u.pathname)){
  const link=tab.playwright.getByRole('link',{name:'购买套餐',exact:true}),href=await link.getAttribute('href');
  const target=href?new URL(href,u):null;
  if(!target||target.origin!==origin||target.pathname!=='/purchase-plan')throw Error('heibao_native_shop_link_not_verified');
  await link.click();u=new URL(await tab.url());
 }
 if(u.origin!==origin||u.pathname!=='/purchase-plan')return{captures:[],checkpoint:{type:'login_or_purchase_plan_navigation_required',url:origin+'/purchase-plan'},orderSubmitted:false,paymentExecuted:false};
 const captures=[];for(const category of ['普通付费套餐','VIP付费套餐']){
  await tab.playwright.getByRole('tab',{name:category,exact:true}).click();let value;
  for(let n=0;n<20;n++){value=await tab.playwright.evaluate(()=>({category:document.querySelector('[role=tab][aria-selected=true]')?.innerText,cards:[...document.querySelectorAll('button')].filter(b=>/流量:|流量：/.test(b.innerText)).map(b=>({quote:b.innerText,struckPrices:[...b.querySelectorAll('*')].filter(e=>e.children.length===0&&/^¥\d/.test(e.innerText)&&getComputedStyle(e).textDecorationLine.includes('line-through')).map(e=>e.innerText)}))}));if(value.category===category&&value.cards.length===4)break;await tab.playwright.waitForTimeout(250);}
  if(value.category!==category||value.cards.length!==4)throw Error('heibao_plan_category_not_ready');
  captures.push({url:u.href,body:category+'\n\n'+value.cards.map(c=>c.quote).join('\n\n'),observedAt:new Date().toISOString(),kind:'authorized_account_page',metadata:{representation:'visible_dom_selected_card_innerText_joined_by_double_newline',selectedFilter:category,planCards:value.cards,orderSubmitted:false,paymentExecuted:false}});
 }
 return{captures,orderSubmitted:false,paymentExecuted:false};
}
module.exports={origin,recordIds:['A217'],fields:['pricing'],extract,collectMany,readOnlyRecipe:'heibao_account_plan_tabs_readonly'};
