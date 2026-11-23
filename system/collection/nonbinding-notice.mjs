// Only the exact observed informational notice; no ToS or CAPTCHA completion.
export function isNonbindingContinueNotice(s){
 return !s.passwordForm&&!s.agreementCheckbox&&!s.verificationWidgetObserved&&!(s.links||[]).length
  &&!(s.formFields||[]).length&&(s.buttons||[]).length===1&&s.buttons[0]==='继续'
  &&['温馨提示 为了您的安全和更好的体验，请点击继续 继续','温馨提醒 为了您的安全，请确认后继续进入 继续'].includes(String(s.text||'').replace(/\s+/g,' ').trim());
}
export async function continueNonbindingNotice({tab,snapshot,inspect}){
 if(!isNonbindingContinueNotice(snapshot))return{snapshot,observation:{actionTaken:false,status:'not_nonbinding_notice'}};
 if(await tab.url()!==snapshot.url)throw Error('notice_route_changed');
 const control=tab.playwright.getByRole('button',{name:'继续',exact:true});
 if(await control.count()!==1||!await control.isVisible())throw Error('notice_continue_not_unique');
 await control.click();try{await control.waitFor({state:'hidden',timeoutMs:8000});}catch{}
 const after=await inspect(tab);return{snapshot:after,observation:{actionTaken:true,status:isNonbindingContinueNotice(after)?'notice_did_not_clear':'nonbinding_notice_continued',from:snapshot.url,to:after.url,paymentExecuted:false,agreementAccepted:false,captchaCompleted:false}};
}
