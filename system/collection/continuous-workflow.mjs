import fs from 'node:fs';
import path from 'node:path';
import {runWorkflow} from './workflow.mjs';

const active=new Set(['collecting','discovering','collecting_targeted_official_entries','collecting_verified_entries','inspecting_unpaid_orders','release_running']);
const complete=new Set(['published_online_verified','verified_local_not_published','completed_with_blockers_no_new_facts']);
// A persisted campaign drains executable work. External dependencies remain
// explicit; exhaustion of runnable work never means the data is complete.
export async function runContinuous({journalFile,runs,step=runWorkflow,handlers={},onProgress=()=>{},maxSteps=Infinity,resumeBlocked=()=>false}){
 if(!runs?.length)throw Error('Explicit run scope required');
 const identity=runs.map(r=>({runId:r.runId,recordIds:r.recordIds,createUnpaidAllowed:r.createUnpaidAllowed===true,paymentAllowed:false,finalize:r.finalize===true,publish:r.publish===true,batch:r.batch||null,...(r.dependsOn?{dependsOn:r.dependsOn}:{})}));
 if(runs.some(r=>r.paymentAllowed===true))throw Error('Payment is forbidden');
 let state=fs.existsSync(journalFile)?JSON.parse(fs.readFileSync(journalFile,'utf8')):{schemaVersion:'airports-continuous.v1',identity,items:{},events:[]};
 if(JSON.stringify(state.identity)!==JSON.stringify(identity))throw Error('Campaign scope or authority changed');
 const save=()=>{state.updatedAt=new Date().toISOString();fs.mkdirSync(path.dirname(journalFile),{recursive:true});fs.writeFileSync(journalFile+'.tmp',JSON.stringify(state,null,2)+'\n');fs.renameSync(journalFile+'.tmp',journalFile);};
 let consumed=0;
 for(const run of runs){
  let item=state.items[run.runId]||={status:'queued',steps:0};
  if(run.dependsOn&&!['published_online_verified','verified_local_not_published'].includes(state.items[run.dependsOn]?.status)){item.status='waiting_for_pilot';item.waiting=true;save();continue;}
  if(item.blocked&&await resumeBlocked({run,item})){state.events.push({at:new Date().toISOString(),runId:run.runId,status:'explicit_breakpoint_resume',previous:{...item}});delete item.blocked;delete item.error;}
  if(item.terminal||item.blocked)continue;
  while(true){
   if(consumed>=maxSteps){state.status='execution_yielded';save();return state;}
   item.status='running';delete item.waiting;save();let result;consumed++;
   try{result=await step({...run,limit:1,orderLimit:1,paymentAllowed:false});}
   catch(error){item.status='execution_error';item.error=String(error.message).slice(0,400);item.blocked=true;save();break;}
   item.steps++;item.status=result.status;item.dataComplete=result.dataComplete===true;
   state.events.push({at:new Date().toISOString(),runId:run.runId,status:result.status});save();await onProgress({runId:run.runId,...item});
   // Uncancelled orders take precedence over every other campaign action.
   if(result.status==='cleanup_required_stop_batch'||result.cleanupRequired){state.status='cleanup_required_stop_campaign';save();return state;}
   if(complete.has(result.status)){item.terminal=true;save();break;}
   if(active.has(result.status)){if(result.status==='release_running')await new Promise(resolve=>setTimeout(resolve,1000));continue;}
   const handler=handlers[result.status];
   if(handler){let receipt;try{receipt=await handler({run,result});}catch(error){item.status='dependency_failed';item.error=String(error.message).slice(0,400);item.blocked=true;save();break;}if(receipt?.resolved===true)continue;if(receipt?.waiting){item.waiting=true;save();break;}}
   item.blocked=true;item.blocker=result.status;save();break;
  }
 }
 state.status=Object.values(state.items).some(x=>x.waiting&&!x.terminal&&!x.blocked)?'waiting_for_dependencies':Object.values(state.items).every(x=>x.dataComplete)?'data_complete':'runnable_queue_exhausted_with_gaps';save();return state;
}
