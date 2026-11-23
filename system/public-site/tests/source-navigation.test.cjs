'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {safeUrl,validate}=require('../scripts/build-public-data.cjs');

test('new unpaid-order sources keep authenticated business labels rather than operating-history labels',()=>{
 const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/public-sources.json'),'utf8'));
 const rows=data.items.filter(s=>/^CORE-AUTO-CORE-AUTH-BATCH39[56]-/.test(s.id));assert.equal(rows.length,16);
 for(const s of rows){assert.match(s.label,/登录后页面/);assert.doesNotMatch(s.label,/运营历史/);assert.equal(s.evidenceGrade,'E1');assert.equal(s.independenceScore,'I0');}
});

test('WaveNet replay keeps only observed catalog, help and pre-submit product configuration fragments',()=>{
 const origin='https://npqikg.wavenetttt.sbs/';
 for(const fragment of ['#/plans','#/knowledge','#/order/5?period=year_price'])
  for(const allow of [false,true])assert.equal(safeUrl(origin+fragment,allow),origin+fragment);
 for(const fragment of ['#/orders/5','#/order/pay/12345678901234567890','#/order/6?period=year_price','#/order/5?period=month_price','#/order/5?period=year_price&token=private','#/order/5?period=year_price&period=year_price','#/order/%35?period=year_price','#%2Forder%2F5?period=year_price','#/profile'])
  assert.equal(new URL(safeUrl(origin+fragment,true)).hash,'');
 assert.equal(new URL(safeUrl('https://unbound.invalid/#/order/5?period=year_price',true)).hash,'');
 for(const url of ['http://npqikg.wavenetttt.sbs/#/order/5?period=year_price','https://npqikg.wavenetttt.sbs:8443/#/order/5?period=year_price','https://npqikg.wavenetttt.sbs/clientarea#/order/5?period=year_price'])assert.equal(new URL(safeUrl(url,true)).hash,'');
 assert.equal(safeUrl('https://account:secret@npqikg.wavenetttt.sbs/#/order/5?period=year_price',true),null);
});

test('WaveNet retained configuration and catalog replay bind to their captured public product routes',()=>{
 const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/public-sources.json'),'utf8'));
 for(const [id,url] of [
  ['CORE-AUTH-WAVENET-B258-YEAR-CONFIG','https://npqikg.wavenetttt.sbs/#/order/5?period=year_price'],
  ['CORE-AUTH-WAVENET-B257-ALL-CARDS','https://npqikg.wavenetttt.sbs/#/plans'],
  ['CORE-AUTH-WAVENET-B257-HELP-INDEX','https://npqikg.wavenetttt.sbs/#/knowledge']
 ]){const source=data.items.find(s=>s.id===id);assert.ok(source,id);for(const key of ['url','originalRequestUrl','publicReplayUrl'])assert.equal(source[key],url,id+'.'+key);}
 const payment=data.items.find(s=>s.id==='CORE-AUTH-WAVENET-B258-YEAR-PREORDER');assert.ok(payment);
 assert.equal(payment.url,'https://npqikg.wavenetttt.sbs/#/plans');
 assert.equal(payment.publicReplayUrl,'https://npqikg.wavenetttt.sbs/#/plans');
 assert.equal(payment.originalRequestUrl,'https://npqikg.wavenetttt.sbs/');
 const retained=JSON.parse(fs.readFileSync(path.join(__dirname,'../../catalog/refresh/2026-10-26/core-auth-batch258/sources.json'),'utf8')).sources.find(s=>s.source_id===payment.id);
 const privateReference=retained.url.split('/').at(-1);assert.match(privateReference,/^[0-9]{16,}$/);
 assert.ok(!JSON.stringify(data).includes(privateReference),'Private order reference must not appear in public sources');
});

test('retained business sources preserve only the known static SPA routes and help anchors',()=>{
 for(const url of [
  'https://ednovas.org/#/stage/buysubs',
  'https://board.cloudnier.com/#/stage/dashboard',
  'https://board.cloudnier.com/#/stage/buysubs',
  'https://in.mesl.cloud/#/shop',
  'https://in.mesl.cloud/#/wallet/deposit',
  'https://in.mesl.cloud/#/docs',
  'https://shop.starpro.one/#/plan',
  'https://shop.starpro.one/#/knowledge',
  'https://www.xiaoliyu.me/#/plan',
  'https://www.xiaoliyu.me/#/knowledge',
  'https://dv2dsdgf.quanqiugttt1.club/#/plans',
  'https://tntvipaffb01.cc/#/plan',
  'https://tntvipaffb01.cc/#/dashboard',
  'https://tntvipaffb01.cc/#/knowledge',
  'https://shadow-airport.top/#/plan',
  'https://access.naiunet.com/#/plan',
  'https://access.naiunet.com/#/dashboard',
  'https://access.naiunet.com/#/knowledge',
  'https://home.99ba2026.best/#/plan',
  'https://help.ednovas.me/#tui-kuan-shuo-ming',
  'https://help.ednovas.me/#bei-l',
  'https://github.com/example/repo/issues/1#issuecomment-123'
 ])assert.equal(safeUrl(url,true),url);
});

