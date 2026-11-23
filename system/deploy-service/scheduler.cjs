'use strict';
// Host daemon timer; no Codex automation and no browser implementation hidden here.
function createScheduler({store,collect,worker='collector',intervalMs=60000,leaseMs=15*60000,onError=()=>{}}){
 if(!store||typeof collect!=='function')throw Error('Store and collector required');let running=false,timer=null,stopped=false;
 async function tick({siteId}={}){if(running||stopped)return {status:'busy'};running=true;let job;
  try{store.enqueueDue({siteId});job=store.claim(worker,{leaseMs,siteId});if(!job)return {status:'idle'};
   const heartbeat=setInterval(()=>{try{store.renew(job.jobId,job.token,{leaseMs});}catch(e){onError(e);}},Math.max(1000,Math.floor(leaseMs/3)));heartbeat.unref?.();
   try{const result=await collect(job);const status=result?.status||'awaiting_semantic_review';return store.finish(job.jobId,job.token,{status,error:result?.error});}finally{clearInterval(heartbeat);}
  }catch(e){if(job)try{store.finish(job.jobId,job.token,{status:'failed',error:e.message});}catch(leaseError){onError(leaseError);}onError(e);return {status:'failed',error:e.message};}finally{running=false;}}
 function start(){if(timer)return;stopped=false;timer=setInterval(()=>{void tick();},intervalMs);void tick();}
 function stop(){stopped=true;if(timer)clearInterval(timer);timer=null;}
 return {tick,start,stop};
}
module.exports={createScheduler};
