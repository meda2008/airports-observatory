'use strict';
const specs={wancheng_signup_preview:{siteId:'A031',origin:'https://user.dowancheng.com',role:'button',label:'NO ACCOUNT? SIGN UP'},cyberguard_signup_preview:{siteId:'A047',origin:'https://www.cyberguard.best',role:'link',label:'Create Account'}};
async function previewPublicAccountForm(page,source,{recipe,siteId,publicOnly,observe,beforePage,deadline,clock=Date.now}={}){
 const spec=specs[recipe];if(!spec||spec.siteId!==siteId||publicOnly!==true||new URL(source.url).origin!==spec.origin||!source.passwordForm||source.agreementCheckbox||source.type)return{status:'not_applicable',source};
 const control=page.getByRole(spec.role,{name:new RegExp('^'+spec.label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$','i')}).filter({visible:true});if(await control.count()!==1)return{status:'public_account_preview_control_missing',source};
 const detail=await control.evaluate(e=>({tag:e.tagName,type:e.type||null,href:e.tagName==='A'?e.href:null}));
 if(spec.role==='button'&&detail.type!=='button')return{status:'public_account_preview_control_not_readonly',source};
 if(detail.href){let u;try{u=new URL(detail.href);}catch{return{status:'public_account_preview_control_not_readonly',source};}if(u.origin!==spec.origin||u.username||u.password||!/(?:register|signup|sign-up)/i.test(u.pathname+u.hash))return{status:'public_account_preview_control_not_readonly',source};}
 await beforePage();if(new URL(page.url()).origin!==spec.origin)return{status:'entry_origin_changed',source};try{if(recipe==='wancheng_signup_preview')await page.locator('.MuiBackdrop-root').filter({visible:true}).waitFor({state:'hidden',timeout:Math.min(20000,Math.max(500,deadline-clock()-2000))});await control.click({timeout:2500});}catch{return{status:'public_account_preview_loading_blocked',source};}let next=await observe(page);const until=Math.min(deadline-1000,clock()+6000);
 while(clock()<until&&new URL(next.url).origin===spec.origin&&next.text===source.text){await page.waitForTimeout(250);await beforePage();next=await observe(page);}
 return{status:new URL(next.url).origin!==spec.origin?'entry_origin_changed':next.text===source.text?'public_account_preview_not_ready':'continued',source:next};
}
module.exports={specs,previewPublicAccountForm};
