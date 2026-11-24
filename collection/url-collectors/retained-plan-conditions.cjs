'use strict';
// Preserve prior condition provenance when a new price card is observed.
// Historical terms remain historical; a price refresh does not reverify them.
const crypto=require('node:crypto');
const unique=values=>[...new Set(values.filter(v=>typeof v==='string'&&v.trim()))];
const copy=value=>value===undefined?undefined:structuredClone(value);
const time=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?value:null;
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
const fingerprint=value=>crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const contractFields=['terms','additionalCharges','deviceLimit','maxDevices'];
function sourceIdsIn(value){if(!value||typeof value!=='object')return[];if(Array.isArray(value))return unique(value.flatMap(sourceIdsIn));return unique([...(Array.isArray(value.sourceIds)?value.sourceIds:[]),...(typeof value.sourceId==='string'?[value.sourceId]:[]),...Object.entries(value).filter(([key])=>!['sourceIds','sourceId','sourceObservations','sourceRefs'].includes(key)).flatMap(([,child])=>sourceIdsIn(child))]);}
function referenceIndex(sourceRefs){
 if(sourceRefs instanceof Map)return new Map(sourceRefs);
 if(Array.isArray(sourceRefs))return new Map(sourceRefs.filter(r=>r&&typeof r==='object').map(r=>[r.sourceId||r.id||r.source_id,r]).filter(([id])=>typeof id==='string'));
 return new Map(sourceRefs&&typeof sourceRefs==='object'?Object.entries(sourceRefs):[]);
}
function sourceObservations(ids,refs,existing=[]){
 const old=new Map((Array.isArray(existing)?existing:[]).map(r=>[r.sourceId,r]));
 return unique(ids).map(sourceId=>{
  const ref=refs.has(sourceId)?refs.get(sourceId):old.get(sourceId),raw=typeof ref==='string'?ref:ref&&typeof ref==='object'?Object.hasOwn(ref,'sourceObservedAt')?ref.sourceObservedAt:ref.observedAt??ref.capturedAt??ref.last_capture_at:null;
  // A missing source time remains null, even when the old plan has a date.
  return{sourceId,observedAt:time(raw),url:typeof ref?.url==='string'?ref.url:null,sha256:typeof ref?.sha256==='string'?ref.sha256:null};
 });
}
function decorateOldFees(value,ids,refs,existing=[]){
 if(Array.isArray(value))return value.map(v=>decorateOldFees(v,ids,refs,existing));
 if(!value||typeof value!=='object')return copy(value);
 const ownIds=sourceIdsIn(value),sources=ownIds.length?ownIds:ids;
 return{...copy(value),observedAt:time(value.observedAt),sourceIds:unique(sources),sourceObservations:sourceObservations(sources,refs,value.sourceObservations||existing),historical:true,reverifiedThisObservation:false};
}
function preserveContractFields(previous,current,refs){
 const retained=previous.retainedContractFields&&typeof previous.retainedContractFields==='object'?copy(previous.retainedContractFields):{},fields={};
 for(const field of contractFields){
  // Explicit null, zero, false and empty collections are current values.
  if(current[field]!==undefined||previous[field]===undefined)continue;
  const oldValue=previous[field],cached=retained[field],same=cached?.retainedValueSha256===fingerprint(oldValue),original=same?copy(cached.value):copy(oldValue),nestedIds=sourceIdsIn(original),ids=same?unique(cached.sourceIds||[]):nestedIds.length?nestedIds:unique(previous.sourceIds||[]),observations=sourceObservations(ids,refs,same?cached.sourceObservations:[]),value=field==='additionalCharges'?decorateOldFees(original,ids,refs,observations):copy(original);
  fields[field]=value;
  const ownTime=original&&typeof original==='object'&&!Array.isArray(original)?time(original.observedAt):null;
  const metadata={value:original,observedAt:ownTime,sourceIds:ids,sourceObservations:observations,priorPlanObservedAt:same?cached.priorPlanObservedAt??null:time(previous.observedAt),historical:true,reverifiedThisObservation:false,basis:'retained_prior_plan_contract_field',retainedValueSha256:fingerprint(value)};
  if(same){if(cached.previousVersions)metadata.previousVersions=copy(cached.previousVersions);}
  else if(cached){const {previousVersions,...priorVersion}=cached;metadata.previousVersions=[...(previousVersions||[]),priorVersion];}
  retained[field]=metadata;
 }
 return{fields,retained};
}
function preservePlanConditions(previous,current,{sourceRefs}={}){
 if(!previous)return current;
 const refs=referenceIndex(sourceRefs),history=Array.isArray(previous.retainedConditionEvidence)?copy(previous.retainedConditionEvidence):[],oldRestrictions=unique(previous.restrictions||[]),newRestrictions=unique(current.restrictions||[]),known=new Set(history.flatMap(e=>e.restrictions||[]));
 const archived=oldRestrictions.filter(r=>!known.has(r)&&!newRestrictions.includes(r));
 if(archived.length)history.push({restrictions:archived,observedAt:previous.observedAt||null,sourceIds:unique(previous.sourceIds||[]),...(previous.sourceUrl?{sourceUrl:previous.sourceUrl}:{}),basis:'retained_prior_plan_condition_metadata',reverifiedThisObservation:false});
 for(const entry of history){entry.sourceObservations=sourceObservations(entry.sourceIds||[],refs,entry.sourceObservations);entry.historical=true;}
 const oldQuota=previous.retainedQuotaResetStatement,quotaText=oldQuota&&typeof (oldQuota.statement||oldQuota.summary)==='string'?(oldQuota.statement||oldQuota.summary):null,currentQuotaStatement=typeof current.quotaReset==='string'&&current.quotaReset.trim()?current.quotaReset:null,previousQuotaStatement=Object.hasOwn(previous,'currentQuotaResetStatement')?previous.currentQuotaResetStatement===currentQuotaStatement?null:previous.currentQuotaResetStatement:previous.quotaReset;
 const quota=quotaText?{...copy(oldQuota),statement:quotaText,observedAt:time(oldQuota.observedAt),sourceIds:unique(oldQuota.sourceIds||[])}:typeof previousQuotaStatement==='string'&&previousQuotaStatement?{statement:previousQuotaStatement,observedAt:time(previous.observedAt),sourceIds:unique(previous.sourceIds||[]),...(previous.sourceUrl?{sourceUrl:previous.sourceUrl}:{}),basis:'retained_prior_plan_quota_reset_metadata',reverifiedThisObservation:false}:null;
 if(quota){quota.sourceObservations=sourceObservations(quota.sourceIds,refs,quota.sourceObservations);quota.historical=true;quota.reverifiedThisObservation=false;}
 const conditionConflicts=unique(history.flatMap(e=>e.restrictions||[]).filter(r=>/冲突|叠加|重置|覆盖/.test(r))),dates=unique([quota?.observedAt,...history.map(e=>e.observedAt)]),conflict=conditionConflicts.length?' 历史条件冲突/限制：'+conditionConflicts.join(' '):'',currentQuota=typeof current.quotaReset==='string'&&current.quotaReset.trim()?current.quotaReset:'本次价卡未提供新的流量重置规则。';
 const visibleQuota=quota?'当前价卡原时点声明：'+currentQuota+' 历史规则（原观察 '+(quota.observedAt||'日期缺失')+'，本轮未重验）：'+quota.statement+conflict+' 实际续费、叠加与重置规则未确认。':currentQuota;
 const contracts=preserveContractFields(previous,current,refs),contractIds=sourceIdsIn(contracts.retained);
 return{...current,...contracts.fields,name:previous.name||current.name,currentPriceSourceIds:unique(current.currentPriceSourceIds||current.sourceIds||[]),sourceIds:unique([...(current.sourceIds||[]),...(previous.sourceIds||[]),...history.flatMap(e=>e.sourceIds||[]),...(quota?.sourceIds||[]),...contractIds]),restrictions:unique([...oldRestrictions,...newRestrictions]),...(history.length?{retainedConditionEvidence:history}:{}),...(quota?{retainedQuotaResetStatement:quota}:{}),...(Object.keys(contracts.retained).length?{retainedContractFields:contracts.retained}:{}),quotaReset:visibleQuota,currentQuotaResetStatement:currentQuotaStatement,...(dates.length?{retainedConditionDates:dates}:{}),retainedConditionsReverified:false};
}
function retainedConditionSourceIds(plans,currentId){return unique([currentId,...plans.flatMap(p=>[...(p.retainedConditionEvidence||[]).flatMap(e=>e.sourceIds||[]),...(p.retainedQuotaResetStatement?.sourceIds||[]),...sourceIdsIn(p.retainedContractFields)])]);}
module.exports={preservePlanConditions,retainedConditionSourceIds};
