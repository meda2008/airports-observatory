'use strict';
// Native /login label incorrectly points to termsCheckbox instead of Remember_me.
// Never infer consent from a generic unchecked box or from label order.
async function check(page,{origin}={}){try{
 const u=new URL(page.url());if(!['https://flashfox.pro','https://a32.qytaff03.cc','https://a30.xmfvipaffa01.cc'].includes(origin)||u.origin!==origin||u.pathname!=='/login'||u.search||u.hash)return null;
 const box=page.locator('input#Remember_me[type="checkbox"]');if(await box.count()!==1||!await box.isVisible()||!await box.isEnabled())return null;
 const proof=await box.evaluate(e=>{const labels=[...e.parentElement.querySelectorAll(':scope > label')];return {className:e.parentElement.className,labelCount:labels.length,labelText:labels[0]?.innerText.trim(),labelFor:labels[0]?.getAttribute('for'),hasForm:!!e.closest('form')};});
 if(!proof.hasForm||!/(?:^|\s)form-check(?:\s|$)/.test(proof.className)||proof.labelCount!==1||proof.labelText!=='自动登录'||proof.labelFor!=='termsCheckbox')return null;
 await box.check();return {status:'checked',basis:'site_scoped_native_mislabelled_remember_checkbox_exact_structure'};
 }catch{return null;}}
module.exports={check};
