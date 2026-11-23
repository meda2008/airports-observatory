'use strict';
// Riolu's server-rendered account menu is hidden until its ordinary navbar toggle.
// Match the bound identifier only in RAM; never export profile text or read passwords.
async function observeRioluSession(page,config,credential,snapshot={}){
 if((config?.recordId!=='A188'&&!(config?.recordId==='A067'&&config.entryUrl==='https://user.riolu-node.link/shop'&&config.allowedHosts?.includes('user.riolu-node.link')))||config.auth?.mode!=='login'||credential?.origin!=='https://user.riolu-node.link'||!credential.email||snapshot.passwordForm||snapshot.type||snapshot.verificationWidgetObserved||snapshot.agreementCheckbox)return {observed:false};
 try{const u=new URL(page.url());if(u.origin!==credential.origin||u.pathname!=='/shop'||u.search||u.hash)return{observed:false};
 const toggle=page.locator('#accountNavbarDropdown'),menu=page.locator('.navbar-dropdown-account[aria-labelledby="accountNavbarDropdown"]');
 if(await toggle.count()!==1||!await toggle.isVisible()||await menu.count()!==1)return{observed:false};
 const opened=!await menu.isVisible();if(opened)await toggle.click();
 try{if(!await menu.isVisible())return{observed:false};const email=menu.locator('a[href="/profile"] h5.mb-0'),logout=menu.locator('a[data-bs-target="#Sign_out"]');
 if(await email.count()!==1||!await email.isVisible()||await logout.count()!==1||!await logout.isVisible())return{observed:false};
 const matched=(await email.innerText()).trim().toLowerCase()===credential.email.trim().toLowerCase();return matched?{observed:true,basis:'same_origin_visible_account_menu_identifier_matched',accountDataExported:false}:{observed:false};
 }finally{if(opened&&await menu.isVisible())await toggle.click();}
 }catch{return{observed:false};}
}
module.exports={observeRioluSession};

