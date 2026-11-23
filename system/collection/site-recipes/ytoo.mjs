import {readRenderedDocument} from '../visible-document.mjs';
const origin='https://www.stentvessel.shop';
export async function collectYtoo(tab,{afterReadOnlyNavigation}={}){
 if(new URL(await tab.url()).origin!==origin)return null;
 const root=await readRenderedDocument(tab);if(!root.title.includes('YToo')||!root.links.some(l=>l.url==='https://y-too.net/clientarea.php'))throw Error('ytoo_native_identity_link_missing');
 const captures=[];
 for(const group of ['individual','team']){
  if(!root.links.some(l=>new URL(l.url).origin===origin&&new URL(l.url).pathname.replace(/\/$/,'')==='/pricing/'+group)&&group==='team')throw Error('ytoo_team_native_link_missing');
  await tab.goto(origin+'/pricing/'+group);if(afterReadOnlyNavigation)await afterReadOnlyNavigation();await tab.getAXState({emit:false});await tab.playwright.getByText(group==='team'?'Global Accelerate - Team 3T':'AIR',{exact:true}).waitFor({state:'visible',timeout:10000});
  for(const label of group==='individual'?['年付','月付']:['当前目录']){
   if(group==='individual'){const radio=tab.playwright.getByRole('radio',{name:label,exact:true});if(await radio.count()!==1)throw Error('ytoo_billing_control_changed');await radio.click();await tab.playwright.waitForFunction(label=>[...document.querySelectorAll('[role=radio]')].some(e=>e.textContent.trim()===label&&e.getAttribute('aria-checked')==='true'),label);}
   const s=await readRenderedDocument(tab);if(new URL(s.url).origin!==origin||new URL(s.url).pathname.replace(/\/$/,'')!=='/pricing/'+group||s.passwordForm||s.verificationWidgetObserved)throw Error('ytoo_catalog_route_checkpoint');
   s.selectedBilling={group,label,checked:true};s.capturedAt=new Date().toISOString();captures.push(s);
  }
 }
 return{origin,captures,newOrdersCreated:0,paymentExecuted:false};
}
