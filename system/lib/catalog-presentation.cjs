'use strict';
// User-requested display preference only. This never merges records or prices.
function presentationFor(row,all){
 if(row.id!=='A082'||row.coreInfo?.pricing?.plans?.length)return null;
 const hint=row.coreInfo?.pricing?.relatedCandidates?.find(r=>r.recordId==='A070'&&r.identityVerified===false&&r.officialCurrentPriceVerified===false),target=all.find(r=>r.id==='A070');
 if(!hint||!target||!target.primary||!target.coreInfo?.pricing?.plans?.some(p=>Number.isFinite(p.amount)&&p.amount>0&&p.soldOut!==true))return null;
 return{kind:'priced_related_record_preferred',preferredRecordId:target.id,preferredRecordName:target.name,relationshipVerified:false,legacyLabel:'旧记录 · 归属待核',headline:'同名新站套餐已采集',message:'A070 已有套餐报价。A082 为旧入口记录，与 A070 的归属关系仍待核实；两条记录的证据分别保留。'};
}
function preferredRows(rows,all){const presentIds=new Set(rows.map(r=>r.id)),hidden=rows.filter(r=>{const p=presentationFor(r,all);return p&&presentIds.has(p.preferredRecordId);});const ids=new Set(hidden.map(r=>r.id));return{rows:rows.filter(r=>!ids.has(r.id)),hiddenRelatedRecords:hidden.length};}
function displayNameFor(row){return row.id==='A063'&&row.coreInfo?.pricing?.identityScope==='current_Forest_candidate_only_not_Nutbit_identity_confirmation'&&row.coreInfo.pricing.plans?.some(p=>p.name?.startsWith('Forest · '))?'Forest（独立候选）':row.name;}
module.exports={presentationFor,preferredRows,displayNameFor};
