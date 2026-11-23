'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('crypto');
const {collect}=require('../deploy-service/published-entry-probe.cjs');
const origin='https://publisher.example',config={entryUrl:origin+'/',publicOnly:true,publicPublisherDiscovery:true,allowedHosts:['publisher.example']};
async function run(bodies){const urls=[];const r=await collect({config,lookup:async()=>[{address:'8.8.8.8'}],transportFactory:async()=>({get:async(url,options)=>{urls.push(url);assert.equal(options.maxRedirects,0);const b=bodies[url];assert(b,'undeclared fetch '+url);return{status:()=>b.status||200,text:async()=>b.body};},dispose:async()=>{}})});return{r,urls};}
test('only same-origin declared module and literal config fetch are read; candidate destinations never contacted',async()=>{
 const bodies={[origin+'/']:{body:'<script src="/assets/index-a.js"></script>'},[origin+'/assets/index-a.js']:{body:'async function config(){return fetch("/config.json")}'},[origin+'/config.json']:{body:JSON.stringify({title:'站点线路检测',urls:['https://candidate.example']})}};
 const {r,urls}=await run(bodies);assert.equal(r.checkpoint,null);assert.equal(urls.length,3);assert.deepEqual(r.captures[0].metadata.anchors.map(a=>a.url),['https://candidate.example/']);
 const bundle=JSON.parse(r.captures[0].body);for(const o of bundle.originals)assert.equal(o.sha256,crypto.createHash('sha256').update(o.body).digest('hex'));
 assert.equal(r.captures[0].metadata.identityVerified,false);assert.equal(r.paymentExecuted,false);
});
test('undeclared config is never guessed; HTTP denial remains original evidence',async()=>{
 let x=await run({[origin+'/']:{body:'<script src="https://other.example/assets/index-a.js"></script>'}});assert.equal(x.urls.length,1);assert(x.r.checkpoint);
 x=await run({[origin+'/']:{body:'Access denied',status:403}});assert.equal(x.r.checkpoint.reason,'publisher_http_403');assert.equal(JSON.parse(x.r.captures[0].body).originals[0].body,'Access denied');
});

test('transport diagnostics preserve bounded failure code without raw errors, host secrets or fake originals',async()=>{for(const code of ['EAI_AGAIN','ECONNRESET','ERR_CERT_COMMON_NAME_INVALID']){const x=await collect({config,lookup:async()=>[{address:'8.8.8.8'}],transportFactory:async()=>({get:async()=>{throw Error('public request '+code+' PRIVATE_TOKEN at secret.invalid')},dispose:async()=>{}})});assert.equal(x.checkpoint.transportFailure,code);assert.equal(x.checkpoint.reason,'publisher_transport_or_json_failed');assert.deepEqual(x.captures,[]);assert(!JSON.stringify(x).includes('PRIVATE_TOKEN'));assert(!JSON.stringify(x).includes('secret.invalid'));}});
