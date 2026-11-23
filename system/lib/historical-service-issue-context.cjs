'use strict';
function context(stability={},now=Date.now()){
 const parser=require('../collection/url-collectors/next-gap-status-parsers.cjs'),p=parser.profiles.find(p=>p.recordId==='A039');if(!p)return null;
 const rows=(stability.reviewedIssueSignals||[]).filter(f=>f.id?.startsWith('next-gap-operator-status-A039-')&&f.literalChecked===true&&f.sourceIds?.length>0&&f.sourceUrl===p.url&&['operator_degradation_statement','operator_recovery_statement'].includes(f.kind)&&f.independentMeasurement===false&&f.measurementVerified===false&&f.current===false&&f.durationMinutes===null&&f.sampleCount===null&&f.measurementWindow===null&&Number.isFinite(Date.parse(f.createdAt))&&Date.parse(f.createdAt)<=now&&p.events.some(e=>e.permalink===f.postUrl&&e.quote===f.quote&&e.dateTime===f.createdAt)).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
 const other=(stability.reviewedIssueSignals||[]).some(f=>f.literalChecked&&f.sourceIds?.length&&['operator_degradation_statement','operator_outage_statement'].includes(f.kind)&&Number.isFinite(Date.parse(f.createdAt))&&Date.parse(f.createdAt)<=now&&!rows.some(r=>r.id===f.id));
 if(!rows.length||other)return null;
 return{kind:'historical_operator_service_issue_statements',lastIssueAt:rows[0].createdAt,signalSummaries:[...new Set(rows.map(f=>f.summary))],description:'站方历史线路及后台功能问题的修复自述；不是全站中断、当前故障或长期稳定率，未独立验证实际影响、恢复时刻及持续时间。'};
}
module.exports={context};
