'use strict';
// The actual custom checkbox is covered by its associated visible label.
async function check(page,{origin}={}){if(origin!=='https://77777.ifnf.xyz'||new URL(page.url()).origin!==origin)return null;
 const box=page.locator('input#remember-me[type="checkbox"][name="remember"]'),label=page.locator('label[for="remember-me"]');
 if(await box.count()!==1||await label.count()!==1||!await label.isVisible()||(await label.innerText()).trim()!=='记住我'||!await box.isEnabled())return null;
 if(!await box.isChecked())await label.click();return await box.isChecked()?{status:'checked',basis:'exact_fnf_associated_visible_remember_label'}:null;
}
module.exports={check};
