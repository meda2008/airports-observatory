'use strict';
const bound=f=>f?.literalChecked===true&&Array.isArray(f.sourceIds)&&f.sourceIds.length>0;
function eligible(f,now=Date.now()){
 if(!bound(f)||f.kind!=='current_candidate_service_message_date'||f.datePrecision!=='second'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(f.date||'')||!Number.isFinite(Date.parse(f.date))||Date.parse(f.date)>now)return false;
 if(f.currentCandidateOnly!==true||f.legacyRecordIdentityVerified!==false||f.currentOperatingServiceIdentityVerified!==false||f.operatorIdentityVerified!==false||f.legacyContinuityVerified!==false||f.legalEntityContinuityVerified!==false||f.continuousOperationVerified!==false||f.independentHistoricalArchiveVerified!==false||f.independentMeasurement!==false||f.measurementVerified!==false)return false;
 if(['foundedAt','claimedFoundedAt','establishedAt','yearsSinceStart','operatingYears','yearsActive','startYear'].some(k=>f[k]!==undefined))return false;
 const p=require('../collection/url-collectors/retained-business-history-parsers.cjs').profiles.find(p=>p.kind===f.kind&&f.id?.includes(p.recordId)&&p.ref.url===f.sourceUrl&&p.selected.date===f.date&&p.selected.postUrl===f.postUrl);
 return !!p&&f.candidateServiceName===p.name&&f.candidateServiceHostname===new URL(p.validationProfile.currentOfficialUrlAtReview).hostname&&f.currentOfficialHostname===f.candidateServiceHostname&&f.observedAt===p.ref.observedAt&&f.sourceOriginalObservedAt===p.ref.observedAt&&f.dateEvidence?.kind==='captured_telegram_time_attribute'&&f.dateEvidence.value===f.date&&f.dateEvidence.postUrl===f.postUrl;
}
function context(f,now){if(!eligible(f,now))return null;return{date:f.date,kind:f.kind,currentCandidateOnly:true,candidateServiceName:f.candidateServiceName,candidateServiceHostname:f.candidateServiceHostname,legacyRecordIdentityVerified:false,label:'当前候选 '+f.candidateServiceName+'：'+f.date.slice(0,4)+'年有频道业务记录',description:'只属于当前候选 '+f.candidateServiceName+'（'+f.candidateServiceHostname+'）的频道业务时间；不证明目录旧品牌的历史或主体延续，不是成立日、最早业务日或连续运营年限。帖子可编辑，未独立核实当年原文。'};}
module.exports={eligible,context};
