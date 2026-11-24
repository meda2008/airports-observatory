'use strict';
// Plain image CAPTCHAs only. Reviewed origin + explicit opt-in; never widget tokens.
const crypto=require('node:crypto');
const reviewed=new Map([
 ['A073','https://aff01.zygbx.com'],
 ['A143','https://home.99ba2026.best'],
 ['A194','https://99vpn.bar'],
 ['A204','https://99vpn.bar']
]);
function configured(config){try{return (config?.recordId==='A073'?config.readOnlyRecipe==='dageyun_plain_image_login':config?.readOnlyRecipe==='ninebar_plain_image_login')&&reviewed.get(config.recordId)===new URL(config.entryUrl).origin;}catch{return false;}}
async function fill({page,config,recognize,deadline,clock=Date.now}){
 if(!configured(config))return {status:'not_applicable',filled:false};
 const origin=reviewed.get(config.recordId),url=page.url();
 if(new URL(url).origin!==origin)throw Error('captcha_origin_changed');
 if(clock()+1000>=deadline)throw Error('captcha_budget_exhausted');
 const dageyun=config.recordId==='A073';
 const image=page.locator(dageyun?'.col-4 img[src^="data:image/svg+xml;base64,"]':'.captcha-image img').filter({visible:true});
 const input=page.locator(dageyun?'input[placeholder="验证码"][maxlength="4"]':'input[placeholder="4位数字验证码"]').filter({visible:true});
 // Builtin images are inserted only after the normal public captcha GET.
 // An already visible input does not mean its asynchronously loaded image exists.
 const controlsBudget=Math.min(5000,Math.max(1,deadline-clock()-1000));
 try{await Promise.all([image.first().waitFor({state:'visible',timeout:controlsBudget}),input.first().waitFor({state:'visible',timeout:controlsBudget})]);}catch{throw Error('captcha_controls_not_ready');}
 if(await image.count()!==1||await input.count()!==1)throw Error('captcha_controls_ambiguous');
 const readImage=()=>image.evaluate(e=>({loaded:e.complete&&e.naturalWidth>0,width:e.naturalWidth,height:e.naturalHeight,src:e.src}));
 let attrs=await readImage();
 if(!attrs.loaded){await image.evaluate((e,ms)=>new Promise(resolve=>{if(e.complete)return resolve(e.naturalWidth>0);const done=()=>{clearTimeout(timer);e.removeEventListener('load',done);e.removeEventListener('error',done);resolve(e.complete&&e.naturalWidth>0);};const timer=setTimeout(done,ms);e.addEventListener('load',done,{once:true});e.addEventListener('error',done,{once:true});}),Math.min(1200,Math.max(1,deadline-clock()-500)));attrs=await readImage();}
 if(!attrs.loaded||attrs.width>512||attrs.height>256)throw Error('captcha_image_not_ready');
 const kind=await input.getAttribute('type');if(kind&&kind!=='text')throw Error('captcha_input_not_text');
 const bytes=await image.screenshot({timeout:Math.min(3000,deadline-clock())});
 const fingerprint=crypto.createHash('sha256').update(bytes).digest('hex');
 const answer=await recognize(bytes);
 if(!(dageyun?/^[A-Za-z0-9]{4}$/:/^\d{4}$/).test(answer.text||''))throw Error('captcha_answer_format_invalid');
 async function assertCurrent(){
  if(clock()>=deadline||page.url()!==url||await image.count()!==1||!await image.isVisible())throw Error('captcha_session_changed');
  if(await image.getAttribute('src')!==attrs.src)throw Error('captcha_image_changed');
  const current=await image.screenshot({timeout:Math.min(3000,deadline-clock())});
  if(crypto.createHash('sha256').update(current).digest('hex')!==fingerprint)throw Error('captcha_image_changed');
 }
 await assertCurrent();await input.fill(answer.text);await assertCurrent();
 // The answer is intentionally absent from receipts. Server acknowledgement is
 // still required; filling an input never establishes authentication success.
 return {status:'captcha_filled_unverified',filled:true,assertCurrent,receipt:{status:'captcha_filled_unverified',imageSha256:fingerprint,engine:answer.engine,attempts:1,passed:false}};
}
module.exports={configured,fill};
