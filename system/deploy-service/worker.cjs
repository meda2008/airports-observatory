'use strict';
const fs=require('node:fs'),path=require('node:path');
const {createStore}=require('./store.cjs'),{createScheduler}=require('./scheduler.cjs'),{collectSite}=require('./collector.cjs'),{propose}=require('./extractor.cjs');
function seed(store){const root=path.resolve(__dirname,'..'),catalog=require('../lib/catalog-service.cjs').makeCatalogService({baseDir:root}).rawExport().catalog;const dir=path.join(root,'collection/site-collectors');const configs=fs.readdirSync(dir).filter(x=>x.endsWith('.json')).map(x=>require('../lib/website-collector-binding.cjs').bindWebsiteCollector(JSON.parse(fs.readFileSync(path.join(dir,x))),{directory:path.join(root,'collection/website-collectors')}));store.seedSites(configs.map(c=>({...c,initialDocument:catalog.find(r=>r.id===c.recordId)?.coreInfo||{}})));}
function createCollector({store,browser,credentials={},verificationOptions={},extract=propose,collect=collectSite}){verificationOptions={ocr:require('./ocr.cjs').createLocalOcr(),...verificationOptions};return async job=>{const result=await collect(job.site,{browser,credentials,verificationOptions,maxPages:job.site.config.maxPages});for(const checkpoint of result.checkpoints||[])store.saveEvidence({siteId:job.siteId,jobId:job.jobId,url:checkpoint.url,body:JSON.stringify(checkpoint),kind:'verification_checkpoint',observedAt:checkpoint.observedAt});const observations=result.observations.map(x=>({...x,...store.saveEvidence({siteId:job.siteId,jobId:job.jobId,...x})}));for(const d of result.discovery)store.saveEvidence({siteId:job.siteId,jobId:job.jobId,url:d.parentUrl,body:JSON.stringify(d),kind:'unverified_entry_candidate',observedAt:new Date().toISOString()});if(!observations.length)return{status:'blocked',error:result.blocker||'no_readable_content'};const extraction=require('../collection/url-collectors/index.cjs').extractKnown(observations,{prior:job.site.document})||await extract(observations);if(!extraction.patch||!Object.keys(extraction.patch).length)return{status:'blocked',error:extraction.status};extraction.patch=require('./diff.cjs').changesFor(job.site.document,extraction.patch);if(!Object.keys(extraction.patch).length)return{status:'completed'};const proposal=store.createProposal({siteId:job.siteId,jobId:job.jobId,patch:extraction.patch,evidenceIds:observations.map(x=>x.evidenceId),expectedRevision:job.site.revision});if(process.env.AUTO_REVIEW==='true'){const review=await require('./reviewer.cjs').secondReview(extraction.patch,observations);if(review.approved){store.reviewProposal(proposal.id,{approved:true,expectedRevision:job.site.revision,reviewer:'two_pass_llm_literal_checks'});return{status:'completed'};}}return{status:'awaiting_semantic_review'};};}
// Disabled by default. The paused path never seeds, leases, opens a browser,
// reads credentials or touches existing queued jobs.
function collectionEnabled(value=process.env.COLLECTION_ENABLED){return value==='true';}
function createWorkerController({store,enabled=false,heartbeatMs=30000,log=value=>console.log(JSON.stringify(value)),setTimer=setInterval,clearTimer=clearInterval}={}){
 if(!store||typeof store.setServiceHeartbeat!=='function')throw Error('worker_heartbeat_store_required');
 if(!Number.isFinite(heartbeatMs)||heartbeatMs<1000)throw Error('worker_heartbeat_interval_invalid');
 let timer=null,status=enabled?'running':'paused';
 function heartbeat(){const details={collectionEnabled:enabled,paymentAllowed:false,schedule:'weekly_per_site',reason:enabled?'collection_explicitly_enabled':'collection_disabled'};try{store.setServiceHeartbeat('collector',{status,details});log({service:'collector',status,...details});}catch{log({service:'collector',status:'error',reason:'heartbeat_write_failed'});}}
 function start(){if(timer!==null)return;heartbeat();timer=setTimer(heartbeat,heartbeatMs);}
 function error(){status='error';heartbeat();}
 function stop(){if(timer!==null)clearTimer(timer);timer=null;}
 return{start,stop,error,heartbeat};
}
async function main(){
 const store=createStore({filename:process.env.STORE_FILE||path.join(__dirname,'data/collector.sqlite')});
 const enabled=collectionEnabled(),controller=createWorkerController({store,enabled});
 controller.start();
 let browser=null,scheduler=null,stopping=false;
 const stop=async()=>{if(stopping)return;stopping=true;controller.stop();scheduler?.stop();if(browser)await browser.close();store.close();};
 process.once('SIGTERM',()=>void stop());process.once('SIGINT',()=>void stop());
 if(!enabled){if(process.argv.includes('--once'))await stop();return;}
 try{
  seed(store);
  const {chromium}=require('playwright');browser=await chromium.launch({headless:true});
  const credentials=process.env.CREDENTIALS_FILE?JSON.parse(fs.readFileSync(process.env.CREDENTIALS_FILE)):{};
  scheduler=createScheduler({store,collect:createCollector({store,browser,credentials}),intervalMs:Number(process.env.POLL_MS||60000),onError:()=>controller.error()});
  if(process.argv.includes('--once')){console.log(JSON.stringify(await scheduler.tick({siteId:process.env.SITE_ID})));await stop();return;}
  scheduler.start();
 }catch{controller.error();await stop();throw Error('collector_startup_failed');}
}
if(require.main===module)main().catch(()=>{console.error(JSON.stringify({service:'collector',status:'error',reason:'worker_startup_failed'}));process.exitCode=1;});
module.exports={seed,createCollector,collectionEnabled,createWorkerController};
