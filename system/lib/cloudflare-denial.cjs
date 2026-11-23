'use strict';
function matches(source={}){const text=String(source.text||source.body||'').trim();return text.length<3000&&/^Sorry, you have been blocked(?:\n|$)/i.test(text)&&/Cloudflare Ray ID:\s*[a-f0-9]{8,32}\b/i.test(text)&&/Performance\s*(?:&|and)\s*security by Cloudflare/i.test(text);}
module.exports={matches};
