import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {searchJichangbangEntry} from './site-recipes/jichangbang-entry-search.mjs';
const require=createRequire(import.meta.url),{root,runDir}=require('../scripts/collection.cjs'),E=require('../lib/collection-engine.cjs');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>{fs.writeFileSync(p+'.tmp',JSON.stringify(v,null,2)+'\n');fs.renameSync(p+'.tmp',p);};
export async function runDirectoryEntryDiscoveryChunk({browser,runId,recordIds,limit=5,tab:existingTab,readDocument}){
 if(!Array.isArray(recordIds)||!recordIds.length||recordIds.some(id=>!/^A\d{3}$/.test(id)))throw Error('directory_discovery_record_scope_required');
 const dir=runDir(runId),file=path.join(dir,'directory-entry-state.json');fs.mkdirSync(dir,{recursive:true});
 const state=fs.existsSync(file)?read(file):{scope:recordIds,results:{}};
 if(JSON.stringify([...state.scope].sort())!==JSON.stringify([...recordIds].sort()))throw Error('directory_discovery_resume_scope_changed');
 let tab=existingTab,processed=0;
 try{
  for(const id of recordIds.filter(id=>!state.results[id]||state.results[id].status==='directory_search_pending').slice(0,limit)){
   const profile=read(path.join(root,'collection/site-collectors',id+'.json')),query=profile.directoryDiscovery?.query||profile.name;
   try{
    if(!tab){tab=await browser.tabs.new();await tab.goto('https://www.jichangbang.cc/ranking');}
    const receipt=await searchJichangbangEntry({tab,recordId:id,query,readDocument,onCheckpoint:async c=>{if(c.status==='directory_search_pending'){state.results[id]=c;write(file,state);}}});
    const bytes=JSON.stringify(receipt,null,2)+'\n',name=id+'-ranking-visible-search.json';fs.writeFileSync(path.join(dir,name),bytes);
    state.results[id]={status:'directory_search_captured',recordId:id,query,capturedAt:receipt.capturedAt,file:name,sha256:E.sha(bytes),candidateUrls:receipt.records.flatMap(r=>r.links.filter(l=>l.label==='官网').map(l=>l.url)),grade:'E0',officialQuotesAdmitted:0};
   }catch(error){state.results[id]={recordId:id,status:'directory_search_checkpoint',at:new Date().toISOString(),error:String(error.message).slice(0,180),officialQuotesAdmitted:0};}
   write(file,state);processed++;
  }
 }finally{if(tab&&!existingTab)try{await tab.close();}catch{}}
 return{processed,remaining:recordIds.filter(id=>!state.results[id]||state.results[id].status==='directory_search_pending').length,officialQuotesAdmitted:0};
}
