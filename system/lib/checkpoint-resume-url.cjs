'use strict';
// A redacted access-form URL is not a business page. Resume its fixed, already
// configured read-only target; never manufacture hidden form data or POST.
function checkpointResumeUrl(config,material={}){const value=material.url;try{const u=new URL(value),native=require('../deploy-service/native-access-gate.cjs');if(material.type==='access_gate'&&native.configured(config)&&u.origin===new URL(config.entryUrl).origin&&u.pathname==='/verify'&&!u.search&&!u.hash)return config.entryUrl;}catch{}return value;}
module.exports={checkpointResumeUrl};
