'use strict';
const crypto=require('node:crypto');
const {routeKey}=require('./unread-route-planner.cjs');
const priority=['pricing','payment','refund'];
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function routeFieldHints(link){
 const lines=String(link.label||'').split('\n').map(t=>t.trim()).filter(Boolean),category=/^(开始使用|账号与套餐|客户端安装|连接排查|服务说明)$/;const title=category.test(lines[0]||'')?lines[1]||'':lines[0]||'';
 const t=title+' '+new URL(link.url).pathname,fields=[];
 if(/退款|退费|退还|refund|money.?back/i.test(t))fields.push('refund');
 if(/隐私|privacy|cookie/i.test(t))fields.push('privacy');
 if(/条款|协议|terms|\/tos(?:\/|$)|\/policy(?:\/|$)/i.test(t))fields.push('refund','privacy','compatibility');
 if(/支付|付款|充值|payment|billing|cashier/i.test(t))fields.push('payment');
 if(/套餐|价格|报价|续费|购买|pricing|plans|renewal|purchase/i.test(t))fields.push('pricing','payment');
 if(fields.length)return[...new Set(fields)];
 if(/客户端|安装|导入|订阅更新|连接排查|游戏|流媒体|节点地区|地区内容|登录|iPhone|iPad|client|tutorial|streaming|regions|gaming|account-login|contact-cooperation|connection-|stale-proxy|no-network|choose-client|import-update|ios-tiktok/i.test(t))return['compatibility'];
 return null;
}
function origin(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.origin:null;}catch{return null;}}
function readOnlyPolicyLink(link){
 let u;try{u=new URL(link.url);}catch{return false;}
 if(/^\s*(English|简体中文|繁體中文|日本語|中文|en|zh-CN|zh-TW)\s*$/i.test(String(link.label||'')))return false;
 const label=String(link.label||'')+' '+u.pathname+' '+u.hash;
 return !!origin(u.href)&&!/logout|delete|cancel|checkout|subscribe|purchase|order|invite|affiliate|reset|\.exe|\.apk|\.dmg|\.pkg/i.test(label)&&!/\.(?:png|jpe?g|webp|gif|svg|ico|mp4|webm|woff2?|css|js)(?:$|[?#])/i.test(u.pathname)&&!/[?&](token|password|secret|auth|code)=/i.test(u.href)&&/退款|退费|隐私|条款|用户协议|常见问题|知识库|帮助|refund|privacy|terms|tos|faq|knowledge|help|docs/i.test(label);
}
function buildWebsiteCollectors({records,configs=[],pages=[],attempts=[],parserFor=()=>null}){
 const groups=new Map(),unbound=[];
 for(const r of records.filter(r=>r.primary!==false)){
  const o=origin(r.coreInfo?.website?.url);if(!o){unbound.push({recordId:r.id,name:r.name,status:'official_origin_unresolved',missingFields:r.missingFields});continue;}
  let c=groups.get(o);if(!c){c={schemaVersion:'airports-website-collector.v1',collectorId:'url-'+hash(o).slice(0,20),origin:o,recordIds:[],records:[],entryUrls:[],readTasks:[],crossOriginCandidates:[],capabilities:{},policy:{credentialOrigin:o,allowPayment:false,automaticAgreementAcceptance:false,automaticCaptchaCompletion:false,reviewRequired:true},refreshIntervalMs:7*86400000};groups.set(o,c);}
  c.recordIds.push(r.id);c.records.push({recordId:r.id,name:r.name,websiteStatus:r.coreInfo.website.status,missingFields:r.missingFields,sourceIds:r.coreInfo.website.sourceIds||[]});
  c.entryUrls.push(r.coreInfo.website.url);
 }
 const seen=new Set([...pages.filter(p=>p.grade==='E1').map(p=>routeKey(p.url)),...records.flatMap(r=>(r.storeSnapshot?.evidence||[]).map(e=>routeKey(e.url)))]),attempted=new Set(attempts.map(a=>routeKey(a.url)));
 for(const c of groups.values()){
  c.recordIds.sort();c.records.sort((a,b)=>a.recordId.localeCompare(b.recordId));c.entryUrls=[...new Set(c.entryUrls)].sort();
  c.targetFields=[...new Set(c.records.flatMap(r=>r.missingFields))];c.priorityFields=priority.filter(f=>c.targetFields.includes(f));
  const profiles=configs.filter(p=>c.recordIds.includes(p.recordId)&&origin(p.entryUrl)===c.origin),auths=[...new Map(profiles.filter(p=>p.auth).map(p=>[JSON.stringify(p.auth),p.auth])).values()];
  const parser=parserFor(c.origin);
  c.policy.publicOnly=profiles.some(p=>p.publicOnly===true);if(c.policy.publicOnly)c.policy.credentialOrigin=null;
  c.policy.accountReadOnly=profiles.some(p=>p.accountReadOnly===true);
  c.capabilities={literalParser:parser?{recordIds:parser.recordIds,fields:parser.fields}:null,readOnlyRecipe:parser?.readOnlyRecipe||null,auth:auths.length===1?auths[0]:null,authStatus:auths.length>1?'conflicting_site_recipes':auths.length?'site_specific_recipe':'generic_visible_form_only',knowledgeAdapter:profiles.some(p=>p.knowledgeAdapter),includeClientGuides:profiles.some(p=>p.includeClientGuides)};
  const registrations=[...new Map(profiles.filter(p=>p.registrationProfile).map(p=>[JSON.stringify(p.registrationProfile),p.registrationProfile])).values()];c.capabilities.registrationProfile=registrations.length===1?registrations[0]:null;
  c.aliasPolicy='Shared origin deduplicates navigation; each record retains its own identity and fact binding. No alias fact propagation.';
  const routes=new Map(),external=new Map();
  for(const page of pages.filter(p=>p.grade==='E1'&&origin(p.url)===c.origin&&p.recordIds?.some(id=>c.recordIds.includes(id)))){
   for(const link of page.links||[]){if(!readOnlyPolicyLink(link))continue;const key=routeKey(link.url);if(!key||seen.has(key)||attempted.has(key))continue;
    const candidate={url:link.url,label:link.label,parentSourceId:page.sourceId,parentUrl:page.url,parentCapturedAt:page.capturedAt,proofFile:page.file,proofSha256:page.sha256,recordIds:page.recordIds.filter(id=>c.recordIds.includes(id)),targetFields:c.priorityFields};
    if(origin(link.url)!==c.origin){external.set(key,{...candidate,status:'native_link_needs_cross_origin_binding_review',credentialsAllowed:false});continue;}
    routes.set(key,{...candidate,taskId:hash(c.collectorId+'|'+key).slice(0,20),status:'unread_native_official_route',credentialsAllowed:!c.policy.publicOnly});
   }
  }
  c.readTasks=[...routes.values()].sort((a,b)=>a.url.localeCompare(b.url));c.crossOriginCandidates=[...external.values()].sort((a,b)=>a.url.localeCompare(b.url));
  c.status=c.readTasks.length?'unread_official_routes_ready':c.priorityFields.length?'priority_gaps_need_new_sources':'priority_material_available_other_fields_pending';
  c.recipeHash=hash({origin:c.origin,recordIds:c.recordIds,capabilities:c.capabilities,policy:c.policy,readTasks:c.readTasks.map(t=>({url:t.url,proofSha256:t.proofSha256}))});
 }
 return{schemaVersion:'airports-website-collectors.v1',collectors:[...groups.values()].sort((a,b)=>a.origin.localeCompare(b.origin)),unbound,dataComplete:false};
}
module.exports={buildWebsiteCollectors,readOnlyPolicyLink,routeFieldHints,origin};
