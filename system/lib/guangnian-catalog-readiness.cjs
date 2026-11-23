'use strict';
const origin='https://vv3dbvb.guangnianertt1.homes';
async function settle(page,config,{proof,deadline,clock=Date.now,beforePage=async()=>{}}={}){
 if(config?.recordId!=='A148'||config.entryUrl!==origin+'/#/plans'||config.readOnlyRecipe!=='guangnian_authenticated_catalog_readonly'||config.auth?.mode!=='login'||config.publicOnly||proof?.observed!==true||proof.endpoint!==origin+'/api/v1/user/info')return{status:'not_applicable',waits:0};
 if(new URL(page.url()).origin!==origin)return{status:'origin_changed',waits:0};const initialTitle=await page.title();if(initialTitle!=='loading...')return{status:initialTitle==='光年梯'?'already_ready':'unexpected_title',initialTitle,finalTitle:initialTitle,waits:0};
 const until=Math.min(Number.isFinite(deadline)?deadline-1500:clock()+4000,clock()+4000);let waits=0,finalTitle=initialTitle;while(clock()<until&&finalTitle==='loading...'){await beforePage();if(new URL(page.url()).origin!==origin)return{status:'origin_changed',initialTitle,waits};await page.waitForTimeout(Math.min(200,Math.max(1,until-clock())));waits++;finalTitle=await page.title();}
 return{status:finalTitle==='光年梯'?'brand_title_ready_after_native_account':'brand_title_not_ready',initialTitle,finalTitle,waits,titleOverwritten:false,accountReauthenticated:false};
}
module.exports={origin,settle};
