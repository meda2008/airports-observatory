'use strict';
async function bounded(action,{timeoutMs,label,onTimeout=()=>{}}){let timer;try{return await Promise.race([Promise.resolve().then(action),new Promise((_,reject)=>{timer=setTimeout(()=>{try{Promise.resolve(onTimeout()).catch(()=>{});}catch{}reject(Error(label));},timeoutMs);})]);}finally{clearTimeout(timer);}}
module.exports={bounded};
