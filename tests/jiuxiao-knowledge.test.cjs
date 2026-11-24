'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
function fixture({redirect=false,empty=false}={}){
 let stage='index',url='https://shop.starpro.one/#/knowledge';const events=[];
 function loc(kind){return{first(){return this;},count:async()=>1,isVisible:async()=>true,
  getByRole:(role,{name})=>loc(name==='close'?'close':'article-heading'),locator:()=>loc('article-paragraph'),
  waitFor:async({state})=>{events.push(kind+':'+state);if(kind==='article-paragraph')stage='article';},
  click:async()=>{events.push(kind+':click');if(kind==='card'){stage='loading';if(redirect)url='https://different.example/#/knowledge';}if(kind==='close')stage='index';}
 };}
 return{events,tab:{url:async()=>url,playwright:{getByRole:(role,{name}={})=>loc(role==='dialog'?'dialog':'index-heading'),getByText:()=>loc('card'),evaluate:async()=>({text:stage==='article'&&!empty?'常见问题解答\n续费当前订阅只会增加时长，流量不会立即重置':'新用户必看\n常见问题解答',visibleDialogCount:stage==='article'&&!empty?1:0,links:[],blocks:[],buttons:[]})}}};
}
test('site dispatch waits for delayed modal body and closes only the document dialog',async()=>{
 const {collectKnowledge}=await import('../collection/knowledge-browser.mjs');const f=fixture(),r=await collectKnowledge(f.tab);
 assert.deepEqual(r.captures.map(c=>c.semanticLocation.stage),['index','article']);assert.equal(r.newOrdersCreated,0);assert.equal(r.paymentExecuted,false);
 assert(f.events.indexOf('article-paragraph:visible')>f.events.indexOf('card:click'));assert(f.events.includes('close:click'));assert(f.events.includes('dialog:hidden'));
 assert.equal(r.captures[1].text.includes('退款'),false);
});
test('already-read FAQ is not reopened and a route change or empty modal refuses collection',async()=>{
 const {collectKnowledge}=await import('../collection/knowledge-browser.mjs');let f=fixture();const r=await collectKnowledge(f.tab,{previousArticles:['常见问题解答']});assert.equal(r.status,'no_unread_relevant_article_bodies');assert(!f.events.includes('card:click'));
 f=fixture({redirect:true});await assert.rejects(()=>collectKnowledge(f.tab),/route_changed/);assert(!f.events.includes('article-heading:visible'));
 f=fixture({empty:true});await assert.rejects(()=>collectKnowledge(f.tab),/body_not_ready/);
});
