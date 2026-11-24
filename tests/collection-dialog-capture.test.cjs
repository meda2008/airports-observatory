'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
// A real login transition can briefly have no document body. It must remain
// an empty-page observation, never an authentication success or a crash.
test('body-less login transition produces an explicit empty observation',async()=>{
 const {inspectDocument}=await import('../collection/visible-document.mjs'),before=global.document;
 global.document={body:null,title:'Login'};
 try{const s=inspectDocument();assert.equal(s.documentState,'body_missing');assert.equal(s.text,'');assert.equal(s.authenticationObserved,false);assert.deepEqual(s.formFields,[]);assert.deepEqual(s.headingMedia,[]);assert.equal(s.inputValuesRead,false);}finally{global.document=before;}
});
test('visible payment portal outside main is retained once; hidden portals and input values are excluded',async()=>{
 const {inspectDocument}=await import('../collection/browser-driver.mjs');const before=global.document;
 const node=(text,visible=true)=>({innerText:text,getClientRects:()=>visible?[{}]:[],contains:()=>false});
 const main=node('账户充值资料与钱包说明。'.repeat(10)),dialog=node('支付方式\n支付宝\n微信支付\nUSDT (TRC20)\n确认下单\n取消'),nested=node('微信支付'),hidden=node('已绑定银行卡号 hidden secret',false);dialog.contains=e=>e===nested;
 const input={type:'text',name:'amount',placeholder:'金额',getClientRects:()=>[{}],get value(){throw Error('Input value read');}};
 global.document={title:'Wallet',body:main,querySelector:s=>s.startsWith('#betterdocs')?null:main,querySelectorAll:s=>s==='[role="dialog"],dialog[open],[aria-modal="true"]'?[dialog,nested,hidden]:s==='input'?[input]:[]};
 try{const snapshot=inspectDocument();assert.match(snapshot.text,/USDT \(TRC20\)/);assert.equal(snapshot.text.match(/微信支付/g).length,1);assert(!snapshot.text.includes('hidden secret'));assert.equal(snapshot.visibleDialogCount,1);assert.equal(snapshot.inputValuesRead,false);assert.deepEqual(snapshot.formFields,[{type:'text',name:'amount',placeholder:'金额'}]);}finally{global.document=before;}
});
test('payment choices still loading are awaited rather than recorded as missing',async()=>{
 const {readRenderedDocument}=await import('../collection/browser-driver.mjs');let ready=false;
 const tab={url:async()=> 'https://merchant.test/wallet',playwright:{evaluate:async()=>({text:ready?'支付方式\n支付宝':'支付方式\n正在加载可用支付方式…'}),getByText:()=>({waitFor:async options=>{assert.equal(options.state,'hidden');ready=true;}})}};
 const raw=await readRenderedDocument(tab);assert.match(raw.text,/支付宝/);assert.equal(raw.url,'https://merchant.test/wallet');assert(Number.isFinite(Date.parse(raw.capturedAt)),'Every rendered observation needs an actual capture timestamp');
 const blocked={...tab,playwright:{...tab.playwright,evaluate:async()=>({text:'正在加载可用支付方式…'}),getByText:()=>({waitFor:async()=>{throw Error('readiness timeout');}})}};await assert.rejects(readRenderedDocument(blocked),/readiness timeout/);
});

test('open document drawer without dialog role is retained; nested portals are not duplicated',async()=>{
 const {inspectDocument}=await import('../collection/browser-driver.mjs');const before=global.document;
 const node=text=>({innerText:text,getClientRects:()=>[{}],contains:()=>false});
 const main=node('官方文档分类与搜索。'.repeat(10)),drawer=node('常见问题\n仅首次购买24小时内可申请退款。'),nested=node('仅首次购买24小时内可申请退款。');drawer.contains=e=>e===nested;
 global.document={title:'Official FAQ',body:main,querySelector:s=>s.startsWith('#betterdocs')?null:main,querySelectorAll:s=>s==='[role="dialog"],dialog[open],[aria-modal="true"]'?[nested]:s==='.ant-drawer-open .ant-drawer-content'?[drawer]:[]};
 try{const s=inspectDocument();assert.equal(s.text.match(/仅首次购买/g).length,1);assert.equal(s.visibleDialogCount,1);assert.equal(s.inputValuesRead,false);}finally{global.document=before;}
});

test('route changes during rendered capture cannot attach a previous document to the new URL',async()=>{
 const {readRenderedDocument}=await import('../collection/browser-driver.mjs');let reads=0;
 await assert.rejects(readRenderedDocument({url:async()=>++reads===1?'https://merchant.test/#/knowledge':'https://merchant.test/#/plan',playwright:{evaluate:async()=>({text:'Official document original'})}}),/route_changed_during_observation/);
});

test('SPA hidden former main and article cannot contaminate current route evidence',async()=>{
 const {inspectDocument}=await import('../collection/visible-document.mjs'),prior=global.document;
 const node=(innerText,shown)=>({innerText,getClientRects:()=>shown?[{}]:[],contains:()=>false});
 const old=node('Wrong old merchant price 9.9/month '.repeat(8),false),current=node('Current visible merchant subscription terms '.repeat(5),true),hiddenArticle=node('Unrelated old WordPress article',false);
 global.document={title:'Current route',body:current,querySelectorAll:s=>s==='#betterdocs-single-content,.betterdocs-single-content'?[hiddenArticle]:s==='main,#main-content,.main-container'?[old,current]:[]};
 try{const out=inspectDocument();assert.equal(out.text.trim(),current.innerText.trim());assert(!out.text.includes('9.9'));assert(!out.text.includes('WordPress'));assert.equal(out.inputValuesRead,false);}finally{global.document=prior;}
});

