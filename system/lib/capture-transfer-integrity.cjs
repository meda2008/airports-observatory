'use strict';
const crypto=require('node:crypto');
function assertCaptureTransferIntegrity(c){if(c.sha256===undefined)return;if(typeof c.sha256!=='string'||!/^[a-f0-9]{64}$/i.test(c.sha256)||crypto.createHash('sha256').update(c.body).digest('hex')!==c.sha256.toLowerCase())throw Error('原文传输哈希不匹配');}
module.exports={assertCaptureTransferIntegrity};
