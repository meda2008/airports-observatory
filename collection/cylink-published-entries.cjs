'use strict';
// Parse the service's published candidate list; never execute its WAF probes,
// redirect script, support fallback or arbitrary JavaScript.
const net=require('node:net');
const origin=new URL('https://次元.vip/').origin;
function configured(c){try{return c?.recordId==='A046'&&new URL(c.entryUrl).origin===origin;}catch{return false;}}
function anchors(body){
 if(typeof body!=='string'||body.length>160000||!/<title>次元链接\s*-\s*CYLINK<\/title>/.test(body))throw Error('cylink_publisher_brand_or_size_changed');
 const scripts=[...body.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(s=>/const\s+obfuscatedDomains\s*=/.test(s));
 if(scripts.length!==1)throw Error('cylink_publisher_list_ambiguous');const script=scripts[0];
 for(const part of ['return str.split("").reverse().join("");','return atob(encodedStr);','const reversed = reverseString(obfuscatedDomain);','const padded = ensureBase64Padding(reversed);','return decodeBase64(padded);','for (let obfuscatedDomain of obfuscatedDomains)','const decodedDomain = decodeDomain(obfuscatedDomain);'])if(!script.includes(part))throw Error('cylink_publisher_encoding_contract_changed');
 const assignments=[...script.matchAll(/const\s+obfuscatedDomains\s*=\s*(\[[\s\S]*?\])\s*;/g)];if(assignments.length!==1)throw Error('cylink_publisher_list_ambiguous');
 let values;try{values=JSON.parse(assignments[0][1]);}catch{throw Error('cylink_publisher_list_not_literal_json');}
 if(!Array.isArray(values)||!values.length||values.length>20)throw Error('cylink_publisher_list_invalid');
 const urls=values.map(value=>{if(typeof value!=='string'||value.length>2048||!/^=?=?[A-Za-z0-9+/]+$/.test(value))throw Error('cylink_publisher_encoding_invalid');const reversed=[...value].reverse().join('');const bytes=Buffer.from(reversed,'base64');if(bytes.toString('base64').replace(/=+$/,'')!==reversed.replace(/=+$/,''))throw Error('cylink_publisher_encoding_invalid');const text=bytes.toString('utf8');if(!/^https:\/\/[a-zA-Z0-9.-]+\/?$/.test(text))throw Error('cylink_publisher_candidate_not_plain_https');const u=new URL(text),h=u.hostname;if(h.length>253||net.isIP(h)||!h.includes('.')||/\.(?:local|localhost|internal)$/.test(h)||!h.split('.').every(s=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(s)))throw Error('cylink_publisher_candidate_not_public_hostname');return u.origin+'/';});
 if(new Set(urls).size!==urls.length)throw Error('cylink_publisher_duplicate_candidate');
 return urls.map(url=>({url,label:'次元链接 · 原发布页反转Base64列表原生列出；关联待核'}));
}
module.exports={origin,configured,anchors};
