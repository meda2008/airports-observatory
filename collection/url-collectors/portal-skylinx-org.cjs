'use strict';
const origin='https://portal.skylinx.org',target='https://user.skylinx.org.uk';
function extract(s,{prior={}}={}){
 const u=new URL(s.url),core=prior.coreInfo||prior;
 if(u.origin!==origin||u.hash!=='#/dashboard'||!require('../../lib/explicit-entry-announcement.cjs').explicitEntryOrigins(s.text).includes(target))return null;
 return{website:{...core.website,announcedEntries:[{url:target+'/',status:'announced_not_yet_currently_observed',announcementCapturedAt:s.capturedAt,sourceIds:[s.evidenceId].filter(Boolean),quote:'官网新链接：\nhttps://user.skylinx.org.uk https://portal.skylinx.org.uk',credentialPropagationAllowed:false}],sourceIds:[...new Set([...(core.website?.sourceIds||[]),s.evidenceId].filter(Boolean))]}};
}
module.exports={origin,recordIds:['A060'],fields:['website'],extract};
