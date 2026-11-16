import {catalog,search,QueryError} from './public-models.mjs?v=4d60d0c3aef6092f';
let pending;
async function loadJSON(file,expected){
  const r=await fetch(new URL('./'+file,import.meta.url),{credentials:'omit',signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error('公开资料加载失败');
  const bytes=await r.arrayBuffer();
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  if(digest!==expected)throw Error('公开资料完整性检查失败');
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function data(){
 if(!pending)pending=loadJSON('index-52e129ade1e9c7f6.json','52e129ade1e9c7f65ff162fd554d29f799b0ec572d9108b551fccc068a65fddb').catch(e=>{pending=undefined;throw e;});
 return pending;
}
export async function publicRead(input){
 const u=new URL(input,'https://airports.vigorai.top');
 if(u.origin!=='https://airports.vigorai.top')throw Error('不接受外部接口');
 const route=u.pathname;
 // This allowlist is read-only. No request reaches any admin/update endpoint.
 if(!['/api/catalog','/api/search','/api/stats'].includes(route)&&!/^\/api\/airports\/A\d{3}$/.test(route))throw Error('公开站不提供管理或更新接口');
 const d=await data(),q={};
 const allowed=route==='/api/catalog'?['scope','q','payment','refund','price','page','limit']:route==='/api/search'?['criterion','currency','q','maxMonthly','needs']:[];
 for(const[k,v]of u.searchParams){if(!allowed.includes(k)||Object.hasOwn(q,k))throw new QueryError('无效或重复参数');q[k]=v;}
 if(route==='/api/catalog')return catalog(d,q);
 if(route==='/api/search')return search(await loadJSON('search-9c744a97095b55cc.json','9c744a97095b55cc6bc4f7d882e188286318878e38c8dc01f1f5560cbe5a0e3a'),q);
 if(route==='/api/stats')return{...d.stats,...d.publication};
 const ref=d.details[route.split('/').at(-1)];if(!ref)throw Error('未找到机场');return{item:await loadJSON(ref.file,ref.sha256)};
}
