'use strict';
// /plan is declared by the same-origin official umi client (retained SHA256
// 3dd39f6ebb34211761fe34d8e2d33df948b12f1cbe136eff769ae9c4473caa40).
// It is the catalog route, never a product purchase or order action.
const origin='https://aicoffee.app';
function createCollector({readDocument}={}){return async function collectMany(tab){
 const read=readDocument||((t)=>import('../visible-document.mjs').then(m=>m.readRenderedDocument(t)));
 const u=new URL(await tab.url()),initial=await read(tab);
 if(u.origin!==origin||u.pathname!=='/'||!['#/dashboard','#/plan'].includes(u.hash)||initial.passwordForm||initial.verificationWidgetObserved||initial.agreementCheckbox)return{captures:[initial]};
 if(u.hash==='#/dashboard')await tab.goto(origin+'/#/plan');
 await tab.playwright.getByText(/[¥￥]\s*\d|\d+(?:\.\d+)?\s*(?:CNY|元)/).first().waitFor({state:'visible',timeoutMs:9000});
 const after=await read(tab),v=new URL(await tab.url());
 if(v.origin!==origin||v.pathname!=='/'||v.hash!=='#/plan')throw Error('coffee_catalog_destination_changed');
 if(after.passwordForm||after.verificationWidgetObserved||after.agreementCheckbox)throw Error('coffee_catalog_guarded');
 return{captures:u.hash==='#/dashboard'?[initial,after]:[after],newOrdersCreated:0,paymentExecuted:false};
};}
module.exports={origin,recordIds:['A078'],fields:['pricing'],readOnlyRecipe:'official_client_declared_coffee_plan_catalog',createCollector,collectMany:createCollector(),extract:()=>null};
