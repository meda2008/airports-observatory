import {readRenderedDocument} from '../visible-document.mjs';
export async function collectFnfShopReadOnly(tab){
 if(new URL(await tab.url()).origin!=='https://33333.ifnf.xyz'||new URL(await tab.url()).pathname!=='/seni/yes/user/shop')throw Error('fnf_shop_scope_mismatch');
 const captures=[];let page=await readRenderedDocument(tab);captures.push(page);
 if(!page.text.includes('购买会员计划')){
  await tab.playwright.getByRole('link',{name:'订阅 ',exact:true}).first().click();page=await readRenderedDocument(tab);captures.push(page);
  if(page.text.includes('套餐过期后')&&page.buttons.includes('已读')){await tab.playwright.getByRole('button',{name:'已读',exact:true}).click();await tab.playwright.getByRole('link',{name:'订阅 ',exact:true}).first().click();}
 }
 const ready=async()=>{await tab.playwright.locator('#pay-confirm:not([disabled])').waitFor({state:'visible',timeoutMs:15000});};await ready();
 const controls=()=>tab.playwright.locator('div[onclick]').evaluateAll(es=>es.filter(e=>e.getClientRects().length).map(e=>({id:e.id,text:e.innerText,selected:e.classList.contains('active')})));
 const plans=(await controls()).filter(e=>/^plan_\d+$/.test(e.id));if(plans.length!==6)throw Error('fnf_expected_six_plans');
 for(const plan of plans){await tab.playwright.locator('#'+plan.id).click();await ready();const periods=(await controls()).filter(e=>/^\d+month$/.test(e.id));
 for(const period of periods){await tab.playwright.getByText(period.text.trim(),{exact:true}).click();await ready();const active=await controls();const off=active.find(e=>e.id==='autorenew-off');if(off&&!off.selected)await tab.playwright.getByText('关闭',{exact:true}).click();
 const snapshot=await readRenderedDocument(tab);if(snapshot.text.includes('正在加载套餐'))throw Error('fnf_quote_still_loading');
 const selection=await controls();snapshot.fnfSelection={planId:plan.id,planLabel:plan.text.split('\n').at(-1).trim(),period:period.text.trim(),activePlan:selection.find(e=>/^plan_/.test(e.id)&&e.selected)?.id,activePeriod:selection.find(e=>/^\d+month$/.test(e.id)&&e.selected)?.id,autoRenew:selection.find(e=>e.id==='autorenew-on')?.selected===true};captures.push(snapshot);
 }}return{status:'readonly_quotes_collected',captures,newOrdersCreated:0,paymentExecuted:false};
}
