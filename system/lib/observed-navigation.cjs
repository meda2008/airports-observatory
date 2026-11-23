'use strict';
function safeObservedUrl(value){try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return null;u.search='';u.hash='';if(/token|password|secret|session|credential|authorization|api.?key/i.test(u.pathname))u.pathname='/[redacted]';return u.href;}catch{return null;}}
function observedDestination({entryUrl,blockedRoute,snapshotUrl,snapshotObservedAt,mainNavigation}={}){
 const entry=safeObservedUrl(entryUrl),blocked=safeObservedUrl(blockedRoute),document=safeObservedUrl(snapshotUrl),request=safeObservedUrl(mainNavigation?.url);
 if(blocked)return{url:blocked,basis:'observed_blocked_main_request',observedAt:request===blocked?mainNavigation?.observedAt||null:null};
 if(document&&entry&&new URL(document).origin!==new URL(entry).origin)return{url:document,basis:'observed_browser_document_url',observedAt:snapshotObservedAt||null};
 if(request&&entry&&new URL(request).origin!==new URL(entry).origin)return{url:request,basis:'observed_main_request_only_not_destination_content',observedAt:mainNavigation?.observedAt||null};
 return null;
}
module.exports={safeObservedUrl,observedDestination};
