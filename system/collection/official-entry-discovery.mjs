import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {followObservedReadOnlyLink} from './observed-link-navigation.mjs';
import {readRenderedDocument} from './visible-document.mjs';
const require=createRequire(import.meta.url),E=require('../lib/collection-engine.cjs'),{runDir,root}=require('../scripts/collection.cjs'),{gaps}=require('../scripts/plan-collection-gaps.cjs');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
export function buildEntryDiscoveryPlan(catalog,{targetFields=['pricing','payment','refund']}={}){
 if(!Array.isArray(targetFields)||!targetFields.length||targetFields.some(f=>!['pricing','payment','refund'].includes(f)))throw Error('unsupported_entry_discovery_fields');
 const tasks=[],excluded=[];
 for(const r of catalog.items.filter(r=>r.listing?.primary!==false)){
  const missing=gaps(r).filter(f=>targetFields.includes(f));if(!missing.length)continue;
  if(require('../lib/collection-user-skips.cjs').isUserSkipped(r.id)){excluded.push({recordId:r.id,reason:'standing_user_skip'});continue;}
  const name=r.name.replace(/\s*[（(].*?[）)]/g,'').trim();
  tasks.push({recordId:r.id,name:r.name,knownOfficialUrl:r.coreInfo?.website?.url||null,missing,query:`${name} 机场 官网 官方发布 最新入口`,basis:'name_search_not_restricted_to_old_domain',candidateAdmission:'unverified_discovery_only_no_business_fact'});
 }
 return {tasks:tasks.sort((a,b)=>Number(b.missing.includes('pricing'))-Number(a.missing.includes('pricing'))),excluded};
}
export function discoveryCandidates(snapshot){
 const urls=new Map();for(const l of snapshot.links||[]){const u=E.safeUrl(l.url);if(!u)continue;const parsed=new URL(u),host=parsed.hostname,isGoogle=/(^|\.)google\.[a-z.]+$/.test(host);if(isGoogle&&parsed.pathname!=='/goto'||/(^|\.)gstatic\.com$|(^|\.)googleusercontent\.com$/.test(host))continue;urls.set(u,{url:u,label:l.label,identityStatus:isGoogle?'search_redirect_destination_unresolved':'unverified',grade:'E0',businessFactsAdmitted:0});}
 return [...urls.values()];
}
export function searchVerificationBlocked(snapshot){
 const text=snapshot.text||'';let url;try{url=new URL(snapshot.url);}catch{}
 // Search snippets may themselves discuss CAPTCHA. That is not a challenge.
 return snapshot.verificationWidgetObserved===true||snapshot.challengeFormObserved===true||/^\/sorry(?:\/|$)/.test(url?.pathname||'')||/our systems have detected unusual traffic|我们的系统检测到您的计算机网络中存在异常流量|我们的系统检测到您的计算机网络中存在异常|请完成以下验证以继续搜索|verify (?:that )?you are (?:a )?human to continue/i.test(text);
}
// Resolving a search redirect supplies a usable destination, not an identity
// binding. The caller retains the reference and must review native provenance.
export async function resolveObservedDiscoveryLink({browser,sourceTab,link,recordId,readDocument=readRenderedDocument,onCheckpoint}){
 const result=await followObservedReadOnlyLink({browser,sourceTab,link,onCheckpoint});
 try{
  if(result.observation.status==='observed_link_landed'&&result.tab.playwright.locator){try{await result.tab.playwright.locator('body').filter({hasText:/\S/}).waitFor({state:'visible',timeoutMs:8000});}catch{}}
  const document=result.observation.status==='observed_link_landed'?await readDocument(result.tab):null;
  return {...result,receipt:{recordId,...result.observation,capturedAt:new Date().toISOString(),contentStatus:document?.text?.trim()?'visible_reference_captured':'no_readable_reference_body',grade:'E0',identityStatus:'unverified_reference_destination',businessFactsAdmitted:0,document}};
 }catch(error){try{await result.tab.close();}catch{}throw error;}
}
export async function runEntryDiscoveryChunk({browser,runId,limit=5,onProgress=()=>{},excludeRecordIds=[],resolveFirstCandidate=true,targetFields=['pricing','payment','refund']}){
 const dir=runDir(runId),pf=path.join(dir,'entry-discovery-plan.json'),sf=path.join(dir,'entry-discovery-state.json');
 const currentCatalog=require('../lib/current-collection-catalog.cjs').loadCurrentCollectionCatalog({root}),currentRows=new Map(currentCatalog.items.filter(r=>r.listing?.primary!==false).map(r=>[r.id,r]));
 const plan=fs.existsSync(pf)?read(pf):{...buildEntryDiscoveryPlan(currentCatalog,{targetFields}),collectionInput:currentCatalog.collectionInput,createdAt:new Date().toISOString(),runId};if(!fs.existsSync(pf))write(pf,plan);
 const actionable=task=>currentRows.has(task.recordId)&&gaps(currentRows.get(task.recordId)).some(f=>targetFields.includes(f));
 const state=fs.existsSync(sf)?read(sf):{results:{}};excludeRecordIds=[...new Set([...excludeRecordIds,...require('../lib/collection-user-skips.cjs').skippedRecordIds])];if(state.serviceBlocked)return{processed:0,serviceBlocked:true};fs.mkdirSync(path.join(dir,'entry-discovery-evidence'),{recursive:true});let processed=0;
 for(const task of plan.tasks.filter(t=>!state.results[t.recordId]&&!excludeRecordIds.includes(t.recordId)&&actionable(t)).slice(0,limit)){let tab;try{
  tab=await browser.tabs.new();await tab.goto('https://www.google.com/search?q='+encodeURIComponent(task.query));
  try{await tab.playwright.getByRole('heading',{name:'搜索结果',exact:true}).waitFor({state:'visible',timeoutMs:10000});}catch{}
  const snapshot=await tab.playwright.evaluate(()=>({text:document.body.innerText,verificationWidgetObserved:[...document.querySelectorAll('iframe')].some(e=>e.getClientRects().length&&/recaptcha|hcaptcha|turnstile/i.test(e.src+' '+e.title)),challengeFormObserved:[...document.querySelectorAll('form[action]')].some(e=>e.getClientRects().length&&/\/sorry\//.test(e.action)),links:[...document.querySelectorAll('a[href]')].filter(e=>e.getClientRects().length&&e.innerText.trim().length>5).map(e=>({url:e.href,label:e.innerText}))}));
  const raw={...snapshot,text:E.redact(snapshot.text),url:await tab.url(),query:task.query,recordId:task.recordId,capturedAt:new Date().toISOString(),grade:'E0',representation:'visible_search_DOM_discovery_only'};
  const bytes=JSON.stringify(raw,null,2)+'\n',hash=E.sha(bytes),file='entry-discovery-evidence/'+hash+'.json';fs.writeFileSync(path.join(dir,file),bytes);
  const blocked=searchVerificationBlocked(raw),candidates=discoveryCandidates(raw);
  let resolvedReference=null;
  if(!blocked&&resolveFirstCandidate){
   // Limit direct inspection to the strongest visible result. In particular,
   // never manufacture a destination from the display breadcrumb.
   const ranked=tab.playwright.locator('#rso a[href]').filter({has:tab.playwright.locator('h3'),visible:true});
   if(await ranked.count()){
    let followed;try{
     followed=await resolveObservedDiscoveryLink({browser,sourceTab:tab,link:ranked.nth(0),recordId:task.recordId});
     const content=JSON.stringify(followed.receipt,null,2)+'\n',digest=E.sha(content),destinationFile='entry-discovery-evidence/'+digest+'.json';fs.writeFileSync(path.join(dir,destinationFile),content);
     resolvedReference={status:followed.receipt.status,finalUrl:followed.receipt.finalUrl,file:destinationFile,sha256:digest,grade:'E0',identityStatus:'unverified_reference_destination',businessFactsAdmitted:0};
    }catch(error){resolvedReference={status:'reference_resolution_blocked',error:E.redact(String(error.message)).slice(0,180),businessFactsAdmitted:0};}finally{if(followed)try{await followed.tab.close();}catch{}}
   }
  }
  state.results[task.recordId]={...task,status:blocked?'discovery_search_verification_blocked':raw.text.length<100?'discovery_incomplete_render':'discovery_candidates_need_identity_review',capturedAt:raw.capturedAt,file,sha256:hash,candidates,resolvedReference,businessFactsAdmitted:0};if(blocked)state.serviceBlocked=true;
 }catch(error){state.results[task.recordId]={...task,status:'discovery_access_error',at:new Date().toISOString(),error:E.redact(String(error.message)).slice(0,300)};}finally{if(tab)try{await tab.close()}catch{}write(sf,state);processed++;onProgress({recordId:task.recordId,status:state.results[task.recordId].status,candidates:state.results[task.recordId].candidates?.length||0});}if(state.serviceBlocked)break;}
 return{processed,remaining:plan.tasks.filter(t=>!state.results[t.recordId]&&!excludeRecordIds.includes(t.recordId)&&actionable(t)).length,serviceBlocked:!!state.serviceBlocked};
}
