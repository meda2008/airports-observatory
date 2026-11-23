import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
// One auth implementation for Node Playwright and Codex's documented IAB API.
export async function loginWithSiteAdapter({tab,config,credential,emailCodeProvider,verificationOptions={}}){
 let currentUrl=await tab.url();
 const page={id:tab.id,url:()=>currentUrl,
  evaluate:async(...args)=>{currentUrl=await tab.url();return tab.playwright.evaluate(...args);},
  locator:selector=>tab.playwright.locator(selector),
  getByRole:(...args)=>tab.playwright.getByRole(...args),
  frameLocator:selector=>tab.playwright.frameLocator(selector),
  screenshot:options=>tab.screenshot(options),
  waitForAuthTransition:async selector=>{try{await tab.playwright.locator(selector).waitFor({state:'hidden',timeoutMs:8000});}catch(error){if(!/timeout|timed\s*out|deadline/i.test(String(error.message)))throw error;}finally{currentUrl=await tab.url();}},
  waitForLoadState:async(state,{timeout}={})=>{try{return await tab.playwright.waitForLoadState({state,timeoutMs:timeout});}finally{currentUrl=await tab.url();}}};
 return require('../deploy-service/auth.cjs').authenticate(page,{config,credential,emailCodeProvider,verificationOptions});
}