test('retained document and payment-help deep links reject secret and unobserved variants',()=>{
 const retained=[
  'https://board.cloudnier.com/#/stage/dashboard',
  'https://board.cloudnier.com/#/stage/buysubs',
  'https://shop.starpro.one/#/knowledge',
  'https://tntvipaffb01.cc/#/knowledge',
  'https://cloud.e-ix.com/#/docs/20',
  'https://cloud.e-ix.com/#/docs/32',
  'https://cloud.e-ix.com/#/docs/54',
  'https://cloud.e-ix.com/#/wallet/deposit',
  'https://portal.skylinx.org/#/plan',
  'https://portal.skylinx.org/#/dashboard',
  'https://portal.skylinx.org/#/knowledge',
  'https://nicecloud.co/#/docs',
  'https://in.mesl.cloud/#/docs/68',
  'https://ss-id.com/#/docs/45',
  'https://user.665353.xyz/#/plan',
  'https://access.naiunet.com/#/knowledge',
  'https://guolicheng.cc/index.php#/knowledge',
  'https://access.shandiancn.com/#/knowledge',
  'https://www.xiaoliyu.me/#/dashboard',
  'https://aff01.zygbx.com/#/plan',
  'https://aff01.zygbx.com/#/knowledge',
  'https://a01.xxfaffa01.cc/#/store',
  'https://a01.xxfaffa01.cc/#/help'
 ];
 for(const value of retained){
  assert.equal(safeUrl(value,true),value);
  const queried=new URL(value);queried.searchParams.set('token','private');
  assert.equal(safeUrl(queried.href,true),value,'top-level token removed, exact page retained');
  for(const suffix of ['?token=private','/profile','%3Ftoken%3Dprivate'])
   assert.equal(new URL(safeUrl(value+suffix,true)).hash,'','unobserved fragment rejected');
  const wrongHost=new URL(value);wrongHost.hostname+='-unbound.invalid';
  assert.equal(new URL(safeUrl(wrongHost.href,true)).hash,'');
 }
 for(const value of [
  'https://cloud.e-ix.com/#/docs/21',
  'https://cloud.e-ix.com/#/profile',
  'https://cloud.e-ix.com/#/orders/20',
  'https://portal.skylinx.org/#/ticket/1',
  'https://nicecloud.co/#/docs/999',
  'https://cloud.e-ix.com/#%2Fdocs%2F20'
 ])assert.equal(new URL(safeUrl(value,true)).hash,'');
 assert.equal(safeUrl('https://user:password@cloud.e-ix.com/#/docs/20',true),null);
});

