'use strict';
const net=require('node:net');
const scopes={A034:{recipe:'prpr_public_capabilities',origin:'https://prpr.96110.cn.com'},A023:{recipe:'jms_public_catalog_readonly',origin:'https://justmysocks.net'}};
function scoped(c){const s=scopes[c?.recordId];return !!s&&c.publicOnly===true&&c.webEgress==='authenticated_local_proxy'&&c.readOnlyRecipe===s.recipe;}

function selectedProfile(config,profiles){
 if(!scoped(config))return null;
 const selected=profiles.filter(x=>x.profile?.enabled===true&&x.profile.synthetic===false&&x.profile.kind==='stability'&&x.profile.identityVerified===true&&net.isIP(x.profile.expectedEgressIp||''));
 if(selected.length!==1)return null;return{profile:selected[0].profile,revision:selected[0].revision};
}
async function context({config,route,createContext,beforePage=async()=>{},assertPublicUrl=require('./collector.cjs').assertPublicUrl,egressOptions,clock=Date.now,deadline=Infinity}){
 if(!scoped(config))throw Error('web_egress_scope_rejected');
 const p=route?.profile;if(!p||p.synthetic!==false||p.enabled!==true||p.identityVerified!==true||p.kind!=='stability'||!net.isIP(p.expectedEgressIp||'')||!Number.isInteger(route.revision))throw Error('web_egress_verified_profile_missing');
 const options=egressOptions||require('./web-context-egress.cjs').webContextEgress(config),proxy=new URL(p.proxyUrl),echo=new URL(p.egressUrl);
 if(proxy.origin!==new URL(options.proxy.server).origin||proxy.hostname!=='127.0.0.1'||proxy.protocol!=='http:'||echo.protocol!=='https:'||!p.allowedTargetOrigins?.includes(echo.origin))throw Error('web_egress_route_binding_changed');
 const ctx=await createContext({ignoreHTTPSErrors:false,...options});let reads=0,checks=0,transportRetries=0;const failedReadAttempts=[];
 async function safeGet(url,options={},stage){for(let attempt=0;attempt<2;attempt++){const left=deadline-clock()-(stage==='public_source'?6500:0);if(left<1000)throw Error('web_egress_budget_exhausted');try{return await ctx.get(url,{...options,maxRedirects:0,timeout:Math.min(options.timeout||6000,left)});}catch(error){const transient=/ECONNRESET|ECONNREFUSED|socket hang up|connection (?:closed|reset)|Timeout|timed out/i.test(String(error.message));failedReadAttempts.push({stage,attempt:attempt+1,observedAt:new Date(clock()).toISOString(),reason:transient?'transient_read_transport':'read_transport_rejected'});if(!transient||attempt===1)throw Error(stage==='egress'?'web_egress_transport_failed':'web_egress_source_transport_failed');transportRetries++;await beforePage();}}}

 async function verify(){await beforePage();await assertPublicUrl(echo.href);const remaining=deadline-clock();if(remaining<1000)throw Error('web_egress_budget_exhausted');const r=await safeGet(echo.href,{timeout:Math.min(6000,remaining),maxRedirects:0},'egress'),body=await r.text();let value;try{value=body.length<=1024?JSON.parse(body):null}catch{}if(r.status()!==200||value?.ip!==p.expectedEgressIp)throw Error('web_egress_check_failed');checks++;}
 return{get:async(url,readOptions)=>{if(new URL(url).origin!==scopes[config.recordId].origin)throw Error('web_egress_site_origin_changed');if(config.recordId==='A023'&&url!=='https://justmysocks.net/members/cart.php')throw Error('web_egress_site_route_rejected');await verify();const r=await safeGet(url,readOptions,'public_source');await verify();reads++;return r;},dispose:()=>ctx.dispose(),proof:()=>({status:'verified_before_and_after_each_read',guardedReads:reads,matchedChecks:checks,sourceProfileId:p.id,sourceProfileRevision:route.revision,transportRetries,failedReadAttempts})};
}
function runtimeProof(config,caps){const x=caps?.webEgress;if(!scoped(config)||x?.status!=='verified_before_and_after_each_read'||!Number.isInteger(x.guardedReads)||x.guardedReads<1||x.guardedReads>16||x.matchedChecks!==x.guardedReads*2||typeof x.sourceProfileId!=='string'||!Number.isInteger(x.sourceProfileRevision))return null;return{status:x.status,guardedReads:x.guardedReads,matchedChecks:x.matchedChecks,sourceProfileId:x.sourceProfileId,sourceProfileRevision:x.sourceProfileRevision};}
module.exports={selectedProfile,context,runtimeProof};
