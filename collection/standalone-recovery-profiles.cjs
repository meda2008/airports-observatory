'use strict';
// Retained-evidence configuration repairs. This module never visits a site,
// submits credentials, changes the database, or treats an adapter as verified.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const secretText=s=>/@|(?:vmess|vless|trojan|ss):\/\/|(?:token|password|secret)\s*[=:]/i.test(String(s));
function originOf(raw){try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password?u.origin:null;}catch{return null;}}
function navigationKey(raw){try{const u=new URL(raw);if(!u.hash.startsWith('#/'))u.hash='';u.pathname=u.pathname.replace(/\/+$/,'')||'/';return u.href;}catch{return raw;}}
function readOnlyBusinessUrl(raw,{origin,allowedHosts=[]}={}){try{const u=new URL(raw),route=u.pathname+u.search+u.hash;if(u.origin!==origin||!allowedHosts.includes(u.hostname)||u.username||u.password||[...u.searchParams.keys()].some(k=>/token|password|session|secret|email|auth/i.test(k))||/checkout|logout|cancel|delete|reset|register|subscribe|invoice|(?:^|[\/#?&=])(?:order|orders|pay|payment|billing)(?:$|[\/#?&=])/i.test(route))return false;return /(?:^|[\/#])(?:plans?|shop|product|personal-plan)(?:$|[\/?#])|\/user\/product(?:$|[\/?#])|\/cart\.php(?:$|\?gid=\d+$)/i.test(route);}catch{return false;}}
function reference(doc){return{file:doc.file,sha256:doc.sha256,url:doc.url,observedAt:doc.observedAt||null,representation:doc.representation||'retained_visible_page_metadata',...(doc.originalSource?{originalSource:doc.originalSource}:{})};}
function fieldSelector(field,fields){
 if(!field||typeof field.type!=='string')return null;
 const type=field.type.toLowerCase();if(!['email','text','password'].includes(type))return null;
 const quoted=value=>JSON.stringify(String(value));
 const base='input[type='+quoted(type)+']';
 if(typeof field.ariaLabel==='string'&&field.ariaLabel&&!secretText(field.ariaLabel)&&fields.filter(f=>f.ariaLabel===field.ariaLabel).length===1)return 'input[aria-label='+quoted(field.ariaLabel)+']';
 if(typeof field.name==='string'&&field.name&&!secretText(field.name)&&fields.filter(f=>f.type===field.type&&f.name===field.name).length===1)return base+'[name='+quoted(field.name)+']';
 if(typeof field.placeholder==='string'&&field.placeholder&&!secretText(field.placeholder)&&fields.filter(f=>f.type===field.type&&f.placeholder===field.placeholder).length===1)return base+'[placeholder='+quoted(field.placeholder)+']';
 return fields.filter(f=>f.type===field.type).length===1&&type!=='text'?base:null;
}
function authFromDocument(doc){
 const d=doc.document||doc,fields=d.formFields||[];if(!d.passwordForm||d.agreementCheckbox||/登录即.*同意|登录并同意|继续即表示同意|点击.*同意服务条款/.test(d.text||''))return null;
 if(d.verificationWidgetObserved||/请点击验证码|完成拼图|请验证您是真人|正在进行安全验证/.test(d.text||''))return null;
 const passwords=fields.filter(f=>f.type==='password'),emails=fields.filter(f=>f.type==='email'||f.type==='text'&&/邮箱|电子邮件地址|email|username/i.test([f.name,f.placeholder,f.ariaLabel].join(' ')));
 const buttons=[...new Set((d.buttons||[]).filter(b=>typeof b==='string'&&/^\s*(?:安全登录|立即登录|现在就登录|登\s*[录入陸陆](?:账户|账号|帳戶)?|login|sign in)\s*$/i.test(b)))];
 if(passwords.length!==1||emails.length!==1||buttons.length!==1)return null;
 const emailSelector=fieldSelector(emails[0],fields),passwordSelector=fieldSelector(passwords[0],fields);if(!emailSelector||!passwordSelector)return null;
 return{mode:'login',emailSelector,passwordSelector,submitSelector:'button:text-is('+JSON.stringify(buttons[0])+')'};
}
function planReadiness(doc){
 const d=doc.document||doc;
 if(Array.isArray(d.planCards)&&d.planCards[0]?.name&&!secretText(d.planCards[0].name))return{text:d.planCards[0].name,timeoutMs:15000};
 if(Array.isArray(d.headings)){const headings=d.headings.map(h=>typeof h==='string'?h:h.text||h.name).filter(h=>typeof h==='string'&&h.length>2&&h.length<120&&!secretText(h));const text=d.text||d.body||'';for(const h of headings){const at=text.indexOf(h);if(at>=0&&/[¥￥$]\s*\d|\d\s*(?:元|USD|CNY)/.test(text.slice(at,at+350))&&!/余额|balance|充值/i.test(h))return{text:h,timeoutMs:15000};}}
 return null;
}
function documentsFromJson(value,{file,sha256}={}){
 const out=[],seen=new Set();function walk(v,parent={},depth=0){if(!v||typeof v!=='object'||depth>7||seen.has(v))return;seen.add(v);if(Array.isArray(v)){for(const x of v.slice(0,150))walk(x,parent,depth+1);return;}
  const url=v.url||parent.url,observedAt=v.capturedAt||v.observedAt||parent.observedAt;
  if(url&&originOf(url)&&(Array.isArray(v.formFields)||Array.isArray(v.readLinks)||Array.isArray(v.links)||Array.isArray(v.planCards)||Array.isArray(v.headings))){out.push({file,sha256,url,observedAt,representation:v.representation,document:v});}
  for(const [key,x]of Object.entries(v))if(!['text','body','password','email','credentials','accounts','patch','before','after'].includes(key))walk(x,{url,observedAt},depth+1);
 }walk(value);return out;
}
function loadRetainedDocuments({root,origins}={}){
 const work=path.join(root,'work'),result=spawnSync('rg',['--files','--glob','*.json','--glob','!**/data/**','--glob','!**/_private/**','--glob','!**/backups/**','--glob','!**/ocr-venv/**',work],{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024,timeout:30000});
 if(result.error)throw Error('retained_metadata_inventory_failed: '+result.error.code);
 const hosts=[...origins].map(o=>new URL(o).hostname),out=[];
 for(const file of result.stdout.split(/\r?\n/).filter(file=>/login|auth|plans?|shop|route|entry|readiness|view-\d|capture-\d/i.test(path.basename(file)))){try{const stat=fs.statSync(file);if(stat.size>600000)continue;const bytes=fs.readFileSync(file),text=bytes.toString('utf8');if(!hosts.some(h=>text.includes(h))||!/["'](?:formFields|readLinks|planCards|headings|links)["']/.test(text))continue;const relative=path.relative(root,file).split(path.sep).join('/');for(const doc of documentsFromJson(JSON.parse(text.replace(/^\uFEFF/,'')),{file:relative,sha256:digest(bytes)}))if(origins.has(originOf(doc.url))){const d=doc.document,original=typeof d.file==='string'?path.resolve(d.file):null,catalogRoot=path.resolve(root,'catalog/refresh')+path.sep;if(original&&original.startsWith(catalogRoot)&&/\.json$/i.test(original)&&/^[a-f0-9]{64}$/.test(d.originalSha256||'')){const originalBytes=fs.readFileSync(original);if(digest(originalBytes)===d.originalSha256)doc.originalSource={file:path.relative(root,original).split(path.sep).join('/'),sha256:d.originalSha256,hashVerified:true,recaptured:false};}out.push(doc);}}catch{}}
 return out;
}
function loadCredentialOrigins({root,credentialsFile=process.env.CREDENTIALS_FILE||'/run/secrets/website-credentials.json'}={}){
 const counts={};try{const raw=JSON.parse(fs.readFileSync(credentialsFile,'utf8'));for(const a of Array.isArray(raw)?raw:raw.accounts||[]){const origin=originOf(a.url||a.origin);if(!origin||typeof a.email!=='string'||!a.email||typeof a.password!=='string'||!a.password)continue;const rejected=/错误|失败|拒绝|invalid|incorrect|rejected/i.test(a.pw_status||'');const c=counts[origin]||{matchingAccounts:0,usableAccounts:0};c.matchingAccounts++;if(!rejected)c.usableAccounts++;counts[origin]=c;}}catch{}
 return counts;
}
function buildRecoveryProfiles({profiles=[],checkpoints=[],documents,credentialOrigins,credentialsFile,root=path.resolve(__dirname,'..')}={}){
 const relevant=profiles.filter(p=>checkpoints.some(c=>c.siteId===(p.siteId||p.recordId||p.config?.recordId)&&c.status==='open'));
 const origins=new Set(relevant.map(p=>originOf((p.config||p).entryUrl)).filter(Boolean));documents??=loadRetainedDocuments({root,origins});credentialOrigins??=loadCredentialOrigins({root,credentialsFile});
 return relevant.map(p=>{const config=p.config||p,siteId=p.siteId||p.recordId||config.recordId,origin=originOf(config.entryUrl),cp=checkpoints.find(c=>c.siteId===siteId&&c.status==='open'),allowed=config.allowedHosts||[],own=documents.filter(d=>originOf(d.url)===origin).sort((a,b)=>Date.parse(b.observedAt||0)-Date.parse(a.observedAt||0)),patch={},refs=[],actions=[],blockedBy=[],credential=credentialOrigins[origin]||{matchingAccounts:0,usableAccounts:0};
  const result={siteId,profileRevision:p.revision||null,checkpointId:cp.id||cp.checkpointId,type:cp.type,configPatch:patch,reason:'',evidenceRefs:refs,safeToApply:false,credentialStatus:{matchingAccounts:credential.matchingAccounts,usableAccounts:credential.usableAccounts,valuesReadIntoReport:false},runtimeMustRevalidateSelectors:true,blockingConditions:blockedBy,actions};
  if(!origin||!allowed.includes(new URL(origin).hostname)){result.reason='entry_identity_or_allowed_host_missing';return result;}
  if(['terms_confirmation_required','cloudflare','image_captcha','captcha_input','interactive_captcha','access_gate'].includes(cp.type)){result.reason='current_interaction_or_agreement_checkpoint_preserved';blockedBy.push(cp.type);actions.push('继续其他站点；仅在本次验证/协议实际完成后显式恢复');return result;}
  if(cp.type==='entry_origin_changed'){result.reason='new_destination_identity_not_verified';blockedBy.push(cp.type);actions.push('核对原始发布链及新域归属；不向新域传播凭据');return result;}
  const loginDoc=own.find(d=>authFromDocument(d));const auth=loginDoc&&authFromDocument(loginDoc);
  if(auth&&!config.publicOnly){if(config.auth?.mode!=='login'||['emailSelector','passwordSelector','submitSelector'].some(k=>config.auth?.[k]!==auth[k])){patch.auth=auth;refs.push(reference(loginDoc));actions.push('从本站留存可见表单元数据恢复精确登录选择器；运行时必须唯一可见');}if(credential.matchingAccounts!==1||credential.usableAccounts!==1)blockedBy.push(credential.matchingAccounts>1?'ambiguous_same_origin_credentials':credential.matchingAccounts===1?'retained_credential_explicitly_rejected':'same_origin_credential_missing');}
  const routes=[];for(const doc of own){const d=doc.document||doc;if(readOnlyBusinessUrl(doc.url,{origin,allowedHosts:allowed})&&planReadiness(doc))routes.push({url:doc.url,doc,readiness:planReadiness(doc),direct:true});for(const link of [...d.links||[],...d.readLinks||[]])if(link?.url&&/套餐|订阅|商店|定价|price|plans|shop/i.test(link.label||link.text||'')&&readOnlyBusinessUrl(link.url,{origin,allowedHosts:allowed}))routes.push({url:link.url,doc,readiness:null,direct:false});}
  const target=routes.find(r=>r.readiness)||routes[0];
  if(target&&navigationKey(target.url)!==navigationKey(config.entryUrl)){patch.entryUrl=target.url;refs.push(reference(target.doc));actions.push('只进入本站曾真实观察到的只读套餐路由，不构造新URL');}
  if(target?.readiness&&JSON.stringify(config.readiness)!==JSON.stringify(target.readiness)){patch.readiness=target.readiness;refs.push(reference(target.doc));actions.push('等待本站留存套餐标题而非把空白壳当成功');}
  if(!auth&&['login_required','content_loading','content_loading_or_layout_changed','credential_not_configured'].includes(cp.type)&&!config.auth?.emailSelector){blockedBy.push('same_origin_visible_form_metadata_unavailable');}
  if(/browser_access_failed|navigation_timeout/.test(cp.type)){const reason=String(cp.reason||'');const classification=/ERR_CERT|certificate|证书/i.test(reason)?'tls_security_interstitial_no_bypass':/NAME_NOT_RESOLVED|DNS|ENOTFOUND/i.test(reason)?'dns_resolution_or_retired_entry_requires_primary_link':/timeout|timed out|超时/i.test(reason)?'bounded_navigation_and_content_settle_required':'browser_transport_failure_requires_fresh_transport_receipt';actions.push(classification);}
  result.evidenceRefs=[...new Map(refs.map(r=>[r.file+'|'+r.url,r])).values()];
  const hasPatch=Object.keys(patch).length>0,authChange=!!patch.auth,routeOnly=hasPatch&&!authChange;
  result.safeToApply=hasPatch&&(routeOnly||credential.matchingAccounts===1&&credential.usableAccounts===1);
  result.reason=result.safeToApply?'retained_same_origin_adapter_repair_ready_for_runtime_revalidation':hasPatch?'adapter_evidence_found_but_credentials_need_resolution':'no_safe_configuration_delta_from_retained_material';
  if(!hasPatch)actions.push('执行端可修复加载等待；新入口必须另有原始链接，不重复旧站猜测');
  return result;
 });
}
function readRecoveryInputs({root=path.resolve(__dirname,'..')}={}){const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(path.join(root,'deploy-service/data/collector.sqlite'),{readOnly:true});try{return{profiles:db.prepare('SELECT site_id,config_json,revision FROM collector_profiles').all().map(r=>({siteId:r.site_id,revision:r.revision,config:JSON.parse(r.config_json)})),checkpoints:db.prepare("SELECT * FROM collector_checkpoints WHERE status='open' ORDER BY rowid DESC").all().map(r=>({id:r.id,siteId:r.site_id,status:r.status,...JSON.parse(r.material_json)}))};}finally{db.close();}}
function exportRecoveryPlan({root=path.resolve(__dirname,'..'),output=path.join(root,'work/standalone-20261110/breakpoint-repair-plan.json')}={}){const rows=buildRecoveryProfiles({...readRecoveryInputs({root}),root}),count=key=>rows.reduce((a,r)=>{const value=key(r);a[value]=(a[value]||0)+1;return a;},{}),report={schemaVersion:'airports-standalone-recovery-plan.v1',generatedAt:new Date().toISOString(),networkAccessed:false,databaseModified:false,credentialsExported:false,counts:{openCheckpointSites:rows.length,safeConfigurationRepairs:rows.filter(r=>r.safeToApply).length,authRepairs:rows.filter(r=>r.safeToApply&&r.configPatch.auth).length,entryRepairs:rows.filter(r=>r.safeToApply&&r.configPatch.entryUrl).length,readinessRepairs:rows.filter(r=>r.safeToApply&&r.configPatch.readiness).length},checkpointTypes:count(r=>r.type),reasons:count(r=>r.reason),rows,retainedInventoryScope:{root:'work',filenamePattern:'login|auth|plans?|shop|route|entry|readiness|view-N|capture-N',maxFileBytes:600000,excludedDirectories:['data','_private','backups','ocr-venv'],completeHistoricalInventory:false,normalizedBacklinks:'catalog/refresh original SHA256 verified when present'},inventoryAttemptHistory:[{method:'broad JSON content scan',status:'ETIMEDOUT',timeoutMs:30000},{method:'filename inventory plus bounded JSON parse',status:'completed'}]};fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));return report;}
if(require.main===module){const report=exportRecoveryPlan();console.log(JSON.stringify({counts:report.counts,reasons:report.reasons},null,2));}
module.exports={buildRecoveryProfiles,readRecoveryInputs,exportRecoveryPlan,loadRetainedDocuments,loadCredentialOrigins,authFromDocument,readOnlyBusinessUrl,documentsFromJson};
