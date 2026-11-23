'use strict';
const origin='https://forest-01.com',path='/tJ8o-O6qU-0sC4cR-5eI2iL8-gR9hS4hM8';
function configured(c){try{return c.recordId==='A063'&&new URL(c.entryUrl).origin===origin&&c.auth?.rpcLogin==='forest_scheme_login_v1'&&!c.publicOnly;}catch{return false;}}
function hasState(s){return !!s?.origins?.some(x=>x.origin===origin&&x.localStorage?.some(v=>v.name==='authToken'&&typeof v.value==='string'&&v.value.length>20));}
function create(config,credential){const enabled=configured(config)&&credential?.origin===origin;let result=null,waiters=[];
 function publish(value){result=value;for(const resolve of waiters.splice(0))resolve(value);}
 return{enabled,async observe(response){try{const u=new URL(response.url());if(!enabled||response.request().method()!=='GET'||u.origin!==origin||u.pathname!==path||u.hash||[...u.searchParams].length!==1||u.searchParams.get('scheme')!=='user/checkLogin')return;const body=await response.body();if(body.length>8192)return;const v=JSON.parse(body);publish({observed:response.status()===200&&v.success===true&&v.data?.is_login===true&&v.data.email?.toLowerCase()===credential.email.toLowerCase(),basis:'native_same_origin_check_login_email_bound',bodyExported:false});}catch{}},reset(){result=null;},snapshot(){return result||{observed:false,basis:'native_check_login_not_observed',bodyExported:false};},async wait(timeoutMs=12000){if(result)return result;let timer,resolve;const p=new Promise(r=>{resolve=r;waiters.push(r);timer=setTimeout(()=>r(null),timeoutMs);});try{await p;return this.snapshot();}finally{clearTimeout(timer);waiters=waiters.filter(x=>x!==resolve);}}};
}
module.exports={configured,hasState,create,origin,path};
