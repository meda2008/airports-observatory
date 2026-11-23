'use strict';
// A platform message date is an earliest observed service-related statement,
// not an establishment date or proof of continuous operation.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const hash=s=>createHash('sha256').update(s).digest('hex');
const configPath=path.join(__dirname,'telegram-history-profiles.json');
function publicOrigin(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.pathname==='/'&&!u.search&&!u.hash?u.origin:null;}catch{return null;}}
function normalizeProfiles(value){const rows=Array.isArray(value)?value:value?.profiles;return(Array.isArray(rows)?rows:[]).flatMap(p=>{
  if(!/^A\d{3}$/.test(p?.recordId||'')||!/^[A-Za-z0-9_]{3,64}$/.test(p?.channel||'')||!Array.isArray(p.aliases)||!p.aliases.length||p.aliases.some(a=>typeof a!=='string'||!a.trim())||!Array.isArray(p.officialOrigins)||!p.officialOrigins.length)return[];
  const officialOrigins=p.officialOrigins.map(publicOrigin);if(officialOrigins.some(o=>!o))return[];
  return[{recordId:p.recordId,channel:p.channel,aliases:[...p.aliases],officialOrigins:[...new Set(officialOrigins)]}];
});}
function loadProfiles(){try{return normalizeProfiles(JSON.parse(fs.readFileSync(configPath,'utf8')));}catch{return[];}}
function fullDateTime(value){
  const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(value||'');if(!m)return false;
  const n=m.slice(1,7).map(Number),d=new Date(Date.UTC(n[0],n[1]-1,n[2],n[3],n[4],n[5]));
  if(d.getUTCFullYear()!==n[0]||d.getUTCMonth()+1!==n[1]||d.getUTCDate()!==n[2]||d.getUTCHours()!==n[3]||d.getUTCMinutes()!==n[4]||d.getUTCSeconds()!==n[5])return false;
  return(!m[7]||Number(m[8])<14&&Number(m[9])<60||Number(m[8])===14&&Number(m[9])===0)&&Number.isFinite(Date.parse(value));
}
const serviceTerms=/套餐|订阅|节点|线路|流量|带宽|价格|支付|元\/月|服务|开业|开张|试用|会员|商品|折扣|优惠|退款|充值|续费|购买|开通|维护|故障|恢复/;
const concreteService=/套餐|订阅|流量|价格|支付|元\/月|折扣|优惠|退款|购买|开业|开张|开通|续费/;
function serviceRelated(text){if(!serviceTerms.test(text))return false;if(/服务更新会在本频道发布/.test(text)&&!concreteService.test(text))return false;if(/channel created|group created|创建(?:了)?(?:本|此)?(?:群组|群聊|频道)|(?:群组|群聊|频道)(?:已)?创建|建群|copyright|版权所有|©/i.test(text)&&!concreteService.test(text))return false;return true;}
function createParser(config){
  const profiles=normalizeProfiles(config);
  function match(url,recordId,{post=false}={}){let u;try{u=new URL(url);}catch{return null;}if(u.origin!=='https://t.me'||u.username||u.password||u.port||u.hash)return null;const m=(post?/^\/([A-Za-z0-9_]+)\/([1-9]\d*)$/:/^\/s\/([A-Za-z0-9_]+)\/?$/).exec(u.pathname);if(!m||post&&u.search||!post&&u.search&&u.search!=='?before=20')return null;const matches=profiles.filter(p=>p.recordId===recordId&&p.channel.toLowerCase()===m[1].toLowerCase());return matches.length===1?{profile:matches[0],postNumber:post?Number(m[2]):null,url:u.href}:null;}
  function forOrigin(url,{recordId}={}){const m=match(url,recordId);return m?{origin:'https://t.me',recordIds:[recordId],channel:m.profile.channel,fields:['operatingHistory'],parserKind:'configured_official_telegram_message_history_v1',extract}:null;}
  function sourceTargets(recordId,prior={},options={}){
    const history=(prior.coreInfo||prior).operatingHistory||{},hasStatements=Array.isArray(history.historyStatements)&&history.historyStatements.length>0;
    return profiles.filter(p=>p.recordId===recordId).map(p=>({url:'https://t.me/s/'+p.channel+(!hasStatements||options.findEarlier===true?'?before=20':''),fields:['operatingHistory'],sourceType:'operator_statement',purpose:!hasStatements||options.findEarlier===true?'earliest_service_message_search':'latest_channel_observation'}));
  }
  function diagnose(o,{recordId}={}){
    const route=match(o?.url,recordId),body=typeof o?.body==='string'?o.body:typeof o?.text==='string'?o.text:'',observedAt=o?.observedAt||o?.capturedAt,reasons=[];
    if(!route)reasons.push('record_channel_or_public_history_route_not_configured');
    if(!body||body.length>4_000_000)reasons.push('original_visible_body_required');
    if(typeof o?.evidenceId!=='string'||!o.evidenceId.trim())reasons.push('current_capture_evidence_id_required');
    if(typeof observedAt!=='string'||!Number.isFinite(Date.parse(observedAt)))reasons.push('original_observed_at_required');
    if((o?.bodySha256&&o.bodySha256!==hash(body))||(o?.sha256&&o.sha256!==hash(body)))reasons.push('capture_body_hash_mismatch');
    if(o?.passwordForm||o?.metadata?.passwordForm||o?.verificationWidgetObserved||o?.metadata?.verificationWidgetObserved||/checkpoint$/.test(o?.kind||''))reasons.push('authentication_or_verification_checkpoint');
    const metadata=o?.metadata?.timeMetadata??o?.timeMetadata;
    if(!Array.isArray(metadata)||!metadata.length)reasons.push('same_post_text_permalink_and_full_datetime_metadata_required');
    if(reasons.length)return{accepted:false,reasons,rejected:[],facts:[]};
    const candidates=[],rejected=[];
    for(const item of metadata.slice(0,100)){
      const permalink=item?.permalink,stamp=item?.dateTime,text=item?.postText;
      const post=match(permalink,recordId,{post:true});
      const reject=reason=>rejected.push({permalink:post?permalink:null,reason});
      if(!post||post.profile.channel.toLowerCase()!==route.profile.channel.toLowerCase()){reject('same_record_channel_permalink_required');continue;}
      if(o.url.includes('?before=20')&&post.postNumber>=20){reject('early_page_message_number_outside_before_bound');continue;}
      if(!fullDateTime(stamp)||Date.parse(stamp)>Date.parse(observedAt)){reject('explicit_valid_full_message_datetime_required');continue;}
      if(typeof text!=='string'||!text.trim()||text.length>2000||!body.includes(text)){reject('same_post_literal_not_bound_to_original_body');continue;}
      if(!serviceRelated(text)){reject('non_service_creation_copyright_or_chat_message');continue;}
      const brandText=text.replace(/https?:\/\/[^\s<>"“”）)]+/g,' ');
      const brand=route.profile.aliases.some(a=>/^[A-Za-z0-9_ -]+$/.test(a)?new RegExp('(?<![A-Za-z0-9_])'+a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![A-Za-z0-9_])','i').test(brandText):brandText.includes(a));
      const urls=[...text.matchAll(/https:\/\/[^\s<>"“”）)]+/g)].flatMap(m=>{try{return[new URL(m[0]).origin];}catch{return[];}});
      if(!brand&&!urls.some(origin=>route.profile.officialOrigins.includes(origin))){reject('same_post_brand_or_registered_official_origin_required');continue;}
      const start=body.indexOf(text);candidates.push({kind:'platform_message_date',id:'telegram-service-message-'+recordId+'-'+route.profile.channel.toLowerCase()+'-'+post.postNumber,date:stamp,quote:text,postUrl:permalink,sourceIds:[o.evidenceId],sourceUrl:o.url,observedAt,bodySha256:hash(body),sourceLocator:{kind:'body_utf16_range',start,end:start+text.length,quoteSha256:hash(text)},literalChecked:true,continuousOperationVerified:false,independentHistoricalArchiveVerified:false,canonicalSourceGroup:'telegram:'+route.profile.channel.toLowerCase(),identityQualification:'configured_official_channel_binding',limitations:['这是官方绑定频道现存业务消息的平台时间，不是成立日；更早消息可能被删除。','Telegram消息保存后可以编辑；本次仅绑定当前可见文字和同帖完整datetime，未独立验证当年原文或持续运营。']});
    }
    // Conflicting timestamps for the same post cannot be resolved from this
    // capture. Retain a diagnostic instead of arbitrarily taking one timestamp.
    const conflicts=new Set(candidates.filter(c=>candidates.some(v=>v.postUrl===c.postUrl&&(v.date!==c.date||v.quote!==c.quote))).map(c=>c.postUrl));
    for(const url of conflicts)rejected.push({permalink:url,reason:'same_post_metadata_conflict'});
    const qualified=candidates.filter(c=>!conflicts.has(c.postUrl)).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
    return{accepted:qualified.length>0,reasons:qualified.length?[]:['no_qualified_service_message_with_full_datetime'],rejected,facts:qualified.length?[qualified[0]]:[]};
  }
  function extract(o,{recordId,prior={}}={}){
    const d=diagnose(o,{recordId});if(!d.accepted)return null;const fact=d.facts[0],old=(prior.coreInfo||prior).operatingHistory||{},items=Array.isArray(old.historyStatements)?old.historyStatements:[];
    if(items.some(v=>v.kind==='platform_message_date'&&Number.isFinite(Date.parse(v.date))&&Date.parse(v.date)<=Date.parse(fact.date)))return null;
    return{operatingHistory:{...old,sourceIds:[...new Set([...(Array.isArray(old.sourceIds)?old.sourceIds:[]),...items.flatMap(v=>Array.isArray(v.sourceIds)?v.sourceIds:[]),o.evidenceId])],historyStatements:[...items,fact]}};
  }
  return{profiles,forOrigin,sourceTargets,diagnose,extract};
}
const exported={createParser,loadProfiles,forOrigin:(...args)=>createParser(loadProfiles()).forOrigin(...args),sourceTargets:(...args)=>createParser(loadProfiles()).sourceTargets(...args),diagnose:(...args)=>createParser(loadProfiles()).diagnose(...args),extract:(...args)=>createParser(loadProfiles()).extract(...args)};
Object.defineProperty(exported,'profiles',{enumerable:true,get:loadProfiles});
module.exports=exported;
