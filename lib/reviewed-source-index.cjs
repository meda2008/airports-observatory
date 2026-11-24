'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),read=f=>JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,''));
// Approved raw files retain DOM links which SQLite's body-only evidence omits.
// This is a navigation/reuse index, never an automatic fact approval mechanism.
function reviewedSources(root,records,directories){
 const out=[],errors=[],byId=new Map(records.map(r=>[r.id,r]));root=path.resolve(root);
 for(const directory of directories){
  const dir=path.resolve(directory);if(!dir.startsWith(root+path.sep))continue;
  const inputFile=path.join(dir,'review-candidates.json'),receiptFile=path.join(dir,'admission-receipts.json'),reviewFile=path.join(dir,'source-review.json');if(![inputFile,receiptFile,reviewFile].every(f=>fs.existsSync(f)))continue;
  try{
   const bytes=fs.readFileSync(inputFile),inputHash=sha(bytes),review=read(reviewFile);if(review.reviewInputSha256!==inputHash)throw Error('review_input_hash_mismatch');
   const receipts=read(receiptFile).receipts||[];
   for(const candidate of read(inputFile).candidates||[]){
    const record=byId.get(candidate.id),receipt=receipts.find(r=>r.recordId===candidate.id&&r.reviewInputSha256===inputHash);
    if(!record||!receipt||!record.storeSnapshot?.proposals?.some(p=>(p.id||p.proposalId)===receipt.proposalId&&p.status==='approved')||!record.storeSnapshot?.changes?.some(c=>(c.proposalId||c.proposal_id)===receipt.proposalId))continue;
    for(const source of candidate.files||[]){
     const file=path.resolve(root,source.file);if(!file.startsWith(root+path.sep))throw Error('reviewed_source_outside_workspace');
     const raw=fs.readFileSync(file);if(sha(raw)!==source.sha256)throw Error('reviewed_source_hash_mismatch');const doc=JSON.parse(raw);if(typeof doc.url!=='string'||!Number.isFinite(Date.parse(doc.capturedAt)))throw Error('reviewed_source_metadata_missing');
     out.push({file,source:{sourceId:'REVIEWED-'+source.sha256.slice(0,24),url:doc.url,capturedAt:doc.capturedAt,sha256:source.sha256,grade:'E1'},recordIds:[candidate.id],proposalId:receipt.proposalId});
    }
   }
  }catch(e){errors.push({file:path.relative(root,inputFile),reason:e.message});}
 }
 return{sources:out,errors};
}
module.exports={reviewedSources};
