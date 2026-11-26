'use strict';
const fs=require('node:fs'),path=require('node:path');
function readCuration(root,bytes){
 const file=path.join(root,'collection/catalog-curation.json');
 if(bytes===undefined)bytes=fs.existsSync(file)?fs.readFileSync(file):null;
 if(bytes===null)return {schemaVersion:'airports-catalog-curation.v1',archived:[]};
 const value=JSON.parse(bytes.toString('utf8'));
 if(value.schemaVersion!=='airports-catalog-curation.v1'||!Array.isArray(value.archived))throw Error('Invalid catalog curation manifest');
 const ids=new Set();for(const r of value.archived){if(!/^A\d{3}$/.test(r.id)||ids.has(r.id)||!r.name||!r.reason||!Number.isFinite(Date.parse(r.archivedAt)))throw Error('Invalid or duplicate catalog archive');ids.add(r.id);}
 return value;
}
function activeRecords(records,root,bytes){const archived=new Set(readCuration(root,bytes).archived.map(r=>r.id));return records.filter(r=>!archived.has(r.id));}
module.exports={readCuration,activeRecords};
