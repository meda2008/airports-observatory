'use strict';
// Missing-field reconciliation over frozen originals, with no new network scan.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {root}=require('./collection.cjs');
const {normalizeRetainedDocument}=require('../lib/retained-document.cjs');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,''));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function matchingLines(text,field){
 const pattern=field==='refund'?/退款|退费|退订|refund|money.back/i:/支付宝|微信支付|PayPal|USDT|TRC20|付款方式|支付方式|payment method/i;
 const lines=text.split(/\n/).map(t=>t.trim()).filter(Boolean),hits=[];
 for(let i=0;i<lines.length;i++)if(pattern.test(lines[i]))hits.push(lines.slice(Math.max(0,i-1),i+2).join('\n').slice(0,1500));
 return[...new Set(hits)];
}
function scan(outputDirectory,{recordIds=null}={}){
 const inventory=read(path.join(root,'outputs/database-inventory-current/primary/records.json')),candidates=[],errors=[],seen=new Set();let inspected=0;
 for(const r of inventory.records){if(recordIds&&!recordIds.includes(r.id))continue;const missing=r.missingFields.filter(f=>['refund','payment'].includes(f));if(!missing.length)continue;
  const origin=u=>{try{return new URL(u).origin;}catch{return null;}},origins=new Set([origin(r.coreInfo.website?.url)].filter(Boolean));
  const profile=path.join(root,'collection/site-collectors',r.id+'.json');if(fs.existsSync(profile)){const value=origin(read(profile).entryUrl);if(value)origins.add(value);}
  for(const s of r.sourceEvidence||[]){
   if(s.grade!=='E1'||!['authenticated_rendered_dom','public_rendered_dom'].includes(s.source_type)||!s.sha256||!s.archiveRef)continue;
   const part=s.originalContainers?.[0]?.archiveEntry;if(!part)continue;
   const dir=path.resolve(root,'catalog/refresh/2026-10-26',s.archiveRef.replace(/-2026-10-26$/,'')),file=path.resolve(dir,part);
   if(!file.startsWith(dir+path.sep)){errors.push({recordId:r.id,sourceId:s.source_id,error:'unsafe_original_path'});continue;}
   const key=r.id+'|'+s.sha256;if(seen.has(key))continue;seen.add(key);
   try{const bytes=fs.readFileSync(file);if(crypto.createHash('sha256').update(bytes).digest('hex')!==s.sha256)throw Error('original_hash_mismatch');
    const doc=normalizeRetainedDocument(bytes,s);inspected++;
    for(const field of missing){const excerpts=matchingLines(doc.text,field);if(!excerpts.length)continue;
     candidates.push({recordId:r.id,name:r.name,field,sourceId:s.source_id,url:doc.url,capturedAt:doc.capturedAt,sha256:s.sha256,file:path.relative(root,file).replaceAll('\\','/'),originMatchesCurrentRecord:origins.has(new URL(doc.url).origin),excerpts,status:'literal_candidate_requires_semantic_review_not_admitted',recaptured:false});}
   }catch(e){errors.push({recordId:r.id,sourceId:s.source_id,error:e.message});}
  }
 }
 const out={at:new Date().toISOString(),inventoryGeneratedAt:inventory.generatedAt,inspected,candidates,errors,newRequests:0,newOrdersCreated:0,paymentExecuted:false,automaticAdmission:false};
 fs.mkdirSync(outputDirectory,{recursive:true});fs.writeFileSync(path.join(outputDirectory,'retained-financial-literals.json'),JSON.stringify(out,null,2)+'\n');return{inspected,candidates:candidates.length,errors:errors.length};
}
// Work/review E1 originals were not covered by the legacy archive traversal.
// Reuse their retained hash-checked documents too; this only yields candidates.
function scanIndexed(outputDirectory,{recordIds=null,inventoryFile=path.join(root,'outputs/database-inventory-current/primary/records.json'),sourceIndex=null}={}){
 const inventory=read(inventoryFile),selected=inventory.records.filter(r=>(!recordIds||recordIds.includes(r.id))&&r.missingFields.some(f=>['payment','refund'].includes(f))),rows=new Map(selected.map(r=>[r.id,r]));
 const index=sourceIndex||require('./build-website-collectors.cjs').retainedIndex(selected),candidates=[],errors=[...index.errors],seen=new Set();let inspected=0;
 for(const page of index.pages){
  const relevant=page.recordIds.filter(id=>rows.has(id));if(!relevant.length||page.grade!=='E1')continue;
  try{
   const file=path.resolve(root,page.file);if(!file.startsWith(root+path.sep))throw Error('unsafe_original_path');const bytes=fs.readFileSync(file);if(hash(bytes)!==page.sha256)throw Error('original_hash_mismatch');
   const doc=normalizeRetainedDocument(bytes,{sha256:page.sha256,url:page.url,last_capture_at:page.capturedAt}),origin=new URL(doc.url).origin;inspected++;
   for(const id of relevant){const r=rows.get(id),key=id+'|'+page.sha256;if(seen.has(key))continue;seen.add(key);let officialOrigin=null;try{officialOrigin=new URL(r.coreInfo.website?.url).origin;}catch{}
    for(const field of r.missingFields.filter(f=>['refund','payment'].includes(f))){const excerpts=matchingLines(doc.text,field);if(!excerpts.length)continue;
     candidates.push({recordId:id,name:r.name,field,sourceId:page.sourceId,url:doc.url,capturedAt:doc.capturedAt,sha256:page.sha256,file:page.file,originMatchesCurrentRecord:origin===officialOrigin,excerpts,status:'literal_candidate_requires_semantic_review_not_admitted',basis:'retained_E1_hash_checked_work_and_review_index',recaptured:false});}
   }
  }catch(e){errors.push({file:page.file,error:String(e.message).slice(0,180)});}
 }
 const out={at:new Date().toISOString(),inventoryGeneratedAt:inventory.generatedAt,scope:selected.map(r=>r.id),inspected,candidates,errors,newRequests:0,newOrdersCreated:0,paymentExecuted:false,automaticAdmission:false};fs.mkdirSync(outputDirectory,{recursive:true});fs.writeFileSync(path.join(outputDirectory,'indexed-financial-literals.json'),JSON.stringify(out,null,2)+'\n');return{inspected,candidates:candidates.length,errors:errors.length};
}
if(require.main===module){const result=process.argv.includes('--indexed')?scanIndexed(process.argv[2]):scan(process.argv[2]);console.log(JSON.stringify(result,null,2));if(result.inspected===0&&result.errors>0)process.exitCode=1;}
module.exports={scan,scanIndexed,matchingLines};
