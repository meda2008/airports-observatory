'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),p=require('../deploy-service/fnf-public-publisher.cjs');
test('publisher dependency allows only two declared cache-busted images, no destination document or authentication',()=>{
 const base='https://77777.ifnf.xyz/favicon.ico?_=1795179427226';assert.equal(p.favicon(base,'GET'),true);
 for(const u of [base.replace('77777','99999'),base.replace('favicon.ico','auth/login'),base+'&token=a',base.replace('https:','http:'),'https://77777.ifnf.xyz/favicon.ico'])assert.equal(p.favicon(u,'GET'),false);
 assert.equal(p.favicon(base,'POST'),false);assert.equal(p.entry('https://77777.ifnf.xyz/seni/yes/auth/login'),true);assert.equal(p.entry('https://77777.ifnf.xyz/seni/yes/user/shop'),false);
});
test('closed shadow cards retain disabled state; third-party recommendations never become own entries',()=>{
 const li=(name,id,disabled)=>({nodeName:'LI',backendNodeId:id,attributes:['class','glass status-card'+(disabled?' disabled':'')],children:[{nodeName:'#text',nodeValue:'262ms '+name+' '+(disabled?'无法访问':'正常')}]});
 const root={nodeName:'DIV',shadowRoots:[{nodeName:'#document-fragment',shadowRootType:'closed',children:[li('Foo&Friends',1,false),li('Foo&Friends',2,true),li('Google',3,false)]}]};
 const rows=p.cards(root);assert.equal(rows.length,2);assert(rows[1].attributes.some(x=>x.includes('disabled')));assert.equal(p.cards({...root,shadowRoots:[]}).length,0);
 assert.equal(p.configured({recordId:'A027',entryUrl:'https://www.fnf.xyz/',publicOnly:true}),true);assert.equal(p.configured({recordId:'A027',entryUrl:'https://www.fnf.xyz/',publicOnly:false}),false);
});
test('FnF ordinary cookie continuation requires full exact brand and text and excludes agreements/challenges',()=>{
 const {ordinaryEntryNotice:f}=require('../collection/standalone-auth-recovery.cjs'),s={title:'Foo&Friends',text:'Foo&Friends\n\n请点击继续访问。\n\nPlease click continue to proceed.\n\n继续 / Continue'};
 assert.deepEqual(f(s),{buttonText:'继续 / Continue',notice:'请点击继续访问。'});
 for(const patch of [{title:'Other'},{passwordForm:true},{agreementCheckbox:true},{verificationWidgetObserved:true},{text:s.text+' 同意服务条款'}])assert.equal(f({...s,...patch}),null);
});
