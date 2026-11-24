'use strict';
// Public evidence links must never expose checkout identifiers or login secrets.
function publicUrl(value){try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return null;if(/(?:\/order(?:s)?(?:\/|$)|viewinvoice|invoice\/|checkout|\/account|\/dashboard|\/user\/profile)/i.test(u.pathname+u.hash))return u.origin+'/';for(const key of [...u.searchParams.keys()])if(/token|password|secret|session|trade|order|invoice|email|auth_key/i.test(key))u.searchParams.delete(key);return u.href;}catch{return null;}}
module.exports={publicUrl};
