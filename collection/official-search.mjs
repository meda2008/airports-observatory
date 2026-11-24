import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),E=require('../lib/collection-engine.cjs'),{root,runDir}=require('../scripts/collection.cjs');
export function classifySearch(text,host){if(/unusual traffic|not a robot|人机验证|验证您是真人|不是机器人|安全验证|异常流量|不是自动程序/i.test(text))return 'search_verification_blocked';if(/找不到.*相符|did not match any documents/i.test(text))return 'no_search_results';if(!text.toLowerCase().includes(host.toLowerCase()))return 'no_official_domain_result';return 'search_results_need_original_review';}
export function preflightOriginals(urls,coreSources=null){
 const sources=coreSources||JSON.parse(fs.readFileSync(path.join(root,'catalog/core-supplement.v1.json'))).sources;
 const key=url=>{try{const u=new URL(url);if(!u.hash.startsWith('#/'))u.hash='';u.pathname=u.pathname.replace(/\/$/,'')||'/';return u.href;}catch{return null;}};
 return [...new Set(urls)].map(url=>{const retained=sources.filter(s=>[s.url,s.navigationUrl,s.originalRequestUrl].filter(Boolean).some(u=>key(u)===key(url)));return{url,status:retained.length?'already_retained_original':'new_original_candidate',retainedSourceIds:retained.map(s=>s.source_id),originalCaptureTimes:retained.map(s=>s.last_capture_at).filter(Boolean),factsAdmitted:0};});
}
// Search results only discover original pages. They never become price facts.
export function planOfficialSearch(runId){
 const dir=runDir(runId),file=path.join(dir,'official-search-plan.json');if(fs.existsSync(file))return JSON.parse(fs.readFileSync(file));
 const catalog=JSON.parse(fs.readFileSync(path.join(root,'public-site/data/public-catalog.json'))),{gaps}=require('../scripts/plan-collection-gaps.cjs'),groups=new Map(),excluded=[];
 for(const row of catalog.items.filter(r=>r.listing?.primary!==false)){const missing=gaps(row).filter(f=>['pricing','payment'].includes(f));if(!missing.length)continue;if(['A034','A047'].includes(row.id)||!row.coreInfo.website?.url){excluded.push({id:row.id,reason:'standing_skip_or_no_verified_domain',missing});continue;}const host=new URL(row.coreInfo.website.url).hostname.replace(/^www\./,'');const g=groups.get(host)||{host,recordIds:[],names:[],missing:[],query:`site:${host} (支付 OR 付款 OR 套餐 OR payment OR billing)`};g.recordIds.push(row.id);g.names.push(row.name);g.missing=[...new Set([...g.missing,...missing])];groups.set(host,g);}
 const out={runId,at:new Date().toISOString(),tasks:[...groups.values()].sort((a,b)=>Number(b.missing.includes('pricing'))-Number(a.missing.includes('pricing'))),excluded,policy:'One focused query per distinct official domain; retain search text/time; identity conflicts remain unresolved; no account or factual admission from snippets'};fs.writeFileSync(file,JSON.stringify(out,null,2));return out;
}
export async function runOfficialSearchChunk({browser,runId,limit=3}){
 const dir=runDir(runId),plan=planOfficialSearch(runId),file=path.join(dir,'official-search-state.json'),state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{results:{}};let processed=0;
 if(state.searchServiceBlocked)return{processed:0,remaining:plan.tasks.length-Object.keys(state.results).length,searchServiceBlocked:true};
 fs.mkdirSync(path.join(dir,'search-evidence'),{recursive:true});
 for(const task of plan.tasks.filter(t=>!state.results[t.host]).slice(0,limit)){let tab;try{
  tab=await browser.tabs.new();await tab.playwright.expectNavigation(()=>tab.goto('https://www.google.com/search?q='+encodeURIComponent(task.query)),{waitUntil:'domcontentloaded',timeoutMs:15000});try{await tab.playwright.waitForLoadState({state:'networkidle',timeoutMs:5000});}catch(error){if(!/timeout|timed\s*out/i.test(error.message))throw error;}
  const visible=await tab.playwright.evaluate(()=>({title:document.title,text:document.body.innerText,links:[...document.querySelectorAll('a[href]')].filter(e=>e.getClientRects().length).map(e=>({url:e.href,label:e.innerText})).filter(l=>l.label)}));const capturedAt=new Date().toISOString(),raw=JSON.stringify({...visible,text:E.redact(visible.text),url:await tab.url(),capturedAt,representation:'visible_search_DOM_discovery_only',grade:'E0',recordIds:task.recordIds},null,2),sha256=E.sha(raw),snapshot='search-evidence/'+sha256+'.json';fs.writeFileSync(path.join(dir,snapshot),raw);
  const status=classifySearch(visible.text,task.host),blocked=status==='search_verification_blocked';
  state.results[task.host]={...task,status,capturedAt,file:snapshot,sha256,grade:'E0',businessFactsAdmitted:0};
  if(blocked){state.searchServiceBlocked=true;}
 }catch(error){state.results[task.host]={...task,status:'search_access_error',at:new Date().toISOString(),message:E.redact(String(error.message)).slice(0,250)};}finally{if(tab)try{await tab.close();}catch{}fs.writeFileSync(file,JSON.stringify(state,null,2));processed++;}if(state.searchServiceBlocked)break;
 }
 return{processed,remaining:plan.tasks.length-Object.keys(state.results).length,searchServiceBlocked:state.searchServiceBlocked===true};
}
