'use strict';
function matches(s={}){const text=String(s.body||s.text||'').trim();return text.length<500&&/^服务器错误\s+403 - 禁止访问: 访问被拒绝。\s+您无权使用所提供的凭据查看此目录或页面。$/.test(text);}
module.exports={matches};
