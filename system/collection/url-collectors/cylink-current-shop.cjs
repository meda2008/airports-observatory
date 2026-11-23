'use strict';
const crypto=require('node:crypto');
function extract(s,{recordId,prior={}}={}){
 if(recordId!=='A046'||!s.evidenceId||!Number.isFinite(Date.parse(s.observedAt))||/checkpoint/.test(s.kind||''))return null;
 let u;try{u=new URL(s.url);}catch{return null;}if(u.origin!=='https://cylink.go443.pro'||u.pathname!=='/user/shop'||u.search||u.hash)return null;
 const body=s.body||'';if(!body.startsWith('CYLINK\n用户中心\n')||!body.endsWith('2020© CYLINK\nSSPANEL\nMetron'))return null;
 const hash=crypto.createHash('sha256').update(body).digest('hex');const ref=(quote,start)=>({quote,sourceIds:[s.evidenceId],sourceUrl:s.url,observedAt:s.observedAt,sourceBodySha256:hash,sourceLocator:{kind:'body_utf16_range',start,end:start+quote.length,quoteSha256:crypto.createHash('sha256').update(quote).digest('hex')}});
 const matches=[...body.matchAll(/^(试用套餐|入门套餐|大众套餐|狂热套餐)\n(一周|月付\n季度\n半年\n年付)\n (\d+\.\d{2})\n此商品无限制购买\n会员等级\n([^\n]+)\n等级时长\n(\d+) 天\n添加流量\n(\d+) GB\n重置周期\n([^\n]+)\n同时在线\n([^\n]+)\n峰值速率\n(\d+)Mbps\n描述\n[^]*?\n购买(?=\n|$)/gm)];
 if(matches.length!==4||new Set(matches.map(m=>m[1])).size!==4)return null;
 const plans=matches.map(m=>({name:m[1],amount:Number(m[3]),amountBasis:'visible_default_option_total',billingPeriod:m[2]==='一周'?'一周（页面等级时长另列10天，存在冲突）':'默认选项（页面等级时长'+m[5]+'天）',currency:null,currencyStatus:'not_shown',quota:m[6]+' GB',quotaReset:m[7],deviceLimit:m[8],maxDevices:/^\d+个设备$/.test(m[8])?Number(m[8].match(/^\d+/)[0]):null,checkoutVerified:false,priceStatus:'advertised_not_checkout_verified',...ref(m[0],m.index),restrictions:['仅当前可见默认价签；未切换周期、未下单。','周期标签存在多个选项，选中态未留存，不把等级时长推断为月付或年付总价。','站方峰值速率为限额声明，不是独立测速。']}));
 const pricing=require('../../lib/current-public-price-catalog.cjs').currentPublicCatalog((prior.coreInfo||prior).pricing||{},{status:'advertised_not_checkout_verified',plans,observedAt:s.observedAt,sourceIds:[s.evidenceId],checkoutVerified:false,observedProductCount:4,observedPeriodPriceCount:4,limitation:'当前默认选项金额；周期选中态和试用一周/10天冲突待核，其他周期不推算。'},'official_visible_cylink_default_option_cards');
 return {pricing};
}
module.exports={origin:'https://cylink.go443.pro',recordIds:['A046'],fields:['pricing'],extract};