test('published retained sources replay their captured business pages rather than the homepage',()=>{
 const projected=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/public-sources.json'),'utf8'));
 const expected={
  'CORE-PUBLIC-YTOO-B243-ORDINARY-CATALOG':'https://y-too.net/cart.php',
  'CORE-PUBLIC-YTOO-B243-TEAM-CATALOG':'https://y-too.net/cart.php?gid=4',
  'CORE-PUBLIC-FLOWER-B242-PAYMENT-PREVIEW':'https://api-flowercloud.com/cart.php?a=checkout',
  'CORE-AUTH-EIX-B232-ANDROID-TV':'https://cloud.e-ix.com/#/docs/54',
  'CORE-AUTH-NIER-B229-DNS-NOTICE':'https://board.cloudnier.com/#/stage/dashboard',
  'CORE-AUTH-NIER-B229-CURRENT-CARDS':'https://board.cloudnier.com/#/stage/buysubs',
  'CORE-AUTH-GALAXY-B228-STARDUST':'https://galaxycloud.cc/checkout?id=2',
  'CORE-AUTH-GALAXY-B228-PLANET':'https://galaxycloud.cc/checkout?id=3',
  'CORE-AUTH-GALAXY-B228-STAR':'https://galaxycloud.cc/checkout?id=4',
  'CORE-AUTH-GALAXY-B228-LIGHT':'https://galaxycloud.cc/checkout?id=5',
  'CORE-AUTH-GALAXY-B228-GALAXY':'https://galaxycloud.cc/checkout?id=6',
  'CORE-AUTH-GALAXY-B228-ONETIME':'https://galaxycloud.cc/checkout?id=7',
  'CORE-AUTH-JIU-B226-RENEWAL-FAQ':'https://shop.starpro.one/#/knowledge',
  'CORE-AUTH-TNT-B225-IOS':'https://tntvipaffb01.cc/#/knowledge',
  'CORE-AUTH-EIX-B205-DEPOSIT-CONDITIONS':'https://cloud.e-ix.com/#/wallet/deposit',
  'CORE-AUTH-EIX-B205-WINDOWS':'https://cloud.e-ix.com/#/docs/20',
  'CORE-AUTH-EIX-B205-ANDROID':'https://cloud.e-ix.com/#/docs/32',
  'CORE-AUTH-SKYLINX-B206-NOTICE':'https://portal.skylinx.org/#/dashboard',
  'CORE-AUTH-SKYLINX-B206-PLANS':'https://portal.skylinx.org/#/plan',
  'CORE-AUTH-SKYLINX-B206-CAMPUS-DNS':'https://portal.skylinx.org/#/knowledge',
  'CORE-AUTH-NEXUS-B208-SSR-NOTICE':'https://nexuscloud.ch/index.php?rp=/announcements/2/SSR.html',
  'CORE-AUTH-NEXUS-B208-TERMINATION-NOTICE':'https://nexuscloud.ch/index.php?rp=/announcements/1/XIANYUCLOUD-IS-BEST.html',
  'CORE-AUTH-NAIU-B210-WINDOWS':'https://access.naiunet.com/#/knowledge',
  'CORE-AUTH-ORANGE-B211-PLANS':'https://guolicheng.cc/index.php#/plan',
  'CORE-AUTH-ORANGE-B211-TERMS':'https://guolicheng.cc/index.php#/knowledge',
  'CORE-AUTH-SHANDIAN-B214-PURCHASE-TERMS':'https://access.shandiancn.com/#/knowledge',
  'CORE-AUTH-SHANDIAN-B214-RENEWAL-NOTICE':'https://access.shandiancn.com/#/dashboard',
  'CORE-AUTH-LIYU-B215-OPENING-LABEL':'https://www.xiaoliyu.me/#/dashboard',
  'CORE-AUTH-DAGE-B216-PLANS':'https://aff01.zygbx.com/#/plan',
  'CORE-AUTH-DAGE-B216-MAC-DOCUMENT':'https://aff01.zygbx.com/#/knowledge',
  'CORE-AUTH-XXF-B221-NORMAL':'https://a01.xxfaffa01.cc/#/store',
  'CORE-AUTH-XXF-B221-RESET-FAQ':'https://a01.xxfaffa01.cc/#/help'
 };
 for(const [id,url]of Object.entries(expected)){
  const source=projected.items.find(s=>s.id===id);assert.ok(source,id);
  for(const key of ['url','originalRequestUrl','publicReplayUrl'])assert.equal(source[key],url,id+'.'+key);
 }
});

test('observed public announcement query routes retain no account or token state',()=>{
 for(const value of [
  'https://nexuscloud.ch/index.php?rp=/announcements/2/SSR.html',
  'https://nexuscloud.ch/index.php?rp=/announcements/1/XIANYUCLOUD-IS-BEST.html'
 ])for(const allowPublicQuery of [false,true])assert.equal(safeUrl(value,allowPublicQuery),value);
 for(const value of [
  'https://nexuscloud.ch/index.php?rp=/announcements/2/SSR.html&token=private',
  'https://nexuscloud.ch/index.php?rp=/announcements/2/SSR.html&rp=/profile',
  'https://nexuscloud.ch/index.php?rp=/announcements/999/private.html',
  'https://nexuscloud.ch/index.php?rp=/clientarea/123',
  'https://nexuscloud.ch/index.php?rp=%252Fannouncements%252F2%252FSSR.html',
  'https://nexuscloud.ch:8443/index.php?rp=/announcements/2/SSR.html',
  'http://nexuscloud.ch/index.php?rp=/announcements/2/SSR.html',
  'https://unbound.invalid/index.php?rp=/announcements/2/SSR.html'
 ])for(const allowPublicQuery of [false,true])assert.equal(new URL(safeUrl(value,allowPublicQuery)).search,'');
 assert.equal(safeUrl('https://user:password@nexuscloud.ch/index.php?rp=/announcements/2/SSR.html'),null);
});

test('publication validation accepts only the two observed announcement query values',()=>{
 const load=name=>JSON.parse(fs.readFileSync(path.join(__dirname,'../data/'+name),'utf8'));
 const catalog=load('public-catalog.json'),sources=load('public-sources.json'),ledger=load('public-ledger.json');
 assert.doesNotThrow(()=>validate(catalog,sources,ledger));
 const source=sources.items.find(s=>s.id==='CORE-AUTH-NEXUS-B208-SSR-NOTICE');assert.ok(source);
 for(const url of [
  'https://nexuscloud.ch/index.php?rp=/clientarea/123',
  'https://nexuscloud.ch/index.php?rp=/announcements/2/SSR.html&token=private',
  'https://nexuscloud.ch/index.php?rp=/announcements/2/SSR.html&rp=/profile',
  'https://unbound.invalid/index.php?rp=/announcements/2/SSR.html'
 ]){
  source.url=url;
  assert.throws(()=>validate(catalog,sources,ledger),/Unsafe query key/);
 }
});

