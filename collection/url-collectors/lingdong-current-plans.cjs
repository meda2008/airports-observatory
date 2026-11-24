'use strict';
const crypto=require('node:crypto'),origin='https://nbqmhk.lingdongttt.sbs';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex'),periods={月:'月付',季:'季付',半年:'半年付',年:'年付',一次性:'一次性'};
function extract(s,{recordId,prior={}}={}){
 if(recordId!=='A177'||!s.evidenceId||!Number.isFinite(Date.parse(s.observedAt))||s.url!==origin+'/#/plans'||s.metadata?.authenticationObserved!==true||s.metadata?.title!=='灵动云'||/checkpoint/.test(s.kind||''))return null;
 const body=s.body,cards=s.metadata.planCards;if(typeof body!=='string'||!Array.isArray(cards)||!cards.length||cards.length>40)return null;
 const plans=[],names=new Set(),bodyHash=sha(body);let supplemental=0;
 for(const card of cards){if(card.headingCount!==1||card.buttonLabel!=='立即订阅'||typeof card.name!=='string'||!card.name||card.name.length>200||names.has(card.name)||typeof card.text!=='string')return null;names.add(card.name);
 const start=body.indexOf(card.text);if(start<0||body.indexOf(card.text,start+1)>=0)return null;
 if(!card.text.startsWith('主推套餐\n'+card.name+'\n')&&!card.text.startsWith('精选方案\n'+card.name+'\n'))return null;
 const m=/\nSTARTING FROM\n¥(\d+\.\d{2})\n\/(月|季|半年|年|一次性)\n包含流量\n([\d.]+(?:GB|TB))\n/.exec(card.text);if(!m||Number(m[1])<=0)return null;
 const monthly=new RegExp('(?:每月(?:享有)?\\s*|月流量[：:]\\s*)'+m[3].replace('.','\\.')).test(card.text),quota=m[3]+(m[2]==='一次性'?'（一次性，站方说明）':monthly?'/月（站方说明）':'（重置周期未说明）');
 const binding={sourceIds:[s.evidenceId],sourceUrl:s.url,observedAt:s.observedAt,quote:card.text,sourceBodySha256:bodyHash,sourceLocator:{kind:'body_utf16_range',start,end:start+card.text.length,bodySha256:bodyHash,quoteSha256:sha(card.text)}};
 const shared={productName:card.name,currency:null,currencySymbol:'¥',currencyStatus:'symbol_only_not_ISO_confirmed',quota,quotaReset:m[2]==='一次性'?'站方称长期有效不过期；未验证履行':monthly?'站方称每月配额；具体重置时点及结转未核实':null,deviceLimit:/设备限制\n不限(?:\n|$)/.test(card.text)?'站方标注不限设备；未验证并发':null,maxDevices:null,checkoutVerified:false,priceStatus:'advertised_not_checkout_verified',...binding};
 const base={...shared,name:card.name+' · '+periods[m[2]],amount:Number(m[1]),amountBasis:'advertised_starting_price_not_period_total',billingPeriod:periods[m[2]],displayBasis:'当前卡片 STARTING FROM 原周期起价；未点击订阅或验证结账。',restrictions:['仅当前账号可见目录；不推定其他账号或续费资格。','卡片明确写STARTING FROM，按起价保留；未确认最终结账总额。','带宽、线路、设备及解锁为站方宣称，不是独立实测。']};
 const promo=/平常季付 ¥(\d+(?:\.\d{1,2})?) \| 现在限定优惠只需 ¥(\d+(?:\.\d{1,2})?)/.exec(card.text);if(promo&&m[2]==='季'&&Number(promo[2])===base.amount)base.discount={label:'站方限时季付文案',listPrice:Number(promo[1]),expiresAt:null,affiliateBinding:'not_verified',status:'advertised_expiry_unconfirmed',conditions:'未给具体到期日，未核实实际优惠资格或结账可用性。',sourceIds:[s.evidenceId]};plans.push(base);
 // Only explicit current cycle totals from a monthly card's complete literal
 // marketing line. A discounted quarterly card's former price is never added.
 if(m[2]==='月'){const line=card.text.split('\n').find(t=>t.startsWith('💰 超值特惠：')),extra=/^💰 超值特惠：季付 ¥(\d+(?:\.\d{1,2})?) \| 半年付 ¥(\d+(?:\.\d{1,2})?) \| 年付 ¥(\d+(?:\.\d{1,2})?)$/.exec(line||'');if(extra)for(const[i,period]of ['季付','半年付','年付'].entries()){const amount=Number(extra[i+1]);if(!Number.isFinite(amount)||amount<=0)return null;plans.push({...shared,name:card.name+' · '+period,amount,amountBasis:'original_billing_period_total',billingPeriod:period,displayBasis:'套餐亮点文案明确列出的周期总额；未切换周期或验证结账。',restrictions:['站方当前卡片文字报价，非本次已选周期控件的结算预览。','优惠、实际可购与服务交付未核实。']});supplemental++;}}
 }
 const old=prior.coreInfo||prior,pricing=require('../../lib/current-public-price-catalog.cjs').currentPublicCatalog(old.pricing||{},{status:'advertised_not_checkout_verified',plans,observedAt:s.observedAt,sourceIds:[s.evidenceId],checkoutVerified:false,observedProductCount:cards.length,observedPeriodPriceCount:plans.length,startingCardPriceCount:cards.length,explicitMarketingCyclePrices:supplemental,operatorIdentityVerified:false,limitation:'原发布页所列灵动云当前登录目录：仅保留默认全部视图明确显示的周期起价，不从可选周期标签推算未显示金额；未点击订阅、下单或付款。不确认ISO币种，不证明法律主体或连续经营。'},'authenticated_lingdong_current_visible_catalog');
 const previous=old.website||{};return{pricing,website:{url:origin+'/',status:'authenticated_named_service_ui_observed',relationship:'authenticated_named_service_ui_continuity_unverified',basis:'本次已授权账号的同名业务目录及原生账号响应已核对；只更新当前可访问入口，不证明历史或法律主体连续经营。',observedBrand:s.metadata.title,operatorIdentityVerified:false,observedAt:s.observedAt,sourceIds:[s.evidenceId],previousEntries:previous.url&&previous.url!==origin+'/'?[...(previous.previousEntries||[]),previous]:previous.previousEntries||[]}};
}
module.exports={origin,recordIds:['A177'],fields:['pricing','website'],extract};
