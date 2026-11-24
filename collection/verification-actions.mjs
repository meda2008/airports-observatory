import {createHash} from 'node:crypto';
import {inspectVisibleChallenge,classifyVisibleChallenge,clickConfirmedChallenge,observeVerification} from './challenge.mjs';
const used=new Map();
function checkConfirmation(confirmation,tab,url,action,now){
 const at=Date.parse(confirmation?.confirmedAt);
 const ttl=action==='solve_image_captcha'?15*60000:120000;
 if(!confirmation||confirmation.tabId!==tab.id||confirmation.url!==url||confirmation.action!==action||!Number.isFinite(at)||at>now||now-at>ttl)throw Error('fresh_page_confirmation_required');
 const key=JSON.stringify([tab.id,url,action,confirmation.confirmedAt]);
 if(used.has(key))throw Error('confirmation_already_used');
 // Keep consumed image grants for their full lifetime. Cleaning them at the
 // shorter CF lifetime would allow an old image grant to be replayed.
 for(const [old,expiresAt]of used)if(now>expiresAt)used.delete(old);
 // Image recognition may need a local dependency warm-up; same-page, one fill,
 // up to 15 minutes. CF/access clicks keep the existing two-minute limit.
 if(used.size>10000)throw Error('confirmation_capacity_reached');
 return ()=>used.set(key,at+ttl);
}
export async function performConfirmedVerification({tab,confirmation,ocr,captcha,now=Date.now()}){
 const before=await inspectVisibleChallenge(tab),type=classifyVisibleChallenge(before);
 if(!type)return{status:'clear',actionTaken:false,passed:true};
 if(type==='network_policy_block')return{status:'access_blocked_by_network_policy',actionTaken:false,passed:false,automaticRetryAllowed:false};
 if(type==='cloudflare'||type==='access_gate'){
  const action=type==='cloudflare'?'click_cloudflare_checkbox':'click_access_button';
  const consume=checkConfirmation(confirmation,tab,before.url,action,now);consume();
  const clicked=await clickConfirmedChallenge({tab,confirmation,inspect:inspectVisibleChallenge,
   classify:s=>classifyVisibleChallenge(s)?'needs_human_verification':s.passwordForm?'login_required':'content_observed',now});
  if(!clicked.actionTaken)return clicked;
  const after=await observeVerification(tab);
  return{...clicked,status:after.status,passed:!after.type};
 }
 if(type!=='image_captcha')return{status:'unsupported_challenge_checkpoint',actionTaken:false,passed:false};
 if(typeof ocr!=='function'||!captcha?.imageSelector||!captcha?.inputSelector||typeof captcha.pattern!=='string'||captcha.pattern.length>100||!captcha.pattern.startsWith('^')||!captcha.pattern.endsWith('$'))return{status:'ocr_or_site_adapter_missing',actionTaken:false,passed:false};
 const consume=checkConfirmation(confirmation,tab,before.url,'solve_image_captcha',now);
 const image=tab.playwright.locator(captcha.imageSelector),input=tab.playwright.locator(captcha.inputSelector);
 if(await image.count()!==1||await input.count()!==1||!await image.isVisible()||!await input.isVisible())return{status:'captcha_controls_ambiguous',actionTaken:false,passed:false};
 const meta=await image.evaluate(e=>{const r=e.getBoundingClientRect();return{tag:e.tagName,loaded:e.complete&&e.naturalWidth>0,src:e.getAttribute('src'),clip:{x:r.x,y:r.y,width:r.width,height:r.height}};});
 const inputType=await input.getAttribute('type');
 if(meta.tag!=='IMG'||!meta.loaded||meta.clip.width<=0||meta.clip.height<=0||['password','email','hidden'].includes(inputType))return{status:'captcha_image_or_input_invalid',actionTaken:false,passed:false};
 const viewport=await tab.playwright.evaluate(()=>({width:window.innerWidth,height:window.innerHeight}));
 const captureOptions={clip:meta.clip,viewport};
 const imageBytes=await tab.screenshot({fullPage:false}),recognized=await ocr(imageBytes,captureOptions);
 if(typeof recognized?.text!=='string'||!new RegExp(captcha.pattern).test(recognized.text))return{status:'ocr_output_rejected',actionTaken:false,passed:false};
 if(await tab.url()!==before.url||await image.getAttribute('src')!==meta.src||Date.now()-Date.parse(confirmation.confirmedAt)>15*60000)throw Error('captcha_page_changed');
 const again=await tab.screenshot({fullPage:false});
 const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
 const unchanged=ocr.fingerprint?await ocr.fingerprint(again,captureOptions)===recognized.imageSha256:sha(again)===sha(imageBytes);
 if(!unchanged)return{status:'captcha_image_changed',actionTaken:false,passed:false};
 consume();
 await input.fill(recognized.text);
 return{status:'captcha_filled',actionTaken:true,passed:false,engine:recognized.engine,version:recognized.version,imageSha256:recognized.imageSha256||sha(imageBytes)};
}
