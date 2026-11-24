'use strict';
// Plain-text URLs count only inside an explicitly labelled, line-bounded entry notice.
function explicitEntryOrigins(text){
 const lines=String(text||'').split(/\r?\n/),out=[];
 for(let i=0;i<lines.length;i++)if(/^官网新链接[：:]\s*$/.test(lines[i].trim())){
  for(let j=i+1;j<Math.min(lines.length,i+7);j++){
   const line=lines[j].trim();if(!line)continue;
   const tokens=line.split(/\s+/);if(!tokens.every(t=>/^https:\/\/[^\s]+$/.test(t)))break;
   for(const token of tokens)try{const u=new URL(token);if(!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash)out.push(u.origin);}catch{}
  }
 }
 return [...new Set(out)];
}
module.exports={explicitEntryOrigins};
