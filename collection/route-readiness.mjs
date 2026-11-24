// A visible menu link is navigation, not permission to submit or retry orders.
export function sameBusinessRoute(actual,expected){
 try{const a=new URL(actual),b=new URL(expected);return a.origin===b.origin&&a.pathname.replace(/\/$/,'')===b.pathname.replace(/\/$/,'')&&a.search===b.search&&a.hash===b.hash;}catch{return false;}
}
export async function followObservedMenu(tab,control,expectedUrl){
 const before=await tab.url();
 if(new URL(expectedUrl).origin!==new URL(before).origin)throw Error('unconfirmed_navigation_host');
 // SPA menus must receive their native click. A hard goto reruns startup guards.
 await control.click();
 await tab.playwright.waitForURL(expectedUrl,{timeoutMs:8000});
 if(!sameBusinessRoute(await tab.url(),expectedUrl))throw Error('observed_menu_route_reset');
}
export async function requireCurrentRoute(tab,snapshot){
 // Called immediately before creating an unpaid order, never retries a submit.
 if(!snapshot?.url||!sameBusinessRoute(await tab.url(),snapshot.url))throw Error('order_route_changed_before_submit');
}

// Expand native HTML disclosures inside an already-open official document drawer.
// This does not open menus, visit routes, accept terms, or operate order controls.
export async function expandObservedDocumentDetails({tab,expectedUrl,maxItems=30}){
 if(!/(?:#\/|\/)(?:knowledge|docs|help)(?:[/?#]|$)/i.test(expectedUrl))throw Error('document_route_required');
 if(!sameBusinessRoute(await tab.url(),expectedUrl))throw Error('document_route_changed_before_expand');
 const root=tab.playwright.locator('.ant-drawer-open .ant-drawer-content');
 await root.waitFor({state:'visible',timeoutMs:10000});
 await root.locator('summary').first().waitFor({state:'visible',timeoutMs:12000});
 if(await root.count()!==1||!await root.isVisible())throw Error('document_drawer_not_unique');
 const nodes=await root.locator('summary').all();if(nodes.length>maxItems)throw Error('document_disclosure_limit');
 let expanded=0;for(const node of nodes){
  const control=await node.evaluate(e=>({native:e.tagName==='SUMMARY'&&e.parentElement?.tagName==='DETAILS',open:e.parentElement?.hasAttribute('open'),interactive:!!e.querySelector('a,button,input,select,textarea,[role="button"]')}));
  if(!control.native||control.interactive)throw Error('document_disclosure_control_unconfirmed');
  if(!sameBusinessRoute(await tab.url(),expectedUrl))throw Error('document_route_changed_during_expand');
  if(!control.open){await node.click();expanded++;}
  if(!sameBusinessRoute(await tab.url(),expectedUrl))throw Error('document_route_changed_during_expand');
 }
 return {total:nodes.length,expanded,routeVerified:true,paymentExecuted:false};
}
