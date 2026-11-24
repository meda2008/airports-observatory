'use strict';
const crypto=require('node:crypto');
const specs=require('../review-monitors.json').sites;
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function profile(recordId,url){return specs.find(s=>s.recordId===recordId&&s.reviewUrl===url);}
function section(source,spec){
 const body=source.body||source.text||'';if(!body.toLowerCase().includes(spec.brand.toLowerCase())||!Number.isFinite(Date.parse(source.observedAt||source.capturedAt)))return null;
 let quote;
 if(spec.priceSection){const start=body.indexOf(spec.priceSection),end=body.indexOf(spec.priceEnd,start);if(start<0||end<=start)return null;quote=body.slice(start,end).trim();}
 else{const lines=body.split('\n'),rows=lines.map((text,n)=>({text,n})).filter(x=>x.text.includes('\t')&&/[¥￥]/.test(x.text));if(!rows.length)return null;quote=lines.slice(Math.max(0,rows[0].n-1),rows.at(-1).n+1).join('\n').trim();}
 if(!quote||quote.length>10000||!/[¥￥]\s*\d/.test(quote))return null;
 const dates=[...body.slice(0,2000).matchAll(/\b(20\d{2})[-.](\d{2})[-.](\d{2})/g)].map(m=>({raw:m[0],iso:m[1]+'-'+m[2]+'-'+m[3]})).filter(x=>Number.isFinite(Date.parse(x.iso)));
 return{quote,start:body.indexOf(quote),publishedAt:dates[0]?.iso||null,pageUpdatedAt:dates[1]?.iso||null,publisherDateQuote:dates.map(x=>x.raw).join(' / ')||null};
}
function extract(source,{recordId,prior={}}={}){
 const spec=profile(recordId,source.url);if(!spec||['verification_checkpoint','auth_checkpoint','public_performance_reference'].includes(source.kind))return null;
 const part=section(source,spec);if(!part||!source.evidenceId)return null;
 const core=prior.coreInfo||prior,old=core.pricing||{},previous=(old.externalReports||[]).find(r=>r.id==='review-price-'+recordId);
 // Matching evidence is still retained by the queue; identical quotes do not
 // manufacture new business revisions or refresh an older quote's capture date.
 if(previous?.quote===part.quote&&previous.publishedAt===part.publishedAt)return null;
 const report={...previous,id:'review-price-'+recordId,status:'unverified_third_party_price',publisher:source.url.includes('ermao.net')?'二毛（ermao.net）':'润土分享（runtushare.net）',sourceUrl:source.url,summary:part.quote,quote:part.quote,publishedAt:part.publishedAt,pageUpdatedAt:part.pageUpdatedAt,publisherDateQuote:part.publisherDateQuote,observedAt:source.observedAt||source.capturedAt,sourceIds:[source.evidenceId],sourceLocator:{kind:'body_utf16_range',start:part.start,end:part.start+part.quote.length},bodySha256:hash(source.body||source.text),officialCurrentPriceVerified:false,checkoutVerified:false,independenceVerified:false,independenceGroup:new URL(source.url).hostname,affiliateDisclosure:'review_site_referral_links_present_not_user_owned',identityLimitation:'评测文章与同名入口的引用关系已观察；未核实法律主体、连续经营和当前交付。',freshnessLimitation:'第三方参考资料，不代表当前官网价格；页面日期与本次采集时间分别保留。'};
 return{pricing:{...old,plans:old.plans||[],status:old.status||'not_confirmed',externalReports:[...(old.externalReports||[]).filter(r=>r.id!==report.id),report],sourceIds:[...new Set([...(old.sourceIds||[]),source.evidenceId])]}};
}
const parsers=specs.map(s=>({origin:new URL(s.reviewUrl).origin,recordIds:[s.recordId],fields:['pricing'],extract}));
module.exports={specs,profile,section,extract,parsers};
