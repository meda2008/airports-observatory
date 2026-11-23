'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {root,runDir}=require('./collection.cjs');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function resume({runId,directory,recordIds}){
 const dir=runDir(runId),inputDir=path.resolve(directory);assert(inputDir.startsWith(root+path.sep));
 const plan=read(path.join(dir,'plan.json')),state=read(path.join(dir,'state.json')),receipts=[];
 const approval=read(path.join(inputDir,'terms-confirmation.json'));
 assert.equal(approval.source,'current_user_reply');assert.equal(approval.scope,'accept_existing_entry_terms_then_read_only');
 for(const id of recordIds){
  const task=plan.tasks.find(t=>t.recordIds.includes(id));assert(task);assert(approval.recordIds.includes(id)&&approval.origins.includes(new URL(task.entryUrl).origin));const file=path.join(inputDir,id+'-guides.json'),raw=read(file);
  assert(raw.captures.some(c=>c.authenticated===true&&!c.passwordForm));const sources=[];
  for(const capture of raw.captures){assert.equal(new URL(capture.url).origin,new URL(task.entryUrl).origin);assert(Number.isFinite(Date.parse(capture.capturedAt)));assert(capture.text);
   const bytes=JSON.stringify({...capture,authenticationObserved:true,representation:'redacted_visible_DOM_text_not_original_HTML'},null,2)+'\n',hash=sha(bytes),relative='evidence/'+hash+'.json';fs.writeFileSync(path.join(dir,relative),bytes);
   sources.push({sourceId:'COLLECT-'+hash.slice(0,24),file:relative,sha256:hash,url:capture.url,capturedAt:capture.capturedAt,recordIds:task.recordIds,grade:'E1',independenceScore:'I0',representation:'redacted_visible_DOM_text_not_original_HTML',semanticLocation:capture.semanticLocation});
  }
  state.attemptHistory??={};if(state.results[task.taskId])(state.attemptHistory[task.taskId]??=[]).push(state.results[task.taskId]);
  state.results[task.taskId]={taskId:task.taskId,recordIds:task.recordIds,status:'observed_needs_review',sources,errors:[],authenticationObserved:true,knowledgeObservation:{status:raw.status,actions:raw.actions,articleTitles:raw.articleTitles},termsConfirmationReceipt:path.relative(root,path.join(inputDir,'terms-confirmation.json')).replaceAll('\\','/'),finishedAt:new Date().toISOString()};
  task.includeClientGuides=true;task.previousArticleTitles=raw.articleTitles;receipts.push({recordId:id,sourceCount:sources.length,articleCount:raw.captures.filter(c=>c.kind==='operator_knowledge_article').length,inputSha256:sha(fs.readFileSync(file))});
 }
 for(const [name,value]of [['state.json',state],['plan.json',plan]]){const target=path.join(dir,name);fs.writeFileSync(target+'.tmp',JSON.stringify(value,null,2)+'\n');fs.renameSync(target+'.tmp',target);}
 const result={at:new Date().toISOString(),receipts,paymentExecuted:false,newOrdersCreated:0};fs.writeFileSync(path.join(inputDir,'resume-receipts.json'),JSON.stringify(result,null,2)+'\n');return result;
}
if(require.main===module)console.log(JSON.stringify(resume({runId:process.argv[2],directory:process.argv[3],recordIds:process.argv.slice(4)}),null,2));
module.exports={resume};
