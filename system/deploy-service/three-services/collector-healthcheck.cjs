'use strict';
const fs=require('node:fs');
async function healthy({fetchImpl=fetch,probe=require('../measurement-sidecar/local-healthcheck.cjs').probe,baseUrl=process.env.INTERNAL_API_URL||'http://api:8080',tokenFile=process.env.INTERNAL_TOKEN_FILE||'/run/secrets/internal-token',readFile=fs.readFileSync}={}){
 try{
  if(!await probe())return false;
  const token=readFile(tokenFile,'utf8').trim();if(token.length<32)return false;
  const response=await fetchImpl(new URL('/internal/measurement-worker',baseUrl),{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({method:'enabled',args:[]}),redirect:'error',signal:AbortSignal.timeout(4000)});
  if(!response.ok)return false;const value=await response.json();return value.ok===true&&typeof value.value==='boolean';
 }catch{return false;}
}
if(require.main===module)healthy().then(ok=>{process.exitCode=ok?0:1;});
module.exports={healthy};
