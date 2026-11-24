'use strict';
const crypto=require('node:crypto'),sha=s=>crypto.createHash('sha256').update(s).digest('hex'),origin='https://hutao.cloud',url=origin+'/';
function extract(s,{recordId,prior={},observations=[]}={}){
 const b=s?.body,m=s?.metadata||{};
 if(recordId!=='A011'||s.url!==url||typeof b!=='string'||!s.evidenceId||!Number.isFinite(Date.parse(s.observedAt))||s.sha256&&s.sha256!==sha(b)||m.passwordForm||m.verificationWidgetObserved||!b.includes('HutaoCloud')||!b.includes('套餐与价格')||!String(m.title||'').startsWith('HutaoCloud'))return null;
 const publisher=observations.find(o=>o.evidenceId&&require('../hutao-publisher-contract.cjs').links(o).some(l=>l.url===url)&&Math.abs(Date.parse(o.observedAt)-Date.parse(s.observedAt))<=86400000);if(!publisher)return null;
 const plans=[],re=/(迷你套餐|专业套餐|商务套餐)\s*\n¥(\d+(?:\.\d{1,2})?)\s+每月\s*\n(?:✓\s*\n)?套餐流量：(\d+)GB\s*\n(?:✓\s*\n)?套餐有效期：(\d+)天\s*\n(?:✓\s*\n)?同时在线：(\d+)个设备\s*\n前往购买/g;
 for(const x of b.matchAll(re)){if(Number(x[2])<=0||Number(x[3])<=0||Number(x[4])<=0||Number(x[5])<=0)return null;plans.push({name:x[1],productName:x[1],amount:Number(x[2]),amountBasis:'original_billing_period_total',billingPeriod:'月付',currency:null,currencySymbol:'¥',currencyStatus:'symbol_only_not_ISO_confirmed',quota:x[3]+'GB',duration:x[4]+'天',maxDevices:Number(x[5]),deviceLimit:x[5]+'个同时在线设备（站方条款）',quote:x[0],sourceUrl:url,sourceIds:[s.evidenceId,publisher.evidenceId],observedAt:s.observedAt,sourceBodySha256:sha(b),sourceLocator:{kind:'body_utf16_range',start:x.index,end:x.index+x[0].length,quoteSha256:sha(x[0])},checkoutVerified:false,priceStatus:'advertised_not_checkout_verified',restrictions:['官网公开页标价，未登录或验证结账金额。','发布页同时列出原入口与本永久入口；非独立信源交叉证明或法律主体连续经营证明。','设备条件为站方自述，未测量速度或稳定性。']});}
 if(plans.length!==3||new Set(plans.map(p=>p.name)).size!==3)return null;
 return{pricing:require('../../lib/current-public-price-catalog.cjs').currentPublicCatalog((prior.coreInfo||prior).pricing||{},{status:'advertised_not_checkout_verified',plans,sourceIds:[s.evidenceId,publisher.evidenceId],observedAt:s.observedAt,checkoutVerified:false,scopeIdentity:'native_publisher_current_entry_relationship_not_legal_entity_proof'},'hutao_public_permanent_entry_catalog')};
}
module.exports={origin,url,recordIds:['A011'],fields:['pricing'],extract};
