'use strict';
// Explicitly unresolved third-party claims belong in the candidate appendix.
// They never establish the current service's founding date or operating age.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const hash=s=>createHash('sha256').update(s).digest('hex');
const configPath=path.join(__dirname,'unresolved-history-profiles.json');
const BASE_LIMITATIONS=Object.freeze([
 '仅为第三方对旧名称或历史候选的年份声明，旧候选与当前服务归属尚未核实。',
 '不能据此确认当前经营主体、成立日、持续运营或前台运营年限；不补造月份与日期。',
 '本次仅核对保留页面文字，未取得对应年份的原始官方页面或独立不可变历史档案。',
]);
function canonical(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&u.href===value?u.href:null;}catch{return null;}}
function normalizeProfiles(config){const rows=Array.isArray(config)?config:config?.profiles;return(Array.isArray(rows)?rows:[]).flatMap(p=>{
 const year=String(p?.year),quote=p?.quote,claimSubject=p?.claimSubject;
 if(!/^A\d{3}$/.test(p?.recordId||'')||!canonical(p?.url)||!/^\d{4}$/.test(year)||typeof quote!=='string'||!quote.trim()||quote.length>10000||typeof claimSubject!=='string'||!claimSubject.trim()||!quote.includes(claimSubject)||!Array.isArray(p.limitations)||!p.limitations.length||p.limitations.some(l=>typeof l!=='string'||!l.trim()))return[];
 if(!new RegExp('(?:^|[^\\d])'+year+'(?:[^\\d]|$)').test(quote))return[];
 return[{recordId:p.recordId,url:p.url,quote,year,claimSubject,limitations:[...p.limitations]}];
});}
function loadProfiles(){try{return normalizeProfiles(JSON.parse(fs.readFileSync(configPath,'utf8')));}catch{return[];}}
function validClock(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)||!Number.isFinite(Date.parse(value)))return false;const date=value.slice(0,10),parsed=new Date(date+'T00:00:00Z');return Number.isFinite(parsed.valueOf())&&parsed.toISOString().slice(0,10)===date;}
function createParser(config){
 const profiles=normalizeProfiles(config);
 function matches(url,recordId){const value=canonical(url);if(!value)return[];return profiles.filter(p=>p.recordId===recordId&&p.url===value);}
 function forOrigin(url,{recordId}={}){return matches(url,recordId).length?{origin:new URL(url).origin,recordIds:[recordId],fields:['operatingHistory'],parserKind:'explicit_identity_unresolved_third_party_year_claim_v1',extract}:null;}
 function sourceTargets(recordId){return[...new Set(profiles.filter(p=>p.recordId===recordId).map(p=>p.url))].map(url=>({url,fields:['operatingHistory'],sourceType:'identity_unresolved_third_party_history'}));}
 function diagnose(o,{recordId}={}){
  const rows=matches(o?.url,recordId),body=typeof o?.body==='string'?o.body:typeof o?.text==='string'?o.text:'',observedAt=o?.observedAt||o?.capturedAt,reasons=[];
  if(!rows.length)reasons.push('record_and_exact_public_source_not_configured');
  if(!body||body.length>4_000_000)reasons.push('original_visible_body_required');
  if(typeof o?.evidenceId!=='string'||!o.evidenceId.trim())reasons.push('current_capture_evidence_id_required');
  if(!validClock(observedAt))reasons.push('valid_original_capture_clock_required');
  if((o?.sha256&&o.sha256!==hash(body))||(o?.bodySha256&&o.bodySha256!==hash(body)))reasons.push('capture_body_hash_mismatch');
  if(o?.passwordForm||o?.verificationWidgetObserved||o?.metadata?.passwordForm||o?.metadata?.verificationWidgetObserved||/checkpoint$/.test(o?.kind||''))reasons.push('authentication_or_verification_checkpoint');
  if(reasons.length)return{accepted:false,status:'rejected',manualReviewRequired:false,reasons,facts:[]};
  const facts=[],rejected=[];
  for(const profile of rows){
   const parsedYear=new Date(profile.year+'-01-01T00:00:00Z');
   if(!Number.isFinite(parsedYear.valueOf())||parsedYear.toISOString().slice(0,4)!==profile.year||Number(profile.year)>Number(observedAt.slice(0,4))){rejected.push({reason:'configured_year_invalid_or_after_capture',claimSubject:profile.claimSubject});continue;}
   if(!body.includes(profile.quote)){rejected.push({reason:'configured_historical_literal_changed_requires_manual_review',claimSubject:profile.claimSubject});continue;}
   if(!profile.quote.includes(profile.claimSubject)||!new RegExp('(?:^|[^\\d])'+profile.year+'(?:[^\\d]|$)').test(profile.quote)){rejected.push({reason:'configured_subject_or_year_not_bound_to_quote',claimSubject:profile.claimSubject});continue;}
   const start=body.indexOf(profile.quote),signature=hash(profile.url+'\n'+profile.year+'\n'+profile.quote);
   facts.push({id:'unresolved-year-'+recordId+'-'+signature.slice(0,16),kind:'identity_unresolved_third_party_year_claim',status:'identity_unresolved',date:profile.year,datePrecision:'year',claimSubject:profile.claimSubject,quote:profile.quote,
    identityVerified:false,currentOperatingServiceIdentityVerified:false,continuousOperationVerified:false,literalChecked:true,sourceIds:[o.evidenceId],sourceUrl:profile.url,observedAt,bodySha256:hash(body),sourceLocator:{kind:'body_utf16_range',start,end:start+profile.quote.length,quoteSha256:hash(profile.quote),bodySha256:hash(body)},
    limitations:[...new Set([...BASE_LIMITATIONS,...profile.limitations])],contentSignature:signature});
  }
  // A changed configured statement cannot be silently replaced by a nearby
  // year or partially accepted as though the whole configured page matched.
  if(rejected.length)return{accepted:false,status:'pending_manual_review',manualReviewRequired:true,reasons:[...new Set(rejected.map(r=>r.reason))],rejected,facts:[]};
  return{accepted:facts.length>0,status:'unresolved_candidate_only',manualReviewRequired:false,reasons:[],facts};
 }
 function extract(o,{recordId,prior={}}={}){
  const d=diagnose(o,{recordId});if(!d.accepted)return null;const old=(prior.coreInfo||prior).operatingHistory||{},items=Array.isArray(old.historicalClaims)?old.historicalClaims:[],added=d.facts.filter(f=>!items.some(v=>v.id===f.id||v.sourceUrl===f.sourceUrl&&v.date===f.date&&v.quote===f.quote));if(!added.length)return null;
  return{operatingHistory:{...old,historicalClaims:[...items,...added],sourceIds:[...new Set([...(Array.isArray(old.sourceIds)?old.sourceIds:[]),...items.flatMap(v=>Array.isArray(v.sourceIds)?v.sourceIds:[]),...added.flatMap(v=>v.sourceIds)])]}};
 }
 return{profiles,forOrigin,sourceTargets,diagnose,extract};
}
const exported={createParser,loadProfiles,forOrigin:(...args)=>createParser(loadProfiles()).forOrigin(...args),sourceTargets:(...args)=>createParser(loadProfiles()).sourceTargets(...args),diagnose:(...args)=>createParser(loadProfiles()).diagnose(...args),extract:(...args)=>createParser(loadProfiles()).extract(...args)};
Object.defineProperty(exported,'profiles',{enumerable:true,get:loadProfiles});
module.exports=exported;
