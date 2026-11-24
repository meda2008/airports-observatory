'use strict';
const crypto=require('node:crypto');
const origin='https://vpnjs.net',url=origin+'/zh-hans/faq';
const paymentQuote='目前支持支付宝、微信相册扫码支付、银行卡支付方式等。';
function extract(s,{recordId}={}){
 if(recordId!=='A217'||s.url!==url||!s.evidenceId||!Number.isFinite(Date.parse(s.observedAt))||s.metadata?.pageTitle!=='常见问题 | 黑豹加速器')return null;
 const body=s.body||'',start=body.indexOf(paymentQuote);
 if(start<0||body.indexOf(paymentQuote,start+1)>=0||!body.includes('黑豹加速器(HeibaoVPN)官方'))return null;
 return{payment:{status:'operator_payment_statement_observed',methods:['支付宝','微信支付','银行卡'],summary:'官网帮助页称支持支付宝、微信相册扫码和银行卡；未验证登录收银台。',quote:paymentQuote,sourceIds:[s.evidenceId],sourceUrl:url,observedAt:s.observedAt,evidenceLevel:'primary_page_observed',checkoutObserved:false,transactionVerified:false,sourceBodySha256:crypto.createHash('sha256').update(body).digest('hex'),sourceLocator:{kind:'body_utf16_range',start,end:start+paymentQuote.length},conditions:['仅官网帮助页声明，不证明当前收银台可用、手续费或实际到账。','没有取得付费套餐报价；不把每日免费时长写成零元付费套餐。','官网导航到用户中心不证明与本机安装包或历史运营主体相同。']}};
}
async function collectMany(tab){
 if(await tab.url()!==url)return{captures:[],checkpoint:{type:'official_faq_navigation_required',url},orderSubmitted:false,paymentExecuted:false};
 for(const name of ['黑豹加速器是一个永久免费的VPN吗？','关于购买套餐以及付款成功却没到账等相关问题。']){
  const button=tab.playwright.getByRole('button',{name,exact:true});
  if(await button.getAttribute('aria-expanded')!=='true')await button.click();
 }
 const value=await tab.playwright.evaluate(()=>({pageTitle:document.title,body:[...document.querySelectorAll('#accordion-content-node-148,#accordion-content-node-149')].map(e=>e.innerText).join('\n\n')}));
 if(!value.body.includes(paymentQuote))throw Error('heibao_official_faq_not_ready');
 return{captures:[{url,body:value.body,observedAt:new Date().toISOString(),kind:'operator_visible_page',metadata:{pageTitle:value.pageTitle,representation:'visible_expanded_official_FAQ_innerText'}}],orderSubmitted:false,paymentExecuted:false};
}
module.exports={origin,recordIds:['A217'],fields:['payment'],extract,collectMany,readOnlyRecipe:'heibao_official_faq_readonly'};
