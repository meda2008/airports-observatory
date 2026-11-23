'use strict';
const crypto=require('node:crypto'),origin='https://lumonet.net',sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function captureVisibleOrder({url,body,observedAt=new Date().toISOString()}){
 const u=new URL(url),id=u.searchParams.get('id');if(u.origin!==origin||u.pathname!=='/dashboard/order/'||!/^\d{20,40}$/.test(id||'')||!body.includes('订单号\n'+id))throw Error('lumo_order_context_unverified');
 const unpaid=body.includes('订单状态\n待支付'),cancelled=body.includes('订单状态\n已取消');if(unpaid===cancelled)throw Error('lumo_order_status_unverified');
 return{url:origin+u.pathname,body:JSON.stringify({visibleText:body.replaceAll(id,'[private_order_id]'),originalBodySha256:sha(body),originalArtifactSha256:sha(JSON.stringify({url,body,observedAt})),orderCorrelationSha256:sha(origin+'|'+id),redaction:'Only private order identifier removed; all visible business text retained.'}),kind:'authorized_account_page',observedAt,metadata:{representation:unpaid?'redacted_actual_unpaid_order_payment_selector':'redacted_actual_cancelled_temporary_order',authenticationObserved:true,orderSubmitted:true,paymentExecuted:false}};
}
async function readCurrentOrder(page){const url=page.url(),body=await page.locator('body').innerText();if(page.url()!==url)throw Error('lumo_order_route_changed');return captureVisibleOrder({url,body});}
async function cancelOwnedUnpaidOrder(page,{expectedOrderSha256,allowCancellation=false,beforePage=async()=>{}}={}){
 if(!allowCancellation||!/^[a-f0-9]{64}$/.test(expectedOrderSha256||''))throw Error('lumo_cancel_grant_required');
 const before=await readCurrentOrder(page),v=JSON.parse(before.body);if(v.orderCorrelationSha256!==expectedOrderSha256)throw Error('lumo_cancel_order_mismatch');
 if(before.metadata.representation==='redacted_actual_cancelled_temporary_order')return before;
 await beforePage();await page.getByRole('button',{name:'取消订单',exact:true}).click();const dialog=page.locator('[role="dialog"],[role="alertdialog"]').filter({has:page.getByRole('heading',{name:'确认取消',exact:true})});if(await dialog.count()!==1)throw Error('lumo_cancel_confirmation_changed');await beforePage();await dialog.getByRole('button',{name:'取消订单',exact:true}).click();await page.getByText('已取消',{exact:true}).waitFor({state:'visible',timeout:15000});const after=await readCurrentOrder(page);if(JSON.parse(after.body).orderCorrelationSha256!==expectedOrderSha256||after.metadata.representation!=='redacted_actual_cancelled_temporary_order')throw Error('lumo_cancel_final_state_unverified');return after;
}
module.exports={captureVisibleOrder,readCurrentOrder,cancelOwnedUnpaidOrder};
