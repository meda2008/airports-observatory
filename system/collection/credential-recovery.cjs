'use strict';
// Local-only migration of a verified, explicitly stored account pair.
// Never derives credentials from a default/master, browser cookie, or a similar brand.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function recoverVerifiedAccount({sourceFile,vaultFile,rowIndex,origin,siteId,actor,backupFile}){
 if(!actor||!/^A\d{3}$/.test(siteId||'')||!Number.isInteger(rowIndex)||!backupFile)throw Error('Explicit source row, site, actor and private backup required');
 const target=new URL(origin);if(target.protocol!=='https:'||target.origin!==origin)throw Error('Exact HTTPS origin required');
 const sourceBytes=fs.readFileSync(sourceFile),raw=JSON.parse(sourceBytes),row=raw.results?.[rowIndex];
 if(!row||row.verified!==true||new URL(row.url).origin!==origin||typeof row.account!=='string'||!/^\S+@\S+\.\S+$/.test(row.account)||typeof row.password!=='string'||!row.password||/错误|失败|拒绝|invalid|incorrect|rejected/i.test(row.status||''))throw Error('No verified exact-origin explicit credential pair');
 const oldBytes=fs.readFileSync(vaultFile),vault=JSON.parse(oldBytes),accounts=Array.isArray(vault)?vault:vault.accounts;
 if(!Array.isArray(accounts))throw Error('Unknown credential vault format');
 if(accounts.some(a=>{try{return new URL(a.url||a.origin).origin===origin;}catch{return false;}}))throw Error('Origin already has saved credentials; do not overwrite or select among them');
 fs.mkdirSync(path.dirname(backupFile),{recursive:true});fs.writeFileSync(backupFile,oldBytes,{flag:'wx',mode:0o600});
 accounts.push({url:origin+'/',email:row.account,password:row.password,pw_status:'verified_registration_record_not_current_login_tested',sourceRecord:{siteId,rowIndex,sourceSha256:sha(sourceBytes)}});
 fs.writeFileSync(vaultFile,JSON.stringify(vault,null,2),{mode:0o600});
 return{siteId,origin,actor,status:'existing_verified_account_recovered',sourceSha256:sha(sourceBytes),oldVaultSha256:sha(oldBytes),newVaultSha256:sha(fs.readFileSync(vaultFile)),networkAccessed:false,credentialValuesExported:false,currentLoginVerified:false};
}
module.exports={recoverVerifiedAccount};
