'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'work/observatory-service');fs.mkdirSync(dir,{recursive:true});
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const save=(name,x)=>{const p=path.join(dir,name);fs.writeFileSync(p+'.tmp',JSON.stringify(x,null,2));fs.renameSync(p+'.tmp',p);};
function cycle(){
 const at=new Date().toISOString(),file=path.join(dir,'snapshot.json'),before=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):null;
 const catalog=require('../lib/catalog-service.cjs').makeCatalogService({baseDir:root}).rawExport().catalog;
 const tracked=['website','pricing','payment','refund','privacy','compatibility','trial','operatingHistory'];
 const snapshot={},queue=[],changes=[];
 for(const r of catalog){snapshot[r.id]={name:r.name,fields:{}};for(const field of tracked){const v=JSON.parse(JSON.stringify(r.coreInfo[field])); if(field==='operatingHistory'){delete v.elapsedSinceEarliestEvidence;delete v.yearsSinceStart;delete v.label;}snapshot[r.id].fields[field]={hash:hash(v),value:v};const old=before?.records?.[r.id]?.fields?.[field];if(old&&old.hash!==hash(v))changes.push({at,recordId:r.id,name:r.name,field,before:old.value,after:v});}
 const c=r.coreInfo;for(const [field,missing]of [['pricing',!c.pricing.plans.length],['payment',!c.payment.methods.length],['refund',!c.refund.summary],['privacy',!c.privacy.summary],['compatibility',!c.compatibility.summary]])if(missing)queue.push({recordId:r.id,name:r.name,field,priority:{pricing:1,payment:2,refund:3,privacy:4,compatibility:5}[field],entry:c.website.url,status:'needs_browser_collection',actions:['reuse_retained_evidence','discover_unread_official_link','verify_identity','collect_original','review','admit'],restriction:'browser-use in Codex only; no payment; retain blockers; existing unpaid order holds apply'});
 }
 queue.sort((a,b)=>a.priority-b.priority||a.recordId.localeCompare(b.recordId));
 if(changes.length)fs.appendFileSync(path.join(dir,'changes.ndjson'),changes.map(x=>JSON.stringify(x)).join('\n')+'\n');
 save('snapshot.json',{at,records:snapshot});save('queue.json',{at,items:queue});const status={at,pid:process.pid,catalogRecords:catalog.length,pendingFieldTasks:queue.length,changesThisCycle:changes.length,mode:'local_evidence_monitor',remoteBrowserWorker:'not_connected',limitation:'Queue generation and local change tracking run continuously; remote collection requires a connected Codex browser worker. Missing values are not fabricated.'};save('status.json',status);return status;
}
if(require.main===module){console.log(JSON.stringify(cycle()));if(process.argv.includes('--watch'))setInterval(()=>{try{cycle();}catch(e){save('error.json',{at:new Date().toISOString(),message:e.message});}},60000);}
module.exports={cycle};
