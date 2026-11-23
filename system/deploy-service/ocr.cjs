'use strict';
const path=require('node:path'),fs=require('node:fs'),{spawn}=require('node:child_process');
function createLocalOcr({python=process.env.OCR_PYTHON||path.join(__dirname,'data','ocr-venv',process.platform==='win32'?'Scripts/python.exe':'bin/python'),timeoutMs=30000}={}){
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw Error('ocr_timeout_invalid');
 const invoke=async(image,options={})=>{
  if(!Buffer.isBuffer(image)&&!(ArrayBuffer.isView(image)&&image.BYTES_PER_ELEMENT===1))throw Error('ocr_image_bytes_required');
  if(!image.length||image.length>2000000)throw Error('ocr_image_size_invalid');
  if(!fs.existsSync(python))throw Error('ocr_python_not_configured');
  return new Promise((resolve,reject)=>{
   const child=spawn(python,[path.join(__dirname,'ocr-runner.py')],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,OMP_NUM_THREADS:'1'}});
   let out='',done=false;const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(value);};
   const timer=setTimeout(()=>{child.kill();finish(Error('ocr_timeout'));},timeoutMs);
   child.on('error',()=>finish(Error('ocr_process_unavailable')));child.stderr.resume();
   child.stdout.on('data',chunk=>{out+=chunk;if(out.length>16384){child.kill();finish(Error('ocr_output_limit'));}});
   child.on('close',code=>{if(code!==0)return finish(Error('ocr_process_failed'));try{const data=JSON.parse(out);if(!/^[a-f0-9]{64}$/.test(data.imageSha256)||(!options.hashOnly&&(typeof data.text!=='string'||data.text.length>32||data.engine!=='ddddocr')))throw Error();finish(null,data);}catch{finish(Error('ocr_response_invalid'));}});
   child.stdin.on('error',()=>finish(Error('ocr_input_failed')));
   child.stdin.end(JSON.stringify({image:Buffer.from(image).toString('base64'),clip:options.clip,viewport:options.viewport,hashOnly:options.hashOnly===true}));
  });
 };
 const recognize=(image,options)=>invoke(image,options);
 recognize.fingerprint=async(image,options)=> (await invoke(image,{...options,hashOnly:true})).imageSha256;
 return recognize;
}
module.exports={createLocalOcr};
