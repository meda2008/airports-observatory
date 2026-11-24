'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{healthy}=require('../deploy-service/three-services/collector-healthcheck.cjs');
const defaults={probe:async()=>true,readFile:()=> 'x'.repeat(64),baseUrl:'http://api:8080'};
test('paused measurement controls are healthy without enabling any work',async()=>{
 assert(await healthy({...defaults,fetchImpl:async(url,o)=>{assert.equal(url.pathname,'/internal/measurement-worker');assert.equal(o.redirect,'error');assert.deepEqual(JSON.parse(o.body),{method:'enabled',args:[]});return{ok:true,json:async()=>({ok:true,value:false})};}}));
});
test('collector health fails closed on dead proxy, missing auth, unavailable or malformed API',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;return{ok:false};};
 assert.equal(await healthy({...defaults,probe:async()=>false,fetchImpl}),false);assert.equal(calls,0);
 assert.equal(await healthy({...defaults,readFile:()=>'',fetchImpl}),false);assert.equal(calls,0);
 assert.equal(await healthy({...defaults,fetchImpl}),false);
 assert.equal(await healthy({...defaults,fetchImpl:async()=>({ok:true,json:async()=>({ok:true,value:'false'})})}),false);
 assert.equal(await healthy({...defaults,fetchImpl:async()=>{throw Error('private transport details');}}),false);
});
