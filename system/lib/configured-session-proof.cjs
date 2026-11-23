'use strict';
// A bounded UI observation, not an account balance, token or operator-identity proof.
async function configuredSessionVisible(page,config,snapshot={}){try{if(config?.auth?.mode!=='login'||typeof config.auth.successSelector!=='string'||!config.auth.successSelector||snapshot.passwordForm||snapshot.verificationWidgetObserved||snapshot.agreementCheckbox||snapshot.type)return false;const current=new URL(page.url()),entry=new URL(config.entryUrl);if(current.origin!==entry.origin||!config.allowedHosts?.includes(current.hostname))return false;const marker=page.locator(config.auth.successSelector);return await marker.count()===1&&await marker.isVisible();}catch{return false;}}
module.exports={configuredSessionVisible};
