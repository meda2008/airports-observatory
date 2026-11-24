'use strict';
const pageIds=new WeakMap();
function pageTab(page){
 if(!pageIds.has(page))pageIds.set(page,require('node:crypto').randomUUID());
 return {id:page.id||pageIds.get(page),url:async()=>page.url(),playwright:page,screenshot:options=>page.screenshot(options)};
}
// Adapt server Playwright to the same visible-page state machine used in IAB.
async function observeVerification(page,options){
 const shared=await import('../collection/challenge.mjs');
 const result=await shared.observeVerification(pageTab(page),options);
 return {...result,status:result.type==='network_policy_block'?'access_blocked_by_network_policy':result.type?'challenge_requires_current_confirmation':'clear'};
}
async function ensureVerification(page,{confirmationProvider,ocr,captcha,initial}={}){
 initial=initial||await observeVerification(page);
 if(!initial.type||initial.type==='network_policy_block'||!confirmationProvider)return initial;
 const tab=pageTab(page),confirmation=await confirmationProvider({tabId:tab.id,url:initial.snapshot.url,type:initial.type});
 if(!confirmation)return initial;
 let action;
 try{action=await(await import('../collection/verification-actions.mjs')).performConfirmedVerification({tab,confirmation,ocr,captcha});}
 catch{return {...initial,resolutionStatus:'verification_action_failed'};}
 if(action.status==='captcha_filled')return {...initial,type:null,status:'captcha_filled',resolution:action};
 const after=await observeVerification(page);
 return {...after,resolution:action};
}
function checkpointFor(result,{stage,redact}){
 if(!result.type)return null;
 const u=new URL(result.snapshot.url);u.search='';u.hash='';
 return {url:u.href,type:result.type,stage,observedAt:new Date().toISOString(),
  body:redact(result.snapshot.text),actionTaken:!!result.actionTaken,waitAttempted:!!result.waitAttempted,
  status:result.type==='network_policy_block'?'access_blocked_by_network_policy':'awaiting_current_confirmation',nextAction:result.type==='network_policy_block'?'Retain the blocked origin and continue other sites. Resume only after the site access policy changes or a new attributable entry is found; CAPTCHA clicks do not resolve an ASN ban.':'Complete verification in the authorized browser session, then retry; a fresh server context may require verification again.'};
}
module.exports={observeVerification,ensureVerification,checkpointFor};
