import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{runDir}=require('../scripts/collection.cjs');
// All UI execution uses the caller's existing Codex IAB; no external browser.
export async function runWebsiteCollectors(options){
 if(!options.browser?.tabs)throw Error('existing_builtin_browser_required');
 const driver=new URL('./browser-driver.mjs',import.meta.url),{runChunk}=await import(driver.href+'?revision='+fs.statSync(driver).mtimeMs);
 const prepared=require('../scripts/prepare-website-collection.cjs').prepare(options.runId,options.preparation);
 const dir=runDir(options.runId),stateFile=path.join(dir,'state.json'),before=JSON.parse(fs.readFileSync(stateFile,'utf8'));
 const siblingCheckpoints=require('../lib/website-checkpoints.cjs').deferBrokenSiblings(JSON.parse(fs.readFileSync(path.join(dir,'plan.json'),'utf8')),before);
 if(siblingCheckpoints.length){fs.writeFileSync(stateFile+'.tmp',JSON.stringify(before,null,2)+'\n');fs.renameSync(stateFile+'.tmp',stateFile);}
 const collection=await runChunk({...options,preserveChallenges:0,limit:options.limit||4,verificationOptions:{ocr:require('../deploy-service/ocr.cjs').createLocalOcr(),...options.verificationOptions}});
 const state=JSON.parse(fs.readFileSync(stateFile,'utf8'));
 const hintCandidates=Object.values(state.results).flatMap(r=>(r.sources||[]).flatMap(s=>(s.hints||[]).map(h=>({recordIds:r.recordIds,sourceId:s.sourceId,file:s.file,grade:s.grade,...h}))));
 const result={at:new Date().toISOString(),runId:options.runId,status:collection.remaining?'collecting':'observations_ready_for_semantic_review',prepared,siblingCheckpoints,collection,hintCandidates,dataComplete:false,automaticApproval:false,newOrdersCreated:0,paymentExecuted:false,externalPublication:false};
 fs.writeFileSync(path.join(dir,'website-flow-result.json'),JSON.stringify(result,null,2)+'\n');return result;
}
