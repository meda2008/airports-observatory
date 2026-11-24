'use strict';
// Portal registration for the independent backend recipe. Quote evidence is
// parsed separately at the fixed, explicitly authorized native gateway URL.
module.exports={origin:'https://user.heibaojiasu.com',recordIds:['A217'],fields:['pricing'],readOnlyRecipe:'heibao_native_api_readonly',transport:'authenticated_native_api',extract:require('./heibao-native-price.cjs').extract};
