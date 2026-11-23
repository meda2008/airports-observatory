// Follow only a link actually observed in the rendered UI. Opening its href
// directly handles target=_blank controls that fail to create a browser tab.
// This helper navigates; it never fills a form, accepts terms or submits orders.
export async function followObservedReadOnlyLink({browser,sourceTab,link,onCheckpoint=()=>{}}){
 if(await link.count()!==1)throw Error('observed_link_not_unique');
 const sourceUrl=await sourceTab.url(),href=await link.getAttribute('href');if(!href)throw Error('observed_link_href_missing');
 const url=new URL(href,sourceUrl);
 if(url.protocol!=='https:'||url.username||url.password)throw Error('observed_link_requires_safe_https');
 if(/(?:^|\/)(?:logout|delete|cancel|checkout|payment|pay|unsubscribe|reset)(?:[/.]|$)/i.test(url.pathname)||['password','token','secret','session','authkey'].some(k=>url.searchParams.has(k)))throw Error('observed_link_not_readonly_navigation');
 const checkpoint={sourceUrl,observedHref:href,requestedUrl:url.href,credentialsSubmitted:false,newOrdersCreated:0,paymentExecuted:false};
 // Persist the intent before a slow navigation can outlive the browser tool.
 await onCheckpoint({...checkpoint,status:'navigation_pending',at:new Date().toISOString()});
 const tab=await browser.tabs.new();let navigationError=null;
 await onCheckpoint({...checkpoint,tabId:tab.id,status:'navigation_started',at:new Date().toISOString()});
 try{await tab.goto(url.href);await tab.playwright.waitForLoadState({state:'domcontentloaded',timeoutMs:8000});}catch(e){navigationError=String(e.message).slice(0,180);}
 const finalUrl=await tab.url();
 // about:blank and browser error pages are navigation failures, not empty
 // merchant sites, password rejection, or evidence of service shutdown.
 const landed=typeof finalUrl==='string'&&finalUrl.startsWith('https:');
 const observation={...checkpoint,finalUrl:landed?finalUrl:null,status:landed?'observed_link_landed':'navigation_not_landed',navigationError};
 await onCheckpoint({...observation,tabId:tab.id,at:new Date().toISOString()});
 return{tab,observation};
}
