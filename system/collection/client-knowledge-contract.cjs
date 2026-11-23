'use strict';
// Parse literal request templates only. Never evaluate publisher JavaScript.
function templates(body){const out=[];for(const m of String(body).matchAll(/\.get\(\s*(["'`])([^"'`]+)\1/g)){const p=m[2];if(!/^\/user\/knowledge\/fetch\?(?:language=\$\{\w+\}|id=\$\{\w+\}&language=\$\{\w+\})$/.test(p))continue;if(!out.includes(p))out.push(p);}return out;}
function instantiate(template,{language='zh-CN',id}={}){if(!templates('.get(`'+template+'`)').includes(template)||!['zh-CN','en-US','zh-TW'].includes(language))throw Error('knowledge_template_rejected');if(template.includes('id=')){if(!Number.isSafeInteger(id)||id<1||id>1000000)throw Error('knowledge_id_rejected');return'/user/knowledge/fetch?id='+id+'&language='+language;}return'/user/knowledge/fetch?language='+language;}
module.exports={templates,instantiate};
