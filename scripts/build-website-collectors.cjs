'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {root}=require('./collection.cjs'),{normalizeRetainedDocument}=require('../lib/retained-document.cjs');
const {buildWebsiteCollectors}=require('../lib/website-collectors.cjs');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'')),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function retainedIndex(records){
 const bound=new Map(),pages=new Map(),errors=[],attempts=[];
 for(const r of records)for(const s of r.sourceEvidence||[]){if(!s.source_id)continue;let ids=bound.get(s.source_id);if(!ids)bound.set(s.source_id,ids=[]);if(!ids.includes(r.id))ids.push(r.id);}
 function add(file,s,ids){if(s.grade!=='E1'||!ids?.length||!fs.existsSync(file))return;const key=s.sha256+'|'+s.url,prior=pages.get(key);if(prior){prior.recordIds=[...new Set([...prior.recordIds,...ids])];return;}try{const bytes=fs.readFileSync(file);if(hash(bytes)!==s.sha256)throw Error('source_hash_mismatch');const doc=normalizeRetainedDocument(bytes,{sha256:s.sha256,url:s.url,last_capture_at:s.capturedAt||s.last_capture_at,source_id:s.sourceId||s.source_id});pages.set(key,{sourceId:s.sourceId||s.source_id,recordIds:ids,grade:'E1',sha256:s.sha256,file:path.relative(root,file).replaceAll('\\','/'),url:doc.url,capturedAt:doc.capturedAt,links:doc.links});}catch(error){errors.push({file:path.relative(root,file),reason:error.message});}}
 const refresh=path.join(root,'catalog/refresh/2026-10-26');
 for(const name of fs.readdirSync(refresh)){const dir=path.join(refresh,name),sf=path.join(dir,'sources.json');if(!fs.existsSync(sf))continue;for(const s of read(sf).sources||[]){const part=s.originalContainers?.[0]?.archiveEntry;if(!part)continue;const file=path.resolve(dir,part);if(file.startsWith(dir+path.sep))add(file,s,bound.get(s.source_id));}}
 const runs=path.join(root,'work/collection-runs');
 const reviewDirectories=[];for(const name of fs.readdirSync(runs)){if(name.startsWith('SYNTHETIC'))continue;const dir=path.join(runs,name);if(!fs.statSync(dir).isDirectory())continue;reviewDirectories.push(dir);for(const sub of fs.readdirSync(dir,{withFileTypes:true}))if(sub.isDirectory()&&/^review(?:-|$)/.test(sub.name))reviewDirectories.push(path.join(dir,sub.name));}
 const reviewed=require('../lib/reviewed-source-index.cjs').reviewedSources(root,records,reviewDirectories);for(const source of reviewed.sources)add(source.file,source.source,source.recordIds);errors.push(...reviewed.errors);
 for(const name of fs.readdirSync(runs)){if(name.startsWith('SYNTHETIC'))continue;const dir=path.join(runs,name),sf=path.join(dir,'state.json');if(!fs.existsSync(sf))continue;const planFile=path.join(dir,'plan.json'),tasks=fs.existsSync(planFile)?read(planFile).tasks||[]:[];
  for(const r of Object.values(read(sf).results||{})){const task=tasks.find(t=>t.taskId===r.taskId);if(task)attempts.push({recordIds:r.recordIds,url:task.entryUrl,status:r.status,at:r.finishedAt});for(const s of r.sources||[]){const file=path.resolve(dir,s.file);if(file.startsWith(dir+path.sep))add(file,s,s.recordIds||r.recordIds);}}
 }
 return{pages:[...pages.values()],attempts,errors};
}
function build({outputDirectory=path.join(root,'work/website-collectors'),definitionDirectory=path.join(root,'collection/website-collectors')}={}){
 const inventory=read(path.join(root,'outputs/database-inventory-current/primary/records.json')),configs=fs.readdirSync(path.join(root,'collection/site-collectors')).filter(f=>f.endsWith('.json')).map(f=>read(path.join(root,'collection/site-collectors',f)));
 const index=retainedIndex(inventory.records),result=buildWebsiteCollectors({records:inventory.records,configs,...index,parserFor:require('../collection/url-collectors/index.cjs').forOrigin});
 fs.mkdirSync(outputDirectory,{recursive:true});fs.mkdirSync(definitionDirectory,{recursive:true});for(const c of result.collectors){fs.writeFileSync(path.join(outputDirectory,c.collectorId+'.json'),JSON.stringify(c,null,2)+'\n');const {schemaVersion,collectorId,origin,recordIds,entryUrls,capabilities,policy,refreshIntervalMs,aliasPolicy,recipeHash}=c;fs.writeFileSync(path.join(definitionDirectory,c.collectorId+'.json'),JSON.stringify({schemaVersion,collectorId,origin,recordIds,entryUrls,capabilities,policy,refreshIntervalMs,aliasPolicy,recipeHash,acceptance:'partial_capabilities_only_not_all_fields_complete'},null,2)+'\n');}
 const summary={...result,generatedAt:new Date().toISOString(),inventoryGeneratedAt:inventory.generatedAt,counts:{records:inventory.records.length,websites:result.collectors.length,unbound:result.unbound.length,literalParsers:result.collectors.filter(c=>c.capabilities.literalParser).length,readTasks:result.collectors.reduce((n,c)=>n+c.readTasks.length,0),crossOriginCandidates:result.collectors.reduce((n,c)=>n+c.crossOriginCandidates.length,0)},originalsIndexed:index.pages.length,originalErrors:index.errors};
 fs.writeFileSync(path.join(outputDirectory,'index.json'),JSON.stringify(summary,null,2)+'\n');return{outputDirectory,...summary.counts,originalsIndexed:summary.originalsIndexed,originalErrors:index.errors.length};
}
if(require.main===module)console.log(JSON.stringify(build(),null,2));module.exports={build,retainedIndex};
