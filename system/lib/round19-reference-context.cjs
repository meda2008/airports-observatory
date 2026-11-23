'use strict';
function contexts(core={},now=Date.now()){
 const out={},bound=r=>r?.literalChecked===true&&r.sourceIds?.length&&r.independentMeasurement===false&&r.measurementVerified===false&&Number.isFinite(Date.parse(r.observedAt))&&Date.parse(r.observedAt)<=now;
 const r=(core.speed?.imageReports||[]).find(r=>r.id==='round19-image-A075-2025-04-15'&&bound(r)&&r.testedAt==='2025-04-15'&&r.displayedRows===10&&r.valueMbps===null&&r.rateUnit===null&&r.sampleCount===null&&r.currentSpeedVerified===false&&r.eligibleForSpeedRanking===false);
 if(r)out.image={kind:r.kind,testedAt:r.testedAt,publisher:r.publisher,displayedRows:10,reportedLocalTime:r.reportedLocalTime,reportedTimeZone:'CST',timeZoneOffset:null,exactTestInstant:null,valueMbps:null,rateUnit:null,sampleCount:null,description:'第三方历史专线套餐测速图，10个显示行、选核3例。MB未注明每秒，不换算Mbps，不计算总体均值或中位数；CST偏移未知，不代表当前速度。原生落点仅确认当前nyxen.org域名，目的地遇安全验证，不证明历史主体连续。'};
 const d=(core.operatingHistory?.historyStatements||[]).find(r=>r.id==='round19-history-A171-promotion-updated-2026-08-16'&&bound(r)&&r.date==='2026-08-16'&&r.datePrecision==='day'&&r.dateEvidence?.kind==='operator_document_last_updated'&&r.continuousOperationVerified===false);
 if(d)out.document={id:d.id,date:d.date,label:'2026年有促销文档更新记录（自述）',description:'同域促销业务文档自标最后更新2026-08-16；不是首发、开业或成立日，也不证明连续经营或优惠仍有效。'};
 return out;
}
module.exports={contexts};
