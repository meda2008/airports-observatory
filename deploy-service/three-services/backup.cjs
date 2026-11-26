'use strict';
// Run in the Linux API container. No credentials, raw evidence or large buffers
// are emitted. An existing destination is never overwritten.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{DatabaseSync,backup}=require('node:sqlite');
async function backupCanonical(source,destination){
 const src=path.resolve(source),dst=path.resolve(destination),receiptPath=dst+'.receipt.json';
 if(src===dst||fs.existsSync(dst)||fs.existsSync(receiptPath))throw Error('fresh_backup_destination_required');
 fs.mkdirSync(path.dirname(dst),{recursive:true,mode:0o700});
 const stage=fs.mkdtempSync(path.join(path.dirname(dst),'.sqlite-backup-'));
 const stagedDb=path.join(stage,'snapshot.sqlite'),stagedReceipt=path.join(stage,'receipt.json');
 let linked=false;
 try{
  fs.closeSync(fs.openSync(stagedDb,'wx',0o600));
  const db=new DatabaseSync(src,{readOnly:true});
  try{db.exec('BEGIN');db.prepare('SELECT name FROM sqlite_master LIMIT 1').get();await backup(db,stagedDb);db.exec('COMMIT');}finally{db.close();}
  const copied=new DatabaseSync(stagedDb,{readOnly:true});let integrity,records;
  try{integrity=copied.prepare('PRAGMA integrity_check').all();records=copied.prepare('SELECT count(*) n FROM catalog_records').get().n;}finally{copied.close();}
  if(integrity.length!==1||!Object.values(integrity[0]).includes('ok'))throw Error('backup_integrity_failed');
  const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(stagedDb))hash.update(chunk);
  const receipt={status:'verified',at:new Date().toISOString(),bytes:fs.statSync(stagedDb).size,records,sha256:hash.digest('hex'),integrity:'ok'};
  fs.writeFileSync(stagedReceipt,JSON.stringify(receipt,null,2),{mode:0o600,flag:'wx'});
  fs.linkSync(stagedDb,dst);linked=true;
  fs.linkSync(stagedReceipt,receiptPath);
  return receipt;
 }catch(error){
  if(linked)fs.unlinkSync(dst);
  if(error.code==='EEXIST')throw Error('fresh_backup_destination_required',{cause:error});
  throw error;
 }finally{fs.rmSync(stage,{recursive:true,force:true});}
}
if(require.main===module){const[source,destination]=process.argv.slice(2);if(!source||!destination)throw Error('Usage: node backup.cjs SOURCE_DB NEW_BACKUP');backupCanonical(source,destination).then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('Backup incomplete; keep source and inspect retained destination.');process.exitCode=1;});}
module.exports={backupCanonical};
