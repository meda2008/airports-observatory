'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createStore}=require('../deploy-service/store.cjs'),root=path.resolve(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function admit(directory){
 const dir=path.resolve(directory);assert(dir.startsWith(root+path.sep));
 const inputFile=path.join(dir,'review-candidates.json'),input=read(inputFile),review=read(path.join(dir,'source-review.json'));
 assert.equal(hash(fs.readFileSync(inputFile)),review.reviewInputSha256,'Reviewed candidate file changed');
 const inventory=read(path.join(root,'outputs/database-inventory-current/primary/records.json'));
 const receiptFile=path.join(dir,'admission-receipts.json');
 const store=createStore({filename:path.join(root,'deploy-service/data/collector.sqlite')}),receipts=fs.existsSync(receiptFile)?read(receiptFile).receipts:[];
 const save=()=>{const temp=receiptFile+'.tmp';fs.writeFileSync(temp,JSON.stringify({at:new Date().toISOString(),receipts,paymentExecuted:false,externalDeployment:false},null,2));fs.renameSync(temp,receiptFile);};
 try{for(const candidate of input.candidates){
  const decision=review.items.find(r=>r.recordId===candidate.id);assert.equal(decision?.decision,'approve','Source-content review required');
  const file=path.resolve(root,candidate.file);assert(file.startsWith(root+path.sep));const bytes=fs.readFileSync(file);assert.equal(hash(bytes),candidate.originalSha256,'Original changed after review');
  const done=receipts.find(r=>r.recordId===candidate.id&&r.originalSha256===candidate.originalSha256);
  if(done){assert(store.listProposals().some(p=>p.id===done.proposalId&&p.siteId===candidate.id&&p.status==='approved'),'Admission receipt has no approved proposal');continue;}
  const raw=JSON.parse(bytes),record=inventory.records.find(r=>r.id===candidate.id),site=store.getSite(candidate.id);assert(record&&site);assert.equal(site.revision,record.storeSnapshot.site.revision,'Database changed since review inventory');
  assert.equal(new URL(raw.url).origin,new URL(site.config.entryUrl).origin,'Origin mismatch');
  const evidence=store.saveEvidence({siteId:candidate.id,url:raw.url,body:raw.text,observedAt:raw.capturedAt,kind:'authorized_account_page'});
  const patch=require(path.join(root,candidate.parser)).extract({...raw,evidenceId:evidence.evidenceId},{prior:record.coreInfo});assert(patch,'Parser no longer recognizes reviewed source');
  const comparable=JSON.stringify(patch).split(evidence.evidenceId).join('pending_source_binding');assert.equal(comparable,JSON.stringify(candidate.patch),'Claim changed since content review');
  const proposal=store.createProposal({siteId:candidate.id,patch,evidenceIds:[evidence.evidenceId],expectedRevision:site.revision});
  assert(typeof review.reviewer==='string'&&review.reviewer.trim(),'Named reviewer required');
  const result=store.reviewProposal(proposal.id,{approved:true,expectedRevision:site.revision,reviewer:review.reviewer});
  receipts.push({recordId:candidate.id,fields:Object.keys(patch),evidenceId:evidence.evidenceId,proposalId:proposal.id,revision:result.revision,originalSha256:candidate.originalSha256,observedAt:raw.capturedAt,independentHumanReview:false});
  save();
 }}finally{store.close();}
 save();return receipts;
}
if(require.main===module)console.log(JSON.stringify(admit(process.argv[2])));
module.exports={admit};
