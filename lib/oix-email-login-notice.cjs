'use strict';
const message='Google sign-in could not load. Check your connection or use your email and password.';
async function dismissOixEmailLoginNotice(page,config={}){
 if(config.recordId!=='A184')return{dismissed:false};const u=new URL(page.url());if(u.origin!=='https://oixcloud.com'||u.pathname!=='/auth/login')return{dismissed:false};
 const dialog=page.getByRole('dialog',{name:'Notice',exact:true}).filter({visible:true}),count=await dialog.count();if(!count)return{dismissed:false};if(count!==1)throw Error('oix_login_notice_ambiguous');
 const msg=dialog.locator('#msg');let known=false;
 if(await msg.count()===1&&await dialog.getAttribute('aria-describedby')==='msg')known=(await msg.innerText()).replace(/\s+/g,' ').trim()===message;
 else known=(await dialog.innerText()).replace(/\s+/g,' ').trim()==='Notice '+message+' OK';
 if(!known||await dialog.locator('a,input').count()!==0)throw Error('oix_login_notice_changed');
 const button=dialog.getByRole('button',{name:'OK',exact:true});if(await button.count()!==1||await button.evaluate(e=>!!e.closest('form')))throw Error('oix_login_notice_button_ambiguous');
 await button.click();await dialog.waitFor({state:'hidden',timeout:4000});return{dismissed:true,reason:'unavailable_google_notice_only_email_login_unchanged'};
}
async function clickOixEmailSignIn(page,config,submit,options={}){
 if(config.recordId!=='A184')return submit.click(options);
 try{return await submit.click({...options,timeout:Math.min(options.timeout||10000,1500)});}catch(error){
  if(!/intercepts pointer events/.test(error.message))throw error;
  const r=await dismissOixEmailLoginNotice(page,config);if(!r.dismissed)throw error;
  return submit.click({...options,timeout:Math.min(options.timeout||10000,5000)});
 }
}
module.exports={dismissOixEmailLoginNotice,clickOixEmailSignIn};
