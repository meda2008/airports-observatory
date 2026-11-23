import {readRenderedDocument} from '../visible-document.mjs';
const origin='https://eggtart.pro';
export async function collectEggtartNativeRefundEntry(tab){
 if(new URL(await tab.url()).origin!==origin)throw Error('eggtart_origin_mismatch');
 const before=await readRenderedDocument(tab);if(before.passwordForm)return{status:'authorized_login_needed',captures:[before],newOrdersCreated:0,paymentExecuted:false};
 if(before.visibleDialogCount)await tab.playwright.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
 const announcement=tab.playwright.getByRole('link').filter({hasText:'蛋挞云正式扬帆起航！',visible:true}).first();await announcement.waitFor({state:'visible',timeoutMs:12000});await announcement.click();
 await tab.playwright.getByRole('dialog',{name:'蛋挞云正式扬帆起航！',exact:true}).waitFor({state:'visible',timeoutMs:12000});
 const capture=await readRenderedDocument(tab);if(!capture.text.split(/\r?\n/).some(l=>l.trim()==='通知： https://t.me/eggtartcloud'))throw Error('eggtart_native_channel_changed');
 return{status:'native_refund_channel_discovered_requires_dated_statement_review',captures:[capture],candidates:[{recordId:'A077',url:'https://t.me/s/eggtartcloud?q='+encodeURIComponent('退款'),basis:'exact_native_notification_channel',independentSource:false}],newOrdersCreated:0,paymentExecuted:false,currentRefundPolicyConfirmed:false};
}
