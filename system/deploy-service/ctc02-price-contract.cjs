'use strict';
const crypto=require('crypto'),contract=require('../collection/site-contracts/ctc02-price-client.json'),sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function unitCapture(body){if(sha(body)!==contract.sourceBodySha256||body.length!==contract.sourceLength||contract.excerpts.some(e=>body.slice(e.start,e.end)!==e.text))throw Error('ctc02_price_client_changed');return JSON.stringify(contract);}
function unitEvidence(s){return s?.evidenceId&&s.url===contract.url&&s.metadata?.representation==='original_ctc02_price_client_excerpts'&&s.body===JSON.stringify(contract);}
module.exports={contract,unitCapture,unitEvidence};
