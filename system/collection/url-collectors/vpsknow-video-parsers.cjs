'use strict';
// A publisher's historical YouTube player fields, not download throughput,
// repeated measurement, packet loss, sustained playback or current performance.
const {createHash}=require('node:crypto');
const sha=s=>createHash('sha256').update(s).digest('hex');
const URL='https://vpsknow.com/reviews/airports/tag-airport-review/';
const IMAGE_ROOT='https://vpsknow.com/images/reviews/tag-airport-review/';
const profiles=Object.freeze([Object.freeze({recordId:'A004',url:URL,brand:'TAG',fields:Object.freeze(['speed'])})]);
const BOUNDARY='两者是不同播放时刻的截面，连接速度不是持续测速或套餐保证，丢帧也不等于网络丢包。';
const AFFILIATE='本文包含推广链接，可能产生佣金；测试结论与风险说明独立保留。';
function matches(url,recordId){return recordId==='A004'&&url===URL;}
function forOrigin(url,{recordId}={}){return matches(url,recordId)?{origin:'https://vpsknow.com',recordIds:['A004'],fields:['speed'],parserKind:'explicit_vpsknow_historical_player_snapshot_v1',extract}:null;}
function sourceTargets(recordId){return recordId==='A004'?[{url:URL,fields:['speed'],sourceType:'third_party_video_player_report'}]:[];}
function locator(body,quote,start=body.indexOf(quote)){return{kind:'body_utf16_range',start,end:start+quote.length,quoteSha256:sha(quote),bodySha256:sha(body)};}
function validDate(date){const d=new Date(date+'T00:00:00Z');return Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===date;}
function nativeImages(o,body,reasons){
 const metadata=o?.metadata?.links??o?.links,marker='Original image links:\n',index=body.indexOf(marker),expected=['youtube-la.webp','youtube-hawaii.webp'];let retained=null;
 if(index>=0){if(body.lastIndexOf(marker)!==index||o?.representation!=='normalized_retained_visible_DOM_text'){reasons.push('explicit_retained_native_link_appendix_required');return[];}try{const rows=JSON.parse(body.slice(index+marker.length));if(!Array.isArray(rows)||rows.length>100)throw Error();retained=rows;}catch{reasons.push('invalid_retained_native_link_appendix');return[];}}
 const input=metadata??retained;if(!Array.isArray(input)||input.length>500){reasons.push('native_image_links_required');return[];}
 function selected(rows){return expected.map(name=>{const found=[];for(let i=0;i<rows.length;i++){const row=rows[i],value=row?.url??row?.href;if(typeof value!=='string')continue;let u;try{u=new globalThis.URL(value,URL);}catch{continue;}if(u.href===IMAGE_ROOT+name&&(!u.username&&!u.password&&!u.search&&!u.hash))found.push({url:u.href,label:typeof row.label==='string'?row.label.slice(0,160):'',index:i,originalValue:value});}return found[0]||null;});}
 const images=selected(input);if(images.some(v=>v&&((v.url.endsWith('youtube-la.webp')&&v.label.includes('夏威夷'))||(v.url.endsWith('youtube-hawaii.webp')&&v.label.includes('洛杉矶'))))){reasons.push('native_image_node_label_conflict');return[];}if(images.some(v=>!v)){reasons.push('both_exact_native_video_images_required');return[];}
 if(metadata&&retained&&selected(retained).some(v=>!v)){reasons.push('native_link_metadata_appendix_conflict');return[];}
 return images.map(image=>({...image,linkBasis:metadata?'native_capture_links':'explicit_retained_native_link_appendix',linkLocator:metadata?{kind:'capture_metadata_link',path:o.metadata?.links?'metadata.links':'links',index:image.index,attribute:input[image.index].url!==undefined?'url':'href'}:locator(body,image.originalValue,body.indexOf(image.originalValue,index))}));
}
function diagnose(o,{recordId}={}){
 const body=typeof o?.body==='string'?o.body:typeof o?.text==='string'?o.text:'',observedAt=o?.observedAt||o?.capturedAt,reasons=[];
 if(!matches(o?.url,recordId))reasons.push('publisher_route_or_record_identity_not_allowlisted');
 if(!body||body.length>200000)reasons.push('visible_body_required');
 if(typeof o?.evidenceId!=='string'||!o.evidenceId.trim())reasons.push('current_capture_evidence_id_required');
 if(typeof observedAt!=='string'||!Number.isFinite(Date.parse(observedAt)))reasons.push('original_observed_at_required');
 if(o?.sha256&&o.sha256!==sha(body)||o?.bodySha256&&o.bodySha256!==sha(body))reasons.push('capture_body_hash_mismatch');
 if(o?.passwordForm||o?.metadata?.passwordForm||o?.verificationWidgetObserved||o?.metadata?.verificationWidgetObserved||/checkpoint$/.test(o?.kind||''))reasons.push('authentication_or_verification_checkpoint');
 if([...body.matchAll(/^TAG 机场测评\r?$/gm)].length!==1||!body.includes('VPSKnow 机场实测'))reasons.push('explicit_same_named_publisher_heading_required');
 const scopes=[...body.matchAll(/素材记录于 (\d{4}-\d{2}-\d{2})，Clash 检测约 (\d{2}:\d{2})，视频约 (\d{2}:\d{2})–(\d{2}:\d{2})（北京时间）。本地运营商、带宽、路由与分流配置未完整提供；不是多日高峰测试，也没有可用于比较的 Speedtest 上下行结果。/g)],scope=scopes.length===1?scopes[0]:null;
 const date=scope?.[1];if(!date||!validDate(date)||scope.slice(2,5).some(t=>!/^([01]\d|2[0-3]):[0-5]\d$/.test(t))||scope[3]>scope[4])reasons.push('explicit_unique_test_date_and_approximate_scope_required');
 if(date&&Number.isFinite(Date.parse(observedAt))&&date>observedAt.slice(0,10))reasons.push('test_date_after_capture');
 const declarations=[...body.matchAll(/(?:最近实测|最近更新|最后更新|首次测试|最新记录)\s+(\d{4}-\d{2}-\d{2})/g)];if(!declarations.length||declarations.some(m=>m[1]!==date))reasons.push('declared_test_date_conflict');
 if([o?.testedAt,o?.metadata?.testedAt].some(d=>d!==undefined&&d!==date))reasons.push('test_date_metadata_conflict');
 const number='(?:[1-9]\\d{0,2}(?:,\\d{3})+|[1-9]\\d*)',decimal='(?:0|[1-9]\\d*)(?:\\.\\d+)?';
 const videoPattern=new RegExp('素材分别标注美国洛杉矶和美国夏威夷家宽。两张统计均为 (\\d+)×(\\d+)@(\\d+)：洛杉矶连接速度 ('+number+')Kbps、缓冲 ('+decimal+') 秒、丢帧 (\\d+)/(\\d+)；夏威夷 ('+number+')Kbps、缓冲 ('+decimal+') 秒、丢帧 (\\d+)/(\\d+)。'+BOUNDARY,'g');
 const blocks=[...body.matchAll(videoPattern)],video=blocks.length===1?blocks[0]:null;if(!video||video[1]!=='3840'||video[2]!=='2160'||video[3]!=='30')reasons.push('unique_exact_video_scope_rows_units_and_frame_semantics_required');
 if(!body.includes(AFFILIATE))reasons.push('affiliate_disclosure_required');
 const images=nativeImages(o,body,reasons);
 const rows=[];if(video){const definitions=[{nodeLabel:'美国洛杉矶',short:'洛杉矶',rate:4,buffer:5,dropped:6,total:7,image:0},{nodeLabel:'美国夏威夷家宽',short:'夏威夷',rate:8,buffer:9,dropped:10,total:11,image:1}];for(const d of definitions){const rate=video[d.rate],buffer=video[d.buffer],dropped=video[d.dropped],total=video[d.total],valueKbps=Number(rate.replaceAll(',',''));if(!Number.isSafeInteger(valueKbps)||valueKbps<=0||!Number.isFinite(+buffer)||+buffer<0||!Number.isSafeInteger(+dropped)||!Number.isSafeInteger(+total)||+total<=0||+dropped>+total){reasons.push('invalid_player_field_values');continue;}
   const headlines=[...body.matchAll(new RegExp(d.short+'视频连接速度\\r?\\n('+number+')Kbps','g'))];if(!headlines.length||headlines.some(m=>m[1]!==rate))reasons.push('headline_detail_rate_conflict');
   const caption='3840×2160@30，'+rate+'Kbps，缓冲 '+buffer+' 秒，丢帧 '+dropped+'/'+total+'。',captionHeader=d.short+' YouTube 4K';const capPattern=new RegExp('^'+captionHeader+'\\r?\\n\\r?\\n([^\\r\\n]+)','gm'),caps=[...body.matchAll(capPattern)];if(caps.length!==1||caps[0][1]!==caption)reasons.push('same_named_image_caption_fields_conflict');
   const quote=d.short+(d.image===0?'连接速度 ':' ')+rate+'Kbps、缓冲 '+buffer+' 秒、丢帧 '+dropped+'/'+total,quoteStart=video.index+video[0].indexOf(quote),image=images[d.image];
   rows.push({nodeLabel:d.nodeLabel,publisherAssignedNodeLocation:true,valueKbps,unit:'Kbps',resolution:{width:3840,height:2160,fps:30},bufferSeconds:+buffer,droppedFrames:+dropped,totalFrames:+total,quote,sourceLocator:locator(body,quote,quoteStart),imageUrl:image?.url||null,imageLabel:image?.label||'',imageLinkBasis:image?.linkBasis||null,imageLinkLocator:image?.linkLocator||null});
  }}
 if(reasons.length)return{accepted:false,reasons:[...new Set(reasons)],recordId,report:null,facts:[]};
 const contentSignature=sha(JSON.stringify({recordId,testedAt:date,scope:scope[0],video:video[0],rows:rows.map(({sourceLocator,imageLinkLocator,imageLabel,imageLinkBasis,...r})=>r)})),report={id:'vpsknow-player-'+recordId+'-'+date+'-'+contentSignature.slice(0,12),kind:'historical_youtube_player_snapshot',status:'retained_third_party_player_stats_checked',metric:'player_connection_speed',statistic:'single_player_snapshot',unit:'Kbps',testedAt:date,testedAtPrecision:'day',declaredApproximateTimeWindow:date+' '+scope[3]+'–'+scope[4]+' 北京时间（发布者约略说明）',exactPerImageTimestamp:null,network:null,accessBandwidth:null,probeLocation:null,actualVideoProxyClientVersion:null,sampleCount:null,videoSnapshotCount:2,
  rows,publisher:'VPSKnow（vpsknow.com，披露推广返佣）',canonicalSourceGroup:'vpsknow:tag-airport-review:'+date,identityQualification:'same_named_no_known_conflict',sourceIds:[o.evidenceId],sourceUrl:URL,observedAt,bodySha256:sha(body),quote:video[0],sourceLocator:locator(body,video[0],video.index),methodology:scope[0],methodologySourceLocator:locator(body,scope[0],scope.index),affiliateDisclosure:AFFILIATE,affiliateSourceLocator:locator(body,AFFILIATE),literalChecked:true,independentMeasurement:false,measurementVerified:false,currentSpeedVerified:false,rawMeasurementLogsVerified:false,imageAuthenticityVerified:false,contentSignature,
  limitations:['仅保留第三方历史YouTube播放器连接速度估计字段，原单位Kbps；不是Speedtest、持续下载吞吐、套餐带宽、总体中位数或当前速度，不进入速度排名。','两个不同节点/播放时刻的截面不是重复实验样本；sampleCount未知，不计算均值、分位数或可用率。','丢帧计数是视频帧，不是网络丢包；缓冲秒数不等于连续播放时长或长期稳定性。','测试日期来自发布者正文，23:38–23:39为约略北京时间，未生成每图精确epoch。原采集日期不代替测试日。','本地运营商、接入带宽、探针城市及各播放会话的代理客户端/版本未提供。节点地名和家宽标签只是发布者标签，不独立证明物理位置或接入架构。','原图真实性、逐次原始日志和当前表现未独立验证；本文有推广返佣，两个截图属于同一发布者来源。']};
 return{accepted:true,reasons:[],recordId,report,facts:[report]};
}
function extract(o,{recordId,prior={}}={}){const d=diagnose(o,{recordId});if(!d.accepted)return null;const old=(prior.coreInfo||prior).speed||{},reports=Array.isArray(old.videoReports)?old.videoReports:[],report=d.report,same=reports.filter(r=>r.sourceUrl===URL),latest=same.at(-1);if(latest?.contentSignature===report.contentSignature)return null;if(latest){report.id+='-r'+(same.length+1);report.supersedes=latest.id;report.correctionPendingReview=true;}return{speed:{...old,sourceIds:[...new Set([...(Array.isArray(old.sourceIds)?old.sourceIds:[]),...reports.flatMap(r=>Array.isArray(r.sourceIds)?r.sourceIds:[]),o.evidenceId])],videoReports:[...reports,report]}};}
module.exports={profiles,forOrigin,sourceTargets,diagnose,extract};
