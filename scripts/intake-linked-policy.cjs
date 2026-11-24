'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),E=require('../lib/collection-engine.cjs'),{root,runDir}=require('./collection.cjs');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
function intake(runId,{recordIds,originalFile,bindingFiles}){
 const dir=runDir(runId),plan=read(path.join(dir,'plan.json')),state=read(path.join(dir,'state.json')),catalog=read(path.join(root,'public-site/data/public-catalog.json'));
 assert(recordIds.length&&recordIds.every(id=>plan.records.some(r=>r.recordId===id)),'Policy scope not in run');
 const chain=bindingFiles.map(file=>({file,raw:read(file)})),original=read(originalFile);assert(chain.length,'Native website link chain required');
 const origin=new URL(chain[0].raw.url).origin;assert(recordIds.every(id=>new URL(catalog.items.find(r=>r.id===id).coreInfo.website.url).origin===origin),'Aliases must share observed official origin');
 for(let i=0;i<chain.length;i++){const next=i+1<chain.length?chain[i+1].raw:original,previous=chain[i].raw;assert.equal(previous.document.inputValuesRead,false);assert(previous.document.links.some(l=>new URL(l.url).href===new URL(next.requestedUrl||next.url).href),'Missing original native policy link');assert.equal(new URL(next.url).origin,new URL(next.requestedUrl||next.url).origin,'Unobserved cross-origin redirect');}
 assert.equal(original.document.inputValuesRead,false);assert(original.document.text&&E.safeUrl(original.url));
 const preserve=file=>{const bytes=fs.readFileSync(file),sha256=E.sha(bytes.toString('utf8')),relative='original-evidence/'+sha256+'.json';fs.mkdirSync(path.join(dir,'original-evidence'),{recursive:true});fs.copyFileSync(file,path.join(dir,relative));return{originalFile:relative,sha256};};
 const originalPart=preserve(originalFile),bindingChain=chain.map(p=>({...preserve(p.file),url:p.raw.url,capturedAt:p.raw.capturedAt}));
 const raw={...original.document,url:original.url,capturedAt:original.capturedAt,originalSha256:originalPart.sha256,representation:'derived_redacted_visible_DOM_with_retained_original',bindingChain,operatorIdentityVerified:false};
 const bytes=JSON.stringify(raw,null,2)+'\n',sha256=E.sha(bytes),file='evidence/'+sha256+'.json',sourceId='COLLECT-'+sha256.slice(0,24);fs.mkdirSync(path.join(dir,'evidence'),{recursive:true});fs.writeFileSync(path.join(dir,file),bytes);
 const source={sourceId,file,sha256,url:raw.url,capturedAt:raw.capturedAt,recordIds,grade:'E1',independenceScore:'I0',bindingStatus:'observed_native_policy_link_chain',originalFile:originalPart.originalFile,originalSha256:originalPart.sha256,bindingChain,representation:raw.representation,hints:[]};
 const taskId='policy-'+sha256.slice(0,16);if(!plan.tasks.some(t=>t.taskId===taskId))plan.tasks.push({taskId,recordIds,execution:'retained_original_review'});state.results[taskId]={taskId,recordIds,status:'observed_needs_review',sources:[source],finishedAt:new Date().toISOString(),errors:[]};
 fs.writeFileSync(path.join(dir,'plan.json'),JSON.stringify(plan,null,2));fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify(state,null,2));return source;
}
if(require.main===module){const [id,config]=process.argv.slice(2);console.log(JSON.stringify(intake(id,read(config))));}
module.exports={intake};
