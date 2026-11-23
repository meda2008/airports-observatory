'use strict';
// Preserve the earlier round's asserted delta when replaying a page that now
// also has a later separately reviewed reference. Seed only that exact fact.
function withRound19ReviewedFeedback(document,id){const core=structuredClone(document);if(id!=='A037')return core;const entry=require('../../work/performance-20261112-nineteenth/reference-manifest.json').entries.find(e=>e.siteId===id&&e.fact.id==='round19-feedback-A037-52578');if(!entry)throw Error('Exact later reviewed feedback fixture missing');const old=core.stability||{},rows=old.reviewedIssueSignals||[];if(!rows.some(r=>r.id===entry.fact.id))core.stability={...old,reviewedIssueSignals:[...rows,{...structuredClone(entry.fact),sourceIds:['ROUND19-REVIEWED-FIXTURE']} ]};return core;}
module.exports={withRound19ReviewedFeedback};
