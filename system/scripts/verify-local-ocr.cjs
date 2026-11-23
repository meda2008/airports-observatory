'use strict';
// Actual installed engine smoke/regression check, using clearly synthetic text.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const {createLocalOcr}=require('../deploy-service/ocr.cjs');
async function main(){
 const root=path.resolve(__dirname,'..'),dir=path.join(root,'work/site-collector-service/github-integration-20261103');fs.mkdirSync(dir,{recursive:true});
 const python=path.join(root,'deploy-service/data/ocr-venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
 const script="from PIL import Image,ImageDraw,ImageFont\nimport sys,os\nr=sys.argv[1]\ni=Image.new('RGB',(640,360),'white')\nd=ImageDraw.Draw(i)\nf=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',38) if os.name=='nt' else ImageFont.load_default(size=38)\nd.text((360,204),'4826',font=f,fill='black')\ni.save(r+'/synthetic-full.png')\nd.rectangle((0,0,20,20),fill='blue')\ni.save(r+'/synthetic-outside-change.png')\nd.rectangle((360,204,375,220),fill='blue')\ni.save(r+'/synthetic-inside-change.png')\n";
 const generated=spawnSync(python,['-c',script,dir],{windowsHide:true,encoding:'utf8'});if(generated.status!==0)throw Error('synthetic_fixture_generation_failed');
 const ocr=createLocalOcr({python}),bytes=fs.readFileSync(path.join(dir,'synthetic-full.png'));
 const options={clip:{x:350,y:200,width:180,height:60},viewport:{width:640,height:360}};
 const crossRealm=vm.runInNewContext('Uint8Array.from(bytes)',{bytes:[...bytes]});
 const actual=await ocr(crossRealm,options),checks={crossRealmBytesAndLocalCrop:actual.text==='4826',
  sameCropAtDeviceScale2:await ocr.fingerprint(bytes,{clip:{x:175,y:100,width:90,height:30},viewport:{width:320,height:180}})===actual.imageSha256,
  outsideChangesIgnored:await ocr.fingerprint(fs.readFileSync(path.join(dir,'synthetic-outside-change.png')),options)===actual.imageSha256,
  insideChangesDetected:await ocr.fingerprint(fs.readFileSync(path.join(dir,'synthetic-inside-change.png')),options)!==actual.imageSha256};
 const result={synthetic:true,expected:'4826',engine:actual.engine,version:actual.version,confidence:actual.confidence,checks,passed:Object.values(checks).every(Boolean),at:new Date().toISOString()};
 fs.writeFileSync(path.join(dir,'ocr-regression.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
