const test=require('node:test'),assert=require('node:assert/strict'),{sourceInScope}=require('../scripts/plan-native-policy-links.cjs');
test('native policy indexing reads originals only for active requested records',()=>{
 assert.equal(sourceInScope({recordIds:['A053']},new Set(['A171'])),false);
 assert.equal(sourceInScope({recordIds:['A053','A171']},new Set(['A171'])),true);
 assert.equal(sourceInScope({recordIds:['A047']},new Set()),false);
 assert.equal(sourceInScope({},new Set(['A171'])),false);
});
