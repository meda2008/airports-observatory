'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const origin='https://cylink.go443.pro',url=origin+'/user/code';
function configured(c){return require('../lib/cylink-native-session.cjs').configured(c)&&c.fields?.includes('payment');}
function fragment(html){const matches=[...String(html).matchAll(/<ul\b[^>]*\bid=["']pay_the["'][^>]*>[\s\S]*?<\/ul>/g)];return matches.length===1?matches[0][0]:null;}
async function collect({config,credential,stateFile,sessionDir,beforePage=async()=>{},clock=Date.now}){
 const out={captures:[],browser:'service_headless',capabilities:{login:{status:'not_verified'}},ordersCreated:0,paymentExecuted:false};
 const block=type=>({...out,checkpoint:{type,url:config.entryUrl,stage:'wallet_channel_config',reason:'次元链接钱包渠道配置尚未完成校验；不修改页面脚本、不建单、不充值或付款。'}});
 if(!configured(config)||credential?.origin!==origin)return block('cylink_wallet_matching_account_required');
 let state;try{state=JSON.parse(fs.readFileSync(stateFile,'utf8'));}catch{return block('cylink_wallet_saved_access_required');}
 const binding=crypto.createHash('sha256').update(origin+'|'+credential.email).digest('hex').slice(0,16),profile=path.join(sessionDir,'cylink-wallet-channels',binding);let owned;
 try{
  owned=await require('./headed-service-browser.cjs').open({profile});const {context,page}=owned;await context.addCookies(state.cookies||[]);
  const guard=require('./cylink-native-browser-check.cjs').create(config,{clock,deadline:clock()+40000});page.on('response',r=>guard.observe(r));
  await context.route('**/*',async route=>{const r=route.request();try{const u=await require('./collector.cjs').assertPublicUrl(r.url());if(u.origin!==origin||!['GET','HEAD'].includes(r.method())&&!(await guard.requestAllowed(r)))return route.abort();if(/\/(?:logout|setting|node|purchase|buy|order|payment|checkout|subscribe)(?:\/|$)/i.test(u.pathname))return route.abort();return route.continue();}catch{return route.abort();}});
  await beforePage();await page.goto(config.entryUrl,{waitUntil:'domcontentloaded',timeout:20000});await page.waitForTimeout(7000);
  if(page.url()!==config.entryUrl||!require('../lib/cylink-native-session.cjs').shopVisible({url:page.url(),title:await page.title(),text:await page.locator('body').innerText()}))return block('cylink_wallet_protected_shop_not_verified');
  await beforePage();const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:15000});await page.waitForTimeout(700);if(!response||response.status()!==200||page.url()!==url||await page.title()!=='我的钱包 — CYLINK')return block('cylink_wallet_response_not_verified');
  const body=await response.text(),part=fragment(body);if(!part||[credential.email,credential.password].some(s=>s&&part.includes(s))||!require('../collection/url-collectors/cylink-wallet-payment.cjs').channels(part))return block('cylink_wallet_channel_shape_changed');
  out.captures.push({url,body:part,observedAt:new Date(clock()).toISOString(),kind:'authorized_account_page',metadata:{representation:'original_operator_wallet_channel_html_fragment',authenticationObserved:true}});
  out.capabilities={login:{status:'session_observed'},walletChannels:{status:'configured_channels_observed',visibleCheckoutVerified:false,nativeBrowserCheck:guard.snapshot(),scriptExecutionVerified:false}};return out;
 }catch{return block('cylink_wallet_read_failed');}finally{await owned?.close();}
}
module.exports={origin,url,configured,fragment,collect};
