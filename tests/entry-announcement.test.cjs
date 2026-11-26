'use strict';
const { historicalCaptureOptions } = require('./helpers/historical-capture.cjs');

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {explicitEntryOrigins}=require('../lib/explicit-entry-announcement.cjs'),{assertSourceOrigin}=require('../lib/source-origin-binding.cjs');
test('announced plain URL binding requires a bounded labelled notice, exact origin, record and intact source',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'entry-notice-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const text='官网新链接：\n\nhttps://new.invalid https://backup.invalid\n\n普通节点说明\nhttps://ad.invalid';
 assert.deepEqual(explicitEntryOrigins(text),['https://new.invalid','https://backup.invalid']);assert.deepEqual(explicitEntryOrigins('推荐网站\nhttps://new.invalid'),[]);
 const body=JSON.stringify({url:'https://old.invalid/#/dashboard',capturedAt:'2026-10-29T13:02:51.086Z',text});fs.writeFileSync(path.join(root,'notice.json'),body);
 const args={root,recordId:'A060',entryUrl:'https://old.invalid/',sourceUrl:'https://new.invalid/#/login',bindings:[{kind:'retained_explicit_entry_announcement',recordId:'A060',origin:'https://new.invalid',file:'notice.json',sha256:crypto.createHash('sha256').update(body).digest('hex')}]};
 assert.equal(assertSourceOrigin(args).credentialPropagationAllowed,false);assert.throws(()=>assertSourceOrigin({...args,recordId:'A061'}),/record binding/);assert.throws(()=>assertSourceOrigin({...args,entryUrl:'https://other.invalid/'}),/parent origin/);
 assert.throws(()=>assertSourceOrigin({...args,sourceUrl:'https://ad.invalid/',bindings:[{...args.bindings[0],origin:'https://ad.invalid'}]}),/absent/);
 fs.appendFileSync(path.join(root,'notice.json'),' ');assert.throws(()=>assertSourceOrigin(args),/hash mismatch/);
});
test('SkyLinX entry update requires original announcement and currently visible named login; financial evidence remains unchanged', historicalCaptureOptions('work/collection-runs/breakpoints-20261104-v1/followup-sources.json'),()=>{
 const {extractKnown}=require('../collection/url-collectors/index.cjs'),d='work/collection-runs/breakpoints-20261104-v1/',m=JSON.parse(fs.readFileSync(d+'followup-sources.json')),now=JSON.parse(fs.readFileSync(d+m.find(x=>x.label==='A060-official-announced-user-org-uk-current').file));
 const old=JSON.parse(fs.readFileSync('catalog/refresh/2026-10-26/core-auth-batch348/raw/core-auth-skylinx-b348-notice-revision-7bc114a1064e.json'));
 const prior={website:{url:'https://portal.skylinx.org/',sourceIds:['PRIOR']},pricing:{observedAt:'old-time'},payment:{observedAt:'old-time'}};
 assert.equal(extractKnown([{...now,evidenceId:'CURRENT'}],{prior}),null);
 const patch=extractKnown([{...old,evidenceId:'NOTICE'},{...now,evidenceId:'CURRENT'}],{prior}).patch;
 assert.deepEqual(Object.keys(patch),['website']);assert.equal(patch.website.url,'https://user.skylinx.org.uk/');assert.equal(patch.website.operatorIdentityVerified,false);assert.equal(patch.website.credentialPropagationAllowed,false);assert.equal(patch.website.announcedEntries[0].announcementCapturedAt,old.capturedAt);
 assert.equal(extractKnown([{...old,evidenceId:'NOTICE'},{...now,passwordForm:false,evidenceId:'CURRENT'}],{prior}).patch.website.url,prior.website.url);
});