function mediaFixtureDocument(sections,url='https://www.duyaoss.com/archives/4710/'){
 const all=[];
 const node=(tag,innerText='',attributes={},shown=true)=>{const e={tagName:tag,innerText,children:[],nextElementSibling:null,getClientRects:()=>shown?[{}]:[],getAttribute:k=>attributes[k]??null,contains(other){return this.children.includes(other)||this.children.some(c=>c.contains(other));},querySelectorAll(selector){if(selector==='h2,h3')return this.children.filter(c=>['H2','H3'].includes(c.tagName));if(selector==='a[href],img[src],img[data-src],img[data-original]')return this.children.filter(c=>['A','IMG'].includes(c.tagName));return[];}};if(tag==='A')Object.defineProperty(e,'href',{get:()=>new URL(attributes.href,url).href});if(tag==='IMG')Object.defineProperty(e,'src',{get(){throw Error('Do not activate/read lazy src property');}});all.push(e);return e;};
 const children=[];for(const section of sections){const head=node(section.level||'H3',section.heading,{},section.shown!==false),p=node('P');for(const item of section.media||[])p.children.push(node(item.type||'A','',item.attributes||{href:item.url},item.shown!==false));children.push(head,p);}
 for(let i=0;i<children.length;i++)children[i].nextElementSibling=children[i+1]||null;
 const main=node('MAIN','DuyaoSS\n机场测速观察---V2Tun\n'+sections.filter(s=>s.shown!==false).map(s=>s.heading).join('\n'));main.children=children;
 return{URL:url,title:'V2Tun test article',body:main,querySelectorAll:selector=>selector==='#betterdocs-single-content,.betterdocs-single-content'?[main]:selector==='a[href]'?all.filter(n=>n.tagName==='A'):[]};
}

test('bounded native heading/media observation keeps newest image from each network before filling twelve',async()=>{
 const {inspectDocument}=await import('../collection/visible-document.mjs'),before=global.document,sections=[];
 for(let i=1;i<=15;i++)sections.push({heading:`（联通 2026.10.${String(i).padStart(2,'0')} 晚测速）`,media:[{url:`https://www.duyaoss.com/uploaded/202610${String(i).padStart(2,'0')}_${i.toString(16).padStart(13,'a')}.jpg#vwid=4000&vhei=2000`}]});
 sections.push({heading:'（电信 2026.10.10 晚测速）',media:[{type:'IMG',attributes:{'data-src':'https://www.duyaoss.com/uploaded/20261010_abcdef12345678.png'}}]},{heading:'（移动 2026.10.09 晚测速）',media:[{url:'https://www.duyaoss.com/uploaded/20261009_abcdef12345679.webp'}]});
 global.document=mediaFixtureDocument(sections);
 try{const s=inspectDocument();assert.equal(s.headingMedia.length,12);assert.deepEqual(s.headingMedia.slice(0,3).map(m=>m.heading),['（联通 2026.10.15 晚测速）','（电信 2026.10.10 晚测速）','（移动 2026.10.09 晚测速）']);assert(s.headingMedia.every(m=>m.association==='visible_heading_siblings_until_next_same_or_higher_heading'));assert.equal(s.headingMedia[1].links[0].sourceAttribute,'data-src');assert.equal(s.inputValuesRead,false);
  const parser=require('../collection/url-collectors/duyao-image-reference-parsers.cjs').createParser([{recordId:'A008',articleUrl:global.document.URL,aliases:['V2Tun']}]),d=parser.diagnose({url:global.document.URL,body:s.text,metadata:s,observedAt:'2026-11-11T10:00:00Z',evidenceId:'VISIBLE-FIXTURE'},{recordId:'A008'});assert.equal(d.accepted,true,JSON.stringify(d.reasons));assert.equal(d.facts.length,12);assert(d.facts.some(f=>f.publisherClaimedNetwork==='电信'));
 }finally{global.document=before;}
});

test('native image association stops at same/higher heading and excludes hidden, invalid and unsafe media',async()=>{
 const {inspectDocument}=await import('../collection/visible-document.mjs'),before=global.document;
 const good='https://www.duyaoss.com/uploaded/20261110_abcdef12345678.jpg';
 const sections=[{heading:'（联通 2026.11.10 晚测速）',media:[{url:good},{url:'https://evil.test/uploaded/abcdef12345678.jpg'},{url:good+'?token=SECRET'},{url:good+'#token=SECRET'}]},{heading:'Different service',level:'H2',media:[{url:'https://www.duyaoss.com/uploaded/20261110_abcdef12345679.jpg'}]},{heading:'（电信 2026.11.10 晚测速）',shown:false,media:[{url:'https://www.duyaoss.com/uploaded/20261110_abcdef12345670.jpg'}]},{heading:'（移动 2026.02.30 晚测速）',media:[{url:'https://www.duyaoss.com/uploaded/abcdef12345671.jpg'}]}];
 global.document=mediaFixtureDocument(sections);
 try{const s=inspectDocument();assert.equal(s.headingMedia.length,1);assert.equal(s.headingMedia[0].links.length,1);assert.equal(s.headingMedia[0].links[0].url,good);assert(!JSON.stringify(s.headingMedia).includes('SECRET'));global.document=mediaFixtureDocument(sections,'https://merchant.test/archives/4710/');assert.deepEqual(inspectDocument().headingMedia,[]);}finally{global.document=before;}
});
