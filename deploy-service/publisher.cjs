'use strict';
// Reconcile retained files and approved SQLite changes. This service never fetches URLs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createStore}=require('./store.cjs'),{openCatalogDb}=require('./catalog-db.cjs');
function fingerprint({root,store,clock=()=>Date.now()}){const files=['catalog/catalog.v1.json','catalog/source-provenance.json','catalog/core-supplement.v1.json','catalog/current-evidence.v1.json','catalog/forecast-ledger.v1.ndjson'];return crypto.createHash('sha256').update(JSON.stringify({day:new Date(clock()).toISOString().slice(0,10),files:files.map(f=>{try{const s=fs.statSync(path.join(root,f));return[f,s.size,s.mtimeMs];}catch{return[f,null];}}),changes:store.listChanges().map(c=>[c.id,c.revision]),refs:store.listReferrals().map(r=>[r.siteId,r.updatedAt])})).digest('hex');}
function createPublisher({store,catalog,root=path.resolve(__dirname,'..'),clock=()=>Date.now(),receiptFile=store?.filename&&store.filename!==':memory:'?path.join(path.dirname(path.resolve(store.filename)),'local-runtime/publisher-failures.ndjson'):null,onReceipt=()=>{}}={}){
 let last=null,lastFailure=null;
 function keepFailure(error,stage,syncResult){const retryable=[5,6].includes(error?.errcode)||/database (?:is )?locked|sqlite_busy|sqlite_locked/i.test(error?.message||''),receipt={at:new Date(clock()).toISOString(),service:'publisher',status:'failed',stage,reason:stage==='heartbeat'?'publisher_heartbeat_failed':'publication_sync_failed',retryable,syncResult:syncResult?.status||null,networkAccess:false};lastFailure=receipt;
  if(receiptFile)try{fs.mkdirSync(path.dirname(receiptFile),{recursive:true});fs.appendFileSync(receiptFile,JSON.stringify(receipt)+'\n');}catch{receipt.failureReceiptPersisted=false;}
  try{onReceipt(receipt);}catch{}
  return receipt;
 }
 function tick(){let stage='fingerprint',result=null;try{const current=fingerprint({root,store,clock});result={status:'unchanged'};if(current!==last){stage='sync';result=catalog.sync();last=current;}stage='heartbeat';store.setServiceHeartbeat('publisher',{status:'running',details:{snapshotId:catalog.publication()?.snapshotId,result:result.status,networkAccess:false}});return result;}catch(error){const failure=keepFailure(error,stage,result);try{store.setServiceHeartbeat('publisher',{status:'error',details:{reason:failure.reason,retryable:failure.retryable,stage,networkAccess:false}});}catch(heartbeatError){keepFailure(heartbeatError,'failure_heartbeat',result);}return{status:'failed',reason:failure.reason,retryable:failure.retryable,stage,syncResult:result?.status||null};}}
 return{tick,lastFailure:()=>lastFailure};
}
if(require.main===module){const store=createStore({filename:process.env.STORE_FILE||path.join(__dirname,'data/collector.sqlite')}),catalog=openCatalogDb({filename:store.filename,store}),publisher=createPublisher({store,catalog});const result=publisher.tick();console.log(JSON.stringify({service:'publisher',...result,networkAccess:false}));if(process.argv.includes('--once')){catalog.close();store.close();}else{const timer=setInterval(()=>publisher.tick(),Number(process.env.PUBLISH_POLL_MS||30000));const stop=()=>{clearInterval(timer);catalog.close();store.close();};process.once('SIGTERM',stop);process.once('SIGINT',stop);}}
module.exports={createPublisher,fingerprint};
