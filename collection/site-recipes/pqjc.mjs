import {createHash} from 'node:crypto';
const origin='https://xn--mes358aby2apfg.com',scope='user_recognized_candidate_unpaid_balance_topup_only';
export function inspectPqjcBalanceCard(label){
 const visible=e=>!!e&&!!e.getClientRects().length;
 if(!label||label.tagName!=='SPAN'||!visible(label)||label.innerText.trim()!=='当前余额')throw Error('pqjc_balance_label_required');
 const card=label.parentElement?.parentElement;if(!card||!visible(card))throw Error('pqjc_balance_card_missing');
 const text=card.innerText.trim();if(text.length>200||!/^当前余额\s+¥\s*\d+\.\d{2}\s+余额充值\s+自动续费$/.test(text)||/TOTP|OTP|2FA|安全|密码|密钥|双重|两步/i.test(text))throw Error('pqjc_balance_card_not_minimal');
 const switches=[...card.querySelectorAll('input[role="switch"]')].filter(visible);if(switches.length!==1||typeof switches[0].checked!=='boolean')throw Error('pqjc_balance_switch_checked_required');
 return{text,autoRenewChecked:switches[0].checked,scope:'visible_balance_card_only',privateSecurityValuesExcluded:true};
}
export async function readPqjcBalanceCard(tab){
 const label=tab.playwright.getByText('当前余额',{exact:true});await label.waitFor({state:'visible',timeoutMs:8000});
 if(await label.count()!==1)throw Error('pqjc_balance_label_not_unique');
 // The heading can render before the fetched balance. Wait for the visible
 // formatted amount, without reading the surrounding account/security page.
 const amount=tab.playwright.getByText(/^¥\s*\d+\.\d{2}$/).filter({visible:true});await amount.waitFor({state:'visible',timeoutMs:8000});
 if(await amount.count()!==1)throw Error('pqjc_balance_amount_not_unique');
 return label.evaluate(inspectPqjcBalanceCard);
}
export function inspectPqjcOrderSurface(){
 const visible=e=>!!e.getClientRects().length,dialogs=[...document.querySelectorAll('[role="dialog"],dialog[open]')].filter(visible);
 let region,representation;if(dialogs.length===1){region=dialogs[0];representation='redacted_visible_order_dialog_text';}else if(dialogs.length>1)throw Error('pqjc_order_dialog_not_unique');else{
  const rows=[...document.querySelectorAll('tr,[role="row"],.ant-list-item')].filter(e=>visible(e)&&/余额充值/.test(e.innerText)&&/已取消/.test(e.innerText));
  if(rows.length>1)throw Error('pqjc_cancelled_order_row_not_unique');
  if(rows.length===1)region=rows[0];else{
   // HeroUI renders the order as a DIV card. Start from the native action,
   // stop at the first small self-contained order, and never read body/main.
   const buttons=[...document.querySelectorAll('button,[role="button"]')].filter(e=>visible(e)&&e.innerText.trim()==='查看订单');
   if(buttons.length!==1)throw Error('pqjc_cancelled_order_card_not_unique');
   for(let card=buttons[0].parentElement;card&&!['BODY','HTML','MAIN'].includes(card.tagName);card=card.parentElement){
    if(!visible(card))continue;const text=card.innerText.trim();if(text.length>2000)throw Error('pqjc_cancelled_order_card_not_minimal');
    if(!/余额充值/.test(text)||!/^已取消\s*$/m.test(text))continue;
    const ids=[...new Set([...text.matchAll(/\b\d{18,30}\b/g)].map(m=>m[0]))];if(ids.length>1)throw Error('pqjc_order_identifier_not_unique');if(ids.length===1){region=card;break;}
   }
   if(!region)throw Error('pqjc_cancelled_order_card_missing');
  }
  representation='redacted_visible_order_list_text';
 }
 const raw=region.innerText.trim();if(raw.length>12000||/TOTP|2FA|验证码|安全设置|密钥/i.test(raw))throw Error('pqjc_order_surface_scope_changed');
 const matches=[...raw.matchAll(/\b\d{18,30}\b/g)].map(m=>m[0]),ids=[...new Set(matches)];if(ids.length!==1)throw Error('pqjc_order_identifier_not_unique');
 const radios=[...region.querySelectorAll('input[type="radio"],[role="radio"]')].filter(visible).map(e=>(e.closest('label')?.innerText||e.getAttribute('aria-label')||'').trim()).filter(Boolean);
 return{text:raw.replaceAll(ids[0],'[order identifier redacted]'),orderCorrelationInput:ids[0],representation,radioLabels:radios,...(representation==='redacted_visible_order_list_text'?{orderCancellationLabel:'已取消'}:{})};
}
export async function collectPqjcCandidateReadOnly(tab){
 const before=await tab.url(),u=new URL(before);if(u.origin!==origin||u.username||u.password)return null;
 if(u.pathname==='/profile'){
  const card=await readPqjcBalanceCard(tab);if(await tab.url()!==before)throw Error('pqjc_balance_route_changed');
  return{origin,captures:[{...card,url:origin+'/profile',capturedAt:new Date().toISOString()}],newOrdersCreated:0,paymentExecuted:false,cancellationExecuted:false};
 }
 if(u.pathname!=='/order')return null;
 const surface=await tab.playwright.evaluate(inspectPqjcOrderSurface);if(await tab.url()!==before)throw Error('pqjc_order_route_changed');
 const {orderCorrelationInput,...safe}=surface,orderCorrelationSha256=createHash('sha256').update(orderCorrelationInput).digest('hex');
 const amount=safe.text.match(/^总计：¥(\d+(?:\.\d+)?)\s*$/m);
 const capture={...safe,url:origin+'/order',capturedAt:new Date().toISOString(),recordId:'A039',scope,legacyIdentityVerified:false,paymentExecuted:false,inputValuesRead:false,orderCorrelationSha256,...(safe.representation==='redacted_visible_order_dialog_text'?{amount:amount?Number(amount[1]):null,currencyISO:null}:{})};
 return{origin,captures:[capture],newOrdersCreated:0,paymentExecuted:false,cancellationExecuted:false};
}
