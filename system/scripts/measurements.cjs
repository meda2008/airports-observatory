#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
async function main(args=process.argv.slice(2)){
 const command=args[0]||'status',arg=name=>args.find(x=>x.startsWith('--'+name+'='))?.slice(name.length+3),filename=path.resolve(arg('db')||process.env.MEASUREMENT_STORE_FILE||path.join(root,'deploy-service/data/measurements.sqlite'));
 const connection=require('../deploy-service/measurement-connection.cjs'),forceLocal=!!arg('db')||process.env.MEASUREMENT_BACKEND==='local';
 const backend=forceLocal?{mode:'local'}:connection.readBackend();
 if(backend.mode==='api')return runApiCommand({command,arg,backend});
 const store=require('../deploy-service/measurement-connection.cjs').openConfiguredMeasurementStore({filename,forceLocal:!!arg('db')||process.env.MEASUREMENT_BACKEND==='local'});let catalog;
 try{let result;
  if(command==='status')result=store.status();
  else if(command==='configure'){if(!arg('profile')||!arg('actor'))throw Error('profile_file_and_actor_required');const profile=JSON.parse(fs.readFileSync(arg('profile'),'utf8'));if(profile.synthetic&&(!args.includes('--synthetic-fixture')||! /fixture/i.test(path.basename(filename))))throw Error('synthetic_fixture_database_required');const row=store.configure(profile);result={profileId:row.profile.id,revision:row.revision};}
  else if(command==='control'){if(!arg('actor')||!['true','false'].includes(arg('enabled')))throw Error('explicit_enabled_and_actor_required');result=store.setEnabled(arg('enabled')==='true');}
  else if(command==='enqueue'){if(!arg('actor'))throw Error('actor_required');result=store.requestRun(arg('id'));}
  else if(command==='run'||command==='tick'){result=await require('../deploy-service/measurement-worker.cjs').createMeasurementWorker({store,secretDirectory:process.env.MEASUREMENT_SECRET_DIR||path.join(root,'deploy-service/data/measurement-secrets')}).tick({id:arg('id'),limit:Number(arg('limit')||2)});}
  else if(command==='summary')result=require('../lib/measurement-conclusions.cjs').summarize(store,arg('id'));
  else if(command==='observations')result={items:store.observations(arg('id'))};
  else if(command==='propose'||command==='timeline'){if(!arg('catalog-db'))throw Error('explicit_catalog_database_required');catalog=require('../deploy-service/store.cjs').createStore({filename:path.resolve(arg('catalog-db'))});if(command==='propose'){if(!arg('actor'))throw Error('actor_required');result=arg('ids')?require('../lib/measurement-conclusions.cjs').proposeBatch({measurements:store,catalogStore:catalog,profileIds:arg('ids').split(','),observationIdsByProfile:arg('window')?JSON.parse(fs.readFileSync(arg('window'),'utf8')):{},allowSyntheticFixture:args.includes('--synthetic-fixture')}):require('../lib/measurement-conclusions.cjs').propose({measurements:store,catalogStore:catalog,profileId:arg('id'),allowSyntheticFixture:args.includes('--synthetic-fixture')});}else result=require('../lib/historical-evidence-timeline.cjs').buildHistoricalEvidenceTimeline(catalog.getSite(arg('site')));}
  else throw Error('unknown_measurement_command');
  const output=JSON.stringify(result,null,2);if(arg('out')){fs.mkdirSync(path.dirname(path.resolve(arg('out'))),{recursive:true});fs.writeFileSync(arg('out'),output+'\n');}else console.log(output);return result;
 }finally{catalog?.close();store.close();}
}
async function runApiCommand({command,arg,backend}){
 const prefix='/api/admin/measurements';let route=prefix,method='GET',body;
 const actor=()=>{if(!arg('actor'))throw Error('actor_required');return arg('actor');};
 const query=(name,value)=>value?'?'+new URLSearchParams({[name]:value}):'';
 if(command==='status'){}
 else if(command==='summary'||command==='observations')route+='/'+command+query('profileId',arg('id'));
 else if(command==='timeline'){if(!arg('site'))throw Error('site_required');route+='/timeline'+query('siteId',arg('site'));}
 else if(command==='configure'){if(!arg('profile'))throw Error('profile_file_and_actor_required');method='POST';route+='/profile';body={actor:actor(),profile:JSON.parse(fs.readFileSync(arg('profile'),'utf8'))};}
 else if(command==='control'){if(!['true','false'].includes(arg('enabled')))throw Error('explicit_enabled_and_actor_required');method='POST';route+='/control';body={actor:actor(),enabled:arg('enabled')==='true'};}
 else if(command==='enqueue'){method='POST';route+='/request-run';body={actor:actor(),profileId:arg('id')};}
 else if(command==='propose'){method='POST';route+='/propose';body={actor:actor(),...(arg('ids')?{profileIds:arg('ids').split(',')}:{profileId:arg('id')}),...(arg('window')?{observationIdsByProfile:JSON.parse(fs.readFileSync(arg('window'),'utf8'))}:{})};}
 else throw Error('measurement_api_command_not_allowed');
 const token=fs.readFileSync(backend.adminTokenFile,'utf8').trim();if(!token||/[\r\n]/.test(token))throw Error('measurement_api_token_invalid');
 let response;try{response=await fetch(backend.baseUrl+route,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});}catch{throw Error('measurement_api_backend_unavailable');}
 if(!response.ok)throw Error('measurement_api_request_rejected');
 const result=await response.json(),output=JSON.stringify(result,null,2);
 if(arg('out')){fs.mkdirSync(path.dirname(path.resolve(arg('out'))),{recursive:true});fs.writeFileSync(arg('out'),output+'\n');}else console.log(output);
 return result;
}
if(require.main===module)main().catch(()=>{console.error(JSON.stringify({status:'failed',reason:'measurement_command_rejected_no_secret_details'}));process.exitCode=1;});
module.exports={main};
