import {readRenderedDocument} from '../visible-document.mjs';
const origin='https://www.nicecc.cc';
export async function collectNiceRefundCoverage(tab){
 if(new URL(await tab.url()).origin!==origin)throw Error('nicecc_origin_mismatch');
 const before=await readRenderedDocument(tab);if(before.passwordForm)return{status:'authorized_login_needed',captures:[before],newOrdersCreated:0,paymentExecuted:false};
 await tab.playwright.getByRole('link',{name:'文档',exact:true}).click();
 await tab.playwright.getByRole('heading',{name:'文档中心',exact:true}).waitFor({state:'visible',timeoutMs:12000});
 // URL alone changes before the actual body, so wait for this directory marker.
 await tab.playwright.getByRole('region',{name:'文档列表',exact:true}).waitFor({state:'visible',timeoutMs:12000});
 const directory=await readRenderedDocument(tab),button=tab.playwright.getByRole('button').filter({hasText:'常见问题排查'});if(await button.count()!==1)throw Error('nicecc_financial_help_selection_changed');
 await button.click();await tab.playwright.getByRole('button',{name:'返回文档列表',exact:true}).waitFor({state:'visible',timeoutMs:12000});
 await tab.playwright.getByRole('heading',{name:'常见问题排查',exact:true,}).first().waitFor({state:'visible',timeoutMs:12000});
 const detail=await readRenderedDocument(tab);if(!detail.text.includes('购买与使用')||new URL(detail.url).origin!==origin)throw Error('nicecc_help_body_not_ready');
 return{status:/退款|退费|refund/i.test(detail.text)?'new_financial_literal_requires_review':'no_refund_rule_in_observed_faq',captures:[directory,detail],newOrdersCreated:0,paymentExecuted:false,refundPolicyConfirmed:false};
}
