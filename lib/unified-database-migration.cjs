'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const qi=s=>'"'+String(s).replaceAll('"','""')+'"';
function objects(db){return db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'view' THEN 1 WHEN 'index' THEN 2 ELSE 3 END,name").all();}
function columns(db,table){return db.prepare('PRAGMA table_xinfo('+qi(table)+')').all().filter(c=>c.hidden===0).map(c=>c.name);}
function attestation(db,table){
 const names=db.prepare('PRAGMA table_xinfo('+qi(table)+')').all().filter(c=>c.hidden!==1).map(c=>c.name);
 const stmt=db.prepare('SELECT * FROM '+qi(table)+' ORDER BY '+names.flatMap(c=>['typeof('+qi(c)+')',qi(c)+' COLLATE BINARY']).join(','));stmt.setReadBigInts(true);
 const hash=crypto.createHash('sha256');let count=0;for(const record of stmt.iterate()){
  const row=JSON.stringify(Object.entries(record).map(([k,v])=>[k,v===null?['null']:typeof v==='bigint'?['integer',v.toString()]:typeof v==='number'?['real',Object.is(v,-0)?'-0':String(v)]:typeof v==='string'?['text',v]:['blob',Buffer.from(v).toString('hex')]]));hash.update(Buffer.byteLength(row)+':'+row+'\n');count++;
 }return{rows:count,sha256:hash.digest('hex')};
}
// Tokenizes SQL without changing strings/comments. Used only for view names and
// CREATE object names; SQLite itself rewrites table/FK/trigger references below.
function rewriteIdentifiers(sql,map){return sql.replace(/'(?:''|[^'])*'|--[^\n]*|\/\*[\s\S]*?\*\/|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|[A-Za-z_][A-Za-z_0-9]*/g,token=>{
 if(token.startsWith("'")||token.startsWith('--')||token.startsWith('/*'))return token;
 const plain=token[0]==='"'?token.slice(1,-1).replaceAll('""','"'):token[0]==='`'?token.slice(1,-1).replaceAll('``','`'):token[0]==='['?token.slice(1,-1):token;
 return map.has(plain)?qi(map.get(plain)):token;
 });}
