'use strict';
// HTTP-only execution client. The API owns queues, parsing, proposals and SQLite.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {collectWithReferences,runDirectory,earlierPending}=require('./standalone-worker.cjs');
const {redact}=require('./standalone-collector.cjs');
const {MAX_JSON_BYTES}=require('../lib/read-utf8-json.cjs');
const {submissionPlan}=require('../lib/collector-submission.cjs');
const pendingName='pending-submission.json',holdName='pending-submission-hold.json',retryName='pending-submission-retry.json';
const terminalRuns=new Set(['completed','blocked','awaiting_semantic_review','review_approved','review_rejected','cancelled']);
function writeAtomic(file,value,{exclusive=false}={}){
 const temporary=file+'.'+crypto.randomUUID()+'.tmp';
 try{
  fs.writeFileSync(temporary,JSON.stringify(value),{flag:'wx',mode:0o600});
  if(exclusive)fs.linkSync(temporary,file);else fs.renameSync(temporary,file);
 }finally{fs.rmSync(temporary,{force:true});}
}
function readPending(raw){
 try{
  const item=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  const packet=item?.packet;
  if([item?.siteId,item?.jobId,item?.runId].every(id=>typeof id==='string'&&/^[a-zA-Z0-9_-]+$/.test(id))&&
     packet?.jobId===item.jobId&&typeof packet.token==='string'&&packet.token&&
     Array.isArray(packet.captures)&&packet.captures.every(c=>c&&typeof c==='object'&&!Array.isArray(c)))return item;
 }catch{}
 return null;
}
function createWebTransport({baseUrl=process.env.INTERNAL_API_URL||'http://api:8080',token=process.env.COLLECTOR_TOKEN,tokenFile=process.env.INTERNAL_TOKEN_FILE,fetchImpl=globalThis.fetch,timeoutMs=60000}={}){
 if(!baseUrl)throw Error('collector_api_url_required');
 const base=new URL(baseUrl);if(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.search||base.hash)throw Error('invalid_collector_api_url');
 const secret=token||(tokenFile?fs.readFileSync(tokenFile,'utf8').trim():'');if(!secret)throw Error('collector_token_required');
 return async(op,input={},batchBody)=>{let response;try{response=await fetchImpl(new URL('/internal/web-collector/'+op,base),{method:'POST',headers:{authorization:'Bearer '+secret,'content-type':op==='receivebatches'?'application/x-ndjson':'application/json'},body:batchBody??JSON.stringify(input),signal:AbortSignal.timeout(timeoutMs),redirect:'error'});}catch(error){throw require('../lib/service-api-recovery.cjs').wrap(error);}let data;try{data=await response.json();}catch(cause){const wrapped=require('../lib/service-api-recovery.cjs').wrap(cause);if(require('../lib/service-api-recovery.cjs').transient(wrapped))throw wrapped;const error=Error('collector_api_response_invalid');error.status=response.status;throw error;}if(!response.ok){const error=Error(data.error||'collector_api_request_failed');error.status=response.status;throw error;}return data;};
}
function createWebCollector({request,baseUrl,token,tokenFile,fetchImpl,browserFactory,collect,output=process.env.STANDALONE_OUTPUT_DIR||path.join(__dirname,'data/web-evidence'),sessionDir=process.env.STANDALONE_SESSION_DIR,credentialsFile=process.env.CREDENTIALS_FILE,workerName='collector-web',jobBudgetMs=Number(process.env.STANDALONE_JOB_BUDGET_MS||35000),renewMs=20000,clock=Date.now,log=value=>console.log(JSON.stringify(value))}={}){
 if(!Number.isInteger(jobBudgetMs)||jobBudgetMs<1000||jobBudgetMs>180000)throw Error('invalid_standalone_job_budget');
 request||=createWebTransport({baseUrl,token,tokenFile,fetchImpl});
 browserFactory||=async()=>require('playwright').chromium.launch({headless:true,timeout:20000});
 let browser=null,stopping=false,active=0;
 const safeLog=value=>{try{log(value);}catch{}};
 const beat=async(status,reason)=>{try{await request('heartbeat',{status,details:{runnerName:workerName,executionMode:'standalone',browser:'service_headless',active,paymentAllowed:false,reason:reason||null}});}catch{safeLog({service:'standalone_collector',status:'heartbeat_deferred'});}};
 function holdPending(dir,reason,item,details={}){
  const marker={status:'submission_held',reason,at:new Date().toISOString(),...(item&&{siteId:item.siteId,jobId:item.jobId,runId:item.runId}),...details};
  try{writeAtomic(path.join(dir,holdName),marker,{exclusive:true});}
  catch(error){if(error.code!=='EEXIST')safeLog({service:'standalone_collector',status:'submission_hold_write_deferred',directory:path.basename(dir)});return;}
  safeLog({service:'standalone_collector',directory:path.basename(dir),...marker});
 }
 async function replayPending(item,dir,pending){
  let transport=submissionPlan(item.packet);
  if(!transport.op)return {holdReason:'submission_payload_too_large',details:{bytes:transport.bytes,maxBytes:MAX_JSON_BYTES}};
  const run=await request('run',{runId:item.runId});
  if(run?.status==='cancel_requested'){
   const archived=path.join(dir,'cancelled-pending-submission.json');
   if(!fs.existsSync(archived))fs.copyFileSync(pending,archived,fs.constants.COPYFILE_EXCL);
   return {accepted:await request('cancel',{jobId:item.jobId,token:item.packet.token,actor:workerName})};
  }
  if(terminalRuns.has(run?.status))return {accepted:run};
  if(run?.status==='failed')return {holdReason:'run_failed'};
  if(run===null||run?.status==='outdated_config')return {holdReason:run===null?'run_missing':'outdated_config'};
  let leaseUnavailable=run?.status==='lease_expired'||(typeof run?.leaseExpiresAt==='number'&&run.leaseExpiresAt<=clock());
  const canRecover=item.packet.captures.length>0&&item.packet.captures.every(c=>c.metadata?.retainedReplayVerified===true);
  if(!leaseUnavailable){
   try{await request('renew',{jobId:item.jobId,token:item.packet.token,leaseMs:180000});}
   catch(error){
    const lost=['collector_lease_unavailable','Bridge lease lost','Entry discovery lease lost','Entry discovery lease expired'].includes(error?.message);
    // The internal API also returns 409 for retryable failures. It alone cannot establish expiry.
    if(!lost)throw error;
    leaseUnavailable=true;
   }
  }
  if(leaseUnavailable){
   if(!canRecover)return {holdReason:'lease_expired'};
   await replaceRetainedLease(item,dir,pending);
   transport=submissionPlan(item.packet);
   if(!transport.op)return {holdReason:'submission_payload_too_large',details:{bytes:transport.bytes,maxBytes:MAX_JSON_BYTES}};
  }
  return {accepted:await request(transport.op,item.packet,transport.body)};
 }
 async function replaceRetainedLease(item,dir,pending){
  const {job}=await request('recoverretained',{jobId:item.jobId,token:item.packet.token,worker:workerName})||{};
  if(job?.jobId!==item.jobId||typeof job.runId!=='string'||!job.runId||typeof job.token!=='string'||!job.token)throw Error('invalid_retained_recovery');
  const original=path.join(dir,'original-pending-submission.json');
  if(!fs.existsSync(original))fs.copyFileSync(pending,original,fs.constants.COPYFILE_EXCL);
  const oldRunId=item.runId,replacement={...item,runId:job.runId,packet:{...item.packet,token:job.token}};
  writeAtomic(pending,replacement);
  Object.assign(item,replacement);
  fs.writeFileSync(path.join(dir,'lease-recovery.json'),JSON.stringify({jobId:item.jobId,oldRunId,newRunId:item.runId,at:new Date().toISOString(),networkRecaptured:false},null,2));
 }
 async function recoverPending(siteId,protectedEntries){
  if(!fs.existsSync(output))return {};
  let deferred,replayed=false;
  for(const entry of fs.readdirSync(output,{withFileTypes:true})){
   if(!entry.isDirectory())continue;
   const dir=path.join(output,entry.name),pending=path.join(dir,pendingName);
   if(fs.existsSync(path.join(dir,holdName))){
    if(fs.existsSync(pending))protectedEntries.push({dir});
    continue;
   }
   let raw;
   try{raw=fs.readFileSync(pending);}
   catch(error){
    if(error.code!=='ENOENT'){
     protectedEntries.push({dir});
     safeLog({service:'standalone_collector',status:'submission_read_deferred',directory:entry.name});
    }
    continue;
   }
   const item=readPending(raw);
   if(!item){
    protectedEntries.push({dir});
    holdPending(dir,'invalid_pending_submission');
    continue;
   }
   if(siteId&&item.siteId!==siteId)continue;
   const retryFile=path.join(dir,retryName);
   let retry;
   try{retry=JSON.parse(fs.readFileSync(retryFile,'utf8'));}catch{}
   if(replayed||retry?.nextRetryAt>clock()){
    protectedEntries.push({dir,item});
    continue;
   }
   replayed=true;
   try{
    const {accepted,holdReason,details}=await replayPending(item,dir,pending);
    if(holdReason){
     protectedEntries.push({dir,item});
     holdPending(dir,holdReason,item,details);
     replayed=false;
     continue;
    }
    if(!terminalRuns.has(accepted?.status))throw Error('invalid_pending_submission_response');
    const result={siteId:item.siteId,jobId:item.jobId,runId:item.runId,status:accepted.status,acceptanceRecoveredFromApi:true};
    if(!fs.existsSync(path.join(dir,'accepted.json')))fs.writeFileSync(path.join(dir,'accepted.json'),JSON.stringify(result,null,2),{flag:'wx',mode:0o600});
    fs.rmSync(retryFile,{force:true});
    fs.unlinkSync(pending);
    return {result};
   }catch{
    protectedEntries.push({dir,item});
    const attempts=Number.isSafeInteger(retry?.attempts)&&retry.attempts>0?Math.min(retry.attempts+1,10):1;
    const nextRetryAt=clock()+Math.min(300000,1000*2**(attempts-1));
    deferred={status:'submission_deferred',jobId:item.jobId,runId:item.runId,reason:'retained_submission_requires_recovery',nextRetryAt};
    try{writeAtomic(retryFile,{attempts,...deferred});}catch{safeLog({service:'standalone_collector',status:'submission_retry_write_deferred',directory:entry.name});}
   }
  }
  return {deferred};
 }
 async function runOne({siteId}={}){
  const settings=await request('control');if(stopping||!settings.engineEnabled||settings.executionMode!=='standalone'){await beat('paused','execution_disabled_or_other_mode');return{status:'paused'};}
  const protectedEntries=[];
  const {result:recovered,deferred}=await recoverPending(siteId,protectedEntries);
  if(recovered)return recovered;
  const claimed=await request('claim',{worker:workerName,siteId,leaseMs:180000}),job=claimed?.job;
  if(!job){await beat('connected');return deferred||{status:'idle'};}
  const dir=runDirectory(output,job),pendingFile=path.join(dir,pendingName);
  const protectedEntry=protectedEntries.find(entry=>entry.dir===dir||(entry.item
   ?entry.item.jobId===job.jobId&&entry.item.siteId===job.siteId
   :path.basename(entry.dir).startsWith(job.siteId+'-'+job.jobId+'-')));
  if(protectedEntry||fs.existsSync(pendingFile)){
   const type='retained_submission_requires_recovery';
   const checkpoint={type,url:job.site.config.entryUrl,stage:'storage_recovery',reason:'原始待交付记录已保留，需人工核对',requestedAction:'核对原任务和留存材料后显式恢复'};
   holdPending(protectedEntry?.dir||dir,'lease_reclaimed',protectedEntry?.item);
   const identity={siteId:job.siteId,jobId:job.jobId,runId:job.runId};
   let result;
   try{
    const accepted=await request('complete',{jobId:job.jobId,token:job.token,status:'blocked',blocker:type,checkpoint,actor:workerName});
    if(accepted?.status!=='blocked')throw Error('invalid_retained_submission_checkpoint_response');
    result={...identity,status:accepted.status,checkpoint:type};
   }catch{
    result={...identity,status:'submission_deferred',reason:type};
   }
   safeLog({service:'standalone_collector',...result});
   return result;
  }
  fs.mkdirSync(dir,{recursive:true});active++;await beat('connected');let renewal=null,leaseError=null,result,material,retained=false;
  const renew=()=>request('renew',{jobId:job.jobId,token:job.token,leaseMs:180000});
  const timer=setInterval(()=>{if(renewal)return;renewal=renew().then(()=>beat('connected')).catch(error=>{leaseError=error;}).finally(()=>{renewal=null;});},renewMs);
  const beforePage=async()=>{if(stopping)throw Error('standalone_execution_paused');if(renewal)await renewal;if(leaseError)throw leaseError;const current=await request('control');if(!current.engineEnabled||current.executionMode!=='standalone')throw Error('standalone_execution_paused');await renew();};
  try{
   const prior=earlierPending(output,job,dir),guard=claimed.partialReparseGuard;
   if(prior||guard)material={captures:[],checkpoint:{type:guard?'retained_partial_reparse_requires_recovery':'retained_submission_requires_recovery',url:job.site.config.entryUrl,stage:'storage_recovery',reason:'已有原文或重解析任务待恢复；保留原件，不重复网络采集',requestedAction:'复核原任务与原文后显式恢复'},capabilities:{},retainedSubmissionGuard:true};
   else if(job.retainedCaptures){await beforePage();material={captures:job.retainedCaptures,checkpoint:null,retainedReplay:true,ordersCreated:0,paymentExecuted:false};}
   else{await beforePage();browser||=await browserFactory();material=job.discoveryOnly||job.entryDiscovery?await require('./entry-discovery.cjs').collectEntryDiscovery(job,{browser,jobBudgetMs,beforePage}):await collectWithReferences(job.site,{browser,collect,credentialsFile,sessionDir,jobBudgetMs,beforePage,webEgressProfile:job.webEgressProfile,prior:claimed.prior||{}});}
   const captures=material.captures||[];
   if(material.ordersCreated||material.paymentExecuted)throw Error('read_only_collection_contract_violated');
   for(const [i,c]of captures.entries())fs.writeFileSync(path.join(dir,'capture-'+i+'.json'),JSON.stringify({...c,sha256:crypto.createHash('sha256').update(c.body).digest('hex')},null,2),{flag:'wx',mode:0o600});
   fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify({siteId:job.siteId,jobId:job.jobId,runId:job.runId,profileRevision:job.profileRevision,siteRevision:job.siteRevision,executionMode:'standalone',...material,captures:captures.map((c,i)=>({url:c.url,observedAt:c.observedAt,kind:c.kind,file:'capture-'+i+'.json'}))},null,2),{flag:'wx',mode:0o600});
   const packet={jobId:job.jobId,token:job.token,captures:captures.map(c=>({...c,sha256:crypto.createHash('sha256').update(c.body).digest('hex')})),checkpoint:material.checkpoint,capabilities:material.capabilities,observationBasis:material.retainedSubmissionGuard||material.retainedReplay?'retained_reparse':material.browser==='service_native_api'?'standalone_native_api':'standalone_browser',worker:workerName};
   const identity={siteId:job.siteId,jobId:job.jobId,runId:job.runId};
   const transport=submissionPlan(packet),{bytes}=transport,oversized=!transport.op;
   writeAtomic(pendingFile,{...identity,state:oversized?'submission_held':'pending_api_submission',packet},{exclusive:true});retained=true;
   if(oversized){
    const type='submission_payload_too_large';
    holdPending(dir,type,identity,{bytes,maxBytes:MAX_JSON_BYTES});
    const checkpoint={type,url:job.site.config.entryUrl,stage:'storage_recovery',reason:`待提交原文共 ${bytes} 字节，无法按每批 ${MAX_JSON_BYTES} 字节上限完整提交`,requestedAction:'保留原件，按已核验的可提交批次恢复'};
    const blocked=await request('complete',{jobId:job.jobId,token:job.token,status:'blocked',blocker:type,checkpoint,actor:workerName});
    if(blocked?.status!=='blocked')throw Error('invalid_oversized_submission_checkpoint_response');
    return result={...identity,status:'blocked',checkpoint:type};
   }
   await beforePage();const accepted=await request(transport.op,packet,transport.body);
   if(!terminalRuns.has(accepted?.status))throw Error('invalid_pending_submission_response');
   result={siteId:job.siteId,jobId:job.jobId,runId:job.runId,status:accepted.status,proposalId:accepted.proposalId||null,checkpoint:material.checkpoint?.type||null};
   fs.writeFileSync(path.join(dir,'accepted.json'),JSON.stringify(result,null,2),{flag:'wx',mode:0o600});fs.unlinkSync(pendingFile);
  }catch(error){
   result={siteId:job.siteId,jobId:job.jobId,runId:job.runId,status:retained?'submission_deferred':'blocked',reason:redact(error.message).slice(0,300)};
   if(error.message==='Job cancellation requested')try{const ack=await request('cancel',{jobId:job.jobId,token:job.token,actor:workerName});result.status=ack.status;}catch{}
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
