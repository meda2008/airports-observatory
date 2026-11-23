'use strict';
// Discovery of publisher image references only. An annotation is not the image's
// actual test date; every new image still requires a separate visual review.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const ORIGIN='https://www.duyaoss.com',configPath=path.join(__dirname,'duyao-image-profiles.json');
const hash=s=>createHash('sha256').update(s).digest('hex');
const ASSOCIATION='visible_heading_siblings_until_next_same_or_higher_heading';
const MAIN=ORIGIN+'/archives/3/',MAIN_HEADINGS={A017:'46.MESL（国内中转）',A027:'36.Foo&Friends（台湾中转/直连）'};
function validDate(y,m,d){const n=[y,m,d].map(Number),v=new Date(Date.UTC(n[0],n[1]-1,n[2]));return n[0]>=1900&&n[0]<=2099&&v.getUTCFullYear()===n[0]&&v.getUTCMonth()+1===n[1]&&v.getUTCDate()===n[2];}
function articleUrl(value){if(typeof value!=='string'||value.length>180)return null;try{const u=new URL(value);return u.origin===ORIGIN&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&/^\/archives\/[1-9]\d*\/$/.test(u.pathname)&&u.href===value?u.href:null;}catch{return null;}}
function canonicalMediaUrl(value){
 if(typeof value!=='string'||value.length>512||/[\s\x00-\x1f\x7f]/.test(value))return null;
 try{const u=new URL(value);if(u.origin!==ORIGIN||u.username||u.password||u.port||u.search||u.href!==value)return null;
  const m=/^\/uploaded\/(?:([0-9]{8})_([a-f0-9]{8,64})|([a-f0-9]{8,64}))\.(jpg|png|webp)$/.exec(u.pathname);if(!m)return null;
  if(m[1]&&!validDate(m[1].slice(0,4),m[1].slice(4,6),m[1].slice(6,8)))return null;
  if(m[3]&&/^(?:19|20)\d{6}$/.test(m[3])&&!validDate(m[3].slice(0,4),m[3].slice(4,6),m[3].slice(6,8)))return null;
  if(u.hash){const pairs=[...new URLSearchParams(u.hash.slice(1))];if(!pairs.length||pairs.length>2||new Set(pairs.map(p=>p[0])).size!==pairs.length||pairs.some(([k,v])=>!['vwid','vhei'].includes(k)||!(/^[1-9]\d{0,4}$/).test(v)||Number(v)>50000))return null;}
  u.hash='';return u.href;
 }catch{return null;}
}
function headingClaim(value){
 if(typeof value!=='string'||value.length>120||value!==value.trim())return null;
 const m=/^(?:（(.*?)）|\((.*?)\)|(.*))$/.exec(value),text=m?.[1]??m?.[2]??m?.[3];
 const d=/^(联通|电信|移动)\s+(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})\s*(早|午|晚|凌晨|上午|下午|晚间|夜间)?测速$/.exec(text||'');
 if(!d||!validDate(d[2],d[3],d[4]))return null;
 return {network:d[1],claimedTestDate:d[2]+'-'+d[3].padStart(2,'0')+'-'+d[4].padStart(2,'0'),claimedTimeWindow:d[5]||null};
}
function normalizeProfiles(value){
 const rows=Array.isArray(value)?value:value?.profiles;
 const valid=(Array.isArray(rows)?rows:[]).slice(0,300).flatMap(p=>{if(!/^A\d{3}$/.test(p?.recordId||'')||!articleUrl(p.articleUrl)||!Array.isArray(p.aliases)||!p.aliases.length||p.aliases.length>8||!p.aliases.every(a=>typeof a==='string'&&a.trim()===a&&a.length>0&&a.length<=80&&!/[\r\n]/.test(a)))return[];if(p.articleUrl===MAIN&&(!MAIN_HEADINGS[p.recordId]||p.brandSectionHeading!==MAIN_HEADINGS[p.recordId])||p.articleUrl!==MAIN&&p.brandSectionHeading!==undefined)return[];return[{recordId:p.recordId,articleUrl:p.articleUrl,aliases:[...p.aliases],...(p.brandSectionHeading?{brandSectionHeading:p.brandSectionHeading}:{})}];});
 return valid.filter(p=>valid.filter(v=>v.recordId===p.recordId&&v.articleUrl===p.articleUrl).length===1);
}
function loadProfiles(){try{return normalizeProfiles(JSON.parse(fs.readFileSync(configPath,'utf8')));}catch{return[];}}
function fullCaptureTime(value){const m=/^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,3})?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(value||'');return!!m&&validDate(m[1],m[2],m[3])&&(!m[7]||(Number(m[8])<14&&Number(m[9])<60||Number(m[8])===14&&Number(m[9])===0))&&Number.isFinite(Date.parse(value));}
function knownImages(prior){const speed=(prior?.coreInfo||prior||{}).speed||{},urls=new Set();for(const r of [...(Array.isArray(speed.imageCandidates)?speed.imageCandidates:[]),...(Array.isArray(speed.imageReports)?speed.imageReports:[])])for(const v of [r?.imageUrl,r?.nativeImageUrl,r?.sourceImageUrl,r?.sourceUrl,...(Array.isArray(r?.imageUrls)?r.imageUrls:[])]){const u=canonicalMediaUrl(v);if(u)urls.add(u);}return urls;}
function selectFair(items,limit=12){const ordered=[...items].sort((a,b)=>b.claimedTestDate.localeCompare(a.claimedTestDate)||a.order-b.order),picked=[];for(const network of ['联通','电信','移动']){const row=ordered.find(r=>r.publisherClaimedNetwork===network);if(row)picked.push(row);}for(const row of ordered)if(picked.length<limit&&!picked.includes(row))picked.push(row);return picked.slice(0,limit);}
function range(body,q){const start=body.indexOf(q);return{kind:'body_utf16_range',start,end:start+q.length,quoteSha256:hash(q)};}
function scopedMainImages({p,o,body,observedAt,sections,pathPrefix,inventory,inventoryPrefix,prior}){
 const rejected=[],fail=reason=>({accepted:false,reasons:[reason],rejected,facts:[],knownImageCount:0}),matches=sections.map((s,index)=>({s,index})).filter(({s})=>s?.heading===p.brandSectionHeading);
 if(sections.length>2||matches.length!==1)return fail('unique_configured_brand_section_required');
 const {s,index}=matches[0],text=s.sectionText;if(s.headingLevel!==2||s.association!==ASSOCIATION||typeof text!=='string'||text.length>50000||!(text.startsWith(s.heading+'\n')||text.startsWith(s.heading+'\r\n'))||!body.includes(text)||body.indexOf(text)!==body.lastIndexOf(text))return fail('literal_bounded_brand_section_required');
 const scopeStart=body.indexOf(text),scopeEnd=scopeStart+text.length,nextAt=typeof s.nextHeading==='string'?body.indexOf(s.nextHeading,scopeEnd):-1;
 if(![1,2].includes(s.nextHeadingLevel)||typeof s.nextHeading!=='string'||!s.nextHeading||s.nextHeading.length>160||/[\r\n]/.test(s.nextHeading)||nextAt<0||body.slice(scopeEnd,nextAt).trim())return fail('brand_scope_next_same_or_higher_heading_required');
 const otherHeads=text.split(/\r?\n/).filter(line=>/^\d+\.[^\n]+$/.test(line));if(otherHeads.some(line=>line!==s.heading))return fail('brand_section_crosses_another_brand_heading');
 const dateLines=text.split(/\r?\n/).filter(line=>/^[（(].*测速[）)]$/.test(line));if(dateLines.length!==1)return fail('unique_brand_section_calendar_speed_label_required');
 const quote=dateLines[0],m=/^[（(](?:(联通|电信|移动)\s+)?(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})\s*(早|午|晚|凌晨|上午|下午|晚间|夜间)?测速[）)]$/.exec(quote);if(!m||!validDate(m[2],m[3],m[4]))return fail('brand_section_full_calendar_date_required');
 const claimedTestDate=m[2]+'-'+m[3].padStart(2,'0')+'-'+m[4].padStart(2,'0');if(Date.parse(claimedTestDate+'T00:00:00Z')>Date.parse(observedAt)+86400000)return fail('heading_claim_date_after_capture_day_bound');
 if(!Array.isArray(s.links)||!s.links.length||s.links.length>3)return fail('bounded_same_brand_native_image_links_required');
 const known=knownImages(prior),images=[],seen=new Set(),binding=hash(JSON.stringify({sections,links:inventory}));let qualified=0;
 const locate=q=>{const at=body.indexOf(q,scopeStart);return{kind:'body_utf16_range',start:at,end:at+q.length,quoteSha256:hash(q)};};
 for(const [linkIndex,link]of s.links.entries()){
  const native=link?.url||link?.href,canonical=canonicalMediaUrl(native);if(!canonical||link.sourceAttribute!=='href'){rejected.push({nativeImageUrl:native||null,reason:'same_publisher_native_scoped_image_href_required'});continue;}
  if(sections.some(other=>other!==s&&Array.isArray(other?.links)&&other.links.some(v=>canonicalMediaUrl(v.url||v.href)===canonical))){rejected.push({nativeImageUrl:native,reason:'same_image_associated_with_other_brand'});continue;}
  if(seen.has(canonical))continue;seen.add(canonical);qualified++;if(known.has(canonical))continue;
  const inventoryIndex=inventory.findIndex(v=>(v.url||v.href)===native);
  images.push({kind:'unreviewed_publisher_speed_image',id:'duyaoss-image-'+p.recordId+'-'+hash(canonical).slice(0,20),status:'requires_visual_review',quote,claimedTestDate,publisherClaimedNetwork:m[1]||null,claimedTimeWindow:m[5]||null,nativeImageUrl:native,imageUrl:canonical,publisher:'DuyaoSS（www.duyaoss.com，第三方图片引用）',sourceUrl:p.articleUrl,sourceIds:[o.evidenceId],observedAt,bodySha256:hash(body),independentMeasurement:false,requiresVisualReview:true,canonicalSourceGroup:'duyaoss:'+new URL(p.articleUrl).pathname,sourceLocator:{kind:'body_scoped_brand_section_media_binding',bodySha256:hash(body),heading:locate(quote),brandHeading:locate(s.heading),sectionText:{kind:'body_utf16_range',start:scopeStart,end:scopeStart+text.length,quoteSha256:hash(text)},associationMetadataSha256:binding,brandSectionsPath:pathPrefix+'['+index+']',nativeImageUrlPath:pathPrefix+'['+index+'].links['+linkIndex+'].'+(link.url?'url':'href'),nativeLinkInventoryPath:inventoryIndex<0?null:inventoryPrefix+'['+inventoryIndex+'].'+(inventory[inventoryIndex]?.url?'url':'href'),domAssociation:ASSOCIATION},limitations:['这是多品牌主贴中明确同品牌H2范围内的新图片候选；没有自动核对图内数值、单位、网络或测试时间。','claimedTestDate和时段仅来自该品牌范围的页面日期标签；上传文件名可能晚于真实测试，不当作testedAt或历史成立时间。','缺少网络标签时publisherClaimedNetwork保持null；节点线路架构不是探针网络。','不得自动OCR或生成imageReports、当前速度、分位数、稳定率、成立日期及排名。']});
 }
 return{accepted:qualified>0,reasons:qualified?[]:['no_qualified_native_image_references'],rejected,facts:images,knownImageCount:qualified-images.length,qualifiedImageCount:qualified};
}
function createParser(config){
 const profiles=normalizeProfiles(config);
 function match(url,recordId){const canonical=articleUrl(url);return canonical?profiles.find(p=>p.recordId===recordId&&p.articleUrl===canonical)||null:null;}
 function forOrigin(url,{recordId}={}){const p=match(url,recordId);return p?{origin:ORIGIN,articleUrl:p.articleUrl,recordIds:[recordId],aliases:[...p.aliases],fields:['speed'],parserKind:p.brandSectionHeading?'configured_duyaoss_scoped_main_image_reference_v1':'configured_duyaoss_unreviewed_image_reference_v1',extract}:null;}
 function sourceTargets(recordId,prior={}){
  const speed=(prior.coreInfo||prior).speed||{},items=[...(Array.isArray(speed.imageCandidates)?speed.imageCandidates:[]),...(Array.isArray(speed.imageReports)?speed.imageReports:[])];
  return profiles.filter(p=>p.recordId===recordId).map(p=>{const times=items.filter(i=>i?.sourceUrl===p.articleUrl).map(i=>Date.parse(i.observedAt)).filter(Number.isFinite);return{url:p.articleUrl,fields:['speed'],sourceType:'third_party_speed_image_reference',purpose:'weekly_same_article_new_image_discovery',refreshIntervalDays:7,lastObservedAt:times.length?new Date(Math.max(...times)).toISOString():null};}).sort((a,b)=>(Date.parse(a.lastObservedAt)||0)-(Date.parse(b.lastObservedAt)||0));
 }
 function diagnose(o,{recordId,prior={}}={}){
  const p=match(o?.url,recordId),body=typeof o?.body==='string'?o.body:typeof o?.text==='string'?o.text:'',observedAt=o?.observedAt||o?.capturedAt,reasons=[];
  if(!p)reasons.push('record_or_canonical_publisher_article_not_configured');
  if(!body||body.length>4_000_000)reasons.push('original_visible_body_required');
  if(typeof o?.evidenceId!=='string'||!o.evidenceId.trim())reasons.push('current_article_capture_evidence_id_required');
  if(typeof observedAt!=='string'||!fullCaptureTime(observedAt))reasons.push('original_capture_datetime_required');
  if((o?.bodySha256&&o.bodySha256!==hash(body))||(o?.sha256&&o.sha256!==hash(body)))reasons.push('capture_body_hash_mismatch');
  if(o?.passwordForm||o?.metadata?.passwordForm||o?.verificationWidgetObserved||o?.metadata?.verificationWidgetObserved||/checkpoint$/.test(o?.kind||''))reasons.push('authentication_or_verification_checkpoint');
  const lines=body.split(/\r?\n/),brandLine=p&&lines.find(line=>p.brandSectionHeading?line===p.brandSectionHeading:p.aliases.some(alias=>{const escaped=alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp('^(?:机场测速观察[-—–]{1,4}|\\d+[.、])\\s*'+escaped+'(?:[（(\\s]|$)','i').test(line);}));
  if(!brandLine)reasons.push('explicit_same_brand_article_heading_required');
  let sections,pathPrefix;
  if(p?.brandSectionHeading){if(Array.isArray(o?.metadata?.duyaoBrandSections)){sections=o.metadata.duyaoBrandSections;pathPrefix='metadata.duyaoBrandSections';}else if(Array.isArray(o?.duyaoBrandSections)){sections=o.duyaoBrandSections;pathPrefix='duyaoBrandSections';}}
  else if(Array.isArray(o?.metadata?.headingMedia)){sections=o.metadata.headingMedia;pathPrefix='metadata.headingMedia';}
  else if(Array.isArray(o?.headingMedia)){sections=o.headingMedia;pathPrefix='headingMedia';}
  else if(Array.isArray(o?.imageSections)){sections=o.imageSections;pathPrefix='imageSections';}
  else if(Array.isArray(o?.metadata?.imageSections)){sections=o.metadata.imageSections;pathPrefix='metadata.imageSections';}
  if(!sections||!sections.length)reasons.push('explicit_heading_native_media_association_required');
  const inventory=Array.isArray(o?.links)?o.links:Array.isArray(o?.metadata?.links)?o.metadata.links:[],inventoryPrefix=Array.isArray(o?.links)?'links':'metadata.links';
  if(sections?.length>180||inventory.length>500)reasons.push('capture_media_metadata_exceeds_bound');
  if(reasons.length)return{accepted:false,reasons,rejected:[],facts:[],knownImageCount:0};
  if(p.brandSectionHeading)return scopedMainImages({p,o,body,observedAt,sections,pathPrefix,inventory,inventoryPrefix,prior});
  const candidates=[],rejected=[],bindingSha256=hash(JSON.stringify({sections,links:inventory})),known=knownImages(prior),seen=new Map();
  for(const [sectionIndex,section] of sections.slice(0,180).entries()){
   const reject=(reason,nativeImageUrl=null)=>rejected.push({heading:typeof section?.heading==='string'?section.heading.slice(0,120):null,nativeImageUrl,reason});
   const claim=headingClaim(section?.heading);if(!claim){reject('full_calendar_date_network_and_speed_heading_required');continue;}
   if(Date.parse(claim.claimedTestDate+'T00:00:00Z')>Date.parse(observedAt)+86400000){reject('heading_claim_date_after_capture_day_bound');continue;}
   if(!body.includes(section.heading)){reject('heading_not_literal_in_captured_body');continue;}
   if(!Array.isArray(section.links)||!section.links.length){reject('same_heading_native_media_links_required');continue;}
   for(const [linkIndex,link] of section.links.slice(0,6).entries()){
    const native=link?.url||link?.href,canonical=canonicalMediaUrl(native);if(!canonical){reject('same_publisher_uploaded_image_url_required');continue;}
    const inventoryIndex=inventory.findIndex(l=>(l?.url||l?.href)===native);
    const domBound=section.association===ASSOCIATION&&['href','src','data-src','data-original'].includes(link.sourceAttribute);
    if(inventoryIndex<0&&!domBound){reject('native_link_not_in_same_capture_inventory',native);continue;}
    const association={heading:section.heading,claimedTestDate:claim.claimedTestDate,network:claim.network};
    if(seen.has(canonical)){if(JSON.stringify(seen.get(canonical))!==JSON.stringify(association))reject('same_image_conflicting_heading_associations',native);continue;}
    seen.set(canonical,association);
    candidates.push({kind:'unreviewed_publisher_speed_image',id:'duyaoss-image-'+recordId+'-'+hash(canonical).slice(0,20),status:'requires_visual_review',quote:section.heading,claimedTestDate:claim.claimedTestDate,publisherClaimedNetwork:claim.network,claimedTimeWindow:claim.claimedTimeWindow,nativeImageUrl:native,imageUrl:canonical,publisher:'DuyaoSS（www.duyaoss.com，第三方图片引用）',sourceUrl:p.articleUrl,sourceIds:[o.evidenceId],observedAt,bodySha256:hash(body),independentMeasurement:false,requiresVisualReview:true,canonicalSourceGroup:'duyaoss:'+new URL(p.articleUrl).pathname,sourceLocator:{kind:'body_heading_and_capture_metadata_binding',bodySha256:hash(body),heading:range(body,section.heading),brandHeading:range(body,brandLine),associationMetadataSha256:bindingSha256,headingMediaPath:pathPrefix+'['+sectionIndex+']',nativeImageUrlPath:pathPrefix+'['+sectionIndex+'].links['+linkIndex+'].'+(link?.url?'url':'href'),nativeLinkInventoryPath:inventoryIndex<0?null:inventoryPrefix+'['+inventoryIndex+'].'+(inventory[inventoryIndex]?.url?'url':'href'),domAssociation:domBound?ASSOCIATION:null},limitations:['这是同名评测页新发现的图片候选，尚未检查图像内容、单位、节点、网络和实际测试日期。','claimedTestDate和时段只来自页面标题，不是图片页脚或真实测试日期；可能跨日或与图中时间矛盾，必须人工目视复核。','不得自动OCR或生成imageReports、当前速度、分位数、稳定率、成立日期及排名。'],order:candidates.length});
   }
  }
  const conflicts=new Set(rejected.filter(r=>r.reason==='same_image_conflicting_heading_associations').map(r=>canonicalMediaUrl(r.nativeImageUrl)));
  const qualified=candidates.filter(c=>!conflicts.has(c.imageUrl)),fresh=qualified.filter(c=>!known.has(c.imageUrl));
  const facts=selectFair(fresh).map(({order,...fact})=>fact);
  return{accepted:qualified.length>0,reasons:qualified.length?[]:['no_qualified_native_image_references'],rejected,facts,knownImageCount:qualified.length-fresh.length,qualifiedImageCount:qualified.length};
 }
 function discover(o,options){const {facts,...d}=diagnose(o,options);return{...d,images:facts};}
 function extract(o,{recordId,prior={}}={}){const d=diagnose(o,{recordId,prior});if(!d.accepted||!d.facts.length)return null;const old=(prior.coreInfo||prior).speed||{},items=Array.isArray(old.imageCandidates)?old.imageCandidates:[],reports=Array.isArray(old.imageReports)?old.imageReports:[];return{speed:{...old,sourceIds:[...new Set([...(Array.isArray(old.sourceIds)?old.sourceIds:[]),...[...items,...reports].flatMap(i=>Array.isArray(i.sourceIds)?i.sourceIds:[]),o.evidenceId])],imageCandidates:[...items,...d.facts]}};}
 return{profiles,forOrigin,sourceTargets,discover,diagnose,extract};
}
const exported={createParser,loadProfiles,canonicalMediaUrl,forOrigin:(...a)=>createParser(loadProfiles()).forOrigin(...a),sourceTargets:(...a)=>createParser(loadProfiles()).sourceTargets(...a),discover:(...a)=>createParser(loadProfiles()).discover(...a),diagnose:(...a)=>createParser(loadProfiles()).diagnose(...a),extract:(...a)=>createParser(loadProfiles()).extract(...a)};
Object.defineProperty(exported,'profiles',{enumerable:true,get:loadProfiles});
module.exports=exported;
