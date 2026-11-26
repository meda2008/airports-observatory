'use strict';
const {Worker,parentPort,workerData}=require('node:worker_threads');

function openPublicationWorker({filename,root}){
 const pending=new Map();
 let worker,closed=false,closing,sequence=0;
 function start(){
  const current=new Worker(__filename,{workerData:{filename,root}});
  function failed(){
   if(worker!==current)return;
   worker=null;
   for(const {reject} of pending.values())reject(Error('publication_worker_unavailable'));
   pending.clear();
  }
  current.once('error',failed);
  current.once('exit',failed);
  current.on('message',({id,result,ok})=>{
   const request=pending.get(id);
   if(worker!==current||!request)return;
   pending.delete(id);
   if(ok)request.resolve(result);else request.reject(Error('publication_sync_failed'));
  });
  current.unref();
  return current;
 }
 function request(op){
  if(closed)return Promise.reject(Error('publication_worker_closed'));
  worker||=start();
  return new Promise((resolve,reject)=>{
   const id=++sequence;
   pending.set(id,{resolve,reject});
   try{worker.postMessage({id,op});}catch(error){pending.delete(id);reject(error);}
  });
 }
 function close(){
  closed=true;
  closing||=worker?.terminate()||Promise.resolve();
  return closing;
 }
 return {tick:()=>request('tick'),sync:()=>request('sync'),close};
}

if(parentPort&&workerData){
 const {filename,root}=workerData;
 const store=require('./store.cjs').createStore({filename});
 const catalog=require('./catalog-db.cjs').openCatalogDb({filename,store,root});
 const publisher=require('./publisher.cjs').createPublisher({store,catalog,root});
 parentPort.on('message',({id,op})=>{
  try{parentPort.postMessage({id,ok:true,result:op==='sync'?catalog.sync():publisher.tick()});}
  catch{parentPort.postMessage({id,ok:false});}
 });
}
module.exports={openPublicationWorker};