function namespacedSchema(source){
 const temporary=new DatabaseSync(':memory:');try{
  temporary.exec('PRAGMA foreign_keys=OFF; PRAGMA legacy_alter_table=OFF;');
  const original=objects(source);for(const obj of original)temporary.exec(obj.sql);
  const tables=original.filter(o=>o.type==='table');for(const obj of tables)temporary.exec('ALTER TABLE '+qi(obj.name)+' RENAME TO '+qi('discovery_'+obj.name));
  const viewMap=new Map(original.filter(o=>o.type==='view').map(o=>[o.name,'discovery_'+o.name]));
  return objects(temporary).map(obj=>{let sql=rewriteIdentifiers(obj.sql,viewMap);const name=obj.type==='table'?obj.name:'discovery_'+obj.name;
   if(obj.type!=='table'&&obj.type!=='view'){
    // Only the CREATE object's first identifier is renamed, leaving columns intact.
    const prefix=/^(CREATE\s+(?:UNIQUE\s+)?(?:INDEX|TRIGGER)\s+(?:IF\s+NOT\s+EXISTS\s+)?)/i.exec(sql);if(!prefix)throw Error('unsupported_schema_object:'+obj.name);
    sql=prefix[0]+sql.slice(prefix[0].length).replace(/^(?:"(?:""|[^"])*"|`[^`]*`|\[[^\]]*\]|[^\s(]+)/,qi(name));
   }return{...obj,name,sql};});
 }finally{temporary.close();}
}
function mergeSqliteDatabases({businessFile,measurementFile,discoveryFile,targetFile,journalFile=targetFile+'.migration.json'}={}){
 const inputs=[businessFile,measurementFile,discoveryFile].map(p=>path.resolve(p)),target=path.resolve(targetFile);if(new Set(inputs).size!==3||inputs.includes(target))throw Error('migration_paths_must_be_distinct');
 if(fs.existsSync(target)||fs.existsSync(journalFile))throw Error('migration_target_or_journal_exists');
 const journal={version:1,status:'started',startedAt:new Date().toISOString(),sources:{business:inputs[0],measurement:inputs[1],discovery:inputs[2]},target,tables:[]};
 const save=()=>fs.writeFileSync(journalFile,JSON.stringify(journal,null,2),{mode:0o600});save();let out;const sources=[];
 try{
  for(const file of inputs)sources.push(new DatabaseSync(file,{readOnly:true}));
  journal.sourceSchemaSha256=Object.fromEntries(['business','measurement','discovery'].map((name,i)=>[name,crypto.createHash('sha256').update(JSON.stringify(objects(sources[i]))).digest('hex')]));
  fs.copyFileSync(inputs[0],target,fs.constants.COPYFILE_EXCL);fs.chmodSync(target,0o600);out=new DatabaseSync(target);out.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
  const used=new Set(objects(out).map(o=>o.name)),businessTables=objects(sources[0]).filter(o=>o.type==='table');
  const groups=[{source:sources[1],schema:objects(sources[1]),prefix:'',kind:'measurement'},{source:sources[2],schema:namespacedSchema(sources[2]),prefix:'discovery_',kind:'discovery'}];
  if(groups[0].schema.some(o=>o.type==='table'&&!o.name.startsWith('measurement_')))throw Error('unexpected_nonmeasurement_table');
  for(const group of groups){for(const obj of group.schema){if(used.has(obj.name))throw Error('schema_collision:'+obj.name);used.add(obj.name);}
   for(const obj of group.schema.filter(o=>o.type==='table'))out.exec(obj.sql);
   for(const obj of objects(group.source).filter(o=>o.type==='table')){
    const dest=group.prefix+obj.name,cols=columns(group.source,obj.name),read=group.source.prepare('SELECT '+cols.map(qi).join(',')+' FROM '+qi(obj.name));read.setReadBigInts(true);
    const write=out.prepare('INSERT INTO '+qi(dest)+' ('+cols.map(qi).join(',')+') VALUES ('+cols.map(()=>'?').join(',')+')');for(const row of read.iterate())write.run(...cols.map(c=>row[c]));
    const before=attestation(group.source,obj.name),after=attestation(out,dest);if(JSON.stringify(before)!==JSON.stringify(after))throw Error('row_attestation_mismatch:'+dest);journal.tables.push({source:group.kind,sourceTable:obj.name,targetTable:dest,...before});
   }
   if(group.source.prepare("SELECT 1 FROM sqlite_schema WHERE name='sqlite_sequence'").get()){
    const seq=group.source.prepare('SELECT name,seq FROM sqlite_sequence');seq.setReadBigInts(true);for(const row of seq.all()){const dest=group.prefix+row.name;out.prepare('DELETE FROM sqlite_sequence WHERE name=?').run(dest);out.prepare('INSERT INTO sqlite_sequence(name,seq) VALUES(?,?)').run(dest,row.seq);}
   }
   for(const obj of group.schema.filter(o=>o.type!=='table'))out.exec(obj.sql);
  }
  for(const obj of businessTables){const before=attestation(sources[0],obj.name),after=attestation(out,obj.name);if(JSON.stringify(before)!==JSON.stringify(after))throw Error('business_attestation_mismatch:'+obj.name);journal.tables.push({source:'business',sourceTable:obj.name,targetTable:obj.name,...before});}
  journal.foreignKeyCheck=out.prepare('PRAGMA foreign_key_check').all();journal.quickCheck=out.prepare('PRAGMA quick_check').all();if(journal.foreignKeyCheck.length||journal.quickCheck.some(r=>Object.values(r)[0]!=='ok'))throw Error('target_integrity_check_failed');
  journal.targetSchemaSha256=crypto.createHash('sha256').update(JSON.stringify(objects(out))).digest('hex');
  out.exec('COMMIT; PRAGMA foreign_keys=ON;');journal.status='success';journal.finishedAt=new Date().toISOString();save();return journal;
 }catch(error){try{out?.exec('ROLLBACK');}catch{}journal.status='failed';journal.error=error.message;journal.finishedAt=new Date().toISOString();save();throw error;}
 finally{out?.close();for(const source of sources)source.close();}
}
module.exports={mergeSqliteDatabases,attestation,namespacedSchema};
