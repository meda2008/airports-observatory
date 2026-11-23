'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');

// Contract fixtures only. No browser, account, network, or live site is touched.
function knowledgeFixture({
 categories=['公告与通知(2)'],
 titles=['退款条件','Windows客户端教程'],
 articleText='合成条款正文：退款需在购买后规定期限内申请，并保留使用量、支付渠道及扣除费用的说明。'.repeat(12),
 emptyArticle=false,
 longIndex=false,
 redirectOnClick=false,
 redirectOnHeadingWait=false,
 headingTimeout=false,
}={}){
 const events=[];
 let stage='index',url='https://operator.example/#/knowledge',category=null,title=null;
 const articleState=()=>stage==='article';
 const indexText=longIndex?'合成知识库列表、分类和导航，尚未展开任何文章正文。'.repeat(30):'知识库\n文档分类\n公告与通知(2)\n共2篇文档';
 function state(){
  const visibleArticle=articleState();
  const body=visibleArticle&&!emptyArticle?articleText:'';
  return {
   text:visibleArticle?(body||indexText):indexText,
   categories,
   headings:stage==='index'?titles:titles,
   articleButtons:['查看'],
   // Deliberately count all main paragraphs: an empty modal can coexist with a
   // long index. Completing the article must depend on the article body itself.
   paragraphCount:visibleArticle&&!emptyArticle?5:longIndex?6:1,
   articleText:body,
   articleBodyText:body,
   articleParagraphCount:body?5:0,
   authenticated:true,
   passwordForm:false,
  };
 }
 function locator(selector,pattern){
  const matches=()=>selector==='h3'?titles.filter(t=>!pattern||pattern.test(t)):selector==='h2'?(title&&(!pattern||pattern.test(title))?[title]:[]):[];
  return {
   first(){return this;},
   filter({hasText}){return locator(selector,hasText);},
   count:async()=>matches().length,
   isVisible:async()=>selector==='h2'?stage==='article':true,
   click:async()=>{
    const found=matches();assert.equal(found.length,1,'Fixture article locator must be unique');
    title=found[0];events.push({type:'article_click',title});stage='article_loading';
    if(redirectOnClick)url='https://different.example/#/knowledge';
   },
   waitFor:async options=>{
    events.push({type:selector+'_wait',state:options.state,title});
    if(selector==='h2'&&options.state==='visible'){
     if(headingTimeout)throw Error('synthetic heading timeout');
     stage='article';
     if(redirectOnHeadingWait)url='https://different.example/#/knowledge';
    }
   },
   evaluate:async()=>({text:emptyArticle?'':articleText,paragraphCount:emptyArticle?0:5}),
   innerText:async()=>selector==='h2'?title:state().text,
  };
 }
 const tab={
  id:'SYNTHETIC-KNOWLEDGE',
  url:async()=>url,
  playwright:{
   evaluate:async(_fn,arg)=>{
    events.push({type:'inspect',stage,url,scope:arg?.articleTitle?'article':'main'});
    if(arg?.articleTitle){
     if(stage!=='article'||arg.articleTitle!==title)return null;
     return {text:emptyArticle?'':articleText,paragraphCount:emptyArticle?0:5,headerText:title};
    }
    return state();
   },
   locator:selector=>locator(selector),
   getByRole:(role,{name}={})=>({
    count:async()=>role==='button'?(name===''?1:categories.includes(name)?1:0):1,
    isVisible:async()=>true,
    click:async()=>{
     if(name===''){events.push({type:'close_article',title});stage='category';return;}
     events.push({type:'category_click',label:name});category=name;stage='category';
    },
    waitFor:async options=>{events.push({type:'category_heading_wait',name,state:options.state,category});},
   }),
  },
 };
 return{tab,events};
}

test('SPA same URL keeps index/category/article as distinct semantic captures',async()=>{
 const {collectKnowledge}=await import('../collection/knowledge-browser.mjs');
 const f=knowledgeFixture();const result=await collectKnowledge(f.tab);
 assert.equal(result.status,'article_bodies_observed');
 assert.deepEqual(result.captures.map(c=>c.semanticLocation.stage),['index','category','article']);
 assert.equal(new Set(result.captures.map(c=>c.url)).size,1);
 assert.equal(result.captures[2].semanticLocation.title,'退款条件');
 assert.equal(result.captures[2].kind,'operator_knowledge_article');
});

