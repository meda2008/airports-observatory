'use strict';
function contexts(core={},now=Date.now()){
 const out={},bound=r=>r?.literalChecked===true&&r.sourceIds?.length&&r.measurementVerified===false&&r.independentMeasurement===false&&Date.parse(r.observedAt)<=now;
 const image=(core.speed?.imageReports||[]).find(r=>r.id?.startsWith('round21-image-')&&bound(r)&&r.rateUnit===null&&r.valueMbps===null&&r.sampleCount===null&&r.currentSpeedVerified===false&&r.eligibleForSpeedRanking===false);
 if(image){
  const relationship=image.identityQualification==='native_same_brand_registration_page_current_exact_host_terms_anchor_only'?'原生落点www.naiunet.com同名注册页真实条款链接指向当前access.naiunet.com，仅确认现时入口关联；原文团队交割及协议线路调整反证保留，不证明历史主体连续。前3行是订阅信息，56行不是56个节点。':image.identityQualification==='observed_later_published_entry_native_return_exact_current_host_only'?'初次CF原件与后来自动转ppgfabu.com的观察分别保留，发布页原生入口实际回到当前www.paopao.dog，当前正文回指ppgfabu.com；仅核现时入口关系，不编HTTP头或精确跳转时刻，不证明历史主体连续。节点限速为第三方正文陈述，发布页网址延迟不是节点测速。':'原生落点a04.xiaomiaffa01.cc与当前hostname一致，仅确认现时入口关联，不证明历史法律主体连续。图脚接入为第三方自标；韩国零字节等结果仅此历史单次图，不泛化地区或当前故障。';
  out.image={kind:image.kind,testedAt:image.testedAt,publisher:image.publisher,displayedRows:image.displayedRows,reportedLocalTime:image.reportedLocalTime,reportedTimeZone:image.reportedTimeZone,timeZoneOffset:null,exactTestInstant:null,sampleCount:null,rateUnit:null,valueMbps:null,description:'第三方历史测速图，'+image.displayedRows+'显示行，选核3例。图中单位未明确每秒，不换算Mbps或总体均值、中位数；字面时区偏移未知，不代表当前速度。'+relationship};
 }
 const report=(core.stability?.thirdPartyStatusReports||[]).find(r=>r.id==='round21-status-A053-2026-02-05'&&bound(r)&&r.kind==='historical_third_party_service_status_claim'&&r.current===false&&r.sampleCount===null&&r.events?.length===1&&r.events[0].date==='2026-02-05');
 if(report)out.status={kind:report.kind,publisher:report.publisher,signalSummaries:['2026-02-05：发布者称五大常用地区节点仍不错，韩国节点本轮不可用；仅该轮局部历史陈述。'],description:'第三方历史状态记录，未独立核实。仅发布者该轮韩国节点描述，样本、网络、客户端与时长未知；不是全站停服、当前故障或长期稳定率。'};
 return out;
}
module.exports={contexts};
