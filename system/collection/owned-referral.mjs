const redact=text=>String(text).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email redacted]');
export function validOwnedReferral(url,origin){
 try{const u=new URL(url);if(u.protocol!=='https:'||u.origin!==origin||u.username||u.password)return false;
  const route=(u.hash.startsWith('#/')?u.hash.slice(1).split('?')[0]:u.pathname).replace(/\/+$/,'')||'/';
  if(!['/','/register','/auth/register'].includes(route)||!['/','/register','/auth/register'].includes(u.pathname.replace(/\/+$/,'')||'/'))return false;
  const query=u.search.replace(/^\?/,'')+'&'+(u.hash.includes('?')?u.hash.split('?').slice(1).join('?'):'');const p=new URLSearchParams(query);
  if([...p.keys()].some(k=>/password|token|secret|session|auth/i.test(k)))return false;
  return [...p.entries()].some(([key,value])=>/^(code|ref|invite|aff|invite_code)$/i.test(key)&&/^[A-Za-z0-9_-]{2,128}$/.test(value));
 }catch{return false;}
}
export async function copyReferralWithVisibility({tab,control,visibility}){
 const previous=await visibility.get();
 try{await visibility.set(true);
  // Making the browser visible does not focus a background tab. Use only the
  // documented same-tab UI focus command, without reading hidden app state.
  if(tab.capabilities?.get)await(await tab.capabilities.get('cdp')).send('Page.bringToFront',{});
  await tab.getAXState({emit:false});await control.click();await tab.getAXState({emit:false});return await tab.clipboard.readText();}
 finally{await visibility.set(previous);}
}
async function chooseVisibleOwnedCopy(copy){
 if(await copy.count()===1&&await copy.isVisible())return copy;
 const choices=[];
 for(const control of await copy.all()){
  if(!await control.isVisible())continue;
  const row=await control.evaluate(e=>{let p=e.parentElement;for(let n=0;p&&n<5;n++,p=p.parentElement){const text=p.innerText||'',dates=[...text.matchAll(/(20\d{2})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/g)];if(dates.length===1){const code=text.split(/\s+/).find(t=>/^[A-Za-z0-9_-]{6,24}$/.test(t)&&!/^20\d{2}/.test(t));if(code)return{code,key:dates[0].slice(1).map(v=>(v||'00').padStart(2,'0')).join('')};}}return null;});
  if(row)choices.push({control,...row});
 }
 choices.sort((a,b)=>a.key.localeCompare(b.key)||a.code.localeCompare(b.code));
 return choices.length&&(!choices[1]||choices[0].key!==choices[1].key||choices[0].code!==choices[1].code)?choices[0].control:null;
}
// Only own-account referral generation/copy. Never commission withdrawal/transfer.
export async function collectOwnedReferral(tab,{expectedEmail,allowGenerate=false,copyReader}={}){
 const origin=new URL(await tab.url()).origin;
 const ownerText=await tab.playwright.locator('body').innerText();
 const signed=tab.playwright.getByRole('button',{name:/^(退出登录|退出账号|Log out|Sign out)$/i});
 if(!expectedEmail||!ownerText.includes(expectedEmail)||await signed.count()!==1||!await signed.isVisible())return{status:'owned_account_not_confirmed',generated:false};
 if(!/#\/(?:invites|invite)(?:[/?#]|$)|\/(?:invite|referral)(?:[/?#]|$)/i.test(await tab.url())){
  const link=tab.playwright.getByRole('link',{name:'我的邀请',exact:true});
  if(await link.count()!==1||!await link.isVisible())return{status:'referral_navigation_adapter_required',generated:false};
  await link.click();
 }
 if(new URL(await tab.url()).origin!==origin)throw Error('referral_origin_changed');
 const title=tab.playwright.getByRole('heading',{name:'邀请码管理',exact:true});
 try{await title.waitFor({state:'visible',timeoutMs:10000});}catch{return{status:'referral_page_not_ready',generated:false};}
 let generated=false;const copy=tab.playwright.getByRole('button',{name:'复制邀请链接',exact:true});
 if(await copy.count()===0)try{await copy.waitFor({state:'visible',timeoutMs:5000});}catch{}
 if(await copy.count()===0&&allowGenerate){const create=tab.playwright.getByRole('button',{name:'生成邀请码',exact:true});if(await create.count()!==1||!await create.isVisible()||!await create.isEnabled())return{status:'referral_generate_adapter_required',generated:false};await create.click();generated=true;try{await copy.waitFor({state:'visible',timeoutMs:10000});}catch{return{status:'generated_link_not_ready_checkpoint',generated:true};}}
 const selectedCopy=await chooseVisibleOwnedCopy(copy);
 if(!selectedCopy)return{status:'referral_copy_missing_or_ambiguous',generated,copyControlCount:await copy.count()};
 if(typeof copyReader!=='function')return{status:'referral_clipboard_reader_missing',generated};
 const url=await copyReader({tab,control:selectedCopy,expectedOrigin:origin});
 if(!validOwnedReferral(url,origin)){let copiedOrigin=null;try{copiedOrigin=new URL(url).origin;}catch{}return{status:!url?'referral_clipboard_empty':copiedOrigin!==origin?'referral_clipboard_origin_mismatch':'referral_link_format_adapter_required',generated,copiedOrigin};}
 if(new URL(await tab.url()).origin!==origin)throw Error('referral_origin_changed');
 const text=redact(await tab.playwright.locator('main').innerText());
 const parsed=new URL(url),params=new URLSearchParams(parsed.search.replace(/^\?/,'')+'&'+(parsed.hash.split('?')[1]||''));
 const code=[...params.entries()].find(([key])=>/^(code|ref|invite|aff|invite_code)$/i.test(key))?.[1];
 if(!code||!text.split(/\s+/).includes(code))return{status:'referral_copied_code_not_visible_in_owned_row',generated};
 return{status:'owned_referral_observed',generated,url,source:{url:await tab.url(),capturedAt:new Date().toISOString(),text:text+'\n通过可见“复制邀请链接”控件复制的地址：'+url,representation:'redacted_visible_page_and_explicit_copy_control_clipboard',authenticationObserved:true,accountOwnerMatched:true,kind:'authorized_account_page'},paymentExecuted:false,withdrawalExecuted:false};
}
