'use strict';
const origin='https://efbng.guangzssytt.buzz';
module.exports={origin,recordIds:['A043','A149'],fields:['compatibility','payment'],extract:(snapshot,context)=>require('./retained-candidate-payment.cjs').extract(snapshot,context)||require('./ios-guide.cjs').fromGuide(snapshot,{origin,code:'gsy',brand:'光速云'},context)};
