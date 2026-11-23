'use strict';
// Historical complete-HTTPS request latency. No download throughput, current
// measurement, uptime estimate, speed ranking or independent validation.
const {createHash}=require('node:crypto');
const hash=s=>createHash('sha256').update(s).digest('hex');
const URL='https://echoccc.online/posts/airport-review/';
const profiles=Object.freeze([
  Object.freeze({recordId:'A016',brand:'AmyTelecom',officialOrigins:Object.freeze(['https://www.amytele.co']),section:'AmyTelecom 分地区测试明细',endSection:'Gatern 多节点地区测试明细',regions:Object.freeze(['香港','台湾','日本','新加坡','美国'])}),
  Object.freeze({recordId:'A182',brand:'Gatern',officialOrigins:Object.freeze(['https://gatern.com','https://s.gtnb.net']),section:'Gatern 多节点地区测试明细',endSection:'工具',regions:Object.freeze(['香港','台湾','日本','新加坡','韩国','菲律宾','美国','英国','澳大利亚'])}),
]);
const HEADER='地区\t合格/候选节点\t样本成功率 (CF / Google)\tCloudflare 加权 W (最快 F / 典型 M)\tGoogle 加权 W (最快 F / 典型 M)';
const METHOD_LINES=Object.freeze([
  '本次延迟测试在 Windows 11（Mihomo 1.19.31）下通过绑定独立物理接口完成全量节点采样（覆盖率 100%）：',
  '测试网络：中国移动（移动数据网络，绑定物理以太网接口）、中国联通（联通流量，绑定物理 WLAN 接口）。',
  '探测目标与轮数：对每个节点分别请求 Cloudflare（https://cp.cloudflare.com/generate_204）和 Google（https://www.gstatic.com/generate_204）各 3 轮，超时 5 秒，并发 4。',
  '延迟为完整 HTTPS 请求耗时（elapsed_ms），而非 ICMP Ping 值。',
  '合格节点：在两个探测目标共 6 次请求中全部成功（3/3 + 3/3）的节点。',
  '最快 F（ms）：该地区最快合格节点的多轮延迟中位数（p50）。',
  '典型 M（ms）：该地区各节点成功请求 p50 的中位数（节点等权）。',
  '加权 W（ms）：80% × F + 20% × M，越低越好，兼顾该地区最快可用节点与整体水平。',
]);
function match(url,recordId){try{const u=new globalThis.URL(url);if(u.href!==URL)return null;return profiles.find(p=>p.recordId===recordId)||null;}catch{return null;}}
function forOrigin(url,{recordId}={}){const p=match(url,recordId);return p?{origin:'https://echoccc.online',recordIds:[recordId],fields:['speed'],parserKind:'explicit_echoc_historical_https_latency_v1',extract}:null;}
function sourceTargets(recordId){return profiles.some(p=>p.recordId===recordId)?[{url:URL,fields:['speed'],sourceType:'third_party_latency_report'}]:[];}
function locator(body,quote,start=body.indexOf(quote)){return{kind:'body_utf16_range',start,end:start+quote.length,quoteSha256:hash(quote)};}
function section(body,startTitle,endTitle){const re=new RegExp('^'+startTitle+'$','gm'),matches=[...body.matchAll(re)];if(matches.length!==1)return null;const start=matches[0].index,end=body.indexOf('\n'+endTitle+'\n',start+startTitle.length);return end<0?null:{body:body.slice(start,end),start};}
function diagnose(o,{recordId}={}){
  const p=match(o?.url,recordId),body=typeof o?.body==='string'?o.body:typeof o?.text==='string'?o.text:'',observedAt=o?.observedAt||o?.capturedAt,reasons=[];
  if(!p)reasons.push('publisher_path_or_record_identity_not_allowlisted');
  if(!body||body.length>4_000_000)reasons.push('visible_body_required');
  if(typeof o?.evidenceId!=='string'||!o.evidenceId.trim())reasons.push('current_capture_evidence_id_required');
  if(typeof observedAt!=='string'||!Number.isFinite(Date.parse(observedAt)))reasons.push('original_observed_at_required');
  if((o?.sha256&&o.sha256!==hash(body))||(o?.bodySha256&&o.bodySha256!==hash(body)))reasons.push('capture_body_hash_mismatch');
  if(o?.passwordForm||o?.verificationWidgetObserved||o?.metadata?.passwordForm||o?.metadata?.verificationWidgetObserved||/checkpoint$/.test(o?.kind||''))reasons.push('authentication_or_verification_checkpoint');
  const dates=[...body.slice(0,600).matchAll(/^\s*(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s+[^\r\n]+)?$/gm)],date=dates.length===1?dates[0][1]+'-'+dates[0][2].padStart(2,'0')+'-'+dates[0][3].padStart(2,'0'):null;
  if(!date||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)reasons.push('explicit_unique_publication_date_required');
  if(date&&[o?.publishedAt,o?.metadata?.publishedAt].some(d=>typeof d==='string'&&d.slice(0,10)!==date))reasons.push('publication_date_metadata_conflict');
  if(date&&Number.isFinite(Date.parse(observedAt))&&date>observedAt.slice(0,10))reasons.push('publication_date_after_capture');
  const method=section(body,'测试环境与统计口径','核心地区横向对比');
  if(!method||!METHOD_LINES.every(line=>method.body.includes(line)))reasons.push('explicit_https_latency_method_missing_or_changed');
  const detail=p?section(body,p.section,p.endSection):null;
  if(!detail)reasons.push('unique_record_detail_section_required');
  // The publisher page itself must retain its native, same-named official link.
  const links=o?.metadata?.links??o?.links??[],officialLinks=Array.isArray(links)?links.flatMap(l=>{try{const u=new globalThis.URL(l.url||l.href);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash?[u.origin]:[];}catch{return[];}}):[];
  if(p&&(!body.includes('\n'+p.brand+'\n官网：')||!p.officialOrigins.every(origin=>body.includes(origin+'/')&&officialLinks.includes(origin))))reasons.push('same_named_native_official_links_required');
  if(reasons.length)return{accepted:false,reasons,recordId,facts:[]};
  const rows=[],lines=detail.body.split('\n');let network=null,headerSeen=false;const tables=new Map();
  const num='(?:0|[1-9]\\d*)(?:\\.\\d+)?',pattern=new RegExp('^([^\\t]+)\\t(\\d+)/(\\d+)\\t('+num+')% / ('+num+')%\\t('+num+') ms \\(('+num+') / ('+num+')\\)\\t('+num+') ms \\(('+num+') / ('+num+')\\)$');
  let localOffset=lines[0].length+1;
  for(const line of lines.slice(1)){
    const rowStart=detail.start+localOffset;localOffset+=line.length+1;
    if(line==='中国联通'||line==='中国移动'){if(tables.has(line)){reasons.push('duplicate_network_table');break;}network=line;tables.set(line,[]);headerSeen=false;continue;}
    if(line===HEADER){if(!network||headerSeen){reasons.push('duplicate_or_unbound_table_header');break;}headerSeen=true;continue;}
    if(!line.trim())continue;
    const m=pattern.exec(line);
    if(!network||!headerSeen||!m){reasons.push('unexpected_detail_row_or_unit');break;}
    const [qualifiedNodes,candidateNodes,cfPct,googlePct,cfW,cfF,cfM,googleW,googleF,googleM]=m.slice(2).map(Number),region=m[1];
    if(!p.regions.includes(region)||tables.get(network).includes(region)){reasons.push('unexpected_or_duplicate_region');break;}
    if(candidateNodes<=0||qualifiedNodes>candidateNodes||cfPct<0||cfPct>100||googlePct<0||googlePct>100){reasons.push('invalid_node_count_or_sample_success_percentage');break;}
    tables.get(network).push(region);rows.push({region,network,qualifiedNodes,candidateNodes,sampleSuccessPct:{cloudflare:cfPct,google:googlePct},cloudflare:{weightedMs:cfW,fastestMs:cfF,typicalMs:cfM},google:{weightedMs:googleW,fastestMs:googleF,typicalMs:googleM},quote:line,sourceLocator:locator(body,line,rowStart)});
  }
  if(tables.size!==2||['中国联通','中国移动'].some(n=>tables.get(n)?.length!==p.regions.length)||rows.length!==p.regions.length*2)reasons.push('network_region_count_mismatch');
  if(reasons.length)return{accepted:false,reasons:[...new Set(reasons)],recordId,facts:[]};
  const contentSignature=hash(JSON.stringify({recordId,publishedAt:date,method:METHOD_LINES,rows:rows.map(({sourceLocator,quote,...r})=>r)}));
  const report={id:'echoc-https-latency-'+recordId+'-'+date+'-'+contentSignature.slice(0,12),kind:'historical_third_party_latency_report',status:'retained_third_party_latency_checked',metric:'https_elapsed_ms',statistic:'publisher_reported_weighted_and_typical_latency',publishedAt:date,testedAt:null,
    networkContexts:[{network:'中国联通',access:'联通流量，绑定物理 WLAN 接口',location:null,testWindow:null},{network:'中国移动',access:'移动数据网络，绑定物理以太网接口',location:null,testWindow:null}],testPlatform:'Windows 11',testClient:'Mihomo 1.19.31',probeTargets:['https://cp.cloudflare.com/generate_204','https://www.gstatic.com/generate_204'],roundsPerTarget:3,timeoutMs:5000,concurrency:4,
    rows,publisher:"echoc's blog（echoccc.online）",canonicalSourceGroup:'echoccc.online:airport-review:'+date,sourceIds:[o.evidenceId],sourceUrl:URL,observedAt,bodySha256:hash(body),quote:detail.body,sourceLocator:locator(body,detail.body),publicationQuote:dates[0][0],publicationSourceLocator:locator(body,dates[0][0]),methodology:method.body,methodologySourceLocator:locator(body,method.body),
    identityQualification:'same_named_native_official_links',literalChecked:true,sampleCount:null,independentMeasurement:false,measurementVerified:false,contentSignature,
    limitations:['发表日不等于测试日；原文未给具体测试日期、地点及测试时段。','这是历史完整HTTPS请求耗时，不是ICMP延迟、下载Mbps或持续带宽；不进入下载速度主卡或排名。','W是作者发表的80%F+20%M加权值，不是P50；保留发表数值而不复算覆盖。F/M口径按作者原文保留。','节点数和计划轮数不等于独立重复样本量，样本成功率不等于长期可用率；未取得逐次请求原始日志或独立复测。']};
  return{accepted:true,reasons:[],recordId,report,facts:[report]};
}
function extract(o,{recordId,prior={}}={}){const d=diagnose(o,{recordId});if(!d.accepted)return null;const old=(prior.coreInfo||prior).speed||{},reports=Array.isArray(old.latencyReports)?old.latencyReports:[],report=d.report,same=reports.filter(r=>r.sourceUrl===URL),latest=same.at(-1);if(latest?.contentSignature===report.contentSignature)return null;if(latest){report.id+='-r'+(same.length+1);report.supersedes=latest.id;report.correctionPendingReview=true;}return{speed:{...old,sourceIds:[...new Set([...(Array.isArray(old.sourceIds)?old.sourceIds:[]),...reports.flatMap(r=>Array.isArray(r.sourceIds)?r.sourceIds:[]),o.evidenceId])],latencyReports:[...reports,report]}};}
module.exports={profiles,forOrigin,sourceTargets,diagnose,extract};
