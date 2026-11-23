'use strict';
// Exact current portal, complete visible cards only. Does not log in or subscribe.
async function read(page){let u;try{u=new URL(page.url())}catch{return null}if(u.origin!=='https://ccount.biubiu.club'||u.pathname!=='/'||u.hash!=='#/plan')return null;return page.locator('h3').evaluateAll(es=>es.filter(h=>h.getClientRects().length>0).map(h=>{let p=h.parentElement;while(p&&!(p.querySelectorAll('h3').length===1&&p.querySelector('a[href*="/plan/"]')))p=p.parentElement;return p?{name:h.innerText,text:p.innerText,headingCount:1,buttonLabel:'立即订阅',links:[...p.querySelectorAll('a[href]')].map(a=>({label:a.innerText,url:a.href}))}:null}).filter(Boolean));}
module.exports={read};
