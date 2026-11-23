'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
test('migrated API backend refuses legacy supervisor before opening logs or changing process marker',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'three-launch-'));
 try{const config=path.join(dir,'backend.json');fs.writeFileSync(config,JSON.stringify({mode:'api',baseUrl:'http://127.0.0.1:1',adminTokenFile:path.join(dir,'not-read')}));
 const marker=path.resolve(__dirname,'../deploy-service/data/local-runtime/processes.json'),before=fs.existsSync(marker)?fs.readFileSync(marker):null;
 const result=cp.spawnSync(process.execPath,[path.resolve(__dirname,'../scripts/local-product.cjs')],{env:{...process.env,MEASUREMENT_BACKEND_CONFIG:config},encoding:'utf8',timeout:5000,windowsHide:true});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/legacy processes were not started/);if(before)assert.deepEqual(fs.readFileSync(marker),before);else assert.equal(fs.existsSync(marker),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
