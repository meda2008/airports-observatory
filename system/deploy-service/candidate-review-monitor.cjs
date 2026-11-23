'use strict';
const {specs,section}=require('../collection/url-collectors/candidate-review-monitors.cjs');
async function collect({site,browser,sessionDir,beforePage=async()=>{},jobBudgetMs=35000,clock=Date.now,collectPage}={}){
 const config=site.config||site,id=config.recordId||site.id,spec=specs.find(s=>s.recordId===id);
 if(!spec||config.entryUrl!==spec.entryUrl||![new URL(spec.reviewUrl).hostname,new URL(spec.entryUrl).hostname].every(h=>config.allowedHosts.includes(h)))return{captures:[],checkpoint:{type:'review_monitor_scope_mismatch',url:config.entryUrl,stage:'config'},ordersCreated:0,paymentExecuted:false};
 const started=clock(),referenceConfig={...config,entryUrl:spec.reviewUrl,allowedHosts:[new URL(spec.reviewUrl).hostname],adapter:'document_site',readOnlyRecipe:undefined,auth:undefined,publicOnly:true,maxPages:1};
 const reference=await collectPage({id,config:referenceConfig},{browser,sessionDir,beforePage,jobBudgetMs:Math.min(21000,jobBudgetMs),clock,recipes:false});
 const capture=reference.captures.find(c=>c.url===spec.reviewUrl&&!['verification_checkpoint','auth_checkpoint'].includes(c.kind)&&section(c,spec));
 if(!capture)return{...reference,checkpoint:reference.checkpoint||{type:'review_price_layout_changed',url:spec.reviewUrl,stage:'reference_parse',reason:'指定评测页缺少可绑定品牌及有界价格段，未生成报价。'},ordersCreated:0,paymentExecuted:false};
 capture.kind='third_party_review';let entry=null;
 if(clock()-started<jobBudgetMs-1500){const entryConfig={...config,auth:undefined,readOnlyRecipe:undefined,publicOnly:true,maxPages:1,allowedHosts:config.allowedHosts.filter(h=>h!==new URL(spec.reviewUrl).hostname)};entry=await collectPage({id,config:entryConfig},{browser,sessionDir,beforePage,jobBudgetMs:Math.min(11000,Math.max(1000,jobBudgetMs-(clock()-started))),clock,recipes:false});}
 const result={captures:[capture,...(entry?.captures||[])].slice(0,3),checkpoint:null,ordersCreated:0,paymentExecuted:false,startedAt:new Date(started).toISOString(),finishedAt:new Date(clock()).toISOString(),browser:'service_headless',capabilities:{reviewPricing:{status:'bounded_third_party_quote_observed',url:spec.reviewUrl,officialCurrentPriceVerified:false},officialEntry:{status:entry?.checkpoint?'checkpoint':entry?.captures?.length?'entry_material_only':'not_attempted_budget',checkpoint:entry?.checkpoint||null,officialPlansVerified:false},login:{status:'not_attempted_public_read_only'},schedulerScope:{status:'review_monitor_only_not_full_official_collector'}}};
 return result;
}
module.exports={collect};
