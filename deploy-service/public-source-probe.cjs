'use strict';
// Bounded GET-only diagnostics. Journal each source before dispatch so a crash
// cannot silently repeat the previous network request. Never collects accounts.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function failure(e){for(const code of ['ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ECONNRESET','ETIMEDOUT','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE'])if(e?.code===code||e?.cause?.code===code)return code;return /timeout|timed out/i.test(e?.message||'')?'ETIMEDOUT':'public_source_read_failed';}
async function collect({cases,directory,createContext,assertPublicUrl=require('./collector.cjs').assertPublicUrl,clock=Date.now}={}){
 if(!Array.isArray(cases)||!cases.length||cases.length>4||!path.isAbsolute(directory||''))throw Error('bounded_explicit_probe_scope_required');
 for(const c of cases){const u=new URL(c.url);if(!/^A\d{3}$/.test(c.id)||u.protocol!=='https:'||u.username||u.password||u.hash||!require('./standalone-collector.cjs').safeReadUrl(u.href,[u.hostname]))throw Error('public_read_only_probe_url_required');}
 fs.mkdirSync(directory,{recursive:true,mode:0o700});let ctx;
 try{ctx=await(createContext?createContext():require('playwright').request.newContext({ignoreHTTPSErrors:false}));return await Promise.all(cases.map(async c=>{
 const file=path.join(directory,c.id+'-'+sha(c.url)+'.json');
 if(fs.existsSync(file)){const old=JSON.parse(fs.readFileSync(file,'utf8'));if(old.id!==c.id||old.url!==c.url)throw Error('probe_journal_identity_mismatch');return{...old,reused:true,file};}
 const row={id:c.id,url:c.url,observedAt:new Date(clock()).toISOString(),method:'GET',status:'started',credentialsSubmitted:false,paymentExecuted:false};fs.writeFileSync(file,JSON.stringify(row,null,2),{flag:'wx',mode:0o600});
 try{await assertPublicUrl(c.url);const r=await ctx.get(c.url,{maxRedirects:0,timeout:12000}),body=await r.text();if(body.length>160000)throw Error('source_too_large');Object.assign(row,{status:'completed',httpStatus:r.status(),location:r.headers().location||null,body,sha256:sha(body)});}catch(e){Object.assign(row,{status:'failed',error:failure(e)});}
 row.finishedAt=new Date(clock()).toISOString();fs.writeFileSync(file,JSON.stringify(row,null,2),{mode:0o600});return{...row,file};
 }));}finally{await ctx?.dispose();}
}
module.exports={collect,failure};
if(require.main===module){const directory=process.env.PUBLIC_SOURCE_PROBE_DIRECTORY||'';if(!directory.startsWith('/collector-state/public-source-probes/')||directory.includes('..'))throw Error('private_collector_probe_directory_required');collect({cases:JSON.parse(process.env.PUBLIC_SOURCE_PROBE_CASES||'[]'),directory}).then(rows=>console.log(JSON.stringify(rows.map(({body,...row})=>({...row,bodyBytes:body?Buffer.byteLength(body):0}))))).catch(e=>{console.error(e.message);process.exitCode=1;});}
