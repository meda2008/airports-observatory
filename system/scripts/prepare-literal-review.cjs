'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{root}=require('./collection.cjs');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function prepare(specFile,outputDirectory){
 const spec=read(specFile),dir=path.resolve(outputDirectory);assert(dir.startsWith(root+path.sep));assert(/^A\d{3}$/.test(spec.recordId));assert(spec.scope&&Array.isArray(spec.checks)&&spec.checks.length);assert(!fs.existsSync(path.join(dir,'admission-receipts.json')),'Admitted review input is immutable');
 const row=read(path.join(root,'outputs/database-inventory-current/primary/records.json')).records.find(r=>r.id===spec.recordId);assert(row,'Record outside current inventory');const store=require('../deploy-service/store.cjs').createStore({filename:path.join(root,'deploy-service/data/collector.sqlite')});
 try{
  const site=store.getSite(spec.recordId);assert.equal(row.storeSnapshot.site.revision,site.revision,'Refresh inventory before preparing a new revision');
  const files=spec.files.map(file=>{const absolute=path.resolve(root,file);assert(absolute.startsWith(root+path.sep));return{file,sha256:sha(fs.readFileSync(absolute))};}),snapshots=files.map((s,i)=>({...read(path.join(root,s.file)),evidenceId:'pending_source_binding_'+i}));
  const extracted=require('../collection/url-collectors/index.cjs').extractKnown(snapshots,{prior:row.coreInfo});assert(extracted,'No literal extraction; no review candidate written');const input={candidates:[{id:spec.recordId,expectedRevision:site.revision,prior:row.coreInfo,files,originBindings:spec.originBindings||[],patch:extracted.patch}]},bytes=JSON.stringify(input,null,2)+'\n';
  fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'review-candidates.json'),bytes);fs.writeFileSync(path.join(dir,'source-review.json'),JSON.stringify({reviewedAt:new Date().toISOString(),reviewInputSha256:sha(bytes),reviewer:'literal_source_self_review_not_independent',independent_human_review:false,code_review:false,items:[{recordId:spec.recordId,decision:'approve',scope:spec.scope,checks:spec.checks}],newOrdersCreated:0,paymentExecuted:false},null,2)+'\n');return{recordId:spec.recordId,fields:Object.keys(extracted.patch),expectedRevision:site.revision,reviewInputSha256:sha(bytes),automaticAdmission:false};
 }finally{store.close();}
}
if(require.main===module)console.log(JSON.stringify(prepare(process.argv[2],process.argv[3]),null,2));module.exports={prepare};