test('business replay routes cannot carry account, token, arbitrary hash or userinfo state',()=>{
 for(const url of [
  'https://in.mesl.cloud/#/shop?token=private',
  'https://in.mesl.cloud/#/profile',
  'https://in.mesl.cloud/#/orders/123',
  'https://shop.starpro.one/#/register?code=private',
  'https://www.xiaoliyu.me/#/plan?token=private',
  'https://dv2dsdgf.quanqiugttt1.club/#/plans?token=private',
  'https://tntvipaffb01.cc/#/dashboard?token=private',
  'https://home.99ba2026.best/#/profile',
  'https://in.mesl.cloud/#%2Fshop',
  'https://unbound.invalid/#/shop'
 ])assert.equal(new URL(safeUrl(url,true)).hash,'');
 assert.equal(safeUrl('https://in.mesl.cloud/?token=private#/shop',true),'https://in.mesl.cloud/#/shop');
 assert.equal(safeUrl('https://user:password@in.mesl.cloud/#/shop',true),null);
});

test('Galaxy product replay keeps only the six observed product IDs without private query state',()=>{
 for(const id of ['2','3','4','5','6','7'])for(const allow of [false,true])assert.equal(safeUrl('https://galaxycloud.cc/checkout?id='+id,allow),'https://galaxycloud.cc/checkout?id='+id);
 for(const value of ['https://galaxycloud.cc/checkout?id=2&token=private','https://galaxycloud.cc/checkout?id=2&id=3','https://galaxycloud.cc/checkout?id=999','https://galaxycloud.cc/checkout?id=%32','https://galaxycloud.cc/my_order?id=2','https://galaxycloud.cc:8443/checkout?id=2','http://galaxycloud.cc/checkout?id=2','https://unbound.invalid/checkout?id=2'])for(const allow of [false,true])assert.equal(new URL(safeUrl(value,allow)).search,'');
 assert.equal(safeUrl('https://user:password@galaxycloud.cc/checkout?id=2'),null);
});
test('publication rejects unobserved or private variants of retained Galaxy product sources',()=>{
 const load=name=>JSON.parse(fs.readFileSync(path.join(__dirname,'../data/'+name),'utf8'));
 const catalog=load('public-catalog.json'),sources=load('public-sources.json'),ledger=load('public-ledger.json');
 const source=sources.items.find(s=>s.id==='CORE-AUTH-GALAXY-B228-STARDUST');assert.ok(source);
 assert.doesNotThrow(()=>validate(catalog,sources,ledger));
 for(const url of ['https://galaxycloud.cc/checkout?id=999','https://galaxycloud.cc/checkout?id=2&token=private','https://galaxycloud.cc/checkout?id=2&id=3','https://unbound.invalid/checkout?id=2']){source.url=url;assert.throws(()=>validate(catalog,sources,ledger),/Unsafe query key/);}
});

test('observed FlowerCloud payment page keeps only its exact public route',()=>{
 const url='https://api-flowercloud.com/cart.php?a=checkout';
 assert.equal(safeUrl(url,true),url);
 assert.equal(safeUrl(url),url);
 for(const value of [url+'&token=private',url+'&a=checkout','https://api-flowercloud.com/cart.php?a=%63heckout','https://api-flowercloud.com/cart.php?a=view','https://api-flowercloud.com/cart.php?invoiceid=1','https://api-flowercloud.com:444/cart.php?a=checkout','https://example.invalid/cart.php?a=checkout'])assert.equal(new URL(safeUrl(value,true)).search,'');
 assert.equal(safeUrl('https://account:secret@api-flowercloud.com/cart.php?a=checkout',true),null);
});

test('observed Ytoo team catalog preserves only its exact public category query',()=>{
 const url='https://y-too.net/cart.php?gid=4';
 assert.equal(safeUrl(url,true),url); assert.equal(safeUrl(url),url);
 for(const value of [url+'&token=private',url+'&gid=4','https://y-too.net/cart.php?gid=%34','https://y-too.net/cart.php?gid=04','https://y-too.net/cart.php?gid=5','https://y-too.net/cart.php?a=add&pid=14','https://y-too.net:444/cart.php?gid=4','https://example.invalid/cart.php?gid=4'])assert.equal(new URL(safeUrl(value,true)).search,'');
});
