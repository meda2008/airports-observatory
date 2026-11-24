'use strict';
// Native citation is useful context; unresolved historical identity stays unresolved.
function context(stability={},now=Date.now()){
 const profiles=require('../collection/url-collectors/continuation-status-parsers.cjs').profiles;
 const reports=(stability.linkedChannelReports||[]).filter(r=>r.kind==='linked_official_channel_issue_claim'&&r.literalChecked===true&&r.sourceIds?.length&&r.current===false&&r.countsAsVerifiedStability===false&&r.currentHistoricalIdentityVerified===false&&r.operatorIdentityVerified===false&&r.measurementVerified===false&&r.independentMeasurement===false&&r.durationMinutes===null&&r.sampleCount===null&&r.measurementWindow===null&&r.counterevidence?.aliasRelationVerified===false&&r.counterevidence?.backlinkCurrentHostMatches===false&&Number.isFinite(Date.parse(r.createdAt))&&Date.parse(r.createdAt)<=now&&Number.isFinite(Date.parse(r.observedAt))&&Date.parse(r.observedAt)<=now&&profiles.some(p=>p.url===r.sourceUrl&&p.currentOfficialUrlAtReview===r.currentOfficialUrlAtReview&&p.channelOfficialLink.url===r.counterevidence.oldOfficialBacklink&&p.events.some(e=>e.permalink===r.postUrl&&e.dateTime===r.createdAt&&e.quote===r.quote&&e.summary===r.summary)));
 if(!reports.length)return null;
 return{kind:'linked_channel_unverified_history',currentServiceAttributionVerified:false,countsAsVerifiedStability:false,statementCount:reports.length,independentSourceCount:1,description:'当前官网所引频道的历史自述；频道旧回链域名与当前域关系未独立核实，不计入当前服务的已核实稳定性或故障率。',signalSummaries:reports.slice().sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)).map(r=>r.createdAt.slice(0,10)+' · '+r.summary)};
}
module.exports={context};
