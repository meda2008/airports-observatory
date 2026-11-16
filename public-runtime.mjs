import {catalog,search,QueryError} from './public-models.mjs';
let pending;
async function data(){
 if(!pending)pending=(async()=>{
  const r=await fetch(new URL('./catalog-923471c281ad3782.json',import.meta.url),{credentials:'omit',signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error('公开资料加载失败');
  const bytes=await r.arrayBuffer();
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  if(digest!=='923471c281ad37825635836a26747b34214e72ed6887cd70af9196cbaf0a3b6e')throw Error('公开资料完整性检查失败');
  const s=JSON.parse(new TextDecoder().decode(bytes));
  return{records:s.records,stats:s.stats,publication:{snapshotId:s.sourceSnapshotId,sourceAsOf:s.sourceAsOf}};
 })().catch(e=>{pending=undefined;throw e;});
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
 if(route==='/api/search')return search(d,q);
 if(route==='/api/stats')return{...d.stats,...d.publication};
 const item=d.records.find(r=>r.id===route.split('/').at(-1));if(!item)throw Error('未找到机场');return{item};
}
