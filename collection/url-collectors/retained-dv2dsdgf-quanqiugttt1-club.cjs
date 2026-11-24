'use strict';
const retained=require('./retained-rule.cjs').createRetainedExtractor(require('./retained-dv2dsdgf-quanqiugttt1-club.json'));
module.exports={...retained,recordIds:[...new Set([...retained.recordIds,'A152'])],fields:[...new Set([...retained.fields,'payment'])],extract:(snapshot,context)=>require('./retained-candidate-payment.cjs').extract(snapshot,context)||retained.extract(snapshot,context)};
