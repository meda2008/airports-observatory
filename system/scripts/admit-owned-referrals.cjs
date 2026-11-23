'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {root,runDir}=require('./collection.cjs'),{createStore}=require('../deploy-service/store.cjs');
async function admit(runId){
 const {validOwnedReferral}=await import('../collection/owned-referral.mjs'),dir=runDir(runId),state=JSON.parse(fs.readFileSync(path.join(dir,'state.json'))),store=createStore({filename:path.join(root,'deploy-service/data/collector.sqlite')}),receipts=[];
 try{for(const r of Object.values(state.results)){
  if(r.referralObservation?.status!=='owned_referral_observed')continue;
  const source=r.sources.find(s=>s.kind==='authorized_account_page');assert(source&&source.grade==='E1');const bytes=fs.readFileSync(path.join(dir,source.file));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),source.sha256);
  const raw=JSON.parse(bytes),url=r.referralObservation.url;assert(raw.authenticationObserved&&raw.accountOwnerMatched);assert(raw.text.includes(url));
  for(const id of r.recordIds){const site=store.getSite(id),origin=new URL(site.config.entryUrl).origin;assert.equal(new URL(raw.url).origin,origin);assert(validOwnedReferral(url,origin));
   const old=store.listReferrals().find(v=>v.siteId===id&&v.status==='verified_user_referral');if(old){receipts.push({recordId:id,status:'existing_owned_referral_reused',evidenceId:old.evidenceId});continue;}
   const evidence=store.saveEvidence({siteId:id,url:raw.url,body:raw.text,observedAt:raw.capturedAt,kind:'authorized_account_page'});
   const result=store.setReferral({siteId:id,url,disclosure:'此链接来自维护者本人账号；通过链接注册或购买，维护者可能获得返佣。推荐收益不参与数据判断或价格排序。',evidenceId:evidence.evidenceId});receipts.push({recordId:id,status:result.status,evidenceId:evidence.evidenceId,sourceHash:source.sha256,observedAt:raw.capturedAt});
  }
 }}finally{store.close();}
 fs.writeFileSync(path.join(dir,'referral-admission-receipts.json'),JSON.stringify({at:new Date().toISOString(),receipts,paymentExecuted:false,withdrawalExecuted:false,externalPublication:false},null,2));return receipts;
}
if(require.main===module)admit(process.argv[2]).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={admit};
