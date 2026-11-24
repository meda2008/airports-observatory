'use strict';
const {routeKey,routePriority}=require('./unread-route-planner.cjs');
const originOf=value=>{try{return new URL(value).origin;}catch{return null;}};
function policyLink(link,fields){
 let u;try{u=new URL(link.url);}catch{return false;}
 if(u.protocol!=='https:'||u.username||u.password)return false;
 if(/(^|\.)(telegram\.org|github\.com|google\.com|apple\.com|microsoft\.com|cloudflare\.com)$/.test(u.hostname))return false;
 const text=String(link.label||'')+' '+u.pathname+' '+u.hash;
 if(/logout|delete|cancel|checkout|subscribe|purchase|order|invite|affiliate|reset|download|\.apk|\.exe|\.dmg/i.test(text))return false;
 if([...u.searchParams.keys()].some(k=>!/^(id|article|lang|locale|page)$/i.test(k)))return false;
 return routePriority(link,fields)>0&&/退款|退费|条款|隐私|常见问题|帮助|refund|terms|privacy|tos|faq|help|knowledge|docs/i.test(text);
}
function planNativePolicies({records,pages,attempts=[]}){
 const seen=new Set(pages.map(p=>routeKey(p.url)).filter(Boolean));
 const localeKey=value=>{try{const u=new URL(routeKey(value));u.pathname=u.pathname.replace(/^\/[a-z]{2}(?:-[A-Za-z]+)?(?=\/docs\/)/,'');return u.href;}catch{return null;}};
 const seenLocales=new Set(pages.map(p=>localeKey(p.url)).filter(Boolean));
 const blocked=new Set(attempts.filter(a=>a.url).map(a=>a.recordId+'|'+routeKey(a.url)));
 const blockedOrigins=new Set(attempts.filter(a=>originOf(a.url)&&/verification|protection|browser_policy/.test(a.status||'')).filter(a=>!pages.some(p=>p.grade==='E1'&&p.recordIds?.includes(a.recordId)&&originOf(p.url)===originOf(a.url)&&Date.parse(p.capturedAt)>Date.parse(a.finishedAt||''))).map(a=>a.recordId+'|'+originOf(a.url)));
 const candidates=new Map();
 for(const record of records){if(record.excluded||!record.fields.length)continue;
  for(const page of pages.filter(p=>p.recordIds?.includes(record.id)&&p.grade==='E1')){
   for(const link of page.links||[]){const key=routeKey(link.url);if(!key||seen.has(key)||seenLocales.has(localeKey(link.url))||blocked.has(record.id+'|'+key)||blockedOrigins.has(record.id+'|'+new URL(link.url).origin)||!policyLink(link,record.fields))continue;
    if(key===routeKey(page.url))continue;
    const id=record.id+'|'+key;if(candidates.has(id))continue;
    candidates.set(id,{recordId:record.id,name:record.name,url:link.url,label:link.label,priority:routePriority(link,record.fields),parentUrl:page.url,parentSourceId:page.sourceId,parentCapturedAt:page.capturedAt,parentFile:page.file,parentSha256:page.sha256,crossOrigin:new URL(link.url).origin!==new URL(page.url).origin,status:'unread_native_link_requires_page_review',automaticFactAdmission:false});
   }
  }
 }
 return [...candidates.values()].sort((a,b)=>b.priority-a.priority||a.recordId.localeCompare(b.recordId)||a.url.localeCompare(b.url));
}
module.exports={policyLink,planNativePolicies};
