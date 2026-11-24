'use strict';
const modules=[require('./xiaofeiji-best.cjs'),require('./jichangliebiao-anyland.cjs')];
modules.push(...require('./pricing-gap-reports.cjs'));
function forReport(recordId,url){const origin=new URL(url).origin;return modules.find(m=>m.recordId===recordId&&m.origin===origin)||null;}
module.exports={forReport};
