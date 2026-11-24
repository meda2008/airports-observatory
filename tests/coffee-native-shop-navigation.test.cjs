'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createCollector}=require('../collection/url-collectors/coffee-native-shop-navigation.cjs');
test('Coffee catalog preserves the same-page app session and waits for asynchronously rendered prices without financial controls',async()=>{
 const {chromium}=require('../deploy-service/node_modules/playwright'),browser=await chromium.launch({headless:true});
 try{const page=await browser.newPage();await page.route('**/*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<main>DASHBOARD</main><script>sessionStorage.setItem("fixture","KEEP");window.addEventListener("hashchange",()=>setTimeout(()=>document.querySelector("main").textContent="CATALOG ¥12",100));</script>'}));
 await page.goto('https://aicoffee.app/#/dashboard');
 const tab={url:async()=>page.url(),goto:async url=>page.goto(url),playwright:{getByText:pattern=>{let l=page.getByText(pattern);return{first(){l=l.first();return this;},waitFor:o=>l.waitFor({state:o.state,timeout:2000})}}}};
 const result=await createCollector({readDocument:async()=>({url:page.url(),text:await page.locator('main').innerText()})})(tab);
 assert.equal(result.captures.length,2);assert.equal(result.captures[1].text,'CATALOG ¥12');assert.equal(await page.evaluate(()=>sessionStorage.getItem('fixture')),'KEEP');assert.equal(result.newOrdersCreated,0);assert.equal(result.paymentExecuted,false);
 }finally{await browser.close();}
});
test('Coffee guarded or unrelated routes are retained without attempting catalog navigation',async()=>{
 for(const [url,guard]of [['https://aicoffee.app/#/login',{passwordForm:true}],['https://aicoffee.app/#/dashboard',{verificationWidgetObserved:true}],['https://other.invalid/#/dashboard',{}]]){
 let calls=0;const result=await createCollector({readDocument:async()=>({text:'GUARDED',...guard})})({url:async()=>url,goto:async()=>{calls++;}});
 assert.equal(calls,0);assert.equal(result.captures.length,1);
 }
});
