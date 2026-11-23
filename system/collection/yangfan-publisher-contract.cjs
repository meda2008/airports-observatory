'use strict';
// Read public publisher data only. Never evaluate client code, create its
// verification cookies, invoke logging endpoints or propagate credentials.
const crypto=require('node:crypto');
const origin='https://a4.yfyfind.net';
const clientSha='6559a8d661398d4be9ab20b30fc8bb0f27000b88432de9d016c348f6cb7975d4';
function configured(c){try{return c?.recordId==='A049'&&new URL(c.entryUrl).origin===origin;}catch{return false;}}
function scriptUrl(home){
 const urls=[...home.matchAll(/<script[^>]*src=["']([^"']+)["']/g)].map(m=>new URL(m[1],origin)).filter(u=>u.origin===origin&&/^\/js\/app-[\w-]+\.js$/.test(u.pathname)&&u.search==='?v=20260612');
 if(urls.length!==1)throw Error('publisher_script_ambiguous');return urls[0].href;
}
function configurationUrl(script,now){
 if(crypto.createHash('sha256').update(script).digest('hex')!==clientSha)throw Error('publisher_reviewed_client_changed');
 // The reviewed script declares this alphabet and this literal. Only a data
 // string is decoded; none of the surrounding executable protection is run.
 if(!script.includes('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/='))throw Error('publisher_encoding_changed');
 const literals=[...script.matchAll(/["']([a-zA-Z0-9+/=]{8,500})["']/g)].map(m=>Buffer.from(m[1].replace(/[a-zA-Z]/g,c=>c===c.toLowerCase()?c.toUpperCase():c.toLowerCase()),'base64').toString('utf8'));
 if(!literals.includes('/api/jump-config?_='))throw Error('publisher_config_not_declared');
 if(!Number.isSafeInteger(now)||now<0)throw Error('publisher_clock_invalid');
 return origin+'/api/jump-config?_='+now;
}
function anchors(value){
 if(value?.type!=='relay'||value.brand!=='扬帆云'||value.mode!=='sequential'||!Array.isArray(value.targets)||!value.targets.length||value.targets.length>20||!value.targets.includes(value.defaultTarget))throw Error('publisher_config_schema_changed');
 const urls=value.targets.map(x=>{const u=new URL(x);if(u.protocol!=='https:'||u.username||u.password||u.port||u.pathname!=='/'||u.search||u.hash)throw Error('publisher_candidate_not_plain_origin');return u.origin+'/';});
 if(new Set(urls).size!==urls.length)throw Error('publisher_duplicate_candidates');
 return urls.map(url=>({url,label:'扬帆云 · 原生发布配置列出；归属待核'}));
}
module.exports={origin,clientSha,configured,scriptUrl,configurationUrl,anchors};
