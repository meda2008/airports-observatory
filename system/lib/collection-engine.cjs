'use strict';
// Pure contracts shared by the CLI and the CUA browser driver. No network access.
const crypto=require('node:crypto'),net=require('node:net');
const FIELDS=['pricing','payment','refund','privacy','compatibility','operatingHistory','speed','stability','promotions'];
const sha=value=>crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
function safeUrl(value){
 try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port&&!['80','443'].includes(u.port))return null;for(const key of [...u.searchParams.keys()])if(/^__cf_chl_/i.test(key))u.searchParams.delete(key);
 const h=u.hostname.toLowerCase();if(net.isIP(h)||h==='localhost'||!h.includes('.')||/\.(local|internal|localhost)$/.test(h))return null;
 if(/[?&](token|key|email|password|access_token|auth|subscribe|session|sid)=/i.test(u.search))return null;
 const publicTelegramPreview=h==='t.me'&&/^\/s\/[a-z0-9_]{5,}(?:\/\d+)?\/?$/i.test(u.pathname)&&[...u.searchParams.keys()].every(k=>['q','before','after'].includes(k));
 if(/\/(?:api|s)\//i.test(u.pathname)&&!publicTelegramPreview)return null;
 if(/checkout|logout|resetpassword|createorder|payment\/callback/i.test(u.pathname+u.hash))return null;
 if(u.searchParams.has('a')&&!['view'].includes(u.searchParams.get('a')))return null;
 return u.href;}catch{return null;}
}
function safeEvidenceUrl(value,snapshot,context={}){
 const normal=safeUrl(value);if(normal)return normal;
 // Evidence-only: an explicitly scoped, existing public-IP business origin.
 // Never enables discovery, navigation, checkout execution or private IP access.
 try{const u=new URL(value),a=u.hostname.split('.').map(Number),publicV4=net.isIPv4(u.hostname)&&a[0]>0&&a[0]<224&&![10,127].includes(a[0])&&!(a[0]===100&&a[1]>=64&&a[1]<=127)&&!(a[0]===169&&a[1]===254)&&!(a[0]===172&&a[1]>=16&&a[1]<=31)&&!(a[0]===192&&(a[1]===0||a[1]===168))&&!(a[0]===198&&(a[1]===18||a[1]===19||a[1]===51))&&!(a[0]===203&&a[1]===0);if(publicV4&&u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.pathname==='/'&&!u.search&&!u.hash&&context.authorizedCapturedOrigin===u.origin&&snapshot?.collectionContext==='user_authorized_retained_ip_business_evidence'&&snapshot.authenticationObserved===true&&snapshot.actualOrderUrlWithheld===true&&['unpaid_order_payment_methods','cancelled_order_terminal_state'].includes(snapshot.kind))return u.href;}catch{}
 try{const u=new URL(value);return snapshot?.kind==='unpaid_order_configuration'&&snapshot.collectionContext==='user_authorized_temporary_unpaid_order'&&snapshot.actualOrderUrlWithheld===true&&u.protocol==='https:'&&!u.port&&!u.search&&!u.hash&&/^\/checkout\/?$/.test(u.pathname)&&safeUrl(u.origin)?u.href:null;}catch{return null;}
}
function canonical(value){const clean=safeUrl(value);if(!clean)return null;const u=new URL(clean);for(const k of [...u.searchParams.keys()])if(/^(utm_|aff|ref|code|invite)/i.test(k))u.searchParams.delete(k);u.hash='';return u.href;}
function safeReadLink(link,origin){
 const clean=safeUrl(link.url);if(!clean)return false;const u=new URL(clean);if(u.origin!==origin)return false;
 if(/logout|reset|forget|register|checkout|cancel|delete|renew|addfunds|confproduct|subscribe|invite|ticket|download|\.exe|\.apk|\.dmg/i.test(u.pathname+u.hash))return false;
 if(/立即购买|立即订阅|下单|结账|支付订单|Buy now|Order now|Subscribe now/i.test(link.label))return false;
 if(/申请退款|提交退款|request.*refund|submit.*refund/i.test(link.label)||/\/refund\/(request|submit|create)(?:\/|$)/i.test(u.pathname))return false;
 if([...u.searchParams.keys()].some(k=>!['a','gid','rp','language','currency'].includes(k)))return false;
 if(u.searchParams.has('a')&&!['view'].includes(u.searchParams.get('a')))return false;
 return /关于|公告|优惠|促销|活动|about|announcement|coupon|promotion|offers|套餐|价格|支付|付款|退款|隐私|条款|帮助|文档|钱包|个人中心|pricing|plans?|shop|store|wallet|profile|faq|knowledge|docs?|terms|privacy|tos|cart|billing|refund|trial|support|help/i.test(link.label+' '+u.pathname+' '+u.hash);
}
function redact(value){return String(value||'').split('\n').filter(line=>!/(?:ss|ssr|vmess|vless|trojan|hy2|hysteria2|tuic):\/\/|[?&](?:token|auth_key|access_token)=|\/client\/subscribe|\/s\/[a-f0-9]{24,}/i.test(line)).map(line=>line.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email redacted]').replace(/\b[a-f0-9]{32,}\b/gi,'[identifier redacted]')).filter(line=>!/^\s*(账户余额|可用佣金|待确认佣金|用户ID|Account balance)\b/i.test(line)).join('\n').slice(0,120000);}
function classify(s){const t=s.text||'';
 if(/Error\s*1005/i.test(t)&&/banned the autonomous system number|ASN.*(?:banned|denied)|封禁.*ASN/i.test(t))return 'error_page_observed';
 try{const u=new URL(s.url);if(/^\/(error-page|not-found|404|500)\/?$/.test(u.pathname)||/^#\/(error-page|not-found|404|500)\/?$/.test(u.hash))return 'error_page_observed';}catch{}
 if(/验证码访问|手动输入验证码/.test(t)&&/验证并继续访问|4\s*位数字|四位数字/.test(t))return 'needs_human_verification';
 if(s.verificationWidgetObserved===true||/请验证您是真人|正在进行安全验证|访问验证|verify you are human|just a moment|captcha|hcaptcha|turnstile|我不是恶意刷站|异常流量/i.test(t+' '+s.title)||s.passwordForm&&/请点击验证码|请完成人机验证|请完成验证后登录/i.test(t))return 'needs_human_verification';
 if(/^(?:Your browser will jump to the page you visited after 5 seconds\.|您的浏览器将在五秒后跳转到您访问的页面。)/m.test(t.trim())&&t.trim().length<350)return 'access_protection_wait';
 if(t.length<700&&/^即将打开[a-z0-9.-]+\.[a-z]{2,}\s*$/i.test(t.trim().split('\n')[0])&&t.includes('本页面Apple Cloud防御由Apple Cloud提供')&&/^请稍候，我们正在检查您的浏览器，最多等待(?:[1-9]|1\d|20)秒$/m.test(t))return 'access_protection_wait';
 if(/connection is not private|ERR_CERT|隐私错误|您的连接不是私密连接/i.test(t+' '+s.title))return 'security_warning';
 if(/^\s*404\b/.test(t)&&/页面不存在|页面.*无法访问|page not found/i.test(t.slice(0,180)))return 'error_page_observed';
 if(/进入前确认|继续即表示同意|点击继续即默认同意/i.test(t))return 'requires_terms_confirmation';
 if(s.accountManagementObserved===true)return 'content_observed';
 if(s.passwordForm&&s.passwordInputCount===2&&/注册|sign up|register|create account/i.test(t+' '+s.title))return 'registration_required';
 if(s.passwordForm&&(s.passwordInputCount===undefined||s.passwordInputCount===1))return 'login_required';
 if(t.trim().length<70||/正在初始化页面/.test(t)&&/正在准备页面资源/.test(t)&&!(s.blocks||[]).length)return 'empty_or_loading';
 return 'content_observed';
}
function family(s){const u=s.url||'',t=s.text||'';if(/cart\.php|clientarea\.php|\/store\//i.test(u)||/WHMCS/i.test(t))return 'whmcs';if(/#\/(dashboard|plan|shop|knowledge|profile)/i.test(u))return 'v2board';if(/wordpress|betterdocs|\/docs\//i.test(u))return 'document_site';return 'generic';}
function extract(s,sourceId){
 const lines=redact(s.text).split('\n').map(x=>x.trim()).filter(Boolean),out=[];
 const add=(field,kind,quote,extra={})=>out.push({field,kind,quote,sourceId,observedAt:s.capturedAt,independentlyVerified:false,...extra});
 const selectors={payment:/支付宝|微信支付|Alipay|WeChat Pay|PayPal|USDT|TRC20|ERC20|Visa|MasterCard|银联|信用卡|Bitcoin/i,refund:/退款|refund|不退还/i,privacy:/隐私|日志|privacy|no.logs|retention/i,compatibility:/设备|客户端|IP限制|仅.*地区|新疆|海外|iOS|Android|Windows|macOS/i,operatingHistory:/成立|创立|开业|founded|established|since\s*20\d{2}|运营.*年/i,speed:/Mbps|Gbps|MB\/s|限速|带宽|测速/i,stability:/维护|故障|不可用|恢复|稳定|SLA|uptime/i,promotions:/优惠|折扣|优惠码|赠送|返佣|coupon|discount/i};
 for(const [field,re]of Object.entries(selectors)){for(const line of lines.filter(l=>re.test(l)).slice(0,15))add(field,field==='operatingHistory'?'unverified_history_statement':field==='speed'||field==='stability'?'unmeasured_statement':'text_hint_requires_review',line.slice(0,900));}
 for(const block of (s.blocks||[]).slice(0,80)){const text=redact(block.text);if(!/[$¥￥€£]\s*\d|\d[\d.,]*\s*(CNY|USD|元)/i.test(text))continue;
 for(const m of text.matchAll(/([$¥￥€£])\s*(\d[\d,.]*)/g)){if(!/^\d+(?:\.\d{1,2})?$/.test(m[2])&&!/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(m[2]))continue;const amount=Number(m[2].replaceAll(',',''));if(!Number.isFinite(amount))continue;add('pricing','visible_price_candidate',text.slice(0,1600),{amount,currency:/\bCNY\b/.test(text)?'CNY':/\bUSD\b/.test(text)?'USD':null,currencySymbol:m[1],billingPeriod:(text.match(/月付|月缴|季付|年付|年缴|每月|每年|Monthly|Annually|Quarterly|One Time/i)||[])[0]||null,identityOfPrice:'unreviewed_may_be_wallet_or_addon',checkoutVerified:false});}}
 const seen=new Set();return out.filter(x=>{const k=sha([x.field,x.quote,x.amount]);if(seen.has(k))return false;seen.add(k);return true;});
}
function makePlan(catalog,{runId,overrides={}}={}){
 const records=[],groups=new Map();for(const r of catalog.items){const w=r.coreInfo?.website||{},o=overrides[r.id]||{},url=safeUrl(o.entryUrl||w.url||r.officialUrl),conflict=/conflict|rejected|for_sale|cloud_phone|personal_blog|demonstration|inherited_unverified/.test(w.status||'');
 let status=r.listing?.primary===false?'excluded_non_primary':o.skip?'excluded_user_request':!url?'needs_official_entry':conflict&&!o.allowIdentityReview?'needs_identity_review':'queued';
 if(['A034','A047'].includes(r.id)&&!o.resumeUserSkipped)status='excluded_user_request';
 const row={recordId:r.id,name:r.name,entryUrl:url,status,reason:o.reason||w.basis||null,missing:FIELDS.filter(f=>f==='pricing'?!r.coreInfo?.pricing?.plans?.some(p=>typeof p.amount==='number'):f==='payment'?!r.coreInfo?.payment?.methods?.length:f==='speed'||f==='stability'?!r.coreInfo?.[f]?.measured?.observations?.length:f==='operatingHistory'?!r.coreInfo?.operatingHistory?.continuousOperationVerified:f==='promotions'?!r.coreInfo?.promotions?.length:!r.coreInfo?.[f]?.summary),adapter:o.adapter||null};records.push(row);
 if(status==='queued'){const key=url;let task=groups.get(key);if(!task){task={taskId:sha(key).slice(0,16),recordIds:[],name:r.name,entryUrl:url,adapter:o.adapter||'auto',allowedHosts:[new URL(url).hostname,...(o.allowedHosts||[])],maxPages:o.maxPages||4,status:'queued',...(o.registrationProfile?{registrationProfile:o.registrationProfile}:{})};groups.set(key,task);}task.recordIds.push(r.id);}}
 return {schemaVersion:'airports-collection-run.v1',runId,createdAt:new Date().toISOString(),records,tasks:[...groups.values()],boundary:'All records accounted for; queued browser tasks are not successful collection. Identity conflicts are never silently merged.'};
}
function discover(snapshot,{knownUrls=[],sourceId}={}){
 const known=new Set(knownUrls.map(x=>canonical(x)).filter(Boolean).map(x=>new URL(x).hostname.replace(/^www\./,''))),map=new Map();
 for(const link of snapshot.links||[]){const url=canonical(link.url);if(!url||/download|\/install|\.apk|\.exe|\.dmg/i.test(url+' '+link.label))continue;const host=new URL(url).hostname.replace(/^www\./,'');const explicit=/机场|VPN|加速|网络|Cloud|Proxy|Shadowsocks|Trojan|专线/i.test(link.label),contextual=/机场|VPN/i.test(snapshot.title||'')&&/入口|套餐|注册|订阅/i.test(link.label)&&host!==new URL(snapshot.url).hostname.replace(/^www\./,'');if(!explicit&&!contextual)continue;if(known.has(host)||/google\.|bing\.|github\.com|t\.me|apple\.com|microsoft\.com|cloudflare\.com|youtube\.com/.test(host))continue;
 if(host===new URL(snapshot.url).hostname.replace(/^www\./,''))continue;
 if(!map.has(host))map.set(host,{candidateId:'D-'+sha(host).slice(0,16),name:redact(link.label).slice(0,200),url,originalUrl:safeUrl(link.url),sourceIds:[sourceId],observedAt:snapshot.capturedAt,status:'candidate_identity_unverified',operatorIdentityVerified:false,independentSourceCount:1,dependencyGroup:new URL(snapshot.url).hostname,requiredEvidence:['原经营入口或发布页关系','可读的同名业务及套餐正文'],automaticAdmission:false});}
 return [...map.values()];
}
module.exports={FIELDS,sha,safeUrl,safeEvidenceUrl,canonical,safeReadLink,redact,classify,family,extract,makePlan,discover};
