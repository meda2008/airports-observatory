'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{inventory}=require('../lib/collector-recovery-inventory.cjs');
const p=(id,extra={})=>({siteId:id,config:{name:id,entryUrl:'https://example.com/',enabled:false},...extra});
test('archived no-run records stay archived; null entries and identity conflicts are separate from untested runnable sites',()=>{
 const r=inventory([p('A012'),p('A159',{config:{entryUrl:null}}),p('A003'),p('A004')],{A012:{eligibility:'archived_user_request'},A003:{eligibility:'needs_identity_review'}});
 assert.equal(r.withoutRun,4);assert.deepEqual(r.rows.map(r=>r.next),['archived_do_not_reactivate','discover_official_entry','candidate_readonly_identity_review','first_readonly_validation']);
});
test('running jobs are observed, blocked jobs require a repair, completed raw-only jobs require parsing; no false acceptance',()=>{
 const r=inventory([p('A001',{lastRun:{id:'r1',status:'leased'}}),p('A002',{lastRun:{status:'blocked',blocker:'cloudflare'}}),p('A003',{lastRun:{status:'completed',capabilities:{plans:{status:'not_verified'}}}}),p('A004',{lastRun:{status:'review_approved',capabilities:{plans:{status:'extracted_change'}}}})]);
 assert.deepEqual(r.rows.map(r=>r.next),['observe_existing_job','repair_blocker_before_retry','repair_pricing_parser','verify_scope_session_review_and_frontend']);assert.equal(r.blocked,1);assert(r.rows.every(r=>r.fullAcceptanceVerified===false));
});
