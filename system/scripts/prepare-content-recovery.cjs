'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {root,runDir}=require('./collection.cjs'),E=require('../lib/collection-engine.cjs');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function prepare(runId,{inventoryFile=path.join(root,'outputs/database-inventory-current/primary/records.json'),candidatesFile=path.join(root,'work/site-collector-service/unified-run-20261103/recovery-candidates.json')}={}){
 const dir=runDir(runId);if(fs.existsSync(path.join(dir,'plan.json')))return{runId,resumed:true,tasks:read(path.join(dir,'plan.json')).tasks.length};
 const inventory=read(inventoryFile),candidates=read(candidatesFile),rows=new Map(inventory.records.map(r=>[r.id,r])),groups=new Map(),excluded=[];
 for(const c of candidates.candidates){
  const r=rows.get(c.recordId);if(!r||['A034','A047','A049','A068','A075','A080'].includes(c.recordId)){excluded.push({id:c.recordId,reason:'scope_or_user_skip'});continue;}
  if(/404|请验证您是真人|正在进行安全验证|进入前确认|继续即表示同意/.test(c.retainedExcerpt||'')){excluded.push({id:c.recordId,reason:'error_or_protection_not_content_loading'});continue;}
  if(!/(?:#\/|\/)(?:knowledge|docs|help)(?:[/?#]|$)/i.test(c.url)){excluded.push({id:c.recordId,reason:'not_knowledge_route'});continue;}
  const original=path.resolve(c.latestSourceFile);assert(original.startsWith(path.resolve(root)+path.sep),'Recovery proof must stay in project');assert.equal(hash(fs.readFileSync(original)),c.sha256,'Recovery proof hash mismatch');
  assert.equal(new URL(c.url).origin,new URL(r.coreInfo.website.url).origin,'Recovery origin mismatch');
  const fields=r.missingFields.filter(f=>['pricing','payment','refund','privacy','compatibility','trial'].includes(f));if(!fields.length)continue;
  let task=groups.get(c.url);if(!task){task={taskId:E.sha('content-recovery|'+c.url).slice(0,20),recordIds:[],entryUrl:c.url,allowedHosts:[new URL(c.url).hostname],adapter:'auto',maxPages:1,maxArticles:4,knowledgeAdapter:true,allowRegistration:false,targetFields:[],previousArticleTitles:[],recoveryProofs:[],execution:'recover_unloaded_spa_content'};groups.set(c.url,task);}
  task.recordIds.push(c.recordId);task.targetFields=[...new Set([...task.targetFields,...fields])];task.previousArticleTitles=[...new Set([...task.previousArticleTitles,...c.existingTitles||[]])];task.recoveryProofs.push({file:path.relative(root,original).replaceAll('\\','/'),sha256:c.sha256,capturedAt:c.capturedAt,priorTextLength:c.textLength});
 }
 fs.mkdirSync(path.join(dir,'evidence'),{recursive:true});const tasks=[...groups.values()];
 write(path.join(dir,'plan.json'),{runId,createdAt:new Date().toISOString(),inventoryGeneratedAt:inventory.generatedAt,inventorySha256:hash(fs.readFileSync(inventoryFile)),tasks,records:inventory.records.map(r=>({recordId:r.id,name:r.name,missing:r.missingFields,status:tasks.some(t=>t.recordIds.includes(r.id))?'content_recovery_queued':'needs_other_source_or_measurement'})),excluded,policy:{paymentAllowed:false,orderCreation:false,captcha:'current_confirmation_or_checkpoint',deduplication:'origin_category_article_and_content_not_url_alone',rawEvidence:'retain_capture_time_and_hash'}});
 write(path.join(dir,'state.json'),{runId,results:{},discovery:{},version:3});
 write(path.join(dir,'prior-context.json'),{basis:'latest_reviewed_SQLite_overlay_inventory',records:inventory.records.map(r=>({id:r.id,coreInfo:r.coreInfo}))});
 return{runId,primaryRecords:inventory.records.length,tasks:tasks.length,excluded:excluded.length,dataComplete:false};
}
function retainPilot(runId,recordId,snapshot){
 const dir=runDir(runId),plan=read(path.join(dir,'plan.json')),task=plan.tasks.find(t=>t.recordIds.includes(recordId));assert(task,'Pilot outside recovery scope');
 assert.equal(new URL(snapshot.url).origin,new URL(task.entryUrl).origin);assert.equal(snapshot.semanticLocation?.stage,'article');assert(snapshot.text.length>250&&Number.isFinite(Date.parse(snapshot.capturedAt)));
 const bytes=JSON.stringify(snapshot,null,2)+'\n',sha256=hash(bytes),file='evidence/'+sha256+'.json';fs.writeFileSync(path.join(dir,file),bytes);
 const source={sourceId:'COLLECT-'+sha256.slice(0,24),file,sha256,url:snapshot.url,capturedAt:snapshot.capturedAt,recordIds:task.recordIds,grade:'E1',independenceScore:'I0',representation:'redacted_visible_DOM_text_not_original_HTML',semanticLocation:snapshot.semanticLocation,hints:E.extract(snapshot,'COLLECT-'+sha256.slice(0,24))};
 const state=read(path.join(dir,'state.json'));state.results[task.taskId]={taskId:task.taskId,recordIds:task.recordIds,status:'observed_needs_review',sources:[source],knowledgeObservation:{status:'article_bodies_observed',articleTitles:[snapshot.semanticLocation.title]},errors:[],finishedAt:new Date().toISOString()};write(path.join(dir,'state.json'),state);return{sourceId:source.sourceId,file,sha256};
}
if(require.main===module)console.log(JSON.stringify(prepare(process.argv[2])));
module.exports={prepare,retainPilot};
