'use strict';
// WgetCloud's server-rendered account menu is hidden until its ordinary navbar toggle.
// Match the bound identifier only in RAM; never export profile text or read passwords.
async function observeWgetSession(page,config,credential,snapshot={}){
 if(config?.recordId!=='A001'||config.auth?.mode!=='login'||credential?.origin!=='https://b8cfff2a4jquxdbmwbaj.wgetcloud.org'||!credential.email||snapshot.passwordForm||snapshot.type||snapshot.verificationWidgetObserved||snapshot.agreementCheckbox)return {observed:false};
 try{const u=new URL(page.url());if(u.origin!==credential.origin||u.pathname!=='/user/shop'||u.search||u.hash)return{observed:false};
 const toggle=page.locator('#layout-navbar .dropdown-user > a[data-bs-toggle="dropdown"]'),menu=page.locator('#layout-navbar .dropdown-user .dropdown-menu');
 if(await toggle.count()!==1||!await toggle.isVisible()||await menu.count()!==1)return{observed:false};
 const opened=!await menu.isVisible();if(opened)await toggle.click();
 try{if(!await menu.isVisible())return{observed:false};const email=menu.locator('small.text-muted'),logout=menu.locator('a[href="/user/logout"]');
 if(await email.count()!==1||!await email.isVisible()||await logout.count()!==1||!await logout.isVisible())return{observed:false};
 const matched=(await email.innerText()).trim().toLowerCase()===credential.email.trim().toLowerCase();return matched?{observed:true,basis:'same_origin_visible_account_menu_identifier_matched',accountDataExported:false}:{observed:false};
 }finally{if(opened&&await menu.isVisible())await toggle.click();}
 }catch{return{observed:false};}
}
module.exports={observeWgetSession};

