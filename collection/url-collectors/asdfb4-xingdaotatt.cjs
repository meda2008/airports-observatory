'use strict';
const origin='https://asdfb4.xingdaotatt.homes';
module.exports={origin,recordIds:['A151'],fields:['compatibility'],extract:(snapshot,context)=>require('./ios-guide.cjs').fromGuide(snapshot,{origin,code:'Xdm',brand:'星岛梦'},context)};
