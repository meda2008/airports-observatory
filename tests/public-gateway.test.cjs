'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {createWebServer}=require('../deploy-service/three-services/web.cjs');
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const close=server=>new Promise(resolve=>server.close(resolve));
test('production gateway separates public reads, protected management and internal RPC',async()=>{
 const key='local-test-only-secret-'.repeat(3),seen=[];
 const upstream=http.createServer((req,res)=>{seen.push({url:req.url,authorization:req.headers.authorization});res.setHeader('content-type','application/json');if(req.url==='/api/catalog')res.setHeader('vary','Accept-Encoding');res.end(JSON.stringify({ok:true}));});await listen(upstream);
 const web=createWebServer({upstream:'http://127.0.0.1:'+upstream.address().port,gatewayOptions:{apiHost:'airports-api.example.com',adminHost:'airports-admin.example.com',frontendOrigin:'https://airports.example.com',adminToken:key}});await listen(web);
 const base='http://127.0.0.1:'+web.address().port;
 const get=(url,{host='airports-api.example.com',headers={},body,...options}={})=>new Promise((resolve,reject)=>{
  const req=http.request(base+url,{...options,headers:{Host:host,...headers}},res=>{res.resume();res.on('end',()=>resolve({status:res.statusCode,headers:new Headers(res.headers)}));});req.on('error',reject);req.end(body);
 });
 try{
  const read=await get('/api/catalog',{headers:{Origin:'https://airports.example.com',Authorization:'Bearer do-not-forward'}});assert.equal(read.status,200);assert.equal(read.headers.get('access-control-allow-origin'),'https://airports.example.com');assert.equal(seen.at(-1).authorization,undefined);
  assert.equal(read.headers.get('vary'),'Origin, Accept-Encoding');
  assert.equal((await get('/api/catalog')).headers.get('vary'),'Origin, Accept-Encoding');
  assert.equal((await get('/api/catalog',{headers:{Origin:'https://evil.example'}})).status,403);
  for(const route of ['/api/admin/status','/console.html','/internal/web-collector/claim'])assert.equal((await get(route)).status,404);
  assert.equal((await get('/api/catalog',{method:'POST',body:'{}'})).status,405);
  assert.equal((await get('/api/catalog',{method:'OPTIONS',headers:{Origin:'https://airports.example.com','Access-Control-Request-Method':'POST'}})).status,405);
  assert.equal((await get('/api/catalog',{method:'OPTIONS',headers:{Origin:'https://airports.example.com','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'Authorization'}})).status,403);
  assert.equal((await get('/api/catalog',{host:'unrelated.example.com'})).status,404);
  const admin={host:'airports-admin.example.com'};
  for(const route of ['/','/console.html','/console.js','/api/admin/status'])assert.equal((await get(route,admin)).status,401);
  const credentials={Authorization:'Basic '+Buffer.from('admin:'+key).toString('base64')};
  assert.equal((await get('/',{...admin,headers:credentials})).status,200);
  assert.equal((await get('/api/admin/status',{...admin,headers:credentials})).status,200);assert.equal(seen.at(-1).authorization,'Bearer '+key);
  const write={...admin,method:'POST',body:'{}'};
  const before=seen.length;
  for(const headers of [{},{Origin:'null'},{Origin:'https://evil.example'},{Origin:'https://airports-admin.example.com','Sec-Fetch-Site':'cross-site'}]){
   assert.equal((await get('/api/admin/review',{...write,headers:{...credentials,...headers}})).status,403);
  }
  assert.equal(seen.length,before);
  assert.equal((await get('/api/admin/review',{...write,headers:{...credentials,Origin:'https://airports-admin.example.com'}})).status,200);
  assert.equal((await get('/internal/web-collector/claim',{...admin,headers:credentials})).status,404);
 }finally{await close(web);await close(upstream);}
});
