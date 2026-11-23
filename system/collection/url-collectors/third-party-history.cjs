'use strict';
const {createHash}=require('node:crypto'),hash=s=>createHash('sha256').update(s).digest('hex');
const contracts=Object.freeze([
 {recordId:'A155',url:'https://jichangnote.com/reviews/weifeng-network/',origin:'https://jichangnote.com'},
 {recordId:'A052',url:'https://www.duyaoss.com/archives/3/',origin:'https://www.duyaoss.com'},
]);
function forOrigin(url,{recordId}={}){const c=contracts.find(c=>c.recordId===recordId&&c.url===url);return c?{origin:c.origin,recordIds:[recordId],fields:['operatingHistory'],extract}:null;}
function sourceTargets(recordId){return contracts.filter(c=>c.recordId===recordId).map(c=>({url:c.url,fields:['operatingHistory'],sourceType:'third_party_history_statement'}));}
function locator(body,quote,start=body.indexOf(quote)){return{kind:'body_utf16_range',start,end:start+quote.length,quoteSha256:hash(quote),bodySha256:hash(body)};}
function kukuOpeningClaim(body){
 // Only this brand's first introduction paragraph, never a neighbouring card,
 // price block, generic stability opinion or the repeated table of contents.
 const headings=[...body.matchAll(/^\d+\.[^\r\n]+$/gm)],matches=[];
 for(let i=0;i<headings.length;i++){
  const head=headings[i];if(!/^\d+\.酷酷云KuKuYun（中转机场）$/.test(head[0]))continue;
  const start=head.index+head[0].length,end=headings[i+1]?.index??body.length,section=body.slice(start,end),first=section.search(/\S/);
  if(first<0)continue;const rest=section.slice(first),paragraphEnd=rest.search(/\r?\n[ \t]*\r?\n/),intro=paragraphEnd<0?rest:rest.slice(0,paragraphEnd);
  const m=/^(\d{4}) 年成立的一家机场(?=[，。]|$)/.exec(intro);
  if(!m||[...intro.matchAll(/\d{4}\s*年(?:成立|开业)/g)].length!==1)continue;
  matches.push({year:m[1],quote:m[0],start:start+first,sectionHeading:head[0],headingStart:head.index,sectionBounds:{start:head.index,end}});
 }
 return matches.length===1?matches[0]:null;
}
function extract(o,{recordId,prior={}}={}){
 if(!forOrigin(o?.url,{recordId})||typeof o?.evidenceId!=='string'||!o.evidenceId.trim())return null;
 const rawBody=typeof o.body==='string'?o.body:typeof o.text==='string'?o.text:'',observedAt=o.observedAt||o.capturedAt;
 if(!rawBody||rawBody.length>4_000_000||typeof observedAt!=='string'||!Number.isFinite(Date.parse(observedAt)))return null;
 if(o.bodySha256&&o.bodySha256!==hash(rawBody)||o.sha256&&o.sha256!==hash(rawBody))return null;
 if(o.passwordForm||o.metadata?.passwordForm||o.verificationWidgetObserved||o.metadata?.verificationWidgetObserved||/checkpoint$/.test(o.kind||''))return null;
 let claim,kind,id,publisher;
 if(recordId==='A155'){
  let body=rawBody;try{const j=JSON.parse(body);if(typeof j.sections?.['s14-risk']==='string')body=j.sections['s14-risk'];}catch{}
  const m=body.match(/由于微风网络已知运营时间始于 (\d{4}) 年/);if(!m||!rawBody.includes(m[0]))return null;
  claim={year:m[1],quote:m[0],start:rawBody.indexOf(m[0])};kind='third_party_operating_since_claim';id='third-party-operating-since-A155-'+claim.year;publisher='机场笔记（jichangnote.com，第三方）';
 }else{
  claim=kukuOpeningClaim(rawBody);if(!claim)return null;
  kind='third_party_opening_claim';id='third-party-opening-year-A052-'+claim.year;publisher='DuyaoSS（www.duyaoss.com，第三方）';
 }
 if(+claim.year<1900||+claim.year>Math.min(new Date().getUTCFullYear(),new Date(observedAt).getUTCFullYear()))return null;
 const old=(prior.coreInfo||prior).operatingHistory||{},items=Array.isArray(old.historyStatements)?old.historyStatements:[];
 if(items.some(f=>f.id===id||f.kind===kind&&f.date===claim.year&&f.sourceUrl===o.url&&f.quote===claim.quote))return null;
 const fact={id,kind,date:claim.year,datePrecision:'year',quote:claim.quote,publisher,literalChecked:true,sourceIds:[o.evidenceId],sourceUrl:o.url,observedAt,bodySha256:hash(rawBody),sourceLocator:locator(rawBody,claim.quote,claim.start),continuousOperationVerified:false,independentHistoricalArchiveVerified:false,limitations:['第三方未给此年份的原始出处；不是官网成立日或已核实成立日期，也不是连续运营年限。','当前可编辑页面的出版或更新日期不能证明这段文字当年已存在；不补写月日或从年份倒算运营时长。']};
 if(claim.sectionHeading){fact.sourceLocator.sectionHeading=locator(rawBody,claim.sectionHeading,claim.headingStart);fact.sourceLocator.sectionBounds=claim.sectionBounds;fact.canonicalSourceGroup='duyaoss:/archives/3/';fact.limitations.push('只归属明确的酷酷云KuKuYun介绍段；未展开短链，不由同名声明证明当前法律主体或历史域名连续性。');}
 return{operatingHistory:{...old,sourceIds:[...new Set([...(Array.isArray(old.sourceIds)?old.sourceIds:[]),...items.flatMap(f=>Array.isArray(f.sourceIds)?f.sourceIds:[]),o.evidenceId])],historyStatements:[...items,fact]}};
}
module.exports={forOrigin,sourceTargets,extract};
