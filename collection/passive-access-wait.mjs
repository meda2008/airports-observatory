export function passiveAccessWaitLabel(s){
 if(s.passwordForm||s.agreementCheckbox||s.verificationWidgetObserved)return null;
 // Observed SkyLinX bilingual five-second self-navigation screen. This only
 // waits for the page's normal redirect; it never clicks or solves a challenge.
 if(s.url&&new URL(s.url).origin==='https://portal.skylinx.org'&&(s.text||'').trim()==='Your browser will jump to the page you visited after 5 seconds.\n您的浏览器将在五秒后跳转到您访问的页面。')return '您的浏览器将在五秒后跳转到您访问的页面。';
 const text=s.text||'';if(text.length>700||!/^即将打开[a-z0-9.-]+\.[a-z]{2,}\s*$/i.test(text.trim().split('\n')[0])||!text.includes('本页面Apple Cloud防御由Apple Cloud提供'))return null;
 return text.split('\n').map(x=>x.trim()).find(x=>/^请稍候，我们正在检查您的浏览器，最多等待(?:[1-9]|1\d|20)秒$/.test(x))||null;
}
// Normal page self-navigation only: no checkbox, challenge answer, script,
// cookie, reload or external browser. One bounded wait, then a fresh DOM read.
export async function waitForPassiveAccessPage({tab,snapshot,inspect,runtime='iab',timeoutMs=12000}){
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>20000)throw Error('passive_wait_budget_invalid');
 const label=passiveAccessWaitLabel(snapshot);if(!label)return{snapshot,observation:{waitAttempted:false,actionTaken:false}};
 const heading=label==='您的浏览器将在五秒后跳转到您访问的页面。'?tab.playwright.getByText(label,{exact:true}):tab.playwright.getByRole('heading',{name:label,exact:true});if(await heading.count()!==1||!await heading.isVisible())return{snapshot,observation:{waitAttempted:false,actionTaken:false,reason:'passive_heading_not_unique'}};
 let expired=false;try{await heading.waitFor({state:'hidden',...(runtime==='server'?{timeout:timeoutMs}:{timeoutMs})});}catch(e){if(!/timeout|timed\s*out|deadline exceeded/i.test(String(e.message)))throw e;expired=true;}
 const after=await inspect(tab);return{snapshot:after,observation:{waitAttempted:true,waitBudgetMs:timeoutMs,waitExpired:expired,actionTaken:false,passed:!passiveAccessWaitLabel(after),status:passiveAccessWaitLabel(after)?'passive_wait_incomplete':'passive_wait_page_changed'}};
}
