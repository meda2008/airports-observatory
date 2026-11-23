'use strict';
// Maintenance in the three-service topology never opens a host SQLite file.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{buildPlan}=require('./live-performance-plan.cjs');
const root=path.resolve(__dirname,'..');
function localBase(value){const u=new URL(value);if(u.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(u.hostname)||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('Local admin base required');return u.origin;}
function output(a,result){if(a.out){const dest=path.resolve(root,String(a.out));if(!dest.toLowerCase().startsWith(root.toLowerCase()+path.sep))throw Error('Receipt must stay in project');fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(result,null,2)+'\n');}return result;}
async function executeApi(a,{backend,fetchImpl=fetch}={}){
 const base=localBase(backend.baseUrl);if(a.base!==undefined&&(typeof a.base!=='string'||localBase(a.base)!==base))throw Error('Configured API origin cannot be overridden');
 const siteIds=typeof a.sites==='string'?a.sites.split(','):undefined;
 if(siteIds&&(!siteIds.length||siteIds.some(id=>!/^A\d{3}$/.test(id))))throw Error('Explicit site IDs required');
 const token=fs.readFileSync(backend.adminTokenFile,'utf8').trim();if(!token)throw Error('Admin token required');
 const request=async(route,body)=>{const response=await fetchImpl(base+route,{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(180000)});let result;try{result=await response.json();}catch{throw Error('Local API invalid JSON '+response.status);}if(!response.ok)throw Error('Local API '+response.status+' '+route);return{route,httpStatus:response.status,result};};
 const query=siteIds?'?sites='+encodeURIComponent(siteIds.join(',')):'',takeSnapshot=async()=>(await request('/api/admin/performance/snapshot'+query)).result;
 if(a.command==='monitor')return output(a,{command:'monitor',...(await request('/api/admin/performance/monitor'+query)).result});
 if(a.command==='discover'){
  if(!siteIds||typeof a.actor!=='string'||!a.actor.trim()||typeof a.sources!=='string'||!a.sources.trim())throw Error('API discovery requires --sites, --sources and explicit --actor');
  const ids=a.sources.split(','),registry=require('../collection/performance-discovery-sources.json').seeds;
  if(new Set(ids).size!==ids.length)throw Error('Unique discovery source IDs required');
  const seeds=ids.map(id=>{const seed=registry.find(s=>s.id===id);if(!seed||!siteIds.includes(seed.recordId))throw Error('Discovery seed must belong to explicit sites');return seed;});
  const results=[];for(const seed of seeds){const queued=(await request('/api/admin/discovery',{seedId:seed.id,siteId:seed.recordId,actor:a.actor})).result;if(queued.siteId!==seed.recordId)throw Error('Discovery API returned a different site');results.push({siteId:seed.recordId,seedId:seed.id,status:queued.status,queued});}
  return output(a,{command:'discover',at:new Date().toISOString(),mode:'unified_api_discovery_queue',productionBusinessDatabaseModified:true,newBusinessFacts:0,results});
 }
 if(!['plan','apply','run'].includes(a.command))throw Error('Use plan|apply|run|monitor|discover');
 const fields=typeof a.fields==='string'?a.fields.split(','):['speed','stability'],publicReferencesOnly=a['public-only']===true;
 if(a['public-only']!==undefined&&a['public-only']!==true)throw Error('Use boolean --public-only');
 if(publicReferencesOnly&&a.command==='run'&&a.mode!=='managed')throw Error('Public-only run requires --mode=managed');
 if(a.command!=='plan'&&(!siteIds||typeof a.actor!=='string'||!a.actor.trim()))throw Error('Mutations require --sites and explicit --actor');
 const before=await takeSnapshot(),plan=buildPlan({...before,fields,siteIds,publicReferencesOnly,refreshExisting:a['refresh-existing']===true});
 const result={command:a.command,at:new Date().toISOString(),plan,mutated:false,results:[]};
 if(a.command!=='plan')for(const row of plan.rows){
  if(!row.enabled||!row.eligibleFields.length){result.results.push({siteId:row.siteId,status:row.status,queued:false});continue;}
  if(a.command==='apply'){
   if(row.canRun){result.results.push({siteId:row.siteId,status:'configuration_already_current',mutated:false});continue;}
   const original=before.profiles.find(p=>p.siteId===row.siteId),r=await request('/api/admin/collectors/'+row.siteId+'/config',{actor:a.actor,expectedRevision:row.profileRevision,config:row.configurationPatch});
   const after=(await takeSnapshot()).profiles.find(p=>p.siteId===row.siteId);for(const k of ['allowedHosts','auth','entryUrl','enabled'])assert.deepEqual(after.config[k],original.config[k]);for(const f of original.config.fields)assert(after.config.fields.includes(f));
   result.results.push({siteId:row.siteId,status:'configuration_applied',beforeRevision:row.profileRevision,afterRevision:after.revision,officialScopesUnchanged:true,...r});result.mutated=true;
  }else{
   if(!row.canRun){result.results.push({siteId:row.siteId,status:'apply_configuration_first',queued:false});continue;}
   const r=a.mode==='managed'?await request('/api/admin/run',{siteId:row.siteId,...(publicReferencesOnly?{publicReferencesOnly:true}:{})}):await request('/api/admin/collectors/'+row.siteId+'/validate',{actor:a.actor});result.results.push({siteId:row.siteId,status:'queued',...r});result.mutated=true;
  }
 }
 return output(a,result);
}
module.exports={executeApi};
