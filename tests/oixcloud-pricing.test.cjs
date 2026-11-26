'use strict';
const { historicalCaptureOptions } = require('./helpers/historical-capture.cjs');

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const c=require('../collection/url-collectors/oixcloud-shop.cjs'),dir=path.resolve(__dirname,'../work/collection-runs/pricing-13-20261105-v13'),read=f=>JSON.parse(fs.readFileSync(path.join(dir,f)));
test('real selected store cards yield 35 distinct cycle totals, excluding demo/free eligibility and preserving limits', historicalCaptureOptions('work/collection-runs/pricing-13-20261105-v13'),()=>{
 let prior={};for(const file of fs.readdirSync(dir).filter(f=>f.startsWith('oix-')&&f.endsWith('.json'))){const s=read(file);if(s.captureKind!==c.captureKind)continue;const p=c.extract({...s,evidenceId:'OBS'},{prior});if(p)prior=p;}
 assert.equal(prior.pricing.plans.length,35);const by=(name,period)=>prior.pricing.plans.find(p=>p.productName===name&&p.billingPeriod===period);
 assert.equal(by('Pass Iron','年付').amount,192);assert.equal(by('Pass Iron','年付').currency,'CNY');assert.equal(by('Pass Alu','年付').soldOut,true);assert.equal(by('Pass Titanium','月付'),undefined);assert(!prior.pricing.plans.some(p=>p.productName==='Developer Licenses'));
 const meter=by('Real-time payment','年付');assert.equal(meter.amount,600);assert.equal(meter.additionalCharges.perGiB,0.8);assert.equal(meter.additionalCharges.minimumAccountBalance,1200);assert(meter.restrictions.some(t=>t.includes('0.8 CNY/GiB')&&t.includes('1200 CNY')));assert(by('Pass Alu','年付').restrictions.some(t=>t.includes('售罄')));assert.equal(prior.pricing.legacyContinuityVerified,false);assert(prior.pricing.plans.every(p=>p.checkoutVerified===false&&p.sourceIds.length));
});
test('strict cards reject changed origins, missing explicit currency, altered quote and unselected period', historicalCaptureOptions('work/collection-runs/pricing-13-20261105-v13/oix-personal-year.json'),()=>{
 const s={...read('oix-personal-year.json'),evidenceId:'S'};for(const p of [{url:'https://dler.io/user/shop'},{text:s.text.replace(c.currencyQuote,'')},{cards:[{...s.cards[0],selectedPeriod:['月付']}]},{cards:[{...s.cards[0],text:s.cards[0].text.replace('192.00','1.00')}]},{recordId:'A099'},{passwordForm:true}])assert.equal(c.extract({...s,...p}),null);
});
test('registered Dler documentation admits only its exact current shop link and never proves legacy succession', historicalCaptureOptions('work/collection-runs/pricing-13-20261105-v13/A184-native-plans-guide.json'),()=>{
 const proofFile='work/collection-runs/pricing-13-20261105-v13/A184-native-plans-guide.json',sha256=crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'..',proofFile))).digest('hex'),binding={kind:'dler_registered_zone_documentation_shop_link',recordId:'A184',origin:c.origin,file:proofFile,sha256},args={root:path.resolve(__dirname,'..'),recordId:'A184',entryUrl:'https://dler.io/',sourceUrl:c.origin+'/user/shop',bindings:[binding]},bind=require('../lib/source-origin-binding.cjs').assertSourceOrigin;
 const r=bind(args);assert.equal(r.legacyContinuityVerified,false);assert.equal(r.credentialPropagationAllowed,false);assert.throws(()=>bind({...args,recordId:'A015'}),/scope mismatch/);assert.throws(()=>bind({...args,entryUrl:'https://other.invalid/'}),/entry mismatch/);assert.throws(()=>bind({...args,sourceUrl:'https://wrong.invalid/shop'}),/Unbound/);
});
