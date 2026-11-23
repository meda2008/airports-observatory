'use strict';
const fs=require('node:fs'),path=require('node:path'),{processJobs}=require('./unified-worker.cjs');
async function watch(file){
 const runtimeTemp=path.join(require('./collection.cjs').root,'work/runtime-temp');fs.mkdirSync(runtimeTemp,{recursive:true});process.env.TEMP=runtimeTemp;process.env.TMP=runtimeTemp;
 const parent=path.dirname(path.resolve(file)),log=path.join(parent,'backend-worker-events.ndjson');
 while(true){
  const campaign=JSON.parse(fs.readFileSync(file,'utf8'));
  for(const spec of campaign.runs){try{const r=processJobs(spec.runId);if(r.processed)fs.appendFileSync(log,JSON.stringify({at:new Date().toISOString(),runId:spec.runId,...r})+'\n');}catch(error){fs.appendFileSync(log,JSON.stringify({at:new Date().toISOString(),runId:spec.runId,error:String(error.message)})+'\n');}}
  if(campaign.stopWorker===true)return;
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
}
if(require.main===module)watch(process.argv[2]).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={watch};
