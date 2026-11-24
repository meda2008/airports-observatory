'use strict';
function eligible(f,now=Date.now()){
 if(f.kind!=='operator_historical_test_statement_date'||f.literalChecked!==true||!f.sourceIds?.length||f.datePrecision!=='day'||!/^\d{4}-\d{2}-\d{2}$/.test(f.date)||!Number.isFinite(Date.parse(f.date))||Date.parse(f.date)>now)return false;
 if(['continuousOperationVerified','independentHistoricalArchiveVerified','operatorIdentityVerified','historicalIdentityVerified','legalEntityContinuityVerified','independentMeasurement','measurementVerified'].some(k=>f[k]!==false)||['foundedAt','establishedAt','yearsSinceStart','operatingYears','yearsActive','claimedFoundedAt','startYear'].some(k=>f[k]!==undefined))return false;
 const p=require('../collection/url-collectors/retained-performance-history-parsers.cjs').profiles.find(p=>p.kind===f.kind&&p.ref.url===f.sourceUrl&&p.selected.date===f.date&&p.currentOfficialUrlAtReview===f.currentOfficialUrlAtReview);
 return!!p&&f.observedAt===p.ref.observedAt&&f.sourceOriginalObservedAt===p.ref.observedAt&&f.dateEvidence?.kind==='operator_test_window_literal'&&f.dateEvidence.value===f.date&&f.dateEvidence.quote===p.selected.dateQuote&&Number.isFinite(Date.parse(f.dateEvidence.windowStart))&&Date.parse(f.dateEvidence.windowStart)<=Date.parse(f.dateEvidence.windowEnd)&&Date.parse(f.dateEvidence.windowEnd)<=now;
}
module.exports={eligible};
