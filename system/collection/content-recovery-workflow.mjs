import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {runChunk} from './browser-driver.mjs';
import {runEntryDiscoveryChunk} from './official-entry-discovery.mjs';
const require=createRequire(import.meta.url),{root,runDir}=require('../scripts/collection.cjs');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
export function preparePriceDiscovery(runId){
 const dir=runDir(runId),file=path.join(dir,'entry-discovery-plan.json');if(fs.existsSync(file))return read(file);
 const inventory=read(path.join(root,'outputs/database-inventory-current/primary/records.json'));
 const tasks=inventory.records.filter(r=>r.missingFields.includes('pricing')&&!['A034','A047'].includes(r.id)).map(r=>({recordId:r.id,name:r.name,knownOfficialUrl:r.coreInfo.website?.url,missing:['pricing'],query:r.coreInfo.website?.url?'site:'+new URL(r.coreInfo.website.url).hostname+' 套餐 价格 订阅':r.id==='A012'?'"骨骨" "Gugu" 机场 套餐 官网':'"'+r.name+'" 机场 套餐 官网',candidateAdmission:'unverified_discovery_only_no_business_fact'}));
 const plan={runId,createdAt:new Date().toISOString(),inventoryGeneratedAt:inventory.generatedAt,tasks};write(file,plan);return plan;
}
function proposeCapturedLiterals(runId){
 const dir=runDir(runId),plan=read(path.join(dir,'plan.json')),state=read(path.join(dir,'state.json'));
 const inventory=read(path.join(root,'outputs/database-inventory-current/primary/records.json'));
 const store=require('../deploy-service/store.cjs').createStore({filename:path.join(root,'deploy-service/data/collector.sqlite')}),results=[];
 try{for(const result of Object.values(state.results))for(const source of result.sources||[]){
  if(source.grade!=='E1')continue;const bytes=fs.readFileSync(path.join(dir,source.file));if(require('node:crypto').createHash('sha256').update(bytes).digest('hex')!==source.sha256)throw Error('recovery_evidence_changed');const raw=JSON.parse(bytes);
  for(const id of result.recordIds){const record=inventory.records.find(r=>r.id===id),site=store.getSite(id);if(!record||!site||new URL(raw.url).origin!==new URL(site.config.entryUrl).origin)continue;
   const evidence=store.saveEvidence({siteId:id,url:raw.url,body:raw.text,observedAt:raw.capturedAt,kind:raw.authenticationObserved||raw.authenticated?'authorized_account_page':'rendered_public_or_authorized_page'});
   const extraction=require('./url-collectors/index.cjs').extractKnown([{...raw,body:raw.text,observedAt:raw.capturedAt,evidenceId:evidence.evidenceId}],{prior:record.coreInfo});
   if(!extraction)continue;const patch=require('../deploy-service/diff.cjs').changesFor(site.document,extraction.patch);if(!Object.keys(patch).length){results.push({recordId:id,status:'existing_reviewed_facts_reused',sourceId:source.sourceId});continue;}
   const pending=store.listProposals().find(p=>p.siteId===id&&p.status==='pending'&&JSON.stringify(p.patch)===JSON.stringify(patch));
   const proposal=pending||store.createProposal({siteId:id,patch,evidenceIds:[evidence.evidenceId],expectedRevision:site.revision});results.push({recordId:id,status:'awaiting_semantic_review',proposalId:proposal.id,fields:Object.keys(patch)});
  }
 }}finally{store.close();}
 const receipt={at:new Date().toISOString(),results,paymentExecuted:false,automaticApproval:false,sourceCount:Object.values(state.results).reduce((n,r)=>n+(r.sources||[]).length,0)};write(path.join(dir,'literal-proposal-receipts.json'),receipt);return receipt;
}
// Code entry for a full bounded pass: durable recovery -> discovery -> proposals.
// It reuses completed steps, never starts an external browser, and never pays.
export async function runContentRecovery(options){
 const {browser,runId,limit=3,discoveryLimit=3}=options;if(!browser?.tabs)throw Error('existing_builtin_browser_required');
 require('../scripts/prepare-content-recovery.cjs').prepare(runId,options.preparation||{});
 // Reconcile frozen originals once before asking the browser to collect again.
 // These are review candidates, never automatic payment/refund assertions.
 const recoveryDir=runDir(runId),reusedFile=path.join(recoveryDir,'retained-financial-literals.json');
 const indexedFile=path.join(recoveryDir,'indexed-financial-literals.json');
 if(!fs.existsSync(indexedFile))require('../scripts/find-retained-financial-literals.cjs').scanIndexed(recoveryDir);
 if(!fs.existsSync(reusedFile)){const scopedPlan=read(path.join(recoveryDir,'plan.json'));require('../scripts/find-retained-financial-literals.cjs').scan(recoveryDir,{recordIds:[...new Set(scopedPlan.tasks.flatMap(t=>t.recordIds||[]))]});}
 const verificationOptions={ocr:require('../deploy-service/ocr.cjs').createLocalOcr(),...options.verificationOptions};
 const collection=await runChunk({...options,browser,runId,limit,preserveChallenges:0,verificationOptions});
 if(collection.remaining)return{status:'collecting',runId,collection,dataComplete:false};
 preparePriceDiscovery(runId);const discovery=await runEntryDiscoveryChunk({browser,runId,limit:discoveryLimit,onProgress:options.onProgress});
 if(discovery.remaining&&!discovery.serviceBlocked)return{status:'discovering',runId,collection,discovery,dataComplete:false};
 const proposals=proposeCapturedLiterals(runId),pending=proposals.results.filter(r=>r.status==='awaiting_semantic_review').length;
 const result={status:pending?'awaiting_semantic_review':'runnable_queue_exhausted_with_gaps',runId,collection,discovery,proposals,pendingProposals:pending,dataComplete:false,paymentExecuted:false,externalPublication:false};
 write(path.join(runDir(runId),'optimized-workflow-result.json'),{...result,at:new Date().toISOString()});return result;
}
