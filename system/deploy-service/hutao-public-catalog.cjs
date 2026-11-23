'use strict';
function configured(c){return c?.recordId==='A011'&&c.readOnlyRecipe==='hutao_public_catalog_readonly'&&c.entryUrl==='https://hutao.cloud/'&&c.publicOnly===true&&!c.auth;}
async function collect({config,collectPage,beforePage,clock=Date.now,jobBudgetMs=45000}){
 const started=clock(),p=await require('./published-entry-probe.cjs').collect({config:{recordId:'A011',entryUrl:'https://hutaoindex.com/',allowedHosts:['hutaoindex.com'],publicOnly:true,publicPublisherDiscovery:true},beforePage,clock,jobBudgetMs:Math.min(15000,jobBudgetMs)});
 if(p.checkpoint)return p;
 if(!require('../collection/hutao-publisher-contract.cjs').links(p.captures[0]).some(x=>x.url===config.entryUrl))return{...p,checkpoint:{type:'publisher_current_entry_relationship_unverified',url:config.entryUrl,reason:'未确认本轮发布页同时列出旧入口和永久入口，不读取或合并业务字段。'}};
 const result=await collectPage({...config,readOnlyRecipe:'hutao_public_catalog_page_only'},Math.max(1000,jobBudgetMs-(clock()-started)));
 return{...result,captures:[...p.captures,...result.captures],ordersCreated:0,paymentExecuted:false};
}
module.exports={configured,collect};
