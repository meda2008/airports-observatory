'use strict';
// A visible browser-check shell is not service content. Waiting is passive:
// no click, reload, token/cookie manipulation or network-policy exception.
function isPassiveBrowserCheck(source={}){
 const text=String(source.text||source.body||'').trim();
 if(text.length>1200||source.passwordForm||source.agreementCheckbox||source.verificationWidgetObserved||source.captchaInputs?.length||source.captchaImages?.length||source.challengeFrames?.length)return false;
 try{if(!['https:','http:'].includes(new URL(source.url).protocol))return false;}catch{return false;}
 try{const u=new URL(source.url);if(['https://cylink.go443.pro','https://cylink.go26.one'].includes(u.origin)&&['/','/user/shop','/auth/login'].includes(u.pathname)&&!u.search&&!u.hash&&text.startsWith('正在验证您与 '+u.hostname+' 的连接')&&/请稍候\s*[0-5]\s*秒/.test(text)&&text.includes('正在确保与 '+u.hostname+' 的安全连接'))return true;}catch{}
 if(/^Your browser will jump to the page you visited after 5 seconds\.\s*您的浏览器将在五秒后跳转到您访问的页面。$/.test(text))return true;
 if(/^UAM_CHECKING\s+Verifying\s+SECURITY_VERIFICATION\s+Verifying your request, this will take about [0-5] seconds\b/.test(text)&&/Protected By Peekabo$/.test(text))return true;
 const m=/^即将打开\s*([a-z0-9.-]+)\s*$/im.exec(text);if(!m)return false;
 try{const u=new URL(source.url);if(!['https:','http:'].includes(u.protocol)||u.hostname.toLowerCase()!==m[1].toLowerCase())return false;}catch{return false;}
 return /请稍候[，,]?\s*我们正在检查您的浏览器[，,]?\s*最多等待5秒/.test(text)&&/本页面Apple Cloud防御由Apple Cloud提供/.test(text);
}
async function settlePassiveBrowserCheck({page,source,observe,beforePage,deadline,clock=Date.now,timeoutMs=10000}={}){
 if(!isPassiveBrowserCheck(source))return{source,observation:null};
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>12000)throw Error('Passive browser check wait must be bounded to1..12000ms');
 const started=clock(),until=Math.min(deadline-1500,started+timeoutMs);let next=source;
 while(clock()<until&&isPassiveBrowserCheck(next)){await page.waitForTimeout(Math.min(350,until-clock()));await beforePage();next=await observe(page);}
 return{source:next,observation:{kind:'visible_apple_cloud_browser_check',waitAttempted:true,waitBudgetMs:timeoutMs,waitElapsedMs:Math.max(0,clock()-started),waitExpired:isPassiveBrowserCheck(next),actionTaken:false,networkPolicyUnchanged:true}};
}
module.exports={isPassiveBrowserCheck,settlePassiveBrowserCheck};
