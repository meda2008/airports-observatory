'use strict';
// Observe a bound account menu, never expose its identifier or click logout.
async function proveCoffeeSession(page,config,snapshot={},credential){
 if(config?.recordId!=='A078'||config.auth?.mode!=='login'||!credential||credential.origin!=='https://aicoffee.app'||typeof credential.email!=='string'||!credential.email||snapshot.passwordForm||snapshot.verificationWidgetObserved||snapshot.agreementCheckbox||snapshot.type)return{observed:false,reason:'not_applicable_or_guarded'};
 const u=new URL(page.url());if(u.origin!==credential.origin||!['#/dashboard','#/plan'].includes(u.hash))return{observed:false,reason:'destination_or_route_not_expected'};
 if(await page.getByRole('dialog').filter({visible:true}).count())return{observed:false,reason:'visible_dialog_present'};
 const escaped=credential.email.trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const menu=page.locator('button,[role="button"]').filter({hasText:new RegExp('^\\s*'+escaped+'\\s*$','i')}).filter({visible:true});
 if(await menu.count()!==1)return{observed:false,reason:'bound_menu_not_unique'};
 await menu.click();
 const logout=page.getByText('退出登录',{exact:true}).filter({visible:true});
 try{await logout.waitFor({state:'visible',timeout:4000});}catch{return{observed:false,reason:'logout_not_observed'};}
 if(new URL(page.url()).origin!==credential.origin||await logout.count()!==1)return{observed:false,reason:'post_menu_identity_changed'};
 return{observed:true,basis:'unique_bound_account_menu_and_visible_logout_no_logout_action'};
}
module.exports={proveCoffeeSession};
