import {isPassiveBrowserCheck} from './passive-browser-check.cjs';
// Visible UI only; no token injection, cookie export or challenge bypass.
// Classify rendered controls, not arbitrary mentions of "captcha" in help text.
export function classifyVisibleChallenge(snapshot={}) {
 const text=String(snapshot.text||'');
 if(/Error\s*1005/i.test(text)&&/banned the autonomous system number|ASN.*(?:banned|denied)|封禁.*ASN/i.test(text))return 'network_policy_block';
 const frames=snapshot.challengeFrames||[];
 if(frames.some(f=>/challenges\.cloudflare\.com/.test(f.src||''))||/请验证您是真人|正在进行安全验证|Verifying you are human|Checking your browser/i.test(text))return 'cloudflare';
 if(frames.length)return 'interactive_captcha';
 if(snapshot.captchaInputs?.length)return snapshot.captchaImages?.length?'image_captcha':'captcha_input';
 if(/向右拖动滑块|完成拼图|请依次点击|请点击验证码/.test(text))return 'interactive_captcha';
 if(isPassiveBrowserCheck(snapshot))return 'access_gate';
 if(/我不是恶意刷站|访问验证|点击继续访问/.test(text))return 'access_gate';
 return null;
}

export async function inspectVisibleChallenge(tab) {
 const snapshot=await tab.playwright.evaluate(()=>{
  const visible=e=>!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&!(location.hostname==='b8cfff2a4jquxdbmwbaj.wgetcloud.org'&&e.closest('.offcanvas:not(.show),.modal:not(.show),[inert],[aria-hidden="true"]'));
  const describe=e=>[e.getAttribute('name'),e.id,e.getAttribute('placeholder'),e.getAttribute('aria-label'),e.getAttribute('alt'),e.getAttribute('title')].filter(Boolean).join(' ');
  const captchaInputs=[...document.querySelectorAll('input')].filter(e=>visible(e)&&/captcha|验证码|图形验证/i.test(describe(e)));
  const captchaImages=[...document.querySelectorAll('img')].filter(e=>visible(e)&&/captcha|验证码|图形验证/i.test(describe(e)+' '+e.getAttribute('src')));
  const inComment=e=>{const form=e.closest('form');return !!form&&(/^(?:commentform|comment-form|comment_form)$/.test(form.id||'')||form.classList?.contains('comment-form'))&&!!form.querySelector('textarea[name="comment"]');};
  const content=document.querySelector('article .entry-content,article .post-content,.post-content,#post-content,.entry-content,article');
  const articleVisible=!!content&&visible(content)&&!content.closest('[inert],[aria-hidden="true"]')&&!content.querySelector('form')&&(content.innerText||'').trim().length>=300;
  let publicCommentOnly=false;try{publicCommentOnly=new URL(document.URL).origin==='https://shadowrocket.one'&&articleVisible&&captchaInputs.length>0&&captchaInputs.every(inComment)&&captchaImages.every(inComment);}catch{}
  return {text:document.body?.innerText||'',passwordForm:[...document.querySelectorAll('input[type=password]')].some(visible),
   buttons:[...document.querySelectorAll('button,[role=button]')].filter(visible).map(e=>e.innerText.trim()),
   captchaInputs:(publicCommentOnly?[]:captchaInputs).map(describe),commentFormCaptchaObserved:publicCommentOnly,commentCaptchaContext:publicCommentOnly?{basis:'visible_public_article_and_captcha_inside_commentform_with_comment_textarea',inputLabels:captchaInputs.map(describe),imageLabels:captchaImages.map(describe)}:null,
   captchaImages:(publicCommentOnly?[]:captchaImages).map(describe),
   challengeFrames:[...document.querySelectorAll('iframe')].filter(e=>visible(e)&&/challenges\.cloudflare\.com|recaptcha|hcaptcha/i.test(e.src+' '+e.title)).map(e=>({src:e.src,title:e.title}))};
 });
 return {...snapshot,url:await tab.url()};
}

export async function observeVerification(tab,{timeoutMs=12000}={}) {
 const initial=await inspectVisibleChallenge(tab),type=classifyVisibleChallenge(initial);
 if(!type)return {snapshot:initial,type:null,status:'clear',actionTaken:false};
 if(type==='network_policy_block')return {snapshot:initial,type,status:'access_blocked_by_network_policy',actionTaken:false,automaticRetryAllowed:false};
 if(type!=='cloudflare')return {snapshot:initial,type,status:'challenge_requires_current_confirmation',actionTaken:false};
 const settled=await settleManagedVerification({tab,snapshot:initial,inspect:inspectVisibleChallenge,
  classify:s=>classifyVisibleChallenge(s)?'needs_human_verification':s.passwordForm?'login_required':'content_observed',timeoutMs});
 const remaining=classifyVisibleChallenge(settled.snapshot);
 return {...settled.observation,snapshot:settled.snapshot,type:remaining,status:remaining?'challenge_requires_current_confirmation':'clear'};
}

