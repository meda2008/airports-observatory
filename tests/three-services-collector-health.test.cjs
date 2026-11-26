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
test('measurement proxy failure leaves the web loop running while measurement retries',async()=>{
 const {runCollectorRuntime}=require('../deploy-service/collector-runtime.cjs');
 const {EventEmitter}=require('node:events');
 const controller=new AbortController(),statuses=[];
 let webStarted=false,webAborted=false,spawned=0,closed=0;
 await runCollectorRuntime({token:'synthetic-test-token',signal:controller.signal,proxyRetryMs:1,
  spawnImpl(){const child=new EventEmitter();spawned++;setImmediate(()=>child.emit('error',Error('proxy fixture')));return child;},
  probeImpl:async()=>false,storeFactory:()=>({close(){closed++;}}),
  measurementLoop:async()=>assert.fail('measurement requires a healthy proxy'),
  webLoop:async({signal})=>{webStarted=true;await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));webAborted=true;},
  log(value){statuses.push(value.status);assert.equal(webStarted,true);assert.equal(webAborted,false);if(spawned===2)controller.abort();},
 });
 assert.deepEqual(statuses,['degraded','degraded']);
 assert.equal(closed,2);
 assert.equal(webAborted,true);
});
