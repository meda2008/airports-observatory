'use strict';
// Run in the Linux API container. No credentials, raw evidence or large buffers
// are emitted. An existing destination is never overwritten.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{DatabaseSync,backup}=require('node:sqlite');
async function backupCanonical(source,destination){
 const src=path.resolve(source),dst=path.resolve(destination);if(src===dst||fs.existsSync(dst))throw Error('fresh_backup_destination_required');
 fs.mkdirSync(path.dirname(dst),{recursive:true,mode:0o700});
 const db=new DatabaseSync(src,{readOnly:true});
 try{db.exec('BEGIN');db.prepare('SELECT name FROM sqlite_master LIMIT 1').get();await backup(db,dst);db.exec('COMMIT');}finally{db.close();}
 fs.chmodSync(dst,0o600);
 const copied=new DatabaseSync(dst,{readOnly:true});let integrity,records;
 try{integrity=copied.prepare('PRAGMA integrity_check').get();records=copied.prepare('SELECT count(*) n FROM catalog_records').get().n;}finally{copied.close();}
 if(!Object.values(integrity).includes('ok'))throw Error('backup_integrity_failed');
 const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(dst))hash.update(chunk);
 const receipt={status:'verified',at:new Date().toISOString(),bytes:fs.statSync(dst).size,records,sha256:hash.digest('hex'),integrity:'ok'};
 fs.writeFileSync(dst+'.receipt.json',JSON.stringify(receipt,null,2),{mode:0o600});return receipt;
}
if(require.main===module){const[source,destination]=process.argv.slice(2);if(!source||!destination)throw Error('Usage: node backup.cjs SOURCE_DB NEW_BACKUP');backupCanonical(source,destination).then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('Backup incomplete; keep source and inspect retained destination.');process.exitCode=1;});}
module.exports={backupCanonical};
