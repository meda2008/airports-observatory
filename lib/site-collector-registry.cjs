'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const E=require('./collection-engine.cjs');
const WEEK=7*86400000;
const STATES=['homepage','auth','register','email','plans','payment','refund','review','block'];
const iso=t=>new Date(t).toISOString();
function buildConfigs(catalog,overrides={},adapterNames=['generic','v2board','whmcs','document_site','flybit']) {
  const plan=E.makePlan(catalog,{overrides:overrides.sites||overrides});
  return plan.records.filter(r=>r.status!=='excluded_non_primary').map(r=>{
    if(!/^[A-Za-z0-9_-]+$/.test(r.recordId))throw Error('Unsafe record id');
    const o=(overrides.sites||overrides)[r.recordId]||{},adapter=o.adapter||'generic';
    if(!adapterNames.includes(adapter))throw Error('Unknown adapter '+adapter);
    const hosts=[r.entryUrl&&new URL(r.entryUrl).hostname,...(o.allowedHosts||[])].filter(Boolean);
    if(hosts.some(h=>!E.safeUrl('https://'+h+'/')||new URL('https://'+h+'/').hostname!==h))throw Error('Invalid allowed host');
    return {schemaVersion:'airports-site-collector.v1',recordId:r.recordId,name:r.name,entryUrl:r.entryUrl,
      entrySource:o.entryUrl?'collection/site-overrides.json':catalog.items.find(x=>x.id===r.recordId)?.coreInfo?.website?.url?'public-catalog.coreInfo.website':'public-catalog.officialUrl',
      allowedHosts:[...new Set(hosts)],adapter,maxPages:o.maxPages||4,enabled:r.status==='queued',eligibility:r.status,reason:r.reason,
      websiteCollectorId:r.entryUrl?"url-"+crypto.createHash("sha256").update(JSON.stringify(new URL(r.entryUrl).origin)).digest("hex").slice(0,20):null,workflow:STATES,refreshIntervalMs:WEEK,fields:E.FIELDS,
      policy:{browser:'codex_builtin',allowPayment:false,allowPaidTrial:false,allowProtectionBypass:false,cloudflare:'checkpoint_and_backoff',unpaidOrder:'explicit_existing_workflow_authorization_and_cleanup_required',registration:'existing_authorization_required',publication:'independent_review_required'},
      ...(o.publicOnly===true?{publicOnly:true}:{}),...(o.accountReadOnly===true?{accountReadOnly:true}:{}),...(o.readOnlyRecipe?{readOnlyRecipe:o.readOnlyRecipe}:{}),...(o.auth?{auth:o.auth}:{}),...(o.knowledgeAdapter?{knowledgeAdapter:true}:{}),...(o.includeClientGuides?{includeClientGuides:true}:{}),...(o.registrationProfile?{registrationProfile:o.registrationProfile}:{}),...(o.allowIdentityReview?{allowIdentityReview:true}:{})};
  });
}
function jobId(recordId,dueAt){return 'site-'+recordId+'-'+E.sha(dueAt).slice(0,16);}
function createService({root=path.resolve(__dirname,'..'),now=()=>Date.now()}={}) {
  const dir=path.join(root,'work/site-collector-service'),configDir=path.join(root,'collection/site-collectors'),stateFile=path.join(dir,'state.json');
  const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
  const write=(p,v)=>{const tmp=p+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(tmp,JSON.stringify(v,null,2)+'\n');fs.renameSync(tmp,p);};
  const load=()=>fs.existsSync(stateFile)?read(stateFile):{schemaVersion:'airports-site-collector-service.v1',sites:{},jobs:{}};
  function transaction(fn){fs.mkdirSync(dir,{recursive:true});const lock=path.join(dir,'state.lock');let fd;try{fd=fs.openSync(lock,'wx');}catch(e){if(e.code==='EEXIST')throw Error('Collector state locked; inspect existing process before recovery');throw e;}try{const state=load(),out=fn(state);write(stateFile,state);return out;}finally{fs.closeSync(fd);fs.unlinkSync(lock);}}
  const configs=()=>fs.existsSync(configDir)?fs.readdirSync(configDir).filter(x=>x.endsWith('.json')).sort().map(f=>require('./website-collector-binding.cjs').bindWebsiteCollector(read(path.join(configDir,f)),{directory:path.join(root,'collection/website-collectors')})):[];
  function init(){const c=buildConfigs(require('./catalog-listing.cjs').loadCatalogProjection(root).doc,read(path.join(root,'collection/site-overrides.json')));fs.mkdirSync(configDir,{recursive:true});for(const x of c){const file=path.join(configDir,x.recordId+'.json');if(!fs.existsSync(file))write(file,x);}return transaction(s=>{s.activeRecordIds=c.map(x=>x.recordId);for(const x of c)s.sites[x.recordId]??={dueAt:iso(now()),failures:0,lastSuccessAt:null};return {count:c.length,enabled:c.filter(x=>x.enabled).length,configDir,stateDir:dir};});}
  function plan({now:at=now(),limit=Infinity}={}){return transaction(s=>{const jobs=[],excluded=[];for(const c of configs().filter(c=>!s.activeRecordIds||s.activeRecordIds.includes(c.recordId))){if(!c.enabled){excluded.push({recordId:c.recordId,reason:c.eligibility});continue;}const site=s.sites[c.recordId];if(!site)continue;if(site.pendingReview){excluded.push({recordId:c.recordId,reason:'awaiting_semantic_review'});continue;}if(Date.parse(site.dueAt)>at)continue;const id=jobId(c.recordId,site.dueAt),old=s.jobs[id];if(old?.status==='leased'&&Date.parse(old.lease.expiresAt)>at)continue;if(jobs.length>=limit)continue;s.jobs[id]={...old,jobId:id,recordId:c.recordId,entryUrl:c.entryUrl,config:c,dueAt:site.dueAt,status:'queued',lease:null};jobs.push(s.jobs[id]);}return {generatedAt:iso(at),jobs,excluded};});}
  function claim(id,{owner,now:at=now(),leaseMs=15*60000}={}){if(!owner||!Number.isFinite(leaseMs)||leaseMs<=0)throw Error('Owner and positive lease required');return transaction(s=>{const j=s.jobs[id];if(!j)throw Error('Unknown job');if(j.status!=='queued'&&!(j.status==='leased'&&Date.parse(j.lease.expiresAt)<=at))throw Error('Job unavailable');j.status='leased';j.lease={owner,token:crypto.randomUUID(),expiresAt:iso(at+leaseMs)};return j;});}
  function finish(id,{token,outcome,blocker=null,checkpoint=null,runId=null,now:at=now()}={}){if(!['awaiting_semantic_review','completed','blocked','failed'].includes(outcome))throw Error('Invalid outcome');return transaction(s=>{const j=s.jobs[id];if(!j||j.status!=='leased'||j.lease.token!==token||Date.parse(j.lease.expiresAt)<=at)throw Error('Lease lost');j.status=outcome;j.finishedAt=iso(at);j.blocker=blocker;j.checkpoint=checkpoint;j.runId=runId;j.lease=null;const site=s.sites[j.recordId];site.lastAttemptAt=iso(at);site.lastOutcome=outcome;if(outcome==='completed'){site.lastSuccessAt=iso(at);site.failures=0;site.dueAt=iso(at+WEEK);}else if(outcome==='awaiting_semantic_review'){site.pendingReview=id;site.dueAt=iso(at+WEEK);}else{site.failures++;site.dueAt=iso(at+Math.min(WEEK,3600000*2**Math.min(site.failures-1,8)));}return j;});}
  function resolveReview(id,{approved,now:at=now()}={}){if(typeof approved!=='boolean')throw Error('Explicit review disposition required');return transaction(s=>{const j=s.jobs[id],site=j&&s.sites[j.recordId];if(!site||site.pendingReview!==id)throw Error('No pending review');delete site.pendingReview;j.reviewedAt=iso(at);j.status=approved?'completed':'review_rejected';if(approved){site.lastSuccessAt=iso(at);site.failures=0;site.dueAt=iso(at+WEEK);}else site.dueAt=iso(at+3600000);return j;});}
  return {init,plan,claim,finish,resolveReview,status:()=>load()};
}
module.exports={buildConfigs,createService,jobId,STATES,WEEK};
