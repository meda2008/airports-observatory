'use strict';
// Public, anonymous, rendered publisher only. Never evaluates hidden handlers,
// removes disabled controls, rewrites Shadow DOM, or visits a click destination.
const origin='https://www.fnf.xyz';
function configured(c){return c?.recordId==='A027'&&c.entryUrl===origin+'/'&&c.publicOnly===true;}
function favicon(url,method){try{const u=new URL(url);return method==='GET'&&u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&['33333.ifnf.xyz','77777.ifnf.xyz'].includes(u.hostname)&&u.pathname==='/favicon.ico'&&[...u.searchParams].length===1&&u.searchParams.getAll('_').length===1&&/^\d{10,16}$/.test(u.searchParams.get('_'));}catch{return false;}}
function entry(url){try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&['33333.ifnf.xyz','77777.ifnf.xyz'].includes(u.hostname)&&u.pathname==='/seni/yes/auth/login';}catch{return false;}}
function cards(root){const found=[];const text=n=>n.nodeName==='#text'?n.nodeValue:(n.children||[]).map(text).join(' ');function walk(n){if(n.nodeName==='LI'){const label=text(n).replace(/\s+/g,' ').trim();if(/^(?:\d+ms )?Foo&Friends (?:正常|无法访问)$/.test(label))found.push({backendNodeId:n.backendNodeId,label,attributes:n.attributes||[]});}for(const k of ['children','shadowRoots'])for(const c of n[k]||[])walk(c);}walk(root);return found.length===2?found:[];}
async function collect({config,browser,beforePage=async()=>{},jobBudgetMs=35000,lookup}={}){
 if(!configured(config))throw Error('fnf_public_publisher_scope_mismatch');
 const {assertPublicUrl}=require('./collector.cjs'),{safeReadUrl}=require('./standalone-collector.cjs');
 let ctx;const captures=[],dependencies=[],targets=[],clicks=[];let clickedLabel=null,timedOut=false;
 const timer=setTimeout(()=>{timedOut=true;void ctx?.close().catch(()=>{});},jobBudgetMs);
 try{
  await beforePage();await assertPublicUrl(config.entryUrl,lookup);
  ctx=await browser.newContext({serviceWorkers:'block',acceptDownloads:false,ignoreHTTPSErrors:false});
  await ctx.route('**/*',async route=>{try{const r=route.request(),u=new URL(r.url()),same=u.origin===origin;
   if(!['GET','HEAD'].includes(r.method())||!same&&!favicon(u.href,r.method())){if(clickedLabel&&r.method()==='GET'&&r.isNavigationRequest()&&entry(u.href))targets.push({label:clickedLabel,url:u.href,observedAt:new Date().toISOString(),destinationAccessed:false});return route.abort();}
   if(!safeReadUrl(u.href,[u.hostname]))return route.abort();await assertPublicUrl(u.href,lookup);
   if(!same)dependencies.push({url:u.href,kind:'native_public_favicon_dependency',notServiceAvailabilityMeasurement:true});return route.continue();
  }catch{return route.abort();}});
  const p=await ctx.newPage();await p.goto(config.entryUrl,{waitUntil:'domcontentloaded',timeout:Math.min(18000,jobBudgetMs)});
  const cd=await ctx.newCDPSession(p);let selected=[];
  for(let i=0;i<20&&!timedOut;i++){await beforePage();if(p.url()!==config.entryUrl)throw Error('publisher_origin_changed');const dom=await cd.send('DOM.getDocument',{depth:-1,pierce:true});selected=cards(dom.root);if(selected.length===2&&selected.every(x=>!x.attributes.some(a=>/\bdisabled\b/.test(a))))break;await p.waitForTimeout(200);}
  const title=await p.title();if(title!=='Foo&Friends. 回家不迷路！'||selected.length!==2)throw Error('publisher_render_contract_changed');
  const ax=await cd.send('Accessibility.getFullAXTree'),visible=ax.nodes.filter(n=>!n.ignored&&['StaticText','heading','link'].includes(n.role?.value)).map(n=>({role:n.role.value,name:n.name?.value||''}));
  for(const n of selected){if(n.attributes.some(a=>/\bdisabled\b/.test(a)))continue;await beforePage();if(p.url()!==config.entryUrl)throw Error('publisher_origin_changed');const {model}=await cd.send('DOM.getBoxModel',{backendNodeId:n.backendNodeId}),q=model.content;if(q.length!==8||!q.every(Number.isFinite))throw Error('publisher_control_not_visible');const start=targets.length;clickedLabel=n.label;try{await p.mouse.click((q[0]+q[2]+q[4]+q[6])/4,(q[1]+q[3]+q[5]+q[7])/4);await p.waitForTimeout(450);}finally{clickedLabel=null;}clicks.push({label:n.label,targets:targets.slice(start)});}
  const observedAt=new Date().toISOString(),body=JSON.stringify({representation:'fnf_rendered_closed_shadow_publisher',sourceUrl:config.entryUrl,title,visibleAccessibility:visible,cards:selected.map(({backendNodeId,...x})=>x),nativeEntryClicks:clicks,dependencies,observedAt,availabilityMeasurement:false,credentialsSubmitted:false});
  captures.push({url:config.entryUrl,body,observedAt,kind:'unverified_entry_candidate',metadata:{title,anchors:targets.map(x=>({url:x.url,label:'Foo&Friends发布页正常可见卡片的原生跳转；目的地未访问'})),identityVerified:false}});
  return{captures,checkpoint:targets.length?null:{type:'publisher_entries_not_opened',url:config.entryUrl,reason:'未取得正常可用卡片的原生跳转；未解除禁用或模拟点击处理函数'},capabilities:{entryDiscovery:{status:'unverified_candidates_only'},login:{status:'not_attempted'}},ordersCreated:0,paymentExecuted:false};
 }catch(e){return{captures,checkpoint:{type:'fnf_public_publisher_unconfirmed',url:config.entryUrl,reason:String(e.message).slice(0,250)},ordersCreated:0,paymentExecuted:false};}finally{clearTimeout(timer);await ctx?.close();}
}
module.exports={configured,favicon,entry,cards,collect};
