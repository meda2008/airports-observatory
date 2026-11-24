'use strict';
// Local supervisor; independent of a Codex chat or scheduled task.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),crypto=require('node:crypto');
const measurementBackend=require('../deploy-service/measurement-connection.cjs').readBackend();
if(measurementBackend.mode==='api'){
 console.log('This installation is managed by the three-service Docker topology. Use deploy-service/compose.three-services.yaml; legacy processes were not started.');
 process.exit(0);
}
const root=path.resolve(__dirname,'..'),dir=path.join(root,'deploy-service'),runtime=path.join(dir,'data/local-runtime');fs.mkdirSync(runtime,{recursive:true});
const envFile=path.join(dir,'.env');if(fs.existsSync(envFile))process.loadEnvFile(envFile);
if(!process.env.ADMIN_TOKEN){const tokenFile=path.join(runtime,'admin-token');if(!fs.existsSync(tokenFile))fs.writeFileSync(tokenFile,crypto.randomBytes(32).toString('hex'),{mode:0o600});process.env.ADMIN_TOKEN=fs.readFileSync(tokenFile,'utf8').trim();}
const env={...process.env,HOST:'127.0.0.1',PORT:process.env.LOCAL_PORT||'8081',STORE_FILE:process.env.STORE_FILE||path.join(dir,'data/collector.sqlite'),COLLECTION_ENABLED:'false'},children=new Map(),startedAt=new Date().toISOString();let stopping=false;
const state=()=>fs.writeFileSync(path.join(runtime,'processes.json'),JSON.stringify({supervisorPid:process.pid,port:env.PORT,collectionEnabled:false,legacyCollectionEnabled:false,managedExecution:'database_controlled',startedAt,children:[...children].map(([name,c])=>({name,pid:c.pid}))},null,2));
function run(name,file){if(stopping)return;const log=fs.openSync(path.join(runtime,name+'.log'),'a'),child=spawn(process.execPath,[path.join(dir,file)],{cwd:root,env,stdio:['ignore',log,log],windowsHide:true});fs.closeSync(log);children.set(name,child);state();child.on('exit',()=>{children.delete(name);state();if(!stopping){console.error(name+' exited; retry in 10 seconds');setTimeout(()=>run(name,file),10000);}});child.on('error',()=>{console.error(name+' failed to start');});}
run('web','server.cjs');run('publisher','publisher.cjs');run('collector','worker.cjs');run('controller','control-daemon.cjs');run('standalone','standalone-worker.cjs');
// Fail closed: an explicitly migrated backend must never silently resume local sampling.
if(measurementBackend.mode==='local'){
 run('measurements','measurement-worker.cjs');
 if(fs.existsSync(path.join(dir,'data/real-line-secrets/active-client.json')))run('line-client','line-client-supervisor.cjs');
}
function stop(){stopping=true;for(const c of children.values())c.kill();}process.once('SIGTERM',stop);process.once('SIGINT',stop);
console.log('Local product: http://127.0.0.1:'+env.PORT+' (legacy worker paused; managed collector uses persisted console settings)');
