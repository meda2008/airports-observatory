import {createHash} from 'node:crypto';
import {readRenderedDocument} from '../visible-document.mjs';
export const allowedQingOrigins=new Set(['https://a32.qytaff03.cc','https://qingyunti.cc']);
export function assessQingRefundCoverage(capture,previousCapture=null){
 const u=new URL(capture.url);if(!allowedQingOrigins.has(u.origin)||u.pathname!=='/docs')throw Error('qing_docs_scope_mismatch');
 const text=String(capture.text||'');if(!text.includes('教程中心')||!text.includes('全部文档')||!text.includes('青云梯IOS详细使用教程'))throw Error('qing_docs_body_not_ready');
 const bodySha256=createHash('sha256').update(text).digest('hex'),sameMaterial=!!previousCapture&&allowedQingOrigins.has(new URL(previousCapture.url).origin)&&previousCapture.text===text;
 return{status:sameMaterial?'duplicate_native_doc_material_no_new_financial_evidence':/退款|退费|refund/i.test(text)?'new_financial_literal_requires_review':'no_refund_rule_in_observed_doc_directory',bodySha256,sameMaterial,independentCorroboration:false,currentRefundPolicyConfirmed:false};
}
export async function collectQingRefundCoverage(tab,{previousCapture=null}={}){
 const before=await readRenderedDocument(tab),u=new URL(before.url);if(!allowedQingOrigins.has(u.origin))throw Error('qing_origin_mismatch');
 if(before.passwordForm)return{status:'authorized_login_needed',captures:[before],newOrdersCreated:0,paymentExecuted:false};
 if(/访问验证|正在进行安全验证/.test(before.text))return{status:'verification_checkpoint_no_automatic_click',captures:[before],newOrdersCreated:0,paymentExecuted:false};
 if(u.pathname!=='/docs'){
  const native=before.links.find(l=>{try{const v=new URL(l.url);return v.origin===u.origin&&v.pathname==='/docs'&&!v.search;}catch{return false;}});
  if(!native)throw Error('qing_native_docs_link_missing');
  // Collapsed sidebars can expose an anchor whose click leaves /shop unchanged.
  // Navigate only to the same-origin URL retained from the visible native link.
  await tab.goto(native.url);
 }
 await tab.playwright.getByRole('heading',{name:'教程中心',exact:true}).waitFor({state:'visible',timeoutMs:12000});
 const capture=await readRenderedDocument(tab),assessment=assessQingRefundCoverage(capture,previousCapture);
 return{...assessment,captures:[capture],newOrdersCreated:0,paymentExecuted:false};
}
