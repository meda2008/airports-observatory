const {test}=require('node:test'),assert=require('node:assert/strict'),{createServer}=require('../deploy-service/server.cjs');
test('mailbox notice is public static text, admin writes remain protected',async t=>{
 const server=createServer({adminToken:'synthetic-test-token',store:{}});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port;
 const r=await fetch(base+'/api/mailbox-privacy');assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/text\/plain/);const text=await r.text();assert.match(text,/Limited Use/);assert.match(text,/read-only/);assert.doesNotMatch(text,/GOCSPX-|refresh_token|123456/);
 assert.equal((await fetch(base+'/api/admin/review',{method:'POST',body:'{}'})).status,401);
});
