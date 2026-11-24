'use strict';
// Keep older round tests focused on their own admission. The same immutable
// announcements and test originals now also have separately source-reviewed dates.
// Seed those exact later facts as existing data; do not relax append-only or
// unrelated-field assertions in the older tests.
const businessDates=require('../../work/performance-20261112-sixteenth/reference-manifest.json').entries.filter(e=>e.collection==='historyStatements');
const performanceTestDates=require('../../work/performance-20261112-seventeenth/retained-performance-history-entries.json').entries;
const later=[...businessDates,...performanceTestDates];
function seedHistory(document,recordId,candidates){const out=structuredClone(document),rows=candidates.filter(e=>e.siteId===recordId);if(!rows.length)return out;const h=out.operatingHistory||{},old=h.historyStatements||[],fresh=rows.filter(e=>!old.some(f=>f.id===e.fact.id)).map(e=>({...structuredClone(e.fact),sourceIds:['source-reviewed-later-business-date-fixture']}));out.operatingHistory={...h,historyStatements:[...old,...fresh],sourceIds:[...new Set([...(h.sourceIds||[]),...fresh.flatMap(f=>f.sourceIds)])]};return out;}
const withReviewedBusinessHistory=(document,recordId)=>seedHistory(document,recordId,later);
const withReviewedPerformanceTestHistory=(document,recordId)=>seedHistory(document,recordId,performanceTestDates);
module.exports={withReviewedBusinessHistory,withReviewedPerformanceTestHistory};