test('article is inspected only after the h2 ready wait, not immediately after clicking a card',async()=>{
 const {collectKnowledge}=await import('../collection/knowledge-browser.mjs');
 const f=knowledgeFixture();const result=await collectKnowledge(f.tab);
 const clicked=f.events.findIndex(e=>e.type==='article_click');
 const waited=f.events.findIndex((e,i)=>i>clicked&&e.type==='h2_wait'&&e.state==='visible');
 const inspected=f.events.findIndex((e,i)=>i>clicked&&e.type==='inspect'&&e.stage==='article');
 assert(clicked>=0&&waited>clicked&&inspected>waited);
 assert(result.captures.some(c=>c.kind==='operator_knowledge_article'&&c.text.includes('合成条款正文')));
});

test('knowledge collector must never click purchase/payment actions or irrelevant client tutorials',async()=>{
 const {collectKnowledge}=await import('../collection/knowledge-browser.mjs');
 const f=knowledgeFixture({categories:['公告与通知(4)','立即购买','确认付款'],titles:['付款方式说明','立即购买','确认付款','Windows客户端教程']});
 await collectKnowledge(f.tab,{maxArticles:8});
 assert.deepEqual(f.events.filter(e=>e.type==='article_click').map(e=>e.title),['付款方式说明']);
 assert.deepEqual(f.events.filter(e=>e.type==='category_click').map(e=>e.label),['公告与通知(4)']);
});

test('previously read article titles are skipped without a second click',async()=>{
 const {collectKnowledge}=await import('../collection/knowledge-browser.mjs');
 const f=knowledgeFixture();const result=await collectKnowledge(f.tab,{previousArticles:['退款条件']});
 assert.equal(f.events.filter(e=>e.type==='article_click').length,0);
 assert(!result.captures.some(c=>c.kind==='operator_knowledge_article'));
 assert(result.articleTitles.includes('退款条件'));
});

test('explicit client-guide recovery reads observed guides but never payment actions',async()=>{
 const {collectKnowledge}=await import('../collection/knowledge-browser.mjs');
 const f=knowledgeFixture({categories:['windows(1)'],titles:['Windows客户端教程','立即付款']});
 const result=await collectKnowledge(f.tab,{includeClientGuides:true});
 assert.equal(result.status,'article_bodies_observed');
 assert.deepEqual(f.events.filter(e=>e.type==='article_click').map(e=>e.title),['Windows客户端教程']);
});

test('cross-origin navigation directly after an article click stops collection',async()=>{
 const {collectKnowledge}=await import('../collection/knowledge-browser.mjs');
 const f=knowledgeFixture({redirectOnClick:true});
 await assert.rejects(collectKnowledge(f.tab),/knowledge_origin_changed/);
 assert(!f.events.some(e=>e.type==='h2_wait'));
});

test('cross-origin navigation during article readiness wait also stops before retaining body',async()=>{
 const {collectKnowledge}=await import('../collection/knowledge-browser.mjs');
 const f=knowledgeFixture({redirectOnHeadingWait:true});
 await assert.rejects(collectKnowledge(f.tab),/knowledge_origin_changed/);
});

test('an empty article cannot be completed from a long underlying index or its paragraph count',async()=>{
 const {collectKnowledge}=await import('../collection/knowledge-browser.mjs');
 const f=knowledgeFixture({emptyArticle:true,longIndex:true});const result=await collectKnowledge(f.tab);
 assert(!result.actions.some(a=>a.kind==='read_article'));
 assert(!result.captures.some(c=>c.kind==='operator_knowledge_article'));
 assert.equal(result.status,'no_relevant_article_bodies');
});

test('h2 readiness timeout records a checkpoint and never completes an article',async()=>{
 const {collectKnowledge}=await import('../collection/knowledge-browser.mjs');
 const f=knowledgeFixture({headingTimeout:true});const result=await collectKnowledge(f.tab);
 assert(result.actions.some(a=>a.kind==='article_loading_checkpoint'));
 assert(!result.actions.some(a=>a.kind==='read_article'));
 assert(!result.captures.some(c=>c.kind==='operator_knowledge_article'));
});
