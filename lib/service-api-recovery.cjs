"use strict";
const {setTimeout:delay}=require('node:timers/promises');
function wrap(error){if(!(error?.message==='fetch failed'||['TimeoutError','AbortError'].includes(error?.name)||['ECONNREFUSED','ECONNRESET','EAI_AGAIN','ENOTFOUND','ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET'].includes(error?.cause?.code||error?.code)))return error;const result=Error('service_api_transport_unavailable');result.serviceApiTransport=true;return result;}
function transient(error){const status=Number(error?.status);if(Number.isInteger(status)&&status>=400)return [408,425,429].includes(status)||status>=500&&status<=599;return error?.serviceApiTransport===true||error?.message==='measurement_worker_api_unavailable';}
async function wait(attempt,signal){try{await delay(Math.min(30000,1000*2**Math.min(Math.max(attempt-1,0),5)),undefined,{signal});}catch(e){if(!signal?.aborted)throw e;}}
function report(service,status,attempt,log=value=>console.log(JSON.stringify(value))){try{log({service,status,attempt});}catch{}}
module.exports={transient,wrap,wait,report};
