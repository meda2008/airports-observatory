const test=require('node:test'),assert=require('node:assert/strict');
test('directory search commits Enter before reading, keeps raw reference as E0 and captures checkpoint first',async()=>{
 const {searchJichangbangEntry}=await import('../collection/site-recipes/jichangbang-entry-search.mjs');let url='https://www.jichangbang.cc/ranking',term,entered=false;const events=[];
 const tab={url:async()=>url,playwright:{getByRole:()=>({fill:async q=>{term=q},press:async k=>{assert.equal(k,'Enter');entered=true;url+='?q='+encodeURIComponent(term);events.push('submitted');}}),waitForURL:async expected=>assert.equal(url,expected),evaluate:async()=>({renderStatus:'visible_main_observed',records:[{heading:'#225 Anyland',links:[{label:'官网',url:'https://public.example/'}]}]})}};
 const r=await searchJichangbangEntry({tab,recordId:'A190',query:'Anyland',onCheckpoint:async c=>events.push(c.status),readDocument:async()=>{assert(entered);return{url,capturedAt:'2026-11-09T00:00:00Z',text:'15.8元/月'};}});
 assert.deepEqual(events,['directory_search_pending','submitted','directory_search_captured']);assert.equal(r.grade,'E0');assert.equal(r.officialQuotesAdmitted,0);assert.equal(r.identityConfirmed,false);assert.equal(r.credentialsSubmitted,false);
});
test('hidden old ranking cards and unrelated guide cards are excluded',async()=>{
 const {inspectRankingCards}=await import('../collection/site-recipes/jichangbang-entry-search.mjs'),prior=global.document;
 const link={innerText:'官网',href:'https://public.example/',getClientRects:()=>[{}]};const card=(heading,shown=true)=>({innerText:heading,querySelector:()=>({innerText:heading}),querySelectorAll:()=>[link],getClientRects:()=>shown?[{}]:[]});
 const hiddenMain={getClientRects:()=>[],querySelectorAll:()=>{throw Error('Hidden former main inspected');}},main={getClientRects:()=>[{}],querySelectorAll:()=>[card('#1 Wrong old airport',false),card('Unrelated guide'),card('#225 Anyland')]};
 global.document={querySelectorAll:()=>[hiddenMain,main]};try{const r=inspectRankingCards();assert.deepEqual(r.records.map(x=>x.heading),['#225 Anyland']);}finally{global.document=prior;}
});
test('directory adapter rejects other origins and uncommitted search routes',async()=>{
 const {searchJichangbangEntry}=await import('../collection/site-recipes/jichangbang-entry-search.mjs');await assert.rejects(searchJichangbangEntry({tab:{url:async()=> 'https://wrong.example/ranking'},recordId:'A190',query:'Anyland'}),/scope_mismatch/);
});
test('directory multi-word queries accept form-encoded plus spaces without repeating the request',async()=>{
 const {searchJichangbangEntry}=await import('../collection/site-recipes/jichangbang-entry-search.mjs');let url='https://www.jichangbang.cc/ranking',query,submissions=0;
 const tab={url:async()=>url,playwright:{getByRole:()=>({fill:async q=>{query=q},press:async()=>{submissions++;url='https://www.jichangbang.cc/ranking?'+new URLSearchParams({q:query});}}),waitForURL:async expected=>assert.equal(url,expected),evaluate:async()=>({renderStatus:'visible_main_observed',records:[]})}},readDocument=async()=>({url,capturedAt:'2026-11-09T16:00:00Z',text:'没有找到匹配机场'});
 const r=await searchJichangbangEntry({tab,recordId:'A051',query:'TNT Cloud',readDocument});assert.equal(r.query,'TNT Cloud');assert.equal(submissions,1);
 await searchJichangbangEntry({tab,recordId:'A051',query:'TNT Cloud',readDocument});assert.equal(submissions,1);
});
