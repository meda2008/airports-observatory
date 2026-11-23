'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const {collectionEnabled,createWorkerController}=require('../deploy-service/worker.cjs');
test('collection requires explicit true; paused worker only writes periodic sanitized heartbeats',()=>{
 for(const value of [undefined,'','false','1','TRUE'])assert.equal(collectionEnabled(value),false);
 assert.equal(collectionEnabled('true'),true);
 const calls=[],logs=[];let pulse,cleared=false;
 const store={setServiceHeartbeat:(name,value)=>calls.push({name,...value}),seedSites:()=>assert.fail('paused worker seeded sites'),enqueueDue:()=>assert.fail('paused worker queued work'),claim:()=>assert.fail('paused worker claimed work'),finish:()=>assert.fail('paused worker finished work')};
 const worker=createWorkerController({store,enabled:false,log:v=>logs.push(v),setTimer:fn=>{pulse=fn;return 1;},clearTimer:()=>{cleared=true;}});
 worker.start();worker.start();pulse();assert.equal(calls.length,2);assert.equal(calls[0].name,'collector');assert.equal(calls[0].status,'paused');assert.equal(calls[0].details.collectionEnabled,false);assert.equal(calls[0].details.paymentAllowed,false);assert.equal(logs.length,2);worker.stop();assert.equal(cleared,true);
});
test('collector errors produce bounded service heartbeat without exception text',()=>{
 const writes=[];const worker=createWorkerController({store:{setServiceHeartbeat:(name,value)=>writes.push({name,...value})},enabled:true,log:()=>{}});
 worker.error();assert.equal(writes[0].status,'error');assert.deepEqual(Object.keys(writes[0].details).sort(),['collectionEnabled','paymentAllowed','reason','schedule']);
});
test('real paused worker stays alive, preserves queued jobs and never reads credentials',async t=>{
 const os=require('node:os'),{spawn}=require('node:child_process'),{createStore}=require('../deploy-service/store.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'airports-paused-worker-')),filename=path.join(dir,'service.sqlite');
 const store=createStore({filename});store.seedSites([{id:'synthetic-paused',entryUrl:'https://example.invalid'}]);store.enqueueDue();const before=store.listJobs();store.close();
 const child=spawn(process.execPath,[path.join(root,'deploy-service/worker.cjs')],{cwd:root,windowsHide:true,env:{...process.env,COLLECTION_ENABLED:'false',STORE_FILE:filename,CREDENTIALS_FILE:path.join(dir,'must-not-be-read.json')},stdio:['ignore','pipe','pipe']});
 const exited=new Promise(resolve=>child.once('exit',resolve));
 t.after(async()=>{child.kill();await exited;fs.rmSync(dir,{recursive:true,force:true});});
 let stdout='',stderr='';child.stderr.on('data',chunk=>{stderr+=chunk;});
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('paused heartbeat not observed: '+stderr)),5000);child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.includes('"status":"paused"')){clearTimeout(timeout);resolve();}});child.once('error',reject);});
 await new Promise(resolve=>setTimeout(resolve,80));assert.equal(child.exitCode,null,'paused daemon must remain alive');
 const check=createStore({filename});try{assert.deepEqual(check.listJobs(),before);assert.equal(check.getServiceHeartbeats().find(v=>v.name==='collector').status,'paused');assert.equal(check.listSites().length,1);}finally{check.close();}
 assert.equal(stderr.includes('ENOENT'),false);assert.equal(stdout.includes('example.invalid'),false);
});
test('Docker manifest contains transitive runtime modules and excludes private data',()=>{
 const docker=fs.readFileSync(path.join(root,'deploy-service/Dockerfile'),'utf8'),rules=fs.readFileSync(path.join(root,'.dockerignore'),'utf8').split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));
 function matches(pattern,file){const directory=pattern.endsWith('/');pattern=pattern.replace(/\/$/,'');const expression=pattern.split('**').map(p=>p.split('*').map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('[^/]*')).join('.*');return new RegExp('^'+expression+(directory?'(?:/.*)?':'')+'$').test(file);}
 function included(file){let result=true;for(const rule of rules){const allow=rule[0]==='!',pattern=allow?rule.slice(1):rule;if(matches(pattern,file))result=allow;}return result;}
 const sources=[...docker.matchAll(/^COPY (.+) \/app\//gm)].flatMap(m=>m[1].split(/\s+/));
 const packaged=file=>included(file)&&sources.some(source=>source.includes('*')?matches(source,file):file===source||file.startsWith(source+'/'));
 for(const file of ['deploy-service/data/collector.sqlite','deploy-service/.env','deploy-service/local-credentials.json'])assert.equal(packaged(file),false,file);
 const seen=new Set(),queue=['deploy-service/worker.cjs','deploy-service/server.cjs','collection/passive-access-wait.mjs','collection/native-read-link.mjs','collection/visible-document.mjs'];
 for(const dir of ['collection/site-recipes','collection/url-collectors'])for(const f of fs.readdirSync(path.join(root,dir)))if(/\.(cjs|mjs)$/.test(f))queue.push(dir+'/'+f);
 while(queue.length){const file=queue.shift();if(seen.has(file))continue;seen.add(file);assert.ok(packaged(file),'runtime module absent from image: '+file);const body=fs.readFileSync(path.join(root,file),'utf8');for(const match of body.matchAll(/(?:require(?:\.resolve)?\(|import\(|from\s*)\s*['"](\.[^'"]+)['"]/g)){const target=path.posix.normalize(path.posix.join(path.posix.dirname(file),match[1]));if(fs.existsSync(path.join(root,target))&&fs.statSync(path.join(root,target)).isFile())queue.push(target);}}
 for(const dir of ['collection/website-collectors','collection/site-collectors']){const files=fs.readdirSync(path.join(root,dir)).filter(f=>f.endsWith('.json'));assert.ok(files.length);for(const f of files)assert.ok(packaged(dir+'/'+f),dir+'/'+f);}
 assert.match(docker,/COLLECTION_ENABLED=false/);assert.match(fs.readFileSync(path.join(root,'deploy-service/compose.yaml'),'utf8'),/COLLECTION_ENABLED: \$\{COLLECTION_ENABLED:-false\}/);assert.equal(require('../deploy-service/package.json').scripts.schedule,'node worker.cjs');
});
