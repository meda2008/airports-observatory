'use strict';
const net=require('node:net');
const origin='https://qu01.kuajiecloud.com';
function configured(c){try{return c?.recordId==='A162'&&new URL(c.entryUrl).origin===origin;}catch{return false;}}
function anchors(body){
 if(typeof body!=='string'||body.length>160000||!body.includes('function getTargets()')||!body.includes('String(typeof DOMAIN_LIST === "string" ? DOMAIN_LIST : "").trim()'))throw Error('publisher_inline_contract_changed');
 const assignments=[...body.matchAll(/const\s+DOMAIN_LIST\s*=\s*"([a-zA-Z0-9.\s-]+)"\s*;/g)];if(assignments.length!==1)throw Error('publisher_domain_list_ambiguous');
 const names=assignments[0][1].trim().split(/\s+/);if(!names.length||names.length>20||new Set(names).size!==names.length)throw Error('publisher_domain_list_invalid');
 return names.map(name=>{if(name.length>253||net.isIP(name)||!name.includes('.')||name.endsWith('.localhost')||!name.split('.').every(x=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(x)))throw Error('publisher_candidate_not_public_hostname');return{url:'https://'+name.toLowerCase()+'/',label:'跨界云 · 原发布页DOMAIN_LIST原生列出；关联待核'};});
}
module.exports={origin,configured,anchors};
