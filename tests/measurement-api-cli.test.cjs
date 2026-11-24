'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {readBackend}=require('../deploy-service/measurement-connection.cjs');
const {main}=require('../scripts/measurements.cjs');
test('API marker accepts explicit loopback only',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'api-cli-')),file=path.join(dir,'marker.json');
 try{for(const baseUrl of ['https://127.0.0.1','http://localhost','http://example.com','http://127.0.0.1@evil','http://127.0.0.1/?secret=1','http://2130706433','http://127.0.0.1/#x']){fs.writeFileSync(file,JSON.stringify({mode:'api',baseUrl,adminTokenFile:path.join(dir,'token')}));assert.throws(()=>readBackend(file),/invalid/);}
 fs.writeFileSync(file,JSON.stringify({mode:'api',baseUrl:'http://127.0.0.1:8081',adminTokenFile:path.join(dir,'token')}));assert.equal(readBackend(file).baseUrl,'http://127.0.0.1:8081');}finally{fs.rmSync(dir,{recursive:true});}
});
test('API CLI authenticates from file, preserves output, refuses execution and redirects without fallback',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'api-cli-')),marker=path.join(dir,'marker.json'),token=path.join(dir,'token'),out=path.join(dir,'output.json'),window=path.join(dir,'window.json');
 fs.writeFileSync(token,'fixture-token');fs.writeFileSync(window,JSON.stringify({p:['o1']}));let received;
 const server=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;received={url:req.url,auth:req.headers.authorization,body};if(req.url.includes('/summary')){res.writeHead(302,{location:'/api/admin/measurements'});res.end();return;}res.setHeader('content-type','application/json');res.end(JSON.stringify({items:['retained']}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));fs.writeFileSync(marker,JSON.stringify({mode:'api',baseUrl:`http://127.0.0.1:${server.address().port}`,adminTokenFile:token}));
 const previous=process.env.MEASUREMENT_BACKEND_CONFIG;process.env.MEASUREMENT_BACKEND_CONFIG=marker;
 t.after(()=>{if(previous===undefined)delete process.env.MEASUREMENT_BACKEND_CONFIG;else process.env.MEASUREMENT_BACKEND_CONFIG=previous;server.closeAllConnections();server.close();fs.rmSync(dir,{recursive:true});});
 await main(['observations','--id=p','--out='+out]);assert.equal(received.url,'/api/admin/measurements/observations?profileId=p');assert.equal(received.auth,'Bearer fixture-token');assert.deepEqual(JSON.parse(fs.readFileSync(out)),{items:['retained']});
 await main(['propose','--ids=p,q','--window='+window,'--actor=test','--out='+out]);assert.deepEqual(JSON.parse(received.body),{actor:'test',profileIds:['p','q'],observationIdsByProfile:{p:['o1']}});
 await assert.rejects(main(['run']),/not_allowed/);await assert.rejects(main(['tick']),/not_allowed/);await assert.rejects(main(['summary']),/backend_unavailable/);
});
