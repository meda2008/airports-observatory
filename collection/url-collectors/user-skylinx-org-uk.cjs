'use strict';
const origin='https://user.skylinx.org.uk';
function extract(s,{prior={}}={}){
 const u=new URL(s.url),core=prior.coreInfo||prior,announcement=core.website?.announcedEntries?.find(x=>x.url===origin+'/'&&x.sourceIds?.length);
 if(u.origin!==origin||u.hash!=='#/login'||!announcement||!s.passwordForm||!/(?:^|\n)SkyLinX(?:\n|$)/.test(s.text)||!/登入/.test(s.text))return null;
 const sourceIds=[...new Set([...(core.website.sourceIds||[]),...announcement.sourceIds,s.evidenceId].filter(Boolean))];
 return{website:{...core.website,url:origin+'/',previousUrl:core.website.url,status:'operator_announced_entry_login_observed',relationship:'retained_operator_notice_and_current_named_login',basis:'旧站2026-10-29已保存公告明确列出该新入口；本轮实际读到同名SkyLinX登录页。仅确认公告指向与当前页面可达，没有向新域名提交凭据，未证明法律主体或持续经营。',operatorIdentityVerified:false,observedAt:s.capturedAt,sourceIds,announcedEntries:core.website.announcedEntries.map(x=>x.url!==origin+'/'?x:{...x,status:'named_login_observed',observedAt:s.capturedAt,currentSourceIds:[s.evidenceId].filter(Boolean)}),credentialPropagationAllowed:false}};
}
module.exports={origin,recordIds:['A060'],fields:['website'],extract};
