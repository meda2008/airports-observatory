'use strict';
// HTTP-only execution client. The API owns queues, parsing, proposals and SQLite.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {collectWithReferences,runDirectory,earlierPending}=require('./standalone-worker.cjs');
const {redact}=require('./standalone-collector.cjs');
function createWebTransport({baseUrl=process.env.INTERNAL_API_URL||'http://api:8080',token=process.env.COLLECTOR_TOKEN,tokenFile=process.env.INTERNAL_TOKEN_FILE,fetchImpl=globalThis.fetch,timeoutMs=60000}={}){
 if(!baseUrl)throw Error('collector_api_url_required');
 const base=new URL(baseUrl);if(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.search||base.hash)throw Error('invalid_collector_api_url');
 const secret=token||(tokenFile?fs.readFileSync(tokenFile,'utf8').trim():'');if(!secret)throw Error('collector_token_required');
 return async(op,input={})=>{let response;try{response=await fetchImpl(new URL('/internal/web-collector/'+op,base),{method:'POST',headers:{authorization:'Bearer '+secret,'content-type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(timeoutMs),redirect:'error'});}catch(error){throw require('../lib/service-api-recovery.cjs').wrap(error);}let data;try{data=await response.json();}catch(cause){const wrapped=require('../lib/service-api-recovery.cjs').wrap(cause);if(require('../lib/service-api-recovery.cjs').transient(wrapped))throw wrapped;const error=Error('collector_api_response_invalid');error.status=response.status;throw error;}if(!response.ok){const error=Error(data.error||'collector_api_request_failed');error.status=response.status;throw error;}return data;};
}
function createWebCollector({request,baseUrl,token,tokenFile,fetchImpl,browserFactory,collect,output=process.env.STANDALONE_OUTPUT_DIR||path.join(__dirname,'data/web-evidence'),sessionDir=process.env.STANDALONE_SESSION_DIR,credentialsFile=process.env.CREDENTIALS_FILE,workerName='collector-web',jobBudgetMs=Number(process.env.STANDALONE_JOB_BUDGET_MS||35000),renewMs=20000,log=value=>console.log(JSON.stringify(value))}={}){
 if(!Number.isInteger(jobBudgetMs)||jobBudgetMs<1000||jobBudgetMs>180000)throw Error('invalid_standalone_job_budget');
 request||=createWebTransport({baseUrl,token,tokenFile,fetchImpl});
 browserFactory||=async()=>require('playwright').chromium.launch({headless:true,timeout:20000});
 let browser=null,stopping=false,active=0;
 const safeLog=value=>{try{log(value);}catch{}};
 const beat=async(status,reason)=>{try{await request('heartbeat',{status,details:{runnerName:workerName,executionMode:'standalone',browser:'service_headless',active,paymentAllowed:false,reason:reason||null}});}catch{safeLog({service:'standalone_collector',status:'heartbeat_deferred'});}};
 const permanentRejected=error=>[400,409,413,422].includes(error?.status);
 function holdSubmission(pending,reason){
  const dir=path.dirname(pending),base=path.join(dir,'review-required-submission.json');
  const held=fs.existsSync(base)?path.join(dir,'review-required-submission-'+crypto.randomUUID()+'.json'):base;
  fs.renameSync(pending,held);
  fs.writeFileSync(held+'.receipt',JSON.stringify({reason,at:new Date().toISOString()}),{mode:0o600,flag:'wx'});
  safeLog({service:'standalone_collector',status:'submission_review_required',reason});
 }
 async function recoverPending({siteId}={}){
  if(!fs.existsSync(output))return null;
  for(const entry of fs.readdirSync(output,{withFileTypes:true})){
   if(!entry.isDirectory())continue;
   const dir=path.join(output,entry.name),pending=path.join(dir,'pending-submission.json');
   let item;
   try{item=JSON.parse(fs.readFileSync(pending,'utf8'));}
   catch(error){if(error.code==='ENOENT')continue;if(!(error instanceof SyntaxError))throw error;holdSubmission(pending,'invalid_pending_packet');continue;}
   if(!item?.packet?.token||!item.jobId||!item.runId||!item.siteId){holdSubmission(pending,'invalid_pending_packet');continue;}
   if(siteId&&item.siteId!==siteId)continue;
   let accepted;
   try{
    const run=await request('run',{runId:item.runId});
    if(run?.status==='cancel_requested'){
     const archived=path.join(dir,'cancelled-pending-submission.json');
     if(!fs.existsSync(archived))fs.copyFileSync(pending,archived,fs.constants.COPYFILE_EXCL);
     accepted=await request('cancel',{jobId:item.jobId,token:item.packet.token,actor:workerName});
    }else if(run&&['completed','blocked','awaiting_semantic_review','review_approved','review_rejected','cancelled'].includes(run.status))accepted=run;
    else{
     try{await request('renew',{jobId:item.jobId,token:item.packet.token,leaseMs:180000});}
     catch(error){
      if(!permanentRejected(error)||!item.packet.captures?.length||item.packet.captures.some(c=>c.metadata?.retainedReplayVerified!==true))throw error;
      const replacement=await request('recoverretained',{jobId:item.jobId,token:item.packet.token,worker:workerName});
      if(!replacement?.job||replacement.job.jobId!==item.jobId)throw Error('invalid_retained_recovery');
      const original=path.join(dir,'original-pending-submission.json');
      if(!fs.existsSync(original))fs.copyFileSync(pending,original,fs.constants.COPYFILE_EXCL);
      const oldRunId=item.runId;item.runId=replacement.job.runId;item.packet.token=replacement.job.token;
      const temp=pending+'.tmp-'+crypto.randomUUID();
      fs.writeFileSync(temp,JSON.stringify(item,null,2),{mode:0o600,flag:'wx'});fs.renameSync(temp,pending);
      fs.writeFileSync(path.join(dir,'lease-recovery.json'),JSON.stringify({jobId:item.jobId,oldRunId,newRunId:item.runId,at:new Date().toISOString(),networkRecaptured:false},null,2));
     }
     accepted=await request('receive',item.packet);
    }
   }catch(error){
    if(permanentRejected(error)){holdSubmission(pending,'api_rejected_pending_packet');continue;}
    return{status:'submission_deferred',jobId:item.jobId,runId:item.runId,reason:'retained_submission_requires_recovery'};
   }
   const result={siteId:item.siteId,jobId:item.jobId,runId:item.runId,status:accepted.status,acceptanceRecoveredFromApi:true};
   if(!fs.existsSync(path.join(dir,'accepted.json')))fs.writeFileSync(path.join(dir,'accepted.json'),JSON.stringify(result,null,2),{flag:'wx',mode:0o600});
   fs.unlinkSync(pending);return result;
  }
  return null;
 }
 async function ensureBrowser(){
  if(browser?.isConnected?.()===false)browser=null;
  if(browser)return browser;
  const instance=await browserFactory();
  browser=instance;
  instance.once?.('disconnected',()=>{if(browser===instance)browser=null;});
  return instance;
 }
 async function runOne({siteId}={}){
  const settings=await request('control');if(stopping||!settings.engineEnabled||settings.executionMode!=='standalone'){await beat('paused','execution_disabled_or_other_mode');return{status:'paused'};}
  const recovered=await recoverPending({siteId});if(recovered)return recovered;
  const claimed=await request('claim',{worker:workerName,siteId,leaseMs:180000}),job=claimed?.job;
  if(!job){await beat('connected');return{status:'idle'};}
  const primaryDir=runDirectory(output,job);
  const dir=fs.existsSync(primaryDir)?fs.mkdtempSync(primaryDir+'-attempt-'):primaryDir;
  fs.mkdirSync(dir,{recursive:true,mode:0o700});active++;await beat('connected');let renewal=null,leaseError=null,result,material,retained=false,activeBrowser=null,browserFailed=false;
  const renew=()=>request('renew',{jobId:job.jobId,token:job.token,leaseMs:180000});
  const timer=setInterval(()=>{if(renewal)return;renewal=renew().then(()=>beat('connected')).catch(error=>{leaseError=error;}).finally(()=>{renewal=null;});},renewMs);
  const beforePage=async()=>{if(stopping)throw Error('standalone_execution_paused');if(renewal)await renewal;if(leaseError)throw leaseError;const current=await request('control');if(!current.engineEnabled||current.executionMode!=='standalone')throw Error('standalone_execution_paused');await renew();};
  const pendingFile=path.join(dir,'pending-submission.json');
  try{
   const prior=earlierPending(output,job,dir),guard=claimed.partialReparseGuard;
   if(prior||guard)material={captures:[],checkpoint:{type:guard?'retained_partial_reparse_requires_recovery':'retained_submission_requires_recovery',url:job.site.config.entryUrl,stage:'storage_recovery',reason:'已有原文或重解析任务待恢复；保留原件，不重复网络采集',requestedAction:'复核原任务与原文后显式恢复'},capabilities:{},retainedSubmissionGuard:true};
   else if(job.retainedCaptures){await beforePage();material={captures:job.retainedCaptures,checkpoint:null,retainedReplay:true,ordersCreated:0,paymentExecuted:false};}
   else{await beforePage();try{activeBrowser=await ensureBrowser();}catch(error){browserFailed=true;throw error;}material=job.discoveryOnly||job.entryDiscovery?await require('./entry-discovery.cjs').collectEntryDiscovery(job,{browser:activeBrowser,jobBudgetMs,beforePage}):await collectWithReferences(job.site,{browser:activeBrowser,collect,credentialsFile,sessionDir,jobBudgetMs,beforePage,webEgressProfile:job.webEgressProfile,prior:claimed.prior||{}});}
   if(activeBrowser?.isConnected?.()===false){browserFailed=true;throw Error('collector_browser_unavailable');}
   const captures=material.captures||[];
   if(material.ordersCreated||material.paymentExecuted)throw Error('read_only_collection_contract_violated');
   for(const [i,c]of captures.entries())fs.writeFileSync(path.join(dir,'capture-'+i+'.json'),JSON.stringify({...c,sha256:crypto.createHash('sha256').update(c.body).digest('hex')},null,2),{flag:'wx',mode:0o600});
   fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify({siteId:job.siteId,jobId:job.jobId,runId:job.runId,profileRevision:job.profileRevision,siteRevision:job.siteRevision,executionMode:'standalone',...material,captures:captures.map((c,i)=>({url:c.url,observedAt:c.observedAt,kind:c.kind,file:'capture-'+i+'.json'}))},null,2),{flag:'wx',mode:0o600});
   const packet={jobId:job.jobId,token:job.token,captures:captures.map(c=>({...c,sha256:crypto.createHash('sha256').update(c.body).digest('hex')})),checkpoint:material.checkpoint,capabilities:material.capabilities,observationBasis:material.retainedSubmissionGuard||material.retainedReplay?'retained_reparse':material.browser==='service_native_api'?'standalone_native_api':'standalone_browser',worker:workerName};
   fs.writeFileSync(pendingFile,JSON.stringify({siteId:job.siteId,jobId:job.jobId,runId:job.runId,state:'pending_api_submission',packet}),{flag:'wx',mode:0o600});retained=true;
   await beforePage();const accepted=await request('receive',packet);
   result={siteId:job.siteId,jobId:job.jobId,runId:job.runId,status:accepted.status,proposalId:accepted.proposalId||null,checkpoint:material.checkpoint?.type||null};
   fs.writeFileSync(path.join(dir,'accepted.json'),JSON.stringify(result,null,2),{flag:'wx',mode:0o600});fs.unlinkSync(pendingFile);
  }catch(error){
   browserFailed||=activeBrowser?.isConnected?.()===false;
   result={siteId:job.siteId,jobId:job.jobId,runId:job.runId,status:retained?'submission_deferred':browserFailed?'failed':'blocked',reason:browserFailed?'collector_browser_unavailable':redact(error.message).slice(0,300)};
   if(error.message==='Job cancellation requested')try{const ack=await request('cancel',{jobId:job.jobId,token:job.token,actor:workerName});result.status=ack.status;}catch{}
   else if(!retained&&browserFailed)try{await request('complete',{jobId:job.jobId,token:job.token,status:'failed',blocker:'collector_browser_unavailable',actor:workerName});}catch{}
   else if(!retained)try{await request('complete',{jobId:job.jobId,token:job.token,status:'blocked',blocker:'standalone_execution_error',checkpoint:{type:'standalone_execution_error',url:job.site.config.entryUrl,stage:'runtime',reason:result.reason,requestedAction:'修复本站执行错误后恢复'},actor:workerName});}catch{}
   fs.writeFileSync(path.join(dir,'runtime-error.json'),JSON.stringify(result,null,2),{flag:'wx',mode:0o600});
  }finally{clearInterval(timer);if(renewal)await renewal;active--;await beat(stopping?'paused':'connected');safeLog({service:'standalone_collector',...result});}
  return result;
 }
 async function stop(){stopping=true;if(browser){await browser.close();browser=null;}await beat('paused','service_stopped');}
 return{runOne,stop};
}
async function runCollectorLoop({signal,siteId=process.env.COLLECTOR_SITE_ID,siteIds=process.env.COLLECTOR_SITE_IDS?.split(',').filter(Boolean)||[],pollMs=Number(process.env.STANDALONE_POLL_MS||15000),retryWait=require('../lib/service-api-recovery.cjs').wait,...options}={}){
 if(!Number.isInteger(pollMs)||pollMs<1000||pollMs>3600000)throw Error('invalid_standalone_poll_interval');
 if(!Array.isArray(siteIds)||siteIds.length>20||siteIds.some(id=>!/^A\d{3}$/.test(id))||new Set(siteIds).size!==siteIds.length)throw Error('invalid_collector_site_scope');
 const assistController=new AbortController(),stopAssist=()=>assistController.abort();signal?.addEventListener('abort',stopAssist,{once:true});const assistRequest=options.request||createWebTransport(options);const assistance=require('./browser-assistance-runtime.cjs').runAssistanceLoop({request:assistRequest,signal:assistController.signal});
 let cursor=0,retryAttempt=0;const runner=createWebCollector(options);try{while(!signal?.aborted){try{const selected=siteId||siteIds.length&&siteIds[cursor++%siteIds.length]||undefined;const result=await runner.runOne({siteId:selected});if(retryAttempt)require('../lib/service-api-recovery.cjs').report('standalone_collector','api_recovered',retryAttempt,options.log);retryAttempt=0;if((!result.jobId||result.status==='submission_deferred')&&!signal?.aborted)await new Promise(resolve=>{const done=()=>{clearTimeout(timer);signal?.removeEventListener('abort',done);resolve();},timer=setTimeout(done,pollMs);signal?.addEventListener('abort',done,{once:true});});}catch(error){if(signal?.aborted)break;if(!require('../lib/service-api-recovery.cjs').transient(error))throw error;retryAttempt++;if(retryAttempt===1||retryAttempt%10===0)require('../lib/service-api-recovery.cjs').report('standalone_collector','api_retry_wait',retryAttempt,options.log);await retryWait(retryAttempt,signal);}}}finally{stopAssist();signal?.removeEventListener('abort',stopAssist);await assistance;await runner.stop();}
}
module.exports={createWebTransport,createWebCollector,runCollectorLoop};
