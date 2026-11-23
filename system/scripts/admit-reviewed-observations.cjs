'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {root}=require('./collection.cjs'),{createStore}=require('../deploy-service/store.cjs');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function admit(directory){
 const dir=path.resolve(directory);assert(dir.startsWith(root+path.sep));const inputFile=path.join(dir,'review-candidates.json'),input=read(inputFile),review=read(path.join(dir,'source-review.json'));
 assert.equal(sha(fs.readFileSync(inputFile)),review.reviewInputSha256);assert(review.reviewer&&review.code_review===false);
 const output=path.join(dir,'admission-receipts.json'),receipts=fs.existsSync(output)?read(output).receipts:[],store=createStore({filename:path.join(root,'deploy-service/data/collector.sqlite')});
 try{for(const candidate of input.candidates){
  assert.equal(review.items.find(i=>i.recordId===candidate.id)?.decision,'approve');const site=store.getSite(candidate.id);assert(site);const snapshots=candidate.files.map(source=>{const file=path.resolve(root,source.file);assert(file.startsWith(root+path.sep));const bytes=fs.readFileSync(file);assert.equal(sha(bytes),source.sha256);const raw=JSON.parse(bytes);require('../lib/source-origin-binding.cjs').assertSourceOrigin({root,entryUrl:site.config.entryUrl,sourceUrl:raw.url,bindings:candidate.originBindings,recordId:candidate.id});assert(Number.isFinite(Date.parse(raw.capturedAt))&&typeof raw.text==='string');return raw;});
  const priorReceipt=receipts.find(r=>r.recordId===candidate.id&&r.reviewInputSha256===review.reviewInputSha256);if(priorReceipt){assert(store.listProposals().some(p=>p.id===priorReceipt.proposalId&&p.status==='approved'));continue;}
  assert.equal(site.revision,candidate.expectedRevision,'Reviewed revision changed');const evidence=snapshots.map(raw=>store.saveEvidence({siteId:candidate.id,url:raw.url,body:raw.text,observedAt:raw.capturedAt,kind:'rendered_public_or_authorized_page'}));
  const extracted=require('../collection/url-collectors/index.cjs').extractKnown(snapshots.map((raw,i)=>({...raw,evidenceId:evidence[i].evidenceId})),{prior:candidate.prior});assert(extracted);let comparable=JSON.stringify(extracted.patch);evidence.forEach((e,i)=>{comparable=comparable.split(e.evidenceId).join('pending_source_binding_'+i);});assert.equal(comparable,JSON.stringify(candidate.patch),'Extracted facts differ from reviewed candidate');
  const proposal=store.createProposal({siteId:candidate.id,patch:extracted.patch,evidenceIds:evidence.map(e=>e.evidenceId),expectedRevision:site.revision});const result=store.reviewProposal(proposal.id,{approved:true,expectedRevision:site.revision,reviewer:review.reviewer});
  receipts.push({recordId:candidate.id,proposalId:proposal.id,revision:result.revision,fields:Object.keys(extracted.patch),evidenceIds:evidence.map(e=>e.evidenceId),sourceCaptureTimes:snapshots.map(s=>s.capturedAt),reviewInputSha256:review.reviewInputSha256,independentHumanReview:false});
  fs.writeFileSync(output,JSON.stringify({at:new Date().toISOString(),receipts,newOrdersCreated:0,paymentExecuted:false,publicDeployment:false},null,2)+'\n');
 }}finally{store.close();}return receipts;
}
if(require.main===module)console.log(JSON.stringify(admit(process.argv[2]),null,2));module.exports={admit};