export async function settleManagedVerification({tab,snapshot,inspect,classify,timeoutMs=12000}) {
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>20000)throw Error('Managed verification wait must be bounded to 1..20000ms');
 const before=snapshot||await inspect(tab),initial=classify(before);
 const result=(next,details)=>({snapshot:next,observation:{actionTaken:false,passed:false,...details}});
 if(initial!=='needs_human_verification')return result(before,{status:initial,waitAttempted:false});
 const label=(before.text||'').split('\n').map(t=>t.trim()).find(t=>/^(正在进行安全验证|Verifying you are human\.?|Checking your browser\.?)$/i.test(t));
 if(!label)return result(before,{status:initial,waitAttempted:false,interaction:'not_classified_as_managed_wait'});
 const interactive=async()=>{
  const checks=tab.playwright.getByRole('checkbox');
  if(await checks.count()===1&&await checks.isVisible())return true;
  const frames=await tab.playwright.locator('iframe').evaluateAll(nodes=>nodes.filter(e=>e.getClientRects().length&&/^https:\/\/challenges\.cloudflare\.com\//.test(e.src)).map(e=>({src:e.src})));
  if(frames.length!==1)return false;
  const frame=tab.playwright.frameLocator('iframe[src="'+frames[0].src.replace(/["\\]/g,'\\$&')+'"]'),control=frame.getByRole('checkbox');
  return await control.count()===1&&await control.isVisible();
 };
 if(await interactive())return result(before,{status:initial,waitAttempted:false,interaction:'visible_checkbox_requires_current_confirmation'});
 const heading=tab.playwright.getByRole('heading',{name:label,exact:true});
 if(await heading.count()!==1||!await heading.isVisible())return result(before,{status:initial,waitAttempted:false,interaction:'managed_heading_not_uniquely_observed'});
 let expired=false;
 try{await heading.waitFor({state:'hidden',timeoutMs});}
 catch(error){if(!/timeout|timed\s*out|deadline exceeded/i.test(String(error.message)))throw error;expired=true;}
 const after=await inspect(tab),status=classify(after);
 const clickable=status==='needs_human_verification'&&await interactive();
 return result(after,{status:status==='needs_human_verification'&&!clickable?'access_protection_wait':status,waitAttempted:true,waitExpired:expired,waitBudgetMs:timeoutMs,interaction:clickable?'visible_checkbox_requires_current_confirmation':'no_interaction_observed',passed:['content_observed','login_required','registration_required'].includes(status)});
}

export async function clickConfirmedChallenge({tab,confirmation,inspect,classify,now=Date.now()}) {
 const before=await inspect(tab);
 if(classify(before)!=='needs_human_verification')return {status:classify(before),actionTaken:false};
 const at=Date.parse(confirmation?.confirmedAt);
 if(!confirmation||confirmation.tabId!==tab.id||confirmation.url!==before.url||!Number.isFinite(at)||at>now||now-at>120000)throw Error('Fresh confirmation for this exact tab and URL required');
 let control;
 if(confirmation.action==='click_access_button'){
  // Exact visible labels only: never generalize to purchase/terms buttons.
  const labels=[...new Set((before.buttons||[]).filter(b=>/^(我不是恶意刷站|点击继续访问)$/.test(b)))];
  if(labels.length!==1||before.agreementCheckbox||before.passwordForm)return {status:'access_button_missing_ambiguous_or_binding',actionTaken:false};
  control=tab.playwright.getByRole('button',{name:labels[0],exact:true});
 }
 else if(confirmation.action==='click_cloudflare_checkbox'){
  // Selector comes from visible iframe metadata on this exact page.
  const frames=await tab.playwright.locator('iframe').evaluateAll(nodes=>nodes.filter(e=>e.getClientRects().length&&/^https:\/\/challenges\.cloudflare\.com\//.test(e.src)).map(e=>({src:e.src,title:e.title})));
  if(frames.length!==1)return {status:'cloudflare_visible_widget_missing_or_ambiguous',actionTaken:false};
  const frame=tab.playwright.frameLocator('iframe[src="'+frames[0].src.replace(/["\\]/g,'\\$&')+'"]');
  control=frame.getByRole('checkbox');
 }else return {status:'challenge_solver_not_available',actionTaken:false};
 if(await control.count()!==1||!await control.isVisible())return {status:'challenge_control_missing_or_ambiguous',actionTaken:false};
 // Recheck destination immediately before the consequential click.
 if(await tab.url()!==confirmation.url)throw Error('Challenge destination changed');
 await control.click();
 const after=await inspect(tab);
 const status=classify(after);
 return {status,actionTaken:true,passed:['content_observed','login_required','registration_required'].includes(status),mechanism:confirmation.action};
}
