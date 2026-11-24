import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {createRequire} from 'node:module';
import {readStableRecheckDocument} from './breakpoint-recheck.mjs';
const require=createRequire(import.meta.url),{runDir}=require('../scripts/collection.cjs'),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
// A fresh, single query per currently unreachable service. Search results are clues only.
export async function runBreakpointEntryDiscovery({browser,runId,limit=3}){
 if(!browser?.tabs||!Number.isInteger(limit)||limit<1||limit>3)throw Error('bounded_builtin_browser_required');
 const dir=runDir(runId),sourcePlan=JSON.parse(fs.readFileSync(path.join(dir,'recheck-plan.json'))),checks=JSON.parse(fs.readFileSync(path.join(dir,'recheck-state.json'))),planFile=path.join(dir,'entry-search-plan.json'),stateFile=path.join(dir,'entry-search-state.json');
 let plan;if(fs.existsSync(planFile))plan=JSON.parse(fs.readFileSync(planFile));else{
  const tasks=sourcePlan.tasks.filter(t=>/empty_or_error|browser_error|execution_error|demo_shell|passive_redirect/.test(checks.results[t.taskId]?.status||'')).map(t=>({...t,reason:checks.results[t.taskId].status}));
  for(const r of sourcePlan.unbound)tasks.push({taskId:'unbound-'+r.recordId,recordIds:[r.recordId],names:[r.name],reason:'no_verified_entry'});
  plan={runId,createdAt:new Date().toISOString(),source:'current_recheck_failure_set',tasks:tasks.map(t=>({taskId:t.taskId,recordIds:t.recordIds,names:t.names,previousEntry:t.entryUrl||null,reason:t.reason,query:t.names[0].replace(/[()]/g,' ')+' 机场 官网 最新地址'})),searchResultsAreOfficialFacts:false};fs.writeFileSync(planFile,JSON.stringify(plan,null,2)+'\n');
 }
 const state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile)):{runId,results:{}};let processed=0;const outcomes=[];
 for(const task of plan.tasks){if(state.results[task.taskId]||processed>=limit)continue;let tab;const r={taskId:task.taskId,recordIds:task.recordIds,query:task.query,candidatesOnly:true};
  try{
   tab=await browser.tabs.new();await tab.goto('https://www.google.com/search?q='+encodeURIComponent(task.query));
   try{await tab.playwright.locator('#rso').waitFor({state:'visible',timeoutMs:10000});}catch{}
   const {snapshot}=await readStableRecheckDocument(tab);const bytes=JSON.stringify(snapshot,null,2)+'\n',hash=sha(bytes),file='originals/search-'+task.recordIds[0]+'-'+hash.slice(0,12)+'.json';fs.writeFileSync(path.join(dir,file),bytes);r.source={file,sha256:hash,url:snapshot.url,capturedAt:snapshot.capturedAt,grade:'E0'};
   r.results=await tab.playwright.evaluate(()=>[...document.querySelectorAll('#rso a')].filter(a=>a.querySelector('h3')).map(a=>({title:a.innerText,url:a.href})).slice(0,6));
   r.status=r.results.length?'entry_candidates_need_direct_verification':/验证|captcha|unusual traffic/i.test(snapshot.text)?'search_verification_checkpoint':'no_identifiable_result';r.visibleExcerpt=snapshot.text.slice(0,6000);
  }catch(error){r.status='entry_search_execution_checkpoint';r.error=/data:text\/html|Browser Use URL policy/.test(error.message)?'Browser error page unavailable':error.message.slice(0,220);}
  finally{if(tab)try{await tab.close();r.tabClosed=true;}catch{r.tabClosed=false;}r.finishedAt=new Date().toISOString();state.results[task.taskId]=r;processed++;outcomes.push({recordIds:r.recordIds,status:r.status,results:r.results});fs.writeFileSync(stateFile,JSON.stringify(state,null,2)+'\n');}
 }
 return{runId,processed,total:plan.tasks.length,remaining:plan.tasks.filter(t=>!state.results[t.taskId]).length,outcomes,officialEntriesAdmitted:0,paymentExecuted:false};
}
