'use strict';
// Keep full immutable comments in evidence; expose concise qualified summaries.
function context(stability={},now=Date.now()){
 const profiles=require('../collection/url-collectors/further-coffee-feedback-parsers.cjs').profiles;
 const all=stability.reviewedIssueSignals||[],rows=all.filter(r=>r.id?.startsWith('further-coffee-feedback-'));
 if(rows.length!==2||all.some(r=>!rows.includes(r)&&['problem_feedback','operator_outage_statement','operator_degradation_statement'].includes(r.kind)))return null;
 const selected=[];
 for(const r of rows){const p=profiles.find(p=>p.url===r.sourceUrl),e=p?.events.find(e=>e.postUrl===r.postUrl&&e.date===r.createdAt&&e.quote===r.quote&&e.summary===r.summary);if(!e||r.kind!=='problem_feedback'||r.literalChecked!==true||!r.sourceIds?.length||r.current!==false||r.independentMeasurement!==false||r.measurementVerified!==false||r.datePrecision!=='day'||r.timeZoneOffset!==null||r.durationMinutes!==null||r.sampleCount!==null||!Number.isFinite(Date.parse(r.createdAt))||Date.parse(r.createdAt)>now-30*86400000)return null;selected.push({date:r.createdAt,text:e.commentId===47309?'访客称节点均不可用，影响范围未核。':'访客称使用一个月后速度不佳，未提供量化测速。'});}
 return{kind:'anonymous_historical_feedback',lastIssueAt:null,signalSummaries:selected.sort((a,b)=>b.date.localeCompare(a.date)).map(r=>r.date+' · '+r.text),description:'两条匿名历史评论，来自同一评测页；日期为页面自标，内容未独立核实，不代表当前故障或长期稳定率。'};
}
module.exports={context};
