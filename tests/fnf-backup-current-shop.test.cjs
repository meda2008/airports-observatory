'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),crypto=require('crypto'),s=JSON.parse(fs.readFileSync('tests/fixtures/fnf-backup-shop-20261120.json','utf8').replace(/^\uFEFF/,'')),p=require('../collection/url-collectors/fnf-backup-current-shop.cjs');
test('real backup merchant body yields exactly six literal starting prices, not line measurements or fabricated cycle totals',()=>{
 const x=p.extract(s,{recordId:'A027',prior:{pricing:{plans:[{name:'old-quarter',amount:26,billingPeriod:'季付'}]}}});assert.deepEqual(x.pricing.plans.map(p=>p.amount),[9.9,19.9,29.9,18.8,48.8,88.8]);assert.equal(x.pricing.priorPlansNotRevalidated.length,1);assert.equal(x.speed,undefined);assert.equal(x.stability,undefined);
 for(const q of x.pricing.plans){assert.equal(q.quote,s.body.slice(q.sourceLocator.start,q.sourceLocator.end));assert.equal(q.sourceLocator.quoteSha256,crypto.createHash('sha256').update(q.quote).digest('hex'));assert.equal(q.currency,null);assert.equal(q.checkoutVerified,false);assert.equal(q.amountBasis,'advertised_starting_price_not_period_total');assert.equal(q.observedAt,s.observedAt);}
 assert.equal(x.website.operatorIdentityVerified,false);assert.equal(require('../collection/url-collectors/index.cjs').forOrigin(s.url,{recordId:'A027'}).origin,p.origin);
});
test('publisher or incomplete/challenged/unbound documents cannot become a price table',()=>{
 for(const patch of [{url:'https://33333.ifnf.xyz/seni/yes/user/shop'},{body:s.body.replace('月付起','总价')},{body:s.body.replace('LV2 MAX','LV1 MAX')},{metadata:{...s.metadata,title:'Foo&Friends'}},{metadata:{...s.metadata,passwordForm:true}},{kind:'verification_checkpoint'},{evidenceId:null}])assert.equal(p.extract({...s,...patch},{recordId:'A027'}),null);
 assert.equal(p.extract(s,{recordId:'A170'}),null);
});
test('covered custom checkbox is checked through its explicit label and verified, never forced',async()=>{
 const {check}=require('../lib/fnf-remember-login.cjs');let checked=false,clicks=0;const box={count:async()=>1,isEnabled:async()=>true,isChecked:async()=>checked},label={count:async()=>1,isVisible:async()=>true,innerText:async()=> '记住我',click:async()=>{checked=true;clicks++;}},page={url:()=>p.origin+'/seni/yes/auth/login',locator:s=>s.startsWith('input')?box:label};
 assert.equal((await check(page,{origin:p.origin})).status,'checked');assert.equal(clicks,1);await check(page,{origin:p.origin});assert.equal(clicks,1);assert.equal(await check(page,{origin:'https://other.invalid'}),null);
});
