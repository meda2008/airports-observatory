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
  current.on('message',({id,result,ok,error:workerError})=>{
   const request=pending.get(id);
   if(worker!==current||!request)return;
   pending.delete(id);
   if(!pending.size&&!closed)current.unref();
   if(ok)request.resolve(result);
   else{
    const err=Error('publication_sync_failed');
    if(workerError&&typeof workerError==='object'){
     if(typeof workerError.code==='string'&&workerError.code)err.workerCode=workerError.code;
     if(typeof workerError.name==='string'&&workerError.name)err.workerName=workerError.name;
     if(typeof workerError.message==='string'&&workerError.message)err.workerMessage=workerError.message;
    }
    request.reject(err);
   }
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
   worker.ref();
   try{worker.postMessage({id,op});}catch(error){pending.delete(id);if(!pending.size)worker.unref();reject(error);}
  });
 }
 function close(){
  closed=true;
  if(!closing){
   const current=worker;
   if(current){
    current.ref();
    closing=new Promise(resolve=>{current.once('exit',resolve);});
    try{current.postMessage({op:'close'});}catch{void current.terminate();}
   }else closing=Promise.resolve();
  }
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
  if(op==='close'){
   try{catalog.close();}finally{try{store.close();}finally{parentPort.close();}}
   return;
  }
  try{
   const attempt=publisher.tick({force:op==='sync'});
   const result=attempt.publicationResult||attempt;
   parentPort.postMessage({id,ok:op!=='sync'||result.status!=='failed',result});
  }
  catch(error){
   const code=typeof error?.code==='string'?error.code.slice(0,64):'';
   const name=typeof error?.name==='string'?error.name.slice(0,64):'Error';
   const message=String(error?.message||'unknown_error').replace(/[\r\n]+/g,' ').slice(0,240);
   parentPort.postMessage({id,ok:false,error:{code,name,message}});
  }
 });
}
module.exports={openPublicationWorker};
