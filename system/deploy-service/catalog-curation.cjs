'use strict';
const fs=require('node:fs'),path=require('node:path');
function readCuration(root){
 const file=path.join(root,'collection/catalog-curation.json');
 if(!fs.existsSync(file))return {schemaVersion:'airports-catalog-curation.v1',archived:[]};
 const value=JSON.parse(fs.readFileSync(file,'utf8'));
 if(value.schemaVersion!=='airports-catalog-curation.v1'||!Array.isArray(value.archived))throw Error('Invalid catalog curation manifest');
 const ids=new Set();for(const r of value.archived){if(!/^A\d{3}$/.test(r.id)||ids.has(r.id)||!r.name||!r.reason||!Number.isFinite(Date.parse(r.archivedAt)))throw Error('Invalid or duplicate catalog archive');ids.add(r.id);}
 return value;
}
function activeRecords(records,root){const archived=new Set(readCuration(root).archived.map(r=>r.id));return records.filter(r=>!archived.has(r.id));}
module.exports={readCuration,activeRecords};
