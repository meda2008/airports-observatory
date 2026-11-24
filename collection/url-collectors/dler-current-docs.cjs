'use strict';
const origin='https://docs.dler.io';
function extract(s,{prior={}}={}){
 const u=new URL(s.url),core=prior.coreInfo||prior;
 if(u.origin!==origin||u.pathname!=='/account/plans.html'||s.title!=='购买、续费与切换 | oixCloud'||!s.text?.startsWith('购买、续费与切换')||!s.links?.some(l=>l.label==='套餐商店'&&l.url==='https://oixcloud.com/user/shop')||!Number.isFinite(Date.parse(s.capturedAt)))return null;
 const old=core.website||{},historicalWebsites=[...(old.historicalWebsites||[])];if(old.url&&old.url!=='https://oixcloud.com/'){const {historicalWebsites:unused,...previous}=old;if(!historicalWebsites.some(h=>h.url===old.url))historicalWebsites.push(previous);}
 return{website:{...old,url:'https://oixcloud.com/',previousUrl:'https://dler.io/',status:'registered_zone_documentation_native_store_link_observed',relationship:'current_dler_documentation_links_oixcloud_not_legacy_succession_proof',basis:'原登记域dler.io的文档子域docs.dler.io当前标题为oixCloud，原生“套餐商店”链接实际打开oixcloud.com/user/shop并读到套餐。仅确认本次入口关联；不证明原Dler恢复、经营主体连续或旧账户权益继承。与A015同一当前商店，不作独立信源或独立运营商计数。',operatorIdentityVerified:false,legacyContinuityVerified:false,sourceGroupId:'oixcloud_current_authenticated_store',relatedRecordIds:['A015'],historicalWebsites,observedAt:s.capturedAt,sourceIds:[s.evidenceId].filter(Boolean)}};
}
module.exports={origin,recordIds:['A184'],fields:['website'],extract};
