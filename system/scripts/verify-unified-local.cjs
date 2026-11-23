'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
async function verify(){
 const read=async route=>{const r=await fetch('http://127.0.0.1:8080'+route);assert.equal(r.status,200);return r.json();};
 assert.equal((await read('/health')).service,'airports-deploy');
 const changes=(await read('/api/changes')).items;
 const coupon=changes.find(c=>c.siteId==='A162'&&c.after.promotions)?.after.promotions[0];
 assert.equal(coupon.code,'kuajie');assert.equal(coupon.checkoutVerified,false);assert.equal(coupon.expiresAt,null);assert.equal(coupon.affiliateBinding,null);assert(coupon.sourceIds.length);
 const devices=changes.find(c=>c.siteId==='A155'&&c.after.compatibility)?.after.compatibility;
 assert(devices.requirements.some(t=>t.includes('Android 5.0+')));assert(devices.requirements.some(t=>t.includes('Windows 10+')));assert(devices.conditionObservations[0].observedAt);assert(devices.sourceIds.length);
 const referrals=[];
 for(const id of ['A162','A153']){const results=(await read('/api/search?q='+id)).items;const row=results.find(r=>r.id===id);assert(row,id+' is absent from public search');assert.equal(row.link.type,'verified_user_referral');assert(row.link.disclosure.includes('返佣'));referrals.push({recordId:id,type:row.link.type,disclosurePresent:true});}
 const inventory=JSON.parse(fs.readFileSync(path.join(root,'outputs/database-inventory-current/summary.json')));
 const result={verifiedAt:new Date().toISOString(),endpoint:'http://127.0.0.1:8080',coupon:'A162',deviceConditions:'A155',referrals,inventoryGeneratedAt:inventory.generatedAt,publicDeployment:false,paymentExecuted:false};
 fs.writeFileSync(path.join(root,'work/site-collector-service/unified-run-20261103/local-http-acceptance.json'),JSON.stringify(result,null,2)+'\n');return result;
}
if(require.main===module)verify().then(v=>console.log(JSON.stringify(v,null,2))).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={verify};
