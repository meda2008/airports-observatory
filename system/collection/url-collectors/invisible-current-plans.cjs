'use strict';
const crypto=require('node:crypto'),origin='https://rfadteb.invisibleattt.sbs',sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function extract(s,{recordId,prior={}}={}){
 if(recordId!=='A164'||s.url!==origin+'/#/plans'||!s.evidenceId||!Number.isFinite(Date.parse(s.observedAt))||s.metadata?.title!=='隐形人'||s.metadata.authenticationObserved!==true||s.kind!=='authorized_account_page')return null;
 const body=s.body,cards=s.metadata.planCards;if(typeof body!=='string'||!body.startsWith('全部套餐\n')||!Array.isArray(cards)||!cards.length||cards.length>40||!s.metadata.buttons?.includes('退出登录'))return null;
 const names=new Set(),starts=[];for(const c of cards){if(c.headingCount!==1||typeof c.name!=='string'||!c.name||names.has(c.name))return null;names.add(c.name);const marker='\n'+c.name+'\n',i=body.indexOf(marker);if(i<0||body.indexOf(marker,i+1)>=0)return null;starts.push(i+1);}if(starts.some((v,i)=>i&&v<=starts[i-1]))return null;
 const periods={月:'月付',季:'季付',半年:'半年付',年:'年付',一次性:'一次性'},plans=[],bodyHash=sha(body);
 for(let i=0;i<cards.length;i++){
  const start=starts[i],end=i+1<starts.length?starts[i+1]:body.length,quote=body.slice(start,end),m=/\nCURRENT OFFER\n¥(\d+\.\d{2})\n\/(月|季|半年|年|一次性)\nAVAILABLE\n/.exec(quote);if(!m||(quote.match(/\nCURRENT OFFER\n/g)||[]).length!==1||Number(m[1])<=0||!quote.includes('\n立即订阅此套餐\n'))return null;
  const quota=/\n月流量\n([\d.]+(?:GB|TB))\n速率\n/.exec(quote);if(!quota)return null;
  const oneoff=m[2]==='一次性',deviceClaims=[...quote.matchAll(/(?:严格限\s*\d+\s*台设备|支持\s*\d+\s*台设备同时[^\n]*)/g)].map(x=>x[0]);
  plans.push({name:cards[i].name+' · '+periods[m[2]],productName:cards[i].name,amount:Number(m[1]),billingPeriod:periods[m[2]],amountBasis:'original_billing_period_total',currency:null,currencySymbol:'¥',currencyStatus:'symbol_only_not_ISO_confirmed',quota:quota[1]+(oneoff?'（一次性；卡片仍标“月流量”，以详情为站方说明）':'/月（站方说明）'),deviceLimit:deviceClaims.length?'卡片称不限设备；详情称'+deviceClaims.join('；')+'，存在冲突，待确认':'卡片称不限设备；未实测',maxDevices:null,checkoutVerified:false,priceStatus:'advertised_not_checkout_verified',displayBasis:'当前全部套餐视图 CURRENT OFFER 明确周期报价；未切换其他周期、未验证结账。',restrictions:['只保留实际显示周期价格，其他可选周期未报出金额，不推算。','线路、速度、解锁、长期有效及设备条件为站方自述，未独立实测。'],sourceIds:[s.evidenceId],sourceUrl:s.url,observedAt:s.observedAt,quote,sourceBodySha256:bodyHash,sourceLocator:{kind:'body_utf16_range',start,end,bodySha256:bodyHash,quoteSha256:sha(quote)}});
 }
 const old=prior.coreInfo||prior,pricing=require('../../lib/current-public-price-catalog.cjs').currentPublicCatalog(old.pricing||{},{status:'advertised_not_checkout_verified',plans,observedAt:s.observedAt,sourceIds:[s.evidenceId],checkoutVerified:false,observedProductCount:cards.length,observedPeriodPriceCount:plans.length,operatorIdentityVerified:false,limitation:'当前登录账户可见套餐目录。仅记录明确展示的周期原价；不使用“约8元/月”替代年付109，不把其他可选周期推算为报价。'},'authenticated_invisible_current_visible_catalog');
 return{pricing};
}
module.exports={origin,recordIds:['A164'],fields:['pricing'],extract};
