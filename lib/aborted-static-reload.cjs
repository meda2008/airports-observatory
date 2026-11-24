'use strict';
async function reloadDeclaredAssets({page,observe,beforePage=async()=>{},origin,deadline,clock=Date.now,timeoutMs=12000,settleMs=3000}){
 try{await page.reload({waitUntil:'domcontentloaded',timeout:timeoutMs});return{source:await observe(page),recovery:null};}
 catch(error){if(!/net::ERR_ABORTED/.test(String(error.message)))throw error;const until=Math.min(deadline-1000,clock()+Math.min(9000,Math.max(1000,Number(settleMs)||3000)));do{await beforePage();if(new URL(page.url()).origin!==origin)throw error;try{const s=await observe(page);if(new URL(s.url).origin!==origin)throw error;if(s.type||s.passwordForm||s.agreementCheckbox||String(s.text||'').trim().length>=80)return{source:s,recovery:{kind:'aborted_static_reload_settled_same_origin',observedAt:new Date(clock()).toISOString(),originalErrorClass:'ERR_ABORTED',additionalNavigations:0}};}catch(e){if(!/Execution context was destroyed|Cannot find context|route_changed_during_observation|dom_changed_during_observation/.test(String(e.message)))throw e;}if(clock()>=until)break;await page.waitForTimeout(250);}while(clock()<until);throw error;}
}
module.exports={reloadDeclaredAssets};
