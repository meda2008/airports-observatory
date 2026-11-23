'use strict';
// Only service-owned Playwright contexts use this module. No desktop UI, token
// injection, external solver or payment controls are involved.
function protectionRequestAllowed(req, origin) {
 try {
  const u=new URL(req.url());
  if(req.method()!=='POST'||u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443')return false;
  const path=/^\/cdn-cgi\/challenge-platform\//.test(u.pathname);
  if(!path)return false;
  if(u.origin===origin)return new URL(req.frame().url()).origin===origin;
  if(u.hostname!=='challenges.cloudflare.com')return false;
  const frame=req.frame();
  return new URL(frame.url()).origin==='https://challenges.cloudflare.com'&&new URL(frame.parentFrame().url()).origin===origin;
 }catch{return false;}
}
async function advance({page,source,observe,beforePage,deadline,clock=Date.now,config,withVerificationWrite=async action=>action()}) {
 const result={source,receipt:{status:'not_applicable',attempts:0,passed:false}};
 if(!['cloudflare','access_gate','interactive_captcha','image_captcha','captcha_input'].includes(source.type))return result;
 const wget=require('./wget-shape-challenge.cjs');
 const shape=new URL(source.url).origin===wget.origin?await wget.solve(page,{beforePage,deadline,clock}):{status:'not_applicable'};
 if(shape.status!=='not_applicable'){
  result.receipt=shape;
  if(shape.passed){await page.waitForTimeout(1000);await beforePage();result.source=await observe(page);}
  return result;
 }
 const origin=new URL(source.url).origin;
 let control;
 if(source.type==='access_gate'&&!source.passwordForm&&!source.agreementCheckbox){
  const labels=[...new Set((source.buttons||[]).filter(s=>/^(我不是恶意刷站|点击继续访问)$/.test(s)||s==='继续访问'&&require('./native-access-gate.cjs').configured(config)))];
  if(labels.length===1){control=page.getByRole('button',{name:labels[0],exact:true});if(await control.count()===0)control=page.locator('button,[role="button"]').filter({hasText:new RegExp('^\\s*'+labels[0]+'\\s*$')}).filter({visible:true});}
 }else if(source.type==='cloudflare'){
  const frames=(source.challengeFrames||[]).filter(f=>{try{return new URL(f.src).origin==='https://challenges.cloudflare.com';}catch{return false;}});
  if(frames.length===1){
   const selector='iframe[src='+JSON.stringify(frames[0].src)+']';
   control=page.frameLocator(selector).getByRole('checkbox');
  }
 }
 result.receipt.status='interactive_solver_unavailable';
 if(!control||await control.count()!==1||!await control.isVisible())return result;
 await beforePage();
 if(clock()+1000>=deadline){result.receipt.status='verification_budget_exhausted';return result;}
 if(new URL(page.url()).origin!==origin){result.receipt.status='verification_origin_changed';return result;}
 const nativeSubmitted=await require('./native-access-gate.cjs').submit(page,control,config,{withVerificationWrite,deadline,clock});if(!nativeSubmitted)await control.click({timeout:Math.min(3000,deadline-clock())});else result.receipt.nativeAccessForm=true;
 result.receipt.attempts=1;
 const until=Math.min(deadline-500,clock()+8000);
 do{
  await page.waitForTimeout(350);await beforePage();
  result.source=await observe(page);
  if(new URL(result.source.url).origin!==origin){result.receipt.status='verification_origin_changed';return result;}
  if(!result.source.type&&(!require('./native-access-gate.cjs').configured(config)||result.source.passwordForm||[result.source.text,result.source.body].some(t=>typeof t==='string'&&t.trim()))){result.receipt.status='verification_cleared';result.receipt.passed=true;return result;}
 }while(clock()<until);
 result.receipt.status='verification_not_cleared';return result;
}
module.exports={advance,protectionRequestAllowed};
