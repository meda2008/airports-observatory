import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {runChunk,resumeClearedGates,completeConfirmedAccessGate} from './browser-driver.mjs';
const require=createRequire(import.meta.url);
const pipeline=require('../scripts/collection-pipeline.cjs');
const {runDir}=require('../scripts/collection.cjs');
export function reviewDisposition(review){if(review.decisions?.length)return 'review_ready_not_staged';return review.reviewer&&Number.isFinite(Date.parse(review.reviewedAt))&&review.rejected?.length?'review_complete_no_new_qualified_facts':'awaiting_semantic_review';}

// One resumable entry. Collection can finish with blockers; evidence admission
// still requires explicitly reviewed facts. This never deploys to a public host.
export async function runWorkflow(options) {
 if(options.breakpointEntryDiscovery){const implementation=new URL('./breakpoint-entry-discovery.mjs',import.meta.url);return(await import(implementation.href+'?revision='+fs.statSync(implementation).mtimeMs)).runBreakpointEntryDiscovery(options);}
 if(options.breakpointRecheck){const implementation=new URL('./breakpoint-recheck.mjs',import.meta.url);return(await import(implementation.href+'?revision='+fs.statSync(implementation).mtimeMs)).runBreakpointRecheck(options);}
 if(!options.emailCodeProvider&&(options.mailboxSession||options.gmailBrowser||options.browser?.tabs?.list))options={...options,emailCodeProvider:(await import('./gmail-browser.mjs')).createAccountAwareCodeProvider({connectorProfile:options.mailboxSession?.profile,connectorProvider:options.mailboxSession?.codeProvider,browser:options.gmailBrowser||options.browser,allowOpenMailboxUI:true})};
 if(options.websiteCollectors){const implementation=new URL('./website-collector-flow.mjs',import.meta.url);return (await import(implementation.href+'?revision='+fs.statSync(implementation).mtimeMs)).runWebsiteCollectors(options);}
 if(options.continuous)return (await import('./continuous-workflow.mjs')).runContinuous(options.continuous);
 if(options.contentRecovery)return (await import('./content-recovery-workflow.mjs')).runContentRecovery(options);
 if(options.unified){const implementation=new URL('./unified-workflow.mjs',import.meta.url);return (await import(implementation.href+'?revision='+fs.statSync(implementation).mtimeMs)).runUnifiedWorkflow(options);}
 const {browser,runId,recordIds,limit=2,incremental=false,officialSearchLimit=0,credentialsForOrigin=null,credentialsForRegistration=null,gmailBrowser=null,challengeConfirmations=[],batch=null,finalize=false,verificationOptions={}}=options;
 let emailCodeProvider=options.emailCodeProvider||null;
 if(officialSearchLimit>0&&!incremental)throw Error('Catalog-wide official search requires explicit incremental scope');
 const directory=runDir(runId);
 if(!fs.existsSync(path.join(directory,'plan.json'))){if(incremental){require('../scripts/plan-collection-gaps.cjs').planGaps(runId);require('../scripts/import-core-collection-evidence.cjs').importCore(runId);}else pipeline.init(runId,recordIds||[]);}
 const challengeActions=[];
 const saved=JSON.parse(fs.readFileSync(path.join(directory,'state.json'),'utf8'));
 for(const confirmation of challengeConfirmations){
  if(!Object.values(saved.results).some(r=>r.handoffTabId===confirmation.tabId&&r.status==='needs_human_verification'))throw Error('Challenge confirmation is outside this run');
  const tab=await browser.tabs.get(confirmation.tabId);
  challengeActions.push({tabId:confirmation.tabId,...await completeConfirmedAccessGate({tab,confirmation})});
 }
 if(challengeActions.length)fs.writeFileSync(path.join(directory,'challenge-actions-'+Date.now()+'.json'),JSON.stringify({at:new Date().toISOString(),actions:challengeActions},null,2));
 const recovered=await resumeClearedGates({browser,runId});
 if(!emailCodeProvider&&(options.mailboxSession||gmailBrowser||browser?.tabs?.list))emailCodeProvider=(await import('./gmail-browser.mjs')).createAccountAwareCodeProvider({connectorProfile:options.mailboxSession?.profile,connectorProvider:options.mailboxSession?.codeProvider,browser:gmailBrowser||browser,allowOpenMailboxUI:true});
 const collection=await runChunk({browser,runId,limit,credentialsForOrigin,credentialsForRegistration,emailCodeProvider,verificationOptions:{ocr:require('../deploy-service/ocr.cjs').createLocalOcr(),...verificationOptions},referralOptions:options.referralOptions||{}});
 const pendingActions=require('../scripts/collection-actions.cjs').actions(runId).items;
 if(collection.remaining)return {status:'collecting',runId,recovered,collection,pendingActions};
 let entryDiscovery=null;
 if(officialSearchLimit>0){const discovery=await import('./official-search.mjs');entryDiscovery=await discovery.runOfficialSearchChunk({browser,runId,limit:officialSearchLimit});if(entryDiscovery.remaining)return{status:entryDiscovery.searchServiceBlocked?'official_search_blocked':'discovering_official_entries',runId,recovered,collection,pendingActions,entryDiscovery,fallback:'Use existing search connector; retain raw batch receipts and reconcile-official-search.cjs. No search snippets admitted as facts.'};}
 const validation=pipeline.analyze(runId);
 const review=JSON.parse(fs.readFileSync(path.join(directory,'review.json'),'utf8'));
 if(!review.decisions.length)return {status:reviewDisposition(review),runId,recovered,collection,validation,pendingActions,entryDiscovery,deployment:'not_performed_without_new_qualified_facts',dataComplete:false};
 if(!finalize)return {status:'review_ready_not_staged',runId,validation};
 if(!batch)throw Error('Explicit evidence batch required before admission');
 const admission=pipeline.stage(runId,batch);
 const candidate=pipeline.build(runId);
 return {status:candidate.status,runId,recovered,collection,validation,admission,pendingActions,deployment:candidate.deployment};
}
