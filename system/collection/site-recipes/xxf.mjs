// Actual authenticated XXF help observed on 2026-11-04. Same URL hosts many FAQ bodies.
export async function waitForXxfKnowledge(tab){
 const u=new URL(await tab.url());if(u.origin!=='https://a01.xxfaffa01.cc'||u.hash!=='#/help')throw Error('xxf_help_route_required');
 await tab.playwright.getByRole('tablist').waitFor({state:'visible',timeoutMs:12000});
 await tab.playwright.getByRole('tab').first().waitFor({state:'visible',timeoutMs:12000});
 return{status:'faq_list_ready',url:await tab.url(),noFinancialPolicyInferred:true};
}
