import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {createRequire} from 'node:module';
import {readRenderedDocument} from './visible-document.mjs';
import {continueNonbindingNotice,isNonbindingContinueNotice} from './nonbinding-notice.mjs';
import {waitForPassiveAccessPage,passiveAccessWaitLabel} from './passive-access-wait.mjs';
const require=createRequire(import.meta.url),{runDir}=require('../scripts/collection.cjs');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
export async function readStableRecheckDocument(tab){
 const transitions=[];for(let attempt=0;attempt<3;attempt++){
  try{return{snapshot:await readRenderedDocument(tab),transitions};}
  catch(error){if(error.message!=='rendered_document_route_changed_during_observation')throw error;transitions.push({at:new Date().toISOString(),resolvedUrl:await tab.url()});}
 }
 throw Error('recheck_route_did_not_stabilize');
}
export function recheckDisposition(s){
 if(s.accountManagementObserved)return'authenticated_account_management_read_only';
 if(passiveAccessWaitLabel(s))return'passive_redirect_wait_checkpoint';
 if(isNonbindingContinueNotice(s))return'nonbinding_continue_notice';
 if(s.title==='EZ-DEMO-TITLE'&&/^v\d+\.\d+\.\d+\s*$/.test(s.text||''))return'demo_shell_not_business_evidence';
 if(s.passwordForm)return s.verificationWidgetObserved||/验证码|captcha|验证已过期/i.test(s.text)?'login_with_verification':'login_required';
 if(/正在进行安全验证|请验证您是真人|Cloudflare|SECURITY_VERIFICATION|访问验证/.test(s.text))return'access_verification_checkpoint';
 if(/继续即表示同意|继续即默认同意/.test(s.text))return'requires_current_terms_confirmation';
 if(/^\s*$/.test(s.text)||/\/error-page\/?$/.test(new URL(s.url).pathname))return'empty_or_error_route';
 return'content_observed_needs_targeted_followup';
}
export async function runBreakpointRecheck({browser,runId,limit=3,reuseTabs={},authorization}){
 if(!browser?.tabs||!Number.isInteger(limit)||limit<1||limit>5)throw Error('existing_builtin_browser_and_bounded_chunk_required');
 const plan=require('../scripts/prepare-breakpoint-recheck.cjs').prepare(runId,{authorization}),dir=runDir(runId),stateFile=path.join(dir,'recheck-state.json'),state=JSON.parse(fs.readFileSync(stateFile));
 if(plan.policy.allowPayment||plan.policy.allowNewOrders)throw Error('recheck_preflight_must_be_read_only');
 const save=()=>{state.updatedAt=new Date().toISOString();fs.writeFileSync(stateFile+'.tmp',JSON.stringify(state,null,2)+'\n');fs.renameSync(stateFile+'.tmp',stateFile);};let processed=0;
 for(const task of plan.tasks){if(state.results[task.taskId]||processed>=limit)continue;let tab,reused=false;
  const r={taskId:task.taskId,recordIds:task.recordIds,entryUrl:task.entryUrl,priorSkips:task.priorSkips,priorEligibility:task.priorEligibility,orderCleanupRequired:task.orderCleanupRequired,sources:[],newOrdersCreated:0,paymentExecuted:false,startedAt:new Date().toISOString()};
  try{
   reused=!!reuseTabs[task.origin];tab=reused?await browser.tabs.get(reuseTabs[task.origin]):await browser.tabs.new();
   if(!reused)try{await tab.goto(task.entryUrl);}catch(error){r.navigationError=String(error.message).slice(0,220);}
   try{await tab.playwright.waitForLoadState({state:'networkidle',timeoutMs:6000});}catch{}
   const stable=await readStableRecheckDocument(tab);let s=stable.snapshot;r.routeTransitions=stable.transitions;
   // An authenticated session can become visible after the login shell; no reload or credential retry.
   if(!s.text.trim())try{await tab.playwright.locator('a,button,input,h1,h2').first().waitFor({state:'visible',timeoutMs:6000});const settled=await readStableRecheckDocument(tab);s=settled.snapshot;r.routeTransitions.push(...settled.transitions);}catch{}
   const observations=[s],inspectStable=async()=>{const x=await readStableRecheckDocument(tab);r.routeTransitions.push(...x.transitions);return x.snapshot;};
   if(passiveAccessWaitLabel(s)){const resolved=await waitForPassiveAccessPage({tab,snapshot:s,inspect:inspectStable,timeoutMs:12000});s=resolved.snapshot;r.passiveWaitObservation=resolved.observation;observations.push(s);}
   if(isNonbindingContinueNotice(s)){const resolved=await continueNonbindingNotice({tab,snapshot:s,inspect:inspectStable});s=resolved.snapshot;r.noticeObservation=resolved.observation;observations.push(s);}
   for(const observation of observations){const text=JSON.stringify(observation,null,2)+'\n',hash=sha(text),file='originals/'+task.recordIds[0]+'-'+hash.slice(0,12)+'.json';fs.writeFileSync(path.join(dir,file),text);
    r.sources.push({sourceId:'RECHECK-'+hash.slice(0,24),recordIds:task.recordIds,file,sha256:hash,url:observation.url,capturedAt:observation.capturedAt,grade:'E0',kind:'access_recheck_not_financial_fact_admission'});}
   r.status=recheckDisposition(s);r.resolvedUrl=s.url;r.title=s.title;r.passwordForm=s.passwordForm;r.verificationWidgetObserved=s.verificationWidgetObserved;r.textLength=s.text.length;r.observedControls=s.buttons;r.nativeLinks=s.links.filter(l=>/帮助|公告|文档|退款|条款|隐私|支付|订单|教程|FAQ|terms|refund|privacy/i.test(l.label));
   r.originChanged=new URL(s.url).origin!==task.origin;r.reusedExistingTab=reused;if(reused)r.followupTabId=tab.id;
  }catch(error){const blocked=/Browser Use URL policy|data:text\/html/i.test(String(error.message));r.status=blocked?'browser_error_page_or_navigation_restriction':'recheck_execution_error';r.error=blocked?'Browser-generated error page could not be read; no bypass attempted.':String(error.message).slice(0,400);}
  finally{if(tab&&!reused)try{await tab.close();r.tabClosed=true;}catch{r.tabClosed=false;}r.finishedAt=new Date().toISOString();state.results[task.taskId]=r;processed++;save();}
 }
 const remaining=plan.tasks.filter(t=>!state.results[t.taskId]).length;
 return{runId,status:remaining?'breakpoint_recheck_running':'all_current_breakpoint_entries_rechecked',processed,remaining,total:plan.tasks.length,unbound:plan.unbound.length,outcomes:Object.values(state.results).slice(-processed).map(r=>({recordIds:r.recordIds,status:r.status,url:r.resolvedUrl,title:r.title,links:r.nativeLinks?.length,priorSkips:r.priorSkips})),newOrdersCreated:0,paymentExecuted:false,dataComplete:false};
}
