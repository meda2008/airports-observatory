'use strict';
const crypto=require('node:crypto');
const origin='https://b8cfff2a4jquxdbmwbaj.wgetcloud.org';
function requestAllowed(req,config){try{return config.recordId==='A001'&&new URL(config.entryUrl).origin===origin&&req.method()==='POST'&&new URL(req.url()).origin===origin&&new URL(req.url()).pathname==='/clicaptcha'&&new URL(req.frame().url()).origin===origin&&(req.postData()||'').length<=16384;}catch{return false;}}
function jobBudget(config,fallback){try{return config.recordId==='A001'&&new URL(config.entryUrl).origin===origin?Math.max(fallback,90000):fallback;}catch{return fallback;}}
function locateShapes({width,height,rgba}) {
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<100||height<80||width>800||height>500||rgba.length!==width*height*4)throw Error('shape_image_invalid');
 const visited=new Uint8Array(width*height),out=[];
 const white=i=>rgba[i*4]>=245&&rgba[i*4+1]>=245&&rgba[i*4+2]>=245&&rgba[i*4+3]>=240;
 for(let seed=0;seed<visited.length;seed++){
  if(visited[seed]||!white(seed))continue;
  visited[seed]=1;const queue=[seed];let x0=width,y0=height,x1=0,y1=0,sx=0,sy=0;
  for(let k=0;k<queue.length;k++){
   const i=queue[k],x=i%width,y=Math.floor(i/width);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);sx+=x;sy+=y;
   for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){if(nx<0||ny<0||nx>=width||ny>=height)continue;const j=ny*width+nx;if(!visited[j]&&white(j)){visited[j]=1;queue.push(j);}}
  }
  const w=x1-x0+1,h=y1-y0+1,area=queue.length,fill=area/(w*h);
  if(w<9||h<9||w>70||h>70||area<45||w/h<0.7||w/h>1.7)continue;
  // This widget uses a wide triangle and a near-square five-point star.
  const shape=fill>.82?'square':fill>.44&&fill<.65&&w/h>1.35?'tri':fill>.30&&fill<.60&&w/h<1.25?'star':null;
  out.push({shape,x:sx/area,y:sy/area,area,fill,width:w,height:h});
 }
 return out;
}
async function solve(page,{beforePage=async()=>{},deadline=Date.now()+45000,clock=Date.now,refreshBudget=2}={}){
 if(new URL(page.url()).origin!==origin)return {status:'not_applicable',attempts:0,passed:false};
 const box=page.locator('.xcaptcha.xon .xcaptcha_box');
 if(await box.count()!==1||!await box.isVisible())return {status:'not_applicable',attempts:0,passed:false};
 const payload=await box.evaluate(box=>{
  const img=box.querySelector('img.xcaptcha_img'),icons=[...box.querySelectorAll('.xcaptcha_span i')].map(e=>e.className.replace('icaptcha-',''));
  if(!img||!img.complete||img.naturalWidth<100||img.naturalHeight<80||img.naturalWidth>800||img.naturalHeight>500)return null;
  const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
  const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;let binary='';for(let i=0;i<data.length;i+=8192)binary+=String.fromCharCode(...data.subarray(i,i+8192));return {width:canvas.width,height:canvas.height,pixels:btoa(binary),order:icons,src:img.currentSrc};
 });
 if(!payload||payload.order.length!==3||new Set(payload.order).size!==3||payload.order.some(x=>!['square','tri','star'].includes(x)))return {status:'shape_prompt_not_supported',attempts:0,passed:false};
 payload.rgba=Buffer.from(payload.pixels,'base64');const points=locateShapes(payload),selected=payload.order.map(shape=>points.filter(p=>p.shape===shape));
 const imageSha256=crypto.createHash('sha256').update(Buffer.from(payload.rgba)).digest('hex');
 if(selected.some(p=>p.length!==1)){
  const refresh=box.locator('.xcaptcha_rebtn');
  if(refreshBudget>0&&clock()+10000<deadline&&await refresh.count()===1&&await refresh.isVisible()){
   await beforePage();await refresh.click();await page.waitForTimeout(800);
   const next=await solve(page,{beforePage,deadline,clock,refreshBudget:refreshBudget-1});
   return {...next,refreshes:(next.refreshes||0)+1};
  }
  return {status:'shape_detection_ambiguous',attempts:0,passed:false,imageSha256,candidates:points};
 }
 const image=box.locator('img.xcaptcha_img');let clicks=0;
 for(const [point] of selected){
  await beforePage();if(clock()>deadline-500||new URL(page.url()).origin!==origin)return {status:'shape_session_changed',attempts:clicks,passed:false,imageSha256};
  const unchanged=await image.evaluate((img,src)=>img.currentSrc===src,payload.src);if(!unchanged)return {status:'shape_image_changed',attempts:clicks,passed:false,imageSha256};
  const bounds=await image.boundingBox();if(!bounds)throw Error('shape_image_not_visible');
  await box.locator('.xcaptcha_cover').click({position:{x:point.x*bounds.width/payload.width,y:point.y*bounds.height/payload.height},timeout:3000});clicks++;
 }
 // Native widget success is observed, never fabricated by setting a token.
 await box.waitFor({state:'hidden',timeout:Math.min(5000,Math.max(1,deadline-clock()))}).catch(()=>{});
 const cleared=!await box.isVisible();
 return {status:cleared?'shape_widget_cleared':'shape_widget_not_cleared',attempts:clicks,passed:cleared,imageSha256};
}
module.exports={locateShapes,solve,origin,requestAllowed,jobBudget};
