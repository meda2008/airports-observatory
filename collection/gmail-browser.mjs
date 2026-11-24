// Gmail UI adapter for an already signed-in, explicitly authorized mailbox.
// No passwords, cookies, hidden application state, raw HTTP, or email writes.
const escaped=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function createExistingGmailCodeProvider({browser,timeZoneOffset='+08:00',allowOpenMailboxUI=false}){
 return async request=>{
  if(typeof browser.nameSession==='function')await browser.nameSession('📨 注册验证码');
  const tabs=await browser.tabs.list();
  const matches=tabs.filter(t=>t.url?.startsWith('https://mail.google.com/mail/')&&t.title?.toLowerCase().includes(request.registrationEmail.toLowerCase()));
  if(matches.length>1||!matches.length&&!allowOpenMailboxUI)throw Error('gmail_existing_mailbox_session_missing_or_ambiguous');
  const owned=matches.length===0,tab=owned?await browser.tabs.new():await browser.tabs.get(matches[0].id);
  try{if(owned)await tab.goto('https://mail.google.com/');return await createGmailBrowserCodeProvider({mailTab:tab,mailboxEmail:request.registrationEmail,timeZoneOffset})(request);}finally{if(owned)await tab.close();}
 };
}
export function createAccountAwareCodeProvider({connectorProfile,connectorProvider,browser,allowOpenMailboxUI=false}){return async request=>{const address=connectorProfile?.email||connectorProfile?.emailAddress;if(typeof connectorProvider==='function'&&address?.toLowerCase()===request.registrationEmail.toLowerCase())return connectorProvider(request);if(!browser?.tabs?.list)throw Error('matching_registration_mailbox_unavailable');return createExistingGmailCodeProvider({browser,allowOpenMailboxUI})(request);};}
export function parseChineseMailTime(value,offset='+08:00'){
 const m=String(value).match(/(20\d{2})年(\d{1,2})月(\d{1,2})日.*?(\d{1,2}):(\d{2})(?::(\d{2}))?/);if(!m)return null;
 return new Date(`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}T${m[4].padStart(2,'0')}:${m[5]}:${m[6]||'00'}${offset}`).toISOString();
}
export function parseVerificationTtl(text){const minutes=[...String(text).matchAll(/(?:有效期(?:为)?\s*(\d{1,2})\s*分钟|valid for\s*(\d{1,2})\s*minutes|将在\s*(\d{1,2})\s*分钟后过期)/gi)].map(m=>Number(m[1]||m[2]||m[3]));const values=[...new Set(minutes)];return values.length===1&&values[0]>0?values[0]:null;}
export function createGmailBrowserCodeProvider({mailTab,mailboxEmail,timeZoneOffset='+08:00'}){
 return async request=>{
  if(request.registrationEmail.toLowerCase()!==mailboxEmail.toLowerCase())throw Error('gmail_mailbox_mismatch');
  if(!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(mailboxEmail))throw Error('gmail_recipient_requires_review');
  const account=mailTab.playwright.getByRole('button',{name:new RegExp('Google.*'+escaped(mailboxEmail),'i')});try{await account.waitFor({state:'visible',timeoutMs:10000});}catch{throw Error('gmail_signed_in_account_unconfirmed');}if(await account.count()!==1)throw Error('gmail_signed_in_account_unconfirmed');
  const current=new URL(await mailTab.url());if(current.origin!=='https://mail.google.com'||!/^\/mail\/u\/\d+\//.test(current.pathname))throw Error('gmail_ui_route_unconfirmed');
  const brand=request.serviceName.replace(/[^\p{L}\p{N}.-]/gu,'');if(!brand)throw Error('gmail_service_scope_missing');
  const query=`in:anywhere newer_than:1d to:${mailboxEmail} ("${brand}" OR "${new URL(request.registrationOrigin).hostname}") (验证码 OR verification OR code)`;
  const searchUrl=current.origin+current.pathname.split('#')[0]+'#search/'+encodeURIComponent(query);if(await mailTab.url()!==searchUrl)await mailTab.goto(searchUrl);
  try{await mailTab.playwright.waitForLoadState({state:'networkidle',timeoutMs:5000});}catch{}
  // Snapshot grounds the visible result locators; it is never emitted or saved.
  await mailTab.playwright.domSnapshot();
  await mailTab.playwright.getByRole('grid').waitFor({state:'visible',timeoutMs:10000});
  const matches=await mailTab.playwright.getByRole('grid').getByRole('row',{name:new RegExp(escaped(brand)+'[\\s\\S]{0,80}(?:验证码|verification|code)','i')}).all();
  if(matches.length!==1)throw Error('gmail_registration_message_missing_or_ambiguous');await matches[0].click();
  try{await mailTab.playwright.waitForLoadState({state:'networkidle',timeoutMs:5000});}catch{}
  await mailTab.playwright.locator('[role="main"] h2').filter({hasText:new RegExp('^'+escaped(brand))}).waitFor({state:'visible',timeoutMs:10000});await mailTab.playwright.locator('[role="main"] .adn .a3s:visible').first().waitFor({state:'visible',timeoutMs:10000});
  const thread=await mailTab.playwright.evaluate(()=>{const root=document.querySelector('[role="main"]');if(!root)return null;const visible=e=>!!e.getClientRects().length;return{subject:root.querySelector('h2')?.innerText||'',messages:[...root.querySelectorAll('.adn')].filter(visible).filter(e=>[...e.querySelectorAll('.a3s')].some(visible)).map(e=>({text:e.innerText,times:[...e.querySelectorAll('[title]')].filter(visible).map(e=>e.getAttribute('title')).filter(t=>/20\d{2}年.*\d+:\d+/.test(t||'')),codes:[...new Set([...e.querySelectorAll('.a3s td,.a3s span,.a3s div')].filter(visible).map(e=>e.innerText?.trim()).filter(t=>/^\d{6}$/.test(t||'')))]}))};});
  if(!thread?.messages?.length)throw Error('gmail_message_body_unconfirmed');const ordered=thread.messages.map(m=>({...m,receivedAt:m.times.map(t=>parseChineseMailTime(t,timeZoneOffset)).filter(Boolean).sort().at(-1)})).filter(m=>m.receivedAt).sort((a,b)=>b.receivedAt.localeCompare(a.receivedAt));if(!ordered.length||ordered.length>1&&ordered[0].receivedAt===ordered[1].receivedAt)throw Error('gmail_latest_message_time_ambiguous');const message={...ordered[0],subject:thread.subject};
  if(!message||!message.subject.includes(brand)||message.codes.length!==1)throw Error('gmail_registration_code_unconfirmed');
  if(/重置密码|找回密码|password reset|reset.*password|登录验证码|login code|sign.in code/i.test(message.subject))throw Error('gmail_code_purpose_mismatch');
  const senderDomains=[...message.text.matchAll(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/gi)].map(m=>m[1].toLowerCase());if(request.senderDomains?.length&&!request.senderDomains.some(d=>senderDomains.includes(d.toLowerCase())))throw Error('gmail_sender_domain_unconfirmed');
  const receivedAt=message.receivedAt,ttl=parseVerificationTtl(message.text);if(!receivedAt||!ttl)throw Error('gmail_code_time_or_expiry_unconfirmed');
  return{code:message.codes[0],recipient:mailboxEmail,mailboxVerified:true,registrationOrigin:request.registrationOrigin,receivedAt,expiresAt:new Date(Date.parse(receivedAt)+ttl*60000).toISOString(),source:'gmail_existing_browser_session_including_spam'};
 };
}
