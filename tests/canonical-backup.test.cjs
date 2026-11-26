'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {backupCanonical}=require('../deploy-service/three-services/backup.cjs');
test('SQLite backup keeps source intact, verifies integrity, streams digest and refuses overwrite',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'airports-backup-')),source=path.join(dir,'source.sqlite'),target=path.join(dir,'copy.sqlite');
 const db=new DatabaseSync(source);db.exec('CREATE TABLE catalog_records(id TEXT PRIMARY KEY);INSERT INTO catalog_records VALUES(\'A001\'),(\'A002\');');db.close();
 const before=crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
 const r=await backupCanonical(source,target);assert.equal(r.status,'verified');assert.equal(r.integrity,'ok');assert.equal(r.records,2);
 assert.equal(r.sha256,crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'));
 assert.equal(before,crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'));
 await assert.rejects(backupCanonical(source,target),/fresh_backup_destination_required/);
});

test('backup includes committed WAL rows and publishes one matching receipt under competing writers',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'airports-backup-'));
 const source=path.join(dir,'source.sqlite'),target=path.join(dir,'copy.sqlite');
 const db=new DatabaseSync(source);
 t.after(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});});
 db.exec("PRAGMA journal_mode=WAL;CREATE TABLE catalog_records(id TEXT);INSERT INTO catalog_records VALUES ('A001');");
 fs.writeFileSync(target+'.receipt.json','existing');
 await assert.rejects(backupCanonical(source,target),/fresh_backup_destination_required/);
 assert.equal(fs.readFileSync(target+'.receipt.json','utf8'),'existing');
 assert.equal(fs.existsSync(target),false);
 fs.unlinkSync(target+'.receipt.json');
 const attempts=await Promise.allSettled([backupCanonical(source,target),backupCanonical(source,target)]);
 assert.equal(attempts.filter(a=>a.status==='fulfilled').length,1);
 assert.equal(attempts.filter(a=>a.status==='rejected').length,1);
 const receipt=JSON.parse(fs.readFileSync(target+'.receipt.json','utf8'));
 assert.equal(receipt.records,1);
 assert.equal(receipt.sha256,crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'));
});
