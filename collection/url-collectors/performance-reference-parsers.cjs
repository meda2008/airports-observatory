'use strict';
// Explicit, source-bound third-party snapshot contracts. These are review
// proposals, not our measurements, uptime estimates or cross-provider rankings.
const {createHash}=require('node:crypto');
const hash=s=>createHash('sha256').update(s).digest('hex');
const profiles=Object.freeze([
  ['A047','cyber',['CyberGuard']],
  ['A066','fatcat',['肥猫云']],
  ['A009','glados',['GLaDOS']],
  ['A010','mj',['魔戒']],
  ['A002','nx',['奶昔','Nexitally']],
  ['A036','wty',['唯兔云']],
  ['A059','ssid',['SS-ID']],
  ['A019','sdog',['SSRDOG']],
  ['A081','web3',['Web3加速器']],
  ['A001','wget',['WgetCloud']],
  ['A150','qqy',['全球云']],
  ['A073','dgy',['大哥云']],
  ['A056','dog',['狗狗加速']],
  ['A142','lmy',['龙猫云']],
  ['A006','sdm',['闪电猫']],
  ['A180','yy',['隐云']],
  ['A200','ssid',['SS-ID']],
].map(([recordId,slug,aliases])=>Object.freeze({recordId,slug,aliases:Object.freeze(aliases),origin:'https://jcnotes.com',fields:Object.freeze(['speed'])})));
// NiceCloud / 九云 identity conflict is deliberately outside this allowlist.
const methods=Object.freeze([
  '下载口径 · Cloudflare Anycast 三样本单连接 v4\n本机经被测节点对 Cloudflare Anycast 运行 3 次独立单连接下载；每次最多 99 MB、最长 15 秒，最终取成功样本平均速度的中位数。',
  '下载口径 · 旧版专用测速端点\n该速度来自旧版首个成功的专用测速端点，只代表当时到该目标的单连接速度，不能与大文件 v3 直接比较。',
]);
function profileFor(url,recordId){
  if(typeof recordId!=='string')return null;
  let u;try{u=new URL(url);}catch{return null;}
  if(u.origin!=='https://jcnotes.com'||u.username||u.password||u.search)return null;
  const route=/^\/airports\/([a-z0-9]+)\/(\d{8})_(\d{6})\/$/.exec(u.pathname);
  if(!route)return null;
  const profile=profiles.find(p=>p.recordId===recordId&&p.slug===route[1]);
  return profile?{profile,url:u.origin+u.pathname,date:route[2],time:route[3]}:null;
}
function forOrigin(url,{recordId}={}){
  const found=profileFor(url,recordId);if(!found)return null;
  return{origin:found.profile.origin,recordIds:[recordId],slug:found.profile.slug,aliases:[...found.profile.aliases],fields:['speed'],parserKind:'explicit_jcnotes_historical_reference_v1',extract};
}
function locator(body,quote){const start=body.indexOf(quote);return{kind:'body_utf16_range',start,end:start+quote.length,quoteSha256:hash(quote)};}
function validDateTime(date,time){const value=new Date(date+'T'+time+':00Z');return Number.isFinite(value.valueOf())&&value.toISOString().slice(0,16)===date+'T'+time;}
function diagnose(o,{recordId}={}){
  const found=profileFor(o?.url,recordId),reasons=[];
  if(!found)reasons.push('publisher_route_or_record_identity_not_allowlisted');
  const body=typeof o?.body==='string'?o.body:typeof o?.text==='string'?o.text:'';
  const observedAt=o?.observedAt||o?.capturedAt;
  if(!body||body.length>4_000_000)reasons.push('visible_body_missing_or_too_large');
  if(typeof o?.evidenceId!=='string'||!o.evidenceId.trim())reasons.push('current_capture_evidence_id_required');
  if(typeof observedAt!=='string'||!Number.isFinite(Date.parse(observedAt)))reasons.push('original_observed_at_required');
  if(o?.sha256&&o.sha256!==hash(body)||o?.bodySha256&&o.bodySha256!==hash(body))reasons.push('body_hash_mismatch');
  if(o?.passwordForm||o?.verificationWidgetObserved||/verification_checkpoint|auth_checkpoint/.test(o?.kind||''))reasons.push('authentication_or_verification_checkpoint');
  // Only exact visible page structure is accepted. A brand mention in a node
  // table/footer is not identity evidence, and JSON wrappers must be decoded
  // by the capture adapter before reaching this text parser.
  const brand=/^← 返回 ([^\n]+) 长期观察\r?$/m.exec(body);
  if(!found||!brand||!found.profile.aliases.includes(brand[1]))reasons.push('snapshot_heading_brand_mismatch');
  if(!body.includes('历史快照\n这是一次历史记录，不代表当前状态。')&&!body.includes('历史快照\r\n这是一次历史记录，不代表当前状态。'))reasons.push('historical_disclosure_missing');
  const headings=[...body.matchAll(/^测速快照 · [^\r\n]*? · (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) · ([^\r\n]+)\r?$/gm)];
  const heading=headings.length===1?headings[0]:null;
  if(!heading||!validDateTime(heading[1],heading[2]))reasons.push('explicit_test_date_time_missing_or_ambiguous');
  else if(found&&(heading[1].replaceAll('-','')!==found.date||heading[2].replace(':','')!==found.time.slice(0,4)))reasons.push('test_date_time_conflicts_with_snapshot_url');
  // This network is an evidenced publisher configuration, not a default to be
  // filled when a new report omits it. A changed network requires a new contract.
  if(!heading||heading[3]!=='湖南联通 1000M 家用宽带')reasons.push('explicit_supported_test_network_missing');
  const blocks=[...body.matchAll(/^本次快照样本\r?\n主要地区可用节点\r?\n\d+ \/ \d+\r?\n\d+% · 香港 \/ 台湾 \/ 新加坡 \/ 日本 \/ 美国\r?\n中位下载\r?\n((?:0|[1-9]\d*)(?:\.\d+)?) Mbps\r?\n(?:0|[1-9]\d*)(?:\.\d+)?[–-](?:0|[1-9]\d*)(?:\.\d+)? Mbps，主要地区(?=\r?\n|$)/gm)];
  const block=blocks.length===1?blocks[0]:null;
  if(!block||!Number.isFinite(Number(block[1]))||Number(block[1])<=0)reasons.push('explicit_primary_region_download_median_mbps_missing_or_ambiguous');
  const methodHits=methods.flatMap(m=>body.includes(m)?[m]:body.includes(m.replaceAll('\n','\r\n'))?[m.replaceAll('\n','\r\n')]:[]);
  if(methodHits.length!==1)reasons.push('explicit_supported_method_missing_or_ambiguous');
  if(reasons.length)return{accepted:false,reasons,recordId,url:o?.url||null};
  const quote=body.slice(brand.index,block.index+block[0].length);
  return{accepted:true,reasons:[],recordId,url:found.url,report:{
    id:'jcnotes-median-'+recordId+'-'+heading[1]+'-'+hash(found.url+'\n'+block[1]+'\n'+body).slice(0,12),
    status:'retained_third_party_metric_checked',literalChecked:true,
    metric:'download_median',valueMbps:Number(block[1]),statistic:'median',scope:'主要地区',
    testedAt:heading[1],network:heading[3]+'（第三方自述）',region:'湖南；香港／台湾／新加坡／日本／美国',
    publisher:'机场观察手记（jcnotes.com）',quote,sourceIds:[o.evidenceId],sourceUrl:found.url,
    observedAt,bodySha256:hash(body),sourceLocator:locator(body,quote),
    identityQualification:'same_named_no_known_conflict',independentMeasurement:false,sampleCount:null,
    methodology:methodHits[0]+(recordId==='A200'&&methodHits[0].includes('旧版专用测速端点')&&body.includes('基准与节点使用相同的 Cloudflare Anycast 三样本单连接方法')?' 同页基准段另称节点使用Cloudflare Anycast三样本单连接，方法声明不一致；仅保留发布中位值，实际方法与基准可比性未核实，不据此归一化。':'')+' 未取得逐次下载原始日志；计划样本数不等于实际成功样本数，仅为第三方历史资料，不能作为当前独立实测或跨方法排名。',
  }};
}
function extract(o,{recordId,prior={}}={}){
  const result=diagnose(o,{recordId});if(!result.accepted)return null;
  const old=(prior.coreInfo||prior).speed||{},reports=Array.isArray(old.verifiedReports)?old.verifiedReports:[];
  const report=result.report;
  const sameSnapshot=r=>r?.sourceUrl===report.sourceUrl&&r?.testedAt===report.testedAt&&r?.metric==='download_median';
  // Recapture does not refresh the clock or source of an unchanged claim.
  const revisions=reports.filter(sameSnapshot);
  if(revisions.at(-1)?.valueMbps===report.valueMbps)return null;
  if(revisions.length){report.id+='-r'+(revisions.length+1);report.supersedes=revisions.at(-1).id;report.correctionPendingReview=true;}
  const sourceIds=[...new Set([...(Array.isArray(old.sourceIds)?old.sourceIds:[]),...reports.flatMap(r=>Array.isArray(r.sourceIds)?r.sourceIds:[]),o.evidenceId])];
  return{speed:{...old,sourceIds,verifiedReports:[...reports,report]}};
}
module.exports={profiles,forOrigin,extract,diagnose};
