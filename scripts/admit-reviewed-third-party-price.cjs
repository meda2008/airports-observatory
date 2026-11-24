'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {root}=require('./collection.cjs'),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
// This branch can only append explicitly unverified reports. It cannot write
// official plans, price status, payment/refund or identity fields.
function reportPatch(pricing,report){assert.equal(report.status,'unverified_third_party_price');assert.equal(report.officialCurrentPriceVerified,false);return{pricing:{...pricing,externalReports:[...(pricing?.externalReports||[]),report]}};}
function main(directory,{prepareOnly=false}={}){
 const dir=path.resolve(directory);assert(dir.startsWith(root+path.sep));const specFile=path.join(dir,'report-spec.json'),spec=read(specFile);
 const file=path.resolve(root,spec.file);assert(file.startsWith(root+path.sep));const bytes=fs.readFileSync(file);assert.equal(sha(bytes),spec.sha256);const raw=JSON.parse(bytes);assert(Number.isFinite(Date.parse(raw.capturedAt)));
 const parser=require('../collection/third-party-collectors/index.cjs').forReport(spec.recordId,raw.url);assert(parser,'Unregistered third-party source');assert.equal(spec.recordId,parser.recordId);
 const report=parser.extract(raw);assert(report,'Literal third-party extraction unavailable');require('../lib/reviewed-price-reports.cjs').validatePriceReports({reports:[report]},raw);
 const store=require('../deploy-service/store.cjs').createStore({filename:path.join(root,'deploy-service/data/collector.sqlite')});
 try{
  const site=store.getSite(spec.recordId);assert(site);const inventory=read(path.join(root,'outputs/database-inventory-current/primary/records.json')).records.find(x=>x.id===spec.recordId);assert.equal(site.revision,inventory.storeSnapshot.site.revision,'Refresh current inventory first');
  const prior=inventory.coreInfo.pricing;
  assert(!(prior.externalReports||[]).some(r=>r.publisher===report.publisher&&r.quote===report.quote),'Already retained report; do not re-admit');
  const candidate={recordId:spec.recordId,expectedRevision:site.revision,file:spec.file,sha256:spec.sha256,priorPricing:prior,report},candidateFile=path.join(dir,'report-candidate.json');
  if(prepareOnly){assert(!fs.existsSync(path.join(dir,'admission-receipt.json')));fs.writeFileSync(candidateFile,JSON.stringify(candidate,null,2)+'\n');return{candidate: path.relative(root,candidateFile),sha256:sha(fs.readFileSync(candidateFile)),automaticAdmission:false};}
  const reviewed=read(candidateFile),review=read(path.join(dir,'source-review.json'));assert.equal(review.reviewInputSha256,sha(fs.readFileSync(candidateFile)));assert.equal(review.decision,'approve');assert.equal(review.independentHumanReview,false);assert(review.reviewer);assert.deepEqual(reviewed,candidate,'Candidate changed after review');assert(!fs.existsSync(path.join(dir,'admission-receipt.json')),'Already admitted');
  const evidence=store.saveEvidence({siteId:spec.recordId,url:raw.url,body:raw.text,observedAt:raw.capturedAt,kind:'unverified_third_party_public_report'}),bound={...report,sourceIds:[evidence.evidenceId]};
  const patch=reportPatch(prior,bound),proposal=store.createProposal({siteId:spec.recordId,patch,evidenceIds:[evidence.evidenceId],expectedRevision:site.revision});const accepted=store.reviewProposal(proposal.id,{approved:true,expectedRevision:site.revision,reviewer:review.reviewer});
  const receipt={at:new Date().toISOString(),recordId:spec.recordId,proposalId:proposal.id,revision:accepted.revision,evidenceId:evidence.evidenceId,sourceCaptureTime:raw.capturedAt,reviewInputSha256:review.reviewInputSha256,officialCurrentPriceVerified:false,previousReportCount:prior.externalReports?.length||0,newReportCount:patch.pricing.externalReports.length,independentHumanReview:false,newOrdersCreated:0,paymentExecuted:false};fs.writeFileSync(path.join(dir,'admission-receipt.json'),JSON.stringify(receipt,null,2)+'\n');return receipt;
 }finally{store.close();}
}
if(require.main===module)console.log(JSON.stringify(main(process.argv[2],{prepareOnly:process.argv.includes('--prepare')}),null,2));module.exports={main,reportPatch};
