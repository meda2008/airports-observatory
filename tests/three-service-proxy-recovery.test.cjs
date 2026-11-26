const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),{createWebServer}=require('../deploy-service/three-services/web.cjs');
async function server(t,handler){const s=http.createServer(handler);await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));return s;}
async function setup(t,handler){const up=await server(t,handler),web=createWebServer({upstream:'http://127.0.0.1:'+up.address().port});await new Promise(r=>web.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>web.close(r)));return 'http://127.0.0.1:'+web.address().port;}
test('a reset before a GET response retries once using a fresh upstream connection',async t=>{let hits=0;const url=await setup(t,(req,res)=>{hits++;if(hits===1)return req.socket.destroy();res.end('{"ok":true}');});const r=await fetch(url+'/api/stats');assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true});assert.equal(hits,2);});
test('a POST review is never retried after a reset with uncertain mutation outcome',async t=>{let hits=0;const url=await setup(t,(req,res)=>{hits++;req.resume();req.on('end',()=>req.socket.destroy());});const r=await fetch(url+'/api/admin/review',{method:'POST',body:'{"id":"test"}'});assert.equal(r.status,502);assert.equal(hits,1);});
test('two GET resets terminate with 502 rather than looping',async t=>{let hits=0;const url=await setup(t,(req,res)=>{hits++;req.socket.destroy();});const r=await fetch(url+'/api/stats');assert.equal(r.status,502);assert.equal(hits,2);});

test('an interrupted upstream body closes the downstream response without retrying',async t=>{
 let hits=0,interrupted;
 const url=await setup(t,(req,res)=>{
  hits++;
  res.writeHead(200,{'content-length':100});
  res.write('partial');
  interrupted=()=>res.destroy();
 });
 const timeout=AbortSignal.timeout(2000);
 const response=await fetch(url+'/api/stats',{signal:timeout});
 assert.equal(response.status,200);
 interrupted();
 await assert.rejects(response.text(),()=>!timeout.aborted);
 assert.equal(hits,1);
});
