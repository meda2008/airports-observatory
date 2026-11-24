'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {root,runDir}=require('./collection.cjs');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const SKIP=require('../lib/collection-user-skips.cjs').skippedRecordIds;
function prepare(runId,{registryFile=path.join(root,'work/website-collectors/index.json'),requestedFields=['pricing','payment','refund']}={}){
 const dir=runDir(runId),file=path.join(dir,'plan.json');if(fs.existsSync(file))return{resumed:true,tasks:read(file).tasks.length};
 const registry=read(registryFile),inventory=read(path.join(root,'outputs/database-inventory-current/primary/records.json'));assert.equal(registry.inventoryGeneratedAt,inventory.generatedAt,'Rebuild website registry after inventory changes');
 const tasks=[],excluded=[];
 for(const collector of registry.collectors)for(const route of collector.readTasks){
  if(!require('../lib/website-collectors.cjs').readOnlyPolicyLink(route)){excluded.push({url:route.url,reason:'static_asset_or_non_document_route'});continue;}
  const recordIds=route.recordIds.filter(id=>!SKIP.has(id));if(!recordIds.length){excluded.push({url:route.url,reason:'standing_user_skip'});continue;}
  const hints=require('../lib/website-collectors.cjs').routeFieldHints(route),wanted=collector.targetFields.filter(f=>requestedFields.includes(f)&&(!hints||hints.includes(f)));if(!wanted.length){excluded.push({url:route.url,reason:'not_relevant_to_requested_missing_fields',routeFields:hints,requestedFields});continue;}
  const proof=path.resolve(root,route.proofFile);assert(proof.startsWith(root+path.sep));const bytes=fs.readFileSync(proof);assert.equal(hash(bytes),route.proofSha256,'Native route proof changed');assert.equal(new URL(route.url).origin,collector.origin);
  const document=require('../lib/retained-document.cjs').normalizeRetainedDocument(bytes,{sha256:route.proofSha256,url:route.parentUrl,last_capture_at:route.parentCapturedAt});
  if(!document.links.some(l=>l.url===route.url)){excluded.push({url:route.url,reason:'native_link_not_in_hashed_original'});continue;}
  tasks.push({taskId:route.taskId,collectorId:collector.collectorId,recordIds,entryUrl:route.url,allowedHosts:[new URL(collector.origin).hostname],adapter:'auto',maxPages:1,allowRegistration:false,publicOnly:collector.policy.publicOnly===true,readOnlyRecipe:collector.capabilities.readOnlyRecipe||undefined,knowledgeAdapter:collector.capabilities.knowledgeAdapter&&/\/\#\/knowledge(?:[/?#]|$)/.test(route.url),includeClientGuides:collector.capabilities.includeClientGuides,auth:collector.capabilities.auth||undefined,registrationProfile:collector.capabilities.registrationProfile||undefined,accountReadOnly:collector.policy.accountReadOnly===true,targetFields:collector.targetFields,proofFile:route.proofFile,proofSha256:route.proofSha256,sourceId:route.parentSourceId,sourceLabel:route.label,priority:/退款|refund|条款|隐私|terms|privacy|常见问题|新用户必看/i.test(route.label)?100:collector.priorityFields.length?50:10});
 }
 for(const task of tasks)task.targetFields=task.targetFields.filter(f=>requestedFields.includes(f)&&(!require('../lib/website-collectors.cjs').routeFieldHints({url:task.entryUrl,label:task.sourceLabel})||require('../lib/website-collectors.cjs').routeFieldHints({url:task.entryUrl,label:task.sourceLabel}).includes(f)));
 tasks.sort((a,b)=>b.priority-a.priority||a.collectorId.localeCompare(b.collectorId)||a.entryUrl.localeCompare(b.entryUrl));
 fs.mkdirSync(path.join(dir,'evidence'),{recursive:true});fs.writeFileSync(file,JSON.stringify({runId,createdAt:new Date().toISOString(),registrySha256:hash(fs.readFileSync(registryFile)),inventoryGeneratedAt:inventory.generatedAt,tasks,excluded,records:inventory.records.map(r=>({recordId:r.id,name:r.name,missing:r.missingFields})),policy:{paymentAllowed:false,orderCreationAllowed:false,sourceBinding:'retained_E1_native_link_hash_checked',registrationAllowed:false}},null,2)+'\n');
 fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify({runId,results:{},discovery:{},version:3},null,2)+'\n');return{resumed:false,websites:new Set(tasks.map(t=>t.collectorId)).size,tasks:tasks.length,excluded:excluded.length};
}
if(require.main===module)console.log(JSON.stringify(prepare(process.argv[2]),null,2));module.exports={prepare};
