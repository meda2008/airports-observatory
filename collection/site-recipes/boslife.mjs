const origin='https://www.blnew.com';
const paths={email:'/proxy/passport/comm/sendEmailVerify',register:'/proxy/passport/auth/register'};
export function classifyBoslifeResponse({operation,httpStatus,message}){
 if(operation==='register'&&message==='必须使用邀请码才可以注册')return{status:'registration_invitation_required',message,invitationRequired:true};
 if(operation==='email'&&message==='验证码有误')return{status:'email_request_verification_rejected',message,emailRequestAccepted:false,emailDeliveryVerified:false};
 if(operation==='register'&&['邮箱验证码有误','验证码有误'].includes(message))return{status:'registration_verification_rejected',message};
 if(httpStatus>=400)return{status:'registration_business_response_rejected',message:'unclassified_rejection_message_not_retained'};
 return{status:'registration_response_requires_ui_confirmation',message:'response_body_not_retained'};
}
export async function readBoslifeResponse({tab,cdp,afterSequence,operation,timeoutMs=10000}){
 if(new URL(await tab.url()).origin!==origin||!paths[operation])throw Error('boslife_response_scope_mismatch');
 const until=Date.now()+timeoutMs;let cursor=afterSequence;
 do{
  const batch=await cdp.readEvents({afterSequence:cursor,methods:['Network.responseReceived'],limit:100,timeoutMs:Math.max(1,until-Date.now())});cursor=batch.cursor;
  const matches=batch.events.filter(e=>{try{const u=new URL(e.params.response.url);return u.origin===origin&&u.pathname===paths[operation];}catch{return false;}});
  if(matches.length){const responses=[];for(const response of matches){const raw=await cdp.send('Network.getResponseBody',{requestId:response.params.requestId});let message='';try{const parsed=JSON.parse(raw.body||'{}');message=String(parsed.message||parsed.error||parsed.msg||'');}catch{}responses.push({...classifyBoslifeResponse({operation,httpStatus:response.params.response.status,message}),httpStatus:response.params.response.status});}return{...responses.at(-1),...(responses.some(r=>r.invitationRequired)?{invitationRequiredObserved:true}:{}),responses,operation,endpoint:origin+paths[operation],observedAt:new Date().toISOString(),requestBodyRead:false,codePersisted:false};}
  if(!batch.events.length&&!batch.hasMore)break;
 }while(Date.now()<until);
 return{status:'registration_response_unconfirmed',operation,emailRequestAccepted:null,emailDeliveryVerified:false,requestBodyRead:false,codePersisted:false};
}
export async function observeBoslifeAction({tab,operation,action}){
 if(new URL(await tab.url()).origin!==origin||!paths[operation])throw Error('boslife_action_scope_mismatch');
 const cdp=await tab.capabilities.get('cdp');await cdp.send('Network.enable');const before=await cdp.readEvents({methods:['Network.responseReceived'],limit:1});
 await action();return readBoslifeResponse({tab,cdp,operation,afterSequence:before.cursor});
}
