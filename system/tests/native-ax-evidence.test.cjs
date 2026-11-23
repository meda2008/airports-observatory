'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('frozen native evidence explicitly requests a full tree and rejects interactive diffs',async()=>{
 const {readFullNativeEvidence:read}=await import('../collection/native-ax-evidence.mjs');const url='https://example.invalid/plan';let options;
 const tab={getAXState:async o=>{options=o;return'Browser tab: 1, Title: "SYNTHETIC", URL: "'+url+'".\n0 AXWebArea SYNTHETIC\n1 text user@example.invalid';}};
 const s=await read(tab,{url});assert.equal(options.disableDiffing,true);assert(s.text.includes('[email redacted]'));assert(!s.text.includes('user@example.invalid'));
 await assert.rejects(read({getAXState:async()=> 'There has been no change in the accessibility tree.'},{url}),/full_native/);
 await assert.rejects(read(tab,{url:'https://other.invalid/'}),/route_mismatch/);
});
