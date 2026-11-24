'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execute}=require('../scripts/performance-maintenance.cjs');
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'perf-api-')),tokenFile=path.join(dir,'token'),backendConfig=path.join(dir,'backend.json');fs.writeFileSync(tokenFile,'fixture-token-no-real-secret');fs.writeFileSync(backendConfig,JSON.stringify({mode:'api',baseUrl:'http://127.0.0.1:12345',adminTokenFile:tokenFile}));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return{backendConfig};}
const response=(value,status=200)=>({ok:status>=200&&status<300,status,json:async()=>value});
const profile={siteId:'A001',revision:4,config:{recordId:'A001',name:'WgetCloud',entryUrl:'https://example.org/',allowedHosts:['example.org'],enabled:true,fields:['pricing'],auth:{mode:'none'}}};
const snapshot=()=>({profiles:[structuredClone(profile)],sites:[{id:'A001',revision:0,document:{}}]});
test('API monitor requests unified monitor with auth and scoped IDs; no host DB needed',async t=>{
 const options=setup(t),calls=[];const result=await execute(['monitor','--sites=A001,A002'],{...options,fetchImpl:async(url,o)=>{calls.push([url,o]);return response({counts:{sites:2},rows:[]});}});
 assert.equal(result.command,'monitor');assert.equal(result.counts.sites,2);assert.equal(calls[0][0],'http://127.0.0.1:12345/api/admin/performance/monitor?sites=A001%2CA002');assert.equal(calls[0][1].headers.authorization,'Bearer fixture-token-no-real-secret');assert.equal(calls[0][1].redirect,'error');assert.equal(calls[0][1].method,'GET');
});
test('API plan and additive apply use fresh snapshots and preserve official account scope',async t=>{
 const options=setup(t),data=snapshot(),calls=[];const fetchImpl=async(url,o)=>{calls.push([url,o]);if(o.method==='POST'){const body=JSON.parse(o.body);assert.equal(body.expectedRevision,4);assert.deepEqual(body.config,{fields:['pricing','speed'],collectPerformanceReferences:true,performanceReferenceFields:['speed']});data.profiles[0].config={...data.profiles[0].config,...body.config};data.profiles[0].revision++;return response({profile:data.profiles[0]});}return response(structuredClone(data));};
 const plan=await execute(['plan','--sites=A001','--fields=speed'],{...options,fetchImpl});assert.equal(plan.plan.rows[0].status,'configuration_repair_required');assert(calls.every(([,o])=>o.method==='GET'));
 const applied=await execute(['apply','--sites=A001','--fields=speed','--actor=fixture'],{...options,fetchImpl});assert.equal(applied.results[0].afterRevision,5);assert.equal(applied.results[0].officialScopesUnchanged,true);assert.deepEqual(data.profiles[0].config.auth,profile.config.auth);assert.deepEqual(data.profiles[0].config.allowedHosts,profile.config.allowedHosts);
});
test('API managed public run uses registered scope and queue endpoint only',async t=>{
 const options=setup(t),data=snapshot(),calls=[];Object.assign(data.profiles[0].config,{publicReferenceEnabled:true,publicReferenceFields:['speed']});
 const result=await execute(['run','--sites=A001','--fields=speed','--actor=fixture','--public-only','--mode=managed'],{...options,fetchImpl:async(url,o)=>{calls.push([url,o]);return response(o.method==='GET'?data:{status:'queued',result:{jobId:'fixture-job'}},o.method==='GET'?200:202);}});
 assert.equal(result.results[0].status,'queued');assert.equal(calls[1][0],'http://127.0.0.1:12345/api/admin/run');assert.deepEqual(JSON.parse(calls[1][1].body),{siteId:'A001',publicReferencesOnly:true});
});
test('API discovery requires explicit registered source ownership before queueing',async t=>{
 const options=setup(t),seed=require('../collection/performance-discovery-sources.json').seeds[0],calls=[];const fetchImpl=async(url,o)=>{calls.push([url,o]);return response({siteId:seed.recordId,status:'queued',jobId:'candidate'});};
 await assert.rejects(execute(['discover','--sites='+seed.recordId,'--actor=fixture'],{...options,fetchImpl}),/requires --sites, --sources/);
 await assert.rejects(execute(['discover','--sites=A999','--sources='+seed.id,'--actor=fixture'],{...options,fetchImpl}),/must belong/);assert.equal(calls.length,0);
 const result=await execute(['discover','--sites='+seed.recordId,'--sources='+seed.id,'--actor=fixture'],{...options,fetchImpl});assert.equal(result.newBusinessFacts,0);assert.equal(result.mode,'unified_api_discovery_queue');assert.equal(calls[0][0],'http://127.0.0.1:12345/api/admin/discovery');assert.deepEqual(JSON.parse(calls[0][1].body),{siteId:seed.recordId,seedId:seed.id,actor:'fixture'});
});
test('configured origin cannot change, retired DB is refused, and API failure never falls back',async t=>{
 const options=setup(t);let calls=0;const fetchImpl=async()=>{calls++;return response({private:'do-not-echo-token'},401);};
 for(const base of ['http://127.0.0.1:9','https://example.org','http://127.0.0.1:12345/path','http://user:pass@127.0.0.1:12345/'])await assert.rejects(execute(['monitor','--base='+base],{...options,fetchImpl}),/origin cannot|Local admin/);
 await assert.rejects(execute(['monitor','--database=deploy-service/data/collector.sqlite'],{...options,fetchImpl}),/Retired live/);assert.equal(calls,0);
 await assert.rejects(execute(['monitor'],{...options,fetchImpl}),e=>e.message==='Local API 401 /api/admin/performance/monitor');assert.equal(calls,1);
});
