'use strict';
// Keep an already-readable same-origin post-login page when the configured entry is only an app root.
function genericEntry(raw){try{const u=new URL(raw);return u.pathname==='/'&&!u.search&&['','#/','#'].includes(u.hash);}catch{return false;}}
module.exports={genericEntry};
