'use strict';
function classify(source={}){let u;try{u=new URL(source.url)}catch{return null;}const text=String(source.body||source.text||'').trim();if(text.length>1000)return null;
 if(u.hostname==='tagxx.vip'&&/^安全验证\s+正在准备挑战任务\.{3}\s+\d{1,3}%\s+初始化$/.test(text))return'access_gate';
 if(u.hostname==='user.tagss14.pro'&&/^🌍\s+检测到海外网络\s+当前网络无法直接访问本站。\s+请前往海外入口继续访问。/.test(text)&&text.includes('前往海外入口 →')&&text.includes('Lan Kwai Fong Networks UK Ltd.'))return'public_source_access_denied';
 return null;
}
module.exports={classify};
