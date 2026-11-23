'use strict';
async function continueLanding(page,source,{siteId,observe,beforePage,deadline,clock=Date.now}={}){
 const expectedOrigin={A146:'https://syjccloud.com',A172:'https://vip.ytjcok.org'}[siteId];
 if(!expectedOrigin||new URL(source.url).origin!==expectedOrigin||source.passwordForm||source.agreementCheckbox||source.verificationWidgetObserved||!String(source.text).includes('Scroll down to sign in'))return{status:'not_applicable',source};
 await beforePage();await page.mouse.move(500,350);await page.mouse.wheel(0,720);
 let next=await observe(page);const until=Math.min(deadline-1000,clock()+6000);
 while(clock()<until&&new URL(next.url).origin===expectedOrigin&&!next.passwordForm&&!next.agreementCheckbox&&!next.type){await page.waitForTimeout(300);await beforePage();next=await observe(page);}
 return{status:new URL(next.url).origin!==expectedOrigin?'entry_origin_changed':next.passwordForm||next.agreementCheckbox||next.type?'continued':'landing_continuation_not_ready',source:next};
}
module.exports={origin:'https://syjccloud.com',recordIds:['A146'],fields:['pricing'],continueLanding};
