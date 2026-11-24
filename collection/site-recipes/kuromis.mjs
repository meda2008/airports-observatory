import {readRenderedDocument} from '../visible-document.mjs';
const origin='https://www.kuromis.com';
async function onOrigin(tab){if(new URL(await tab.url()).origin!==origin)throw Error('kuromis_origin_changed');}
// Existing authenticated session only. Never fills credentials, accepts the
// purchase agreement, submits orders or operates the password-management form.
export async function collectKuromisReadOnly(tab){
 await onOrigin(tab);const captures=[];
 const take=async kind=>{await onOrigin(tab);const s=await readRenderedDocument(tab);if(s.passwordForm&&!s.accountManagementObserved)throw Error('kuromis_login_checkpoint');captures.push({...s,kind});};
 await tab.playwright.getByRole('link',{name:'个人套餐',exact:true}).click();
 await tab.playwright.getByRole('heading',{name:'个人 50G',exact:true}).waitFor({state:'visible',timeoutMs:10000});
 await take('kuromis_current_personal_plan');
 const config=tab.playwright.locator('a[href="/place-order?plan_id=2"]');
 if(await config.count()!==1)throw Error('kuromis_readonly_configuration_link_ambiguous');
 await config.click();await onOrigin(tab);
 await tab.playwright.getByText('选择付款方式',{exact:true}).waitFor({state:'visible',timeoutMs:10000});
 if(new URL(await tab.url()).pathname!=='/place-order'||new URL(await tab.url()).searchParams.get('plan_id')!=='2')throw Error('kuromis_configuration_route_mismatch');
 await take('kuromis_readonly_configuration_no_submission');
 await tab.playwright.getByRole('link',{name:'账户中心',exact:true}).click();
 await tab.playwright.getByText('账号已激活',{exact:true}).waitFor({state:'visible',timeoutMs:10000});
 await take('kuromis_account_readonly_no_password_change');
 return{status:'readonly_financial_pages_collected_no_automatic_admission',captures,newOrdersCreated:0,paymentExecuted:false,refundPolicyNotInferred:true};
}
