'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {root,runDir}=require('./collection.cjs'),sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function prepare(runId,{authorization}={}){
 assert(authorization?.instruction==='把所有断点和跳过的网站再用流程跑一遍，解决阻塞的问题，并完善到流程中','Explicit recheck instruction required');assert(Number.isFinite(Date.parse(authorization.at)));
 const dir=runDir(runId),file=path.join(dir,'recheck-plan.json');if(fs.existsSync(file))return JSON.parse(fs.readFileSync(file));
 const inventory=JSON.parse(fs.readFileSync(path.join(root,'outputs/database-inventory-current/primary/records.json'))),records=inventory.records;
 const profiles=new Map(fs.readdirSync(path.join(root,'collection/site-collectors')).filter(f=>f.endsWith('.json')).map(f=>{const j=JSON.parse(fs.readFileSync(path.join(root,'collection/site-collectors',f)));return[j.recordId,j];}));
 const skips=require('../lib/collection-user-skips.cjs'),groups=new Map(),unbound=[];
 const holdFile=path.join(root,'work/unpaid-order-holds.json'),holds=fs.existsSync(holdFile)?JSON.parse(fs.readFileSync(holdFile)).records||{}:{};
 for(const r of records){const p=profiles.get(r.id),missing=r.missingFields.filter(f=>['pricing','payment','refund'].includes(f)),held=holds[r.id]?.cleanupRequired===true||r.coreInfo.payment?.orderCleanup?.cancellationVerified===false;
  if(!missing.length&&p?.enabled!==false&&!skips.isUserSkipped(r.id)&&!held&&!/captcha|block|error|fail|timeout|login_required|defer/i.test(p?.urlCollector?.status||''))continue;
  const url=p?.entryUrl||r.coreInfo.website?.url;if(!url){unbound.push({recordId:r.id,name:r.name,status:'no_verified_entry',requiredEvidence:'明确的官网或可溯源发布页；不能对空入口执行登录或注册。'});continue;}
  const u=new URL(url);if(!/^https?:$/.test(u.protocol))continue;
  let t=groups.get(u.origin);if(!t){t={taskId:sha(u.origin).slice(0,20),origin:u.origin,entryUrl:url,recordIds:[],names:[],missingFields:[],priorSkips:[],priorEligibility:[],readOnly:true,orderCleanupRequired:false,allowPayment:false};groups.set(u.origin,t);}
  t.recordIds.push(r.id);t.names.push(r.name);t.missingFields=[...new Set([...t.missingFields,...missing])];if(skips.isUserSkipped(r.id))t.priorSkips.push(r.id);if(p?.enabled===false)t.priorEligibility.push({recordId:r.id,eligibility:p.eligibility});t.orderCleanupRequired||=held;
 }
 const plan={schemaVersion:'airports-breakpoint-recheck.v1',runId,createdAt:new Date().toISOString(),inventoryGeneratedAt:inventory.generatedAt,authorization,scope:'current_financial_gaps_disabled_or_blocked_profiles_and_cleanup_holds',policy:{readOnlyPreflight:true,standingDeferralsRecheckedThisRunOnly:true,automaticAgreementAcceptance:false,automaticCaptchaCompletion:false,allowNewOrders:false,allowPayment:false,identityApprovalUnchanged:true},tasks:[...groups.values()].sort((a,b)=>Number(b.recordIds.includes('A022'))-Number(a.recordIds.includes('A022'))||b.priorSkips.length-a.priorSkips.length||a.taskId.localeCompare(b.taskId)),unbound};
 fs.mkdirSync(path.join(dir,'originals'),{recursive:true});fs.writeFileSync(file,JSON.stringify(plan,null,2)+'\n');fs.writeFileSync(path.join(dir,'recheck-state.json'),JSON.stringify({runId,results:{},updatedAt:plan.createdAt},null,2)+'\n');return plan;
}
module.exports={prepare};
