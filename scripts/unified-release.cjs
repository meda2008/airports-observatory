'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),E=require('../lib/collection-engine.cjs'),{root,runDir}=require('./collection.cjs');
const process=require('node:process');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),write=(p,v)=>{fs.writeFileSync(p+'.tmp',JSON.stringify(v,null,2)+'\n');fs.renameSync(p+'.tmp',p);};
const lockFile=path.join(root,'public-site/.openai/unified-release-lock.json');
const alive=pid=>{try{process.kill(pid,0);return true}catch{return false}};
function launchRelease(id){
 const dir=runDir(id),file=path.join(dir,'unified-release.json'),unified=read(path.join(dir,'unified-state.json'));
 assert(unified.reviewHash&&unified.phases.admission?.status==='done','Reviewed admission required');
 let r=fs.existsSync(file)?read(file):{runId:id,reviewHash:unified.reviewHash,startedAt:new Date().toISOString()};assert.equal(r.reviewHash,unified.reviewHash,'Release review changed');
 if(r.status==='published_online_verified')return r;if(r.status==='release_running'&&r.pid&&alive(r.pid))return r;
 if(fs.existsSync(lockFile)){const old=read(lockFile);if(old.runId===id&&!alive(old.pid))fs.unlinkSync(lockFile);else return{status:'release_waiting_for_other_run',owner:old.runId};}
 const lock=fs.openSync(lockFile,'wx');fs.writeFileSync(lock,JSON.stringify({runId:id,pid:process.pid}));fs.closeSync(lock);
 r={...r,status:'release_running',resumedAt:new Date().toISOString()};write(file,r);
 const fd=fs.openSync(path.join(dir,'release-console.log'),'a');const child=cp.spawn(process.execPath,[__filename,'execute',id],{cwd:root,detached:true,windowsHide:true,stdio:['ignore',fd,fd],env:{...process.env,GIT_CONFIG_COUNT:'2',GIT_CONFIG_KEY_0:'maintenance.auto',GIT_CONFIG_VALUE_0:'false',GIT_CONFIG_KEY_1:'gc.auto',GIT_CONFIG_VALUE_1:'0'}});child.unref();fs.closeSync(fd);write(file,{...read(file),pid:child.pid});write(lockFile,{runId:id,pid:child.pid});return read(file);
}
async function execute(id,overrides={}){
 const dir=runDir(id),file=path.join(dir,'unified-release.json'),r=read(file),site=path.join(root,'public-site'),manifest=path.join(site,'dist/build-manifest.json');
 const defaults={build:()=>require('./collection-pipeline.cjs').build(id),manifestHash:()=>E.sha(fs.readFileSync(manifest,'utf8')),push:()=>{cp.execFileSync(process.execPath,['public-site/scripts/publish-github.cjs'],{cwd:root,stdio:'inherit',windowsHide:true});return read(path.join(site,'.openai/github-publication.json'));},findCI:(pub)=>{const runs=JSON.parse(cp.execFileSync('gh',['run','list','--repo',pub.repository,'--limit','10','--json','databaseId,headSha'],{encoding:'utf8',windowsHide:true}));return runs.find(x=>x.headSha===pub.commitSha)?.databaseId;},waitCI:(ci,pub)=>cp.execFileSync('gh',['run','watch',String(ci),'--repo',pub.repository,'--exit-status','--interval','10'],{stdio:'inherit',windowsHide:true}),verify:async pub=>{const v=require('../public-site/scripts/verify-online.cjs'),{loadDirectory}=require('../public-site/scripts/verify-publication.cjs');const result=await v.verifyOnline({config:read(path.join(site,'.openai/site-origin.json')),publication:pub,target:read(path.join(site,'.openai/github-target.json')),localFiles:loadDirectory(path.join(site,'dist')),commit:pub.commitSha,fetchImpl:(url,opts)=>fetch(url,{...opts,signal:AbortSignal.timeout(new URL(url).pathname.endsWith('/data/public-catalog.json')?60000:20000)})});return v.persistReport(result);}};
 const api={...defaults,...overrides},check=()=>assert.equal(E.sha(fs.readFileSync(path.join(dir,'review.json'),'utf8')),r.reviewHash,'Review changed during release');
 try{check();if(!r.buildDone){r.phase='build';write(file,r);await api.build();r.buildDone=true;r.manifestHash=api.manifestHash();write(file,r);}assert.equal(api.manifestHash(),r.manifestHash,'Validated public candidate changed; do not publish mixed builds');check();
  if(!r.publication){r.phase='push';write(file,r);r.publication=await api.push();r.commit=r.publication.commitSha;write(file,r);}
  if(!r.ciVerified){r.phase='ci';write(file,r);r.ciRunId=r.ciRunId||await api.findCI(r.publication);assert(r.ciRunId,'CI not visible yet; retry resumes here without republishing');await api.waitCI(r.ciRunId,r.publication);r.ciVerified=true;write(file,r);}
  check();assert.equal(api.manifestHash(),r.manifestHash,'Validated public candidate changed during release');r.phase='online';write(file,r);const online=await api.verify(r.publication);assert.equal(online.status,'PASS_ONLINE_STATIC_HTTP_ONLY');r.status='published_online_verified';r.onlineReport=online.historyEntry;r.phase='complete';r.finishedAt=new Date().toISOString();write(file,r);
 }catch(error){r.status='release_failed';r.error=String(error.message);r.failedAt=new Date().toISOString();write(file,r);if(require.main===module)process.exitCode=1;}
 finally{if(fs.existsSync(lockFile)&&read(lockFile).runId===id)fs.unlinkSync(lockFile);}return r;
}
if(require.main===module){assert.equal(process.argv[2],'execute');execute(process.argv[3]);}module.exports={launchRelease,execute};
