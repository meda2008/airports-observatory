// Recover a read-only native link when a SPA click leaves the old route visible.
// No guessed routes, protected controls, cross-origin credentials or transactions.
export function safeNativeReadUrl(href,from){
 try{const a=new URL(from),b=new URL(href,from);return b.origin===a.origin&&b.protocol==='https:'&&!b.username&&!b.password&&!/[?&](token|password|secret|auth|code)=/i.test(b.href)&&!/logout|delete|cancel|checkout|subscribe|purchase|order|invite|affiliate|reset|forgot|register|login|\.exe|\.apk/i.test(b.href)&&/knowledge|help|docs|terms|privacy|refund|faq|announcements/i.test(b.pathname+b.hash)?b.href:null;}catch{return null;}
}
export async function followNativeReadLink({tab,label,ready,articleTitle}){
 if(typeof ready!=='function'&&!articleTitle)throw Error('native_read_body_readiness_required');
 const before=await tab.url(),link=tab.playwright.getByRole('link',{name:label,exact:true});
 if(await link.count()!==1||!await link.isVisible())throw Error('native_read_link_missing_or_ambiguous');
 if(await link.getAttribute('target')==='_blank')throw Error('native_new_tab_requires_separate_tracking');
 const target=safeNativeReadUrl(await link.getAttribute('href'),before);if(!target||target===before)throw Error('native_read_target_not_safe_or_already_current');
 await link.click();try{await tab.playwright.waitForURL(target,{timeoutMs:4000});}catch{}
 let directFallback=false;const current=await tab.url();
 if(current===before){await tab.goto(target);directFallback=true;}
 else if(current!==target)throw Error('native_read_link_unexpected_destination');
 if(articleTitle){const heading=tab.playwright.locator('h1').filter({hasText:articleTitle});await heading.waitFor({state:'visible',timeoutMs:12000});if(await heading.count()!==1||await heading.evaluate(e=>e.innerText.trim())!==articleTitle)throw Error('native_article_title_not_exact');await tab.playwright.locator('article p').first().waitFor({state:'visible',timeoutMs:12000});}
 if(ready)await ready(tab);
 if(await tab.url()!==target)throw Error('native_read_route_did_not_stabilize');
 return{before,target,kind:'native_read_only_link',directFallback,credentialSubmitted:false,newOrderCreated:false,paymentExecuted:false};
}
