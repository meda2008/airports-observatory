'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function file(root,v){return path.join(root,'endpoint-unavailable-'+sha(v.base+'|'+v.clientSha256+'|'+v.loginEncoding)+'.json');}
function valid(v,key){return v?.base===key.base&&v.clientSha256===key.clientSha256&&v.loginEncoding===key.loginEncoding&&v.status===404;}
function read(root,key){for(const p of [file(root,key),path.join(root,'endpoint-unavailable.json')]){try{const v=JSON.parse(fs.readFileSync(p,'utf8'));if(valid(v,key))return v;}catch{}}return null;}
function retain(root,v){if(typeof v?.base!=='string'||!/^https:\/\/[^/?#]+\/api\/v1$/.test(v.base)||!/^[a-f0-9]{64}$/.test(v.clientSha256||'')||!['json','form'].includes(v.loginEncoding)||!valid(v,v)||!Number.isFinite(Date.parse(v.observedAt)))throw Error('native_endpoint_hold_invalid');fs.mkdirSync(root,{recursive:true,mode:0o700});const p=file(root,v);try{fs.writeFileSync(p,JSON.stringify(v),{mode:0o600,flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;const old=JSON.parse(fs.readFileSync(p,'utf8'));if(!valid(old,v))throw Error('native_endpoint_hold_conflict');return old;}return v;}
module.exports={read,retain,file};
