import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),E=require('../lib/collection-engine.cjs'),{runDir}=require('../scripts/collection.cjs');
export function validatePublicPost(post,expectedPost){
 if(!/^[a-z0-9_]{5,}\/\d+$/i.test(expectedPost)||post.post!==expectedPost||post.permalink!=='https://t.me/'+expectedPost)throw Error('Public post identity mismatch');
 if(!post.text?.trim()||!Number.isFinite(Date.parse(post.publishedAt)))throw Error('Public post body or exact original timestamp missing');
 return post;
}
// Channel descriptions are mutable, undated statements, never dated posts.
export async function captureChannelDescription({tab,runId,recordId}){
 const dir=runDir(runId),read=p=>JSON.parse(fs.readFileSync(p,'utf8')),plan=read(path.join(dir,'plan.json')),url=await tab.url(),u=new URL(url),task=plan.tasks.find(t=>t.recordIds?.includes(recordId)&&t.allowedHosts?.includes('t.me')&&t.parentLinkSourceId);
 if(!task||u.origin!=='https://t.me'||u.pathname.toLowerCase()!==new URL(task.entryUrl).pathname.toLowerCase())throw Error('Bound official channel provenance required');
 const nodes=await tab.playwright.locator('.tgme_channel_info_description').evaluateAll(es=>es.filter(e=>e.getClientRects().length).map(e=>e.innerText));if(nodes.length!==1||!nodes[0].trim())throw Error('Visible channel description missing or ambiguous');
 const capturedAt=new Date().toISOString(),snapshot={url,title:await tab.title(),text:E.redact(nodes[0]),parentLinkSourceId:task.parentLinkSourceId,kind:'mutable_public_channel_description',publishedAt:null,publicationDateUnknown:true,capturedAt,representation:'redacted_visible_channel_description_DOM_text',authenticationObserved:false,inputValuesRead:false};
 const bytes=JSON.stringify(snapshot,null,2)+'\n',sha256=E.sha(bytes),file='evidence/'+sha256+'.json',sourceId='COLLECT-'+sha256.slice(0,24);fs.mkdirSync(path.join(dir,'evidence'),{recursive:true});fs.writeFileSync(path.join(dir,file),bytes);const state=read(path.join(dir,'state.json')),r=state.results[task.taskId]||{taskId:task.taskId,recordIds:task.recordIds,sources:[],errors:[]};r.sources.push({sourceId,file,sha256,url,capturedAt,recordIds:[recordId],grade:'E1',independenceScore:'I0',representation:snapshot.representation,hints:[]});r.status='observed_needs_review';r.finishedAt=capturedAt;state.results[task.taskId]=r;fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify(state,null,2));return{sourceId,capturedAt,publishedAt:null};
}
// Retains one visible public message with its own timestamp, not a surrounding
// channel date heading. No Telegram sign-in, subscription, joining or posting.
export async function capturePublicPost({tab,runId,recordId,postId}){
 const dir=runDir(runId),plan=JSON.parse(fs.readFileSync(path.join(dir,'plan.json'))),task=plan.tasks.find(t=>t.recordIds?.includes(recordId)&&t.allowedHosts?.includes('t.me')&&t.parentLinkSourceId);
 if(!task?.allowedHosts.includes('t.me')||!task.parentLinkSourceId)throw Error('Original-site channel provenance required');
 const current=new URL(await tab.url());if(current.origin!=='https://t.me'||!current.pathname.startsWith('/s/'+postId.split('/')[0]))throw Error('Unconfirmed public channel');
 if(!/^[a-z0-9_]{5,}\/\d+$/i.test(postId))throw Error('Invalid public post id');
 const rows=await tab.playwright.locator('[data-post="'+postId+'"]').evaluateAll(nodes=>nodes.filter(e=>e.getClientRects().length).map(e=>({post:e.getAttribute('data-post'),text:e.innerText,publishedAt:e.querySelector('time[datetime]')?.getAttribute('datetime'),permalink:e.querySelector('time[datetime]')?.closest('a[href]')?.href,links:[...e.querySelectorAll('a[href]')].filter(a=>a.getClientRects().length).map(a=>({url:a.href,label:a.innerText}))})));
 if(rows.length!==1)throw Error('Visible public message missing or ambiguous');const post=validatePublicPost(rows[0],postId),capturedAt=new Date().toISOString();
 if(Date.parse(post.publishedAt)>Date.parse(capturedAt))throw Error('Post timestamp is in future');
 const snapshot={url:post.permalink,channelPreviewUrl:current.href,parentLinkSourceId:task.parentLinkSourceId,title:await tab.title(),text:E.redact(post.text),post:post.post,publishedAt:post.publishedAt,permalink:post.permalink,links:post.links.filter(l=>E.safeUrl(l.url)),capturedAt,representation:'redacted_visible_public_message_DOM_text_with_exact_time_attribute',inputValuesRead:false};
 const raw=JSON.stringify(snapshot,null,2)+'\n',sha256=E.sha(raw),sourceId='COLLECT-'+sha256.slice(0,24),file='evidence/'+sha256+'.json';fs.mkdirSync(path.join(dir,'evidence'),{recursive:true});fs.writeFileSync(path.join(dir,file),raw);
 const state=JSON.parse(fs.readFileSync(path.join(dir,'state.json'))),old=state.results[task.taskId]||{taskId:task.taskId,recordIds:task.recordIds,sources:[],errors:[]};
 const source={sourceId,file,sha256,url:post.permalink,capturedAt,recordIds:task.recordIds,grade:'E1',independenceScore:'I0',representation:snapshot.representation,hints:E.extract(snapshot,sourceId),discovery:[]};
 old.sources.push(source);old.status='observed_needs_review';old.finishedAt=capturedAt;state.results[task.taskId]=old;fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify(state,null,2));
 return {status:'captured',sourceId,publishedAt:post.publishedAt,capturedAt};
}
