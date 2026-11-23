'use strict';
// One explicit identity contract per catalog record. These publisher-reported
// regional means are historical detail, never the independent speed/rank input.
const {createHash}=require('node:crypto');
const hash=s=>createHash('sha256').update(s).digest('hex');
const profiles=Object.freeze([
  ['A028','erwan-cloud',['尔湾云']],['A084','jifeng-cloud',['疾风云']],
  ['A049','yangfan-cloud',['扬帆云']],
  ['A151','xingdaomeng',['星岛梦']],['A153','feimao-cloud',['飞猫云']],
  ['A155','weifeng-network',['微风网络']],['A156','lingmao',['灵猫']],
  ['A157','wuyou-link',['无忧链接']],['A160','shanyue',['闪跃']],
  ['A162','kuajie-cloud',['跨界云']],['A163','firefly',['Firefly']],
  ['A179','u1s1',['U1S1']],['A199','erwan-cloud',['尔湾云']],
].map(([recordId,slug,aliases])=>Object.freeze({recordId,slug,aliases:Object.freeze(aliases),origin:'https://jichangnote.com',fields:Object.freeze(['speed'])})));
const HEADER='地区\t测试节点数\t有效节点数\t延迟类型\t平均延迟\t平均下载速度\t原始平均速度\t';
function profileFor(url,recordId){let u;try{u=new URL(url);}catch{return null;}if(u.origin!=='https://jichangnote.com'||u.username||u.password||u.search)return null;return profiles.find(p=>p.recordId===recordId&&u.pathname===`/reviews/${p.slug}/`)||null;}
function forOrigin(url,{recordId}={}){const p=profileFor(url,recordId);return p?{origin:p.origin,recordIds:[p.recordId],slug:p.slug,aliases:[...p.aliases],fields:['speed'],parserKind:'explicit_jichangnote_regional_mean_v1',extract}:null;}
function cutSection(text,startMarker,endMarker){const start=text.indexOf(startMarker);if(start<0||text.indexOf(startMarker,start+1)>=0)return null;const end=text.indexOf(endMarker,start+startMarker.length);return{body:text.slice(start,end<0?text.length:end),offset:start};}
function decode(body){
  // The transport is preserved and hashed; only explicit text/sections fields
  // are decoded, with their transformation chain retained in every locator.
  if(!body.trimStart().startsWith('{'))return{kind:'dom',title:body.slice(0,1000),text:body,chain:[],selectedField:null};
  let value;try{value=JSON.parse(body);}catch{return null;}
  const chain=['JSON.parse(body)'];
  for(let i=0;i<3&&value&&!value.sections&&typeof value.text==='string'&&value.text.trimStart().startsWith('{');i++){
    try{value=JSON.parse(value.text);chain.push('JSON.parse(previous.text)');}catch{return null;}
  }
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  if(value.sections&&typeof value.sections['s7-environment']==='string'&&typeof value.sections['s8-speed']==='string'&&typeof value.title==='string')return{kind:'sections',title:value.title,env:value.sections['s7-environment'],speed:value.sections['s8-speed'],chain,embeddedUrl:value.url};
  if(typeof value.text==='string'&&!value.text.trimStart().startsWith('{'))return{kind:'structured_text',title:value.text.split('\n')[0],text:value.text,chain,selectedField:'text',embeddedUrl:value.url};
  return null;
}
function range(body,quote){const start=body.indexOf(quote);return{start,end:start+quote.length,quoteSha256:hash(quote),quote};}
function derivedLocator(decoded,raw,field,body,quote,offset=0){
  if(decoded.kind==='dom')return{kind:'body_utf16_range',...range(raw,quote)};
  const selectedField=decoded.kind==='sections'?(field==='title'?'title':`sections["${field}"]`):'text';
  const selectedBody=decoded.kind==='sections'?body:decoded.text;
  const local=range(body,quote);return{kind:'derived_field_utf16_range',derivationChain:[...decoded.chain],selectedField,derivedBodySha256:hash(selectedBody),start:local.start+offset,end:local.end+offset,quoteSha256:local.quoteSha256,quote};
}
function singleLine(body,label){const rows=body.split(/\r?\n/).filter(l=>l.startsWith(label+'\t'));return rows.length===1?rows[0]:null;}
function diagnose(o,{recordId}={}){
  const reasons=[],p=profileFor(o?.url,recordId),body=typeof o?.body==='string'?o.body:typeof o?.text==='string'?o.text:'',observedAt=o?.observedAt||o?.capturedAt;
  if(!p)reasons.push('publisher_route_or_record_identity_not_allowlisted');
  if(!body||body.length>4_000_000)reasons.push('capture_body_missing_or_too_large');
  if(typeof o?.evidenceId!=='string'||!o.evidenceId.trim())reasons.push('current_capture_evidence_id_required');
  if(typeof observedAt!=='string'||!Number.isFinite(Date.parse(observedAt)))reasons.push('original_observed_at_required');
  if((o?.bodySha256&&o.bodySha256!==hash(body))||(o?.sha256&&o.sha256!==hash(body)))reasons.push('original_capture_body_hash_mismatch');
  if(o?.passwordForm||o?.verificationWidgetObserved||/verification_checkpoint|auth_checkpoint/.test(o?.kind||''))reasons.push('authentication_or_verification_checkpoint');
  const d=decode(body);
  if(!d)return{accepted:false,reasons:[...reasons,'explicit_capture_structure_required'],recordId,url:o?.url||null};
  if(d.embeddedUrl&&profileFor(d.embeddedUrl,recordId)!==p)reasons.push('embedded_publisher_url_conflict');
  const title=d.title||'';
  const brand=p?.aliases.find(a=>title.startsWith(a+'机场怎么样？')||title.startsWith('原页标题：'+a+'机场怎么样？')||(d.kind==='dom'&&title.split(/\r?\n/).some(l=>l===a+'机场测评')));
  if(!brand)reasons.push('publisher_heading_brand_mismatch');
  const envSection=d.kind==='sections'?{body:d.env,offset:0}:cutSection(d.text,'ENVIRONMENT\n7.','SPEED & LATENCY\n8.');
  const speedSection=d.kind==='sections'?{body:d.speed,offset:0}:cutSection(d.text,'SPEED & LATENCY\n8.','EVIDENCE\n9.');
  if(!envSection||!speedSection)return{accepted:false,reasons:[...reasons,'environment_and_speed_sections_required'],recordId,url:o?.url||null};
  const env=envSection.body,speed=speedSection.body;
  const labels=['测试所在地','宽带运营商','家宽带宽','测试周期','主要测试时段','测试客户端'];
  const lines=Object.fromEntries(labels.map(l=>[l,singleLine(env,l)]));
  if(labels.some(l=>!lines[l]))reasons.push('explicit_network_date_time_and_client_rows_required');
  const date=/^测试周期\t(\d{4}-\d{2}-\d{2}) 单次(?:订阅)?测速$/.exec(lines['测试周期']||'')?.[1];
  if(!date||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)reasons.push('explicit_valid_test_date_required');
  const time=/^主要测试时段\t((?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d) CST$/.exec(lines['主要测试时段']||'')?.[1];
  if(!time)reasons.push('explicit_test_time_required');
  const periodDates=[...speed.matchAll(/测试时间：(\d{4}-\d{2}-\d{2}) 单次(?:订阅)?测速/g)].map(m=>m[1]);
  if(periodDates.length!==1||periodDates[0]!==date)reasons.push('environment_and_speed_test_date_conflict');
  const location=lines['测试所在地']?.split('\t')[1],operator=lines['宽带运营商']?.split('\t')[1];
  if(!/^家宽带宽\t(?:[1-9]\d*)(?:\.\d+)? ?Gbps(?:（截图状态栏标示）)?$/.test(lines['家宽带宽']||'')||!operator||!location||/未知|未记录|待确认|未测试|unknown|n\/a/i.test(operator+' '+location))reasons.push('explicit_network_or_bandwidth_required');
  if(!/^测试客户端\tMiaoKo 自定义测/.test(lines['测试客户端']||''))reasons.push('explicit_supported_test_client_required');
  const threadHits=[...env.matchAll(/线程=(\d+)|(\d+) 线程|单线程/g)],threads=[...new Set(threadHits.map(m=>m[1]?Number(m[1]):m[2]?Number(m[2]):1))];
  if(threads.length!==1||threads[0]<1||threads[0]>128)reasons.push('explicit_unambiguous_thread_count_required');
  const headers=speed.split(/\r?\n/).filter(l=>l.startsWith(HEADER));
  const header=headers.length===1?headers[0]:null;
  if(!header||![HEADER+'测试工具',HEADER+'速度范围\t测试工具'].includes(header))reasons.push('explicit_regional_mean_table_header_required');
  const regions=[],numeric='(?:0|[1-9]\\d*)(?:\\.\\d+)?';
  if(header){const tail=speed.slice(speed.indexOf(header)+header.length).replace(/^\r?\n/,'');const rows=tail.split(/\r?\n/);for(const row of rows){if(!row.includes('\t'))break;const cells=row.split('\t'),expected=header.split('\t').length;
    if(cells.length!==expected||!cells[0]||!/^[\p{L}\p{N}（）() /-]{1,45}$/u.test(cells[0])||!/^\d+$/.test(cells[1])||!/^\d+ \/ \d+$/.test(cells[2])||!['TLS RTT','未测试'].includes(cells[3])||!(cells[4]==='未测试'||new RegExp('^'+numeric+' ms$').test(cells[4]))||!new RegExp('^'+numeric+' Mbps$').test(cells[5])||!new RegExp('^'+numeric+' MB/s$').test(cells[6])||!cells.at(-1).startsWith('MiaoKo 自定义测')){reasons.push('malformed_or_wrong_unit_regional_mean_row');break;}
    if(regions.some(r=>r.name===cells[0])){reasons.push('duplicate_regional_mean_row');break;}
    regions.push({name:cells[0],valueMbps:Number(cells[5].split(' ')[0]),originalValueMBps:Number(cells[6].split(' ')[0]),quote:row,sourceLocator:derivedLocator(d,body,'s8-speed',speed,row,speedSection.offset)});
  }}
  if(!regions.length||regions.length>32)reasons.push('regional_mean_rows_missing_or_too_many');
  if(reasons.length)return{accepted:false,reasons:[...new Set(reasons)],recordId,url:o?.url||null};
  const sourceUrl=p.origin+`/reviews/${p.slug}/`,threadQuote=threadHits[0][0],envQuotes=[...labels.map(l=>lines[l]),threadQuote],brandQuote=d.kind==='dom'?brand+'机场测评':d.title,fieldLocators=[derivedLocator(d,body,'title',d.kind==='dom'?body:d.title,brandQuote),...envQuotes.map(q=>derivedLocator(d,body,'s7-environment',env,q,envSection.offset)),derivedLocator(d,body,'s8-speed',speed,header,speedSection.offset),...regions.map(r=>r.sourceLocator)];
  const contentSignature=hash(JSON.stringify({sourceUrl,date,time,network:labels.slice(0,3).map(l=>lines[l]),threads:threads[0],regions:regions.map(r=>[r.name,r.valueMbps,r.originalValueMBps])}));
  return{accepted:true,reasons:[],recordId,url:sourceUrl,report:{
    id:'jichangnote-regional-'+recordId+'-'+date+'-'+contentSignature.slice(0,12),status:'retained_third_party_regional_mean_checked',
    metric:'regional_download_mean',statistic:'publisher_reported_regional_mean',scope:'历史单次测速的发布者地区均值',testedAt:date,testTime:time+' CST',
    network:lines['测试所在地'].split('\t')[1]+'；'+lines['宽带运营商'].split('\t')[1]+'；'+lines['家宽带宽'].split('\t')[1]+'（第三方自述）',threadCount:threads[0],regions,
    publisher:'机场笔记（jichangnote.com，披露推广返佣）',sourceIds:[o.evidenceId],sourceUrl,observedAt,bodySha256:hash(body),literalChecked:true,
    independentMeasurement:false,sampleCount:null,canonicalSourceGroup:'jichangnote:'+p.slug+':'+date,duplicateCatalogRecordIds:p.slug==='erwan-cloud'?['A028','A199']:[],
    contentSignature,sourceLocator:{kind:d.kind==='dom'?'dom_capture_field_ranges':'structured_capture_field_ranges',bodySha256:hash(body),fields:fieldLocators},
    methodology:'仅核对发布者地区平均下载速度原标Mbps及原始平均MB/s；未复算底层节点数据，不换算或校正发布者数值。测试线程数不等于重复样本量；单次任务成功率不等于长期可用率。仅用于历史评测明细，不进入当前主卡速度、中位数或速度排名。',
  }};
}
function extract(o,{recordId,prior={}}={}){
  const d=diagnose(o,{recordId});if(!d.accepted)return null;
  const old=(prior.coreInfo||prior).speed||{},reports=Array.isArray(old.regionalReports)?old.regionalReports:[],r=d.report;
  const same=reports.filter(v=>v?.sourceUrl===r.sourceUrl&&v?.testedAt===r.testedAt),latest=same.at(-1);
  if(latest?.contentSignature===r.contentSignature)return null;
  if(latest){r.id+='-r'+(same.length+1);r.supersedes=latest.id;r.correctionPendingReview=true;}
  return{speed:{...old,sourceIds:[...new Set([...(Array.isArray(old.sourceIds)?old.sourceIds:[]),...reports.flatMap(v=>Array.isArray(v.sourceIds)?v.sourceIds:[]),o.evidenceId])],regionalReports:[...reports,r]}};
}
module.exports={profiles,forOrigin,extract,diagnose};
