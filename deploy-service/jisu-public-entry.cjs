'use strict';
const origin='https://191.101.132.80';
function configured(c){return c?.recordId==='A159'&&c.entryUrl===origin+'/'&&c.publicOnly===true&&c.readOnlyRecipe==='jisu_login_landing_readonly';}
async function advance(page,source,{config,observe,beforePage=async()=>{},deadline=Infinity,clock=Date.now}={}){
 if(!configured(config)||source.url!==origin+'/'||source.passwordForm||source.type||source.agreementCheckbox||source.verificationWidgetObserved)return{source,status:'not_applicable'};
 const body=source.text||source.body||'';if(!body.includes('Welcome to')||!body.includes('极速Cloud')||!body.includes('您的安全可靠服务网关')||/同意|条款|验证码|captcha/i.test(body))return{source,status:'not_applicable'};
 const button=page.getByRole('button',{name:'登录账号',exact:true}).filter({visible:true});if(await button.count()!==1)return{source,status:'jisu_login_control_ambiguous'};
 const control=await button.evaluate(e=>({tag:e.tagName,form:!!e.closest('form')}));if(control.tag!=='BUTTON'||control.form)return{source,status:'jisu_login_control_not_navigation'};
 await beforePage();if(new URL(page.url()).origin!==origin)return{source,status:'entry_origin_changed'};await button.click();
 const until=Math.min(deadline-1500,clock()+8000);do{await page.waitForTimeout(250);await beforePage();source=await observe(page);if(new URL(source.url).origin!==origin)return{source,status:'entry_origin_changed'};if(source.passwordForm||source.type||source.formFields?.length)return{source,status:'native_login_navigation_observed',credentialsSubmitted:false};}while(clock()<until);
 return{source,status:'jisu_login_view_not_ready',credentialsSubmitted:false};
}
module.exports={configured,advance};
