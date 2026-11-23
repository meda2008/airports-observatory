'use strict';
// Site-specific recovery instructions. Never treat a proposed action as acceptance.
const sites={
 A004:{name:'TAG',kind:'interactive_verification',action:'正常登录接口要求交互验证。完成当前服务会话的验证后续跑；不得据验证点击判定登录或套餐采集成功。'},
 A005:{name:'NiceCloud',kind:'environment_access',action:'当前8档报价已发布；Oracle访问受限。保留浏览器与后台差异，需有新入口或网络响应变化再尝试独立登录。'},
 A011:{name:'胡桃',kind:'public_entry_recovery',action:'每次先验证hutaoindex.com原生入口关系，再匿名采集hutao.cloud公开套餐；不需要账号，不进入购买链接。'},
 A014:{name:'FlowerCloud',kind:'interactive_verification',action:'保留旧门户Cloudflare断点；当前任务若改用已核实公开目录，仍不宣称旧验证通过。'},
 A016:{name:'AmyTelecom',kind:'interactive_verification',action:'套餐目录受Cloudflare保护；保留原文和任务，验证完成后从cart目录继续，不创建订单。'},
 A022:{name:'库洛米',kind:'interactive_verification',action:'实际为Vercel浏览器校验，不是套餐布局失败；完成验证后才检查personal-plan解析。'},
 A024:{name:'忍者',kind:'interactive_verification',action:'旧主页Cloudflare保留；当前任务若改用公开目录，不重复账号认证或宣称旧验证通过。'},
 A038:{name:'连接魔方',kind:'public_entry_recovery',action:'匿名读取711-cloud.net公开套餐，逐卡验证原生链接指回登记的linkcube.org用户中心；不访问购买链接，不将宣传带宽与可用率算实测。'},
 A039:{name:'赔钱机场',kind:'interactive_verification',action:'需要已授权域名的正常登录及hCaptcha；不能用未登录页面判定没有套餐。'},
 A043:{name:'旧Boost Net',kind:'identity_hold',currentRecordId:'A149',action:'当前品牌光速云由A149独立监控；旧Boost历史归属保持待核，不把A149报价合并为Boost历史报价。'},
 A047:{name:'CyberGuard',kind:'credentials_required',userHold:true,holdReference:'user_reply_call_97e08e706f234184bf88752891e206da',action:'原邮箱已存在且密码被拒；需要用户更新可用凭据或自行登录。不得重复猜测、注册同邮箱或重置密码。'},
 A055:{name:'咸鱼加速器',kind:'interactive_verification',action:'当前入口Cloudflare；在原断点恢复后读取目录，不重复创建未清理订单。'},
 A075:{name:'酒馆',kind:'interactive_verification',action:'当前入口Cloudflare；保留验证断点，不把验证失败记录成账号密码错误。'},
 A152:{name:'旧寰宇云',kind:'identity_hold',currentRecordId:'A150',action:'当前品牌全球云由A150独立监控；旧寰宇云历史归属保持待核，不能强行合并。'},
 A159:{name:'极速云',kind:'entry_or_transport',action:'旧IP和新导航最终门户超时；需新的官方可达入口。不得关闭TLS校验或把同名候选价格合并。'},
 A165:{name:'浪网',kind:'native_endpoint_unavailable',action:'当前9档已发布；Oracle正常认证404。仅新客户端契约、入口或响应变化才解除对应端点hold，不重复登录。'},
 A176:{name:'九云',kind:'entry_or_transport',action:'旧shop门户超时保留；只有核实后的新公开目录任务才独立执行，不绕过证书检查。'},
 A178:{name:'飞V',kind:'native_endpoint_unavailable',action:'正常登录接口404；只在新官方入口或客户端契约变化后尝试，不当成密码错误。'},
 A183:{name:'FlowerCloud重复记录',kind:'same_source',primaryRecordId:'A014',action:'与A014同址，复用A014本轮原文和阻塞；不得重复网络采集或计为独立信源。'},
 A191:{name:'库洛米重复记录',kind:'same_source',primaryRecordId:'A022',action:'与A022同址，复用A022本轮原文和阻塞；不得重复登录或计为独立验收。'},
 A196:{name:'BiuBiu',kind:'interactive_verification',action:'先读取发布页实际links.json，禁止使用过期inline fallback；当前门户要求Turnstile验证。'},
 A203:{name:'V2Tun旧入口',kind:'entry_or_transport',action:'旧cp.v2-tun.net已不可用；从V2Tun原频道及永久导航发现当前目录，第三方报价不能算官网报价。'}
};
const publicRecipes={A014:{module:'flower',name:'FlowerCloud',action:'匿名读取huacloud.dev价格页6档报价，保留Basic流量冲突和旧门户CF记录，不访问购买链接。'},A024:{module:'ninja',name:'忍者／当前环球网络加速',action:'读取当前同域公开配置、固定计价客户端及13档普通套餐；试用单列，旧品牌归属未核。'},A176:{module:'ninecloud',name:'九云／当前九霄云',action:'读取频道列出的starpro.one公开配置、固定计价客户端和5档目录；旧品牌归属及shop子域失败保留。'}};
function forProfile(p){let s=sites[p?.siteId];if(!s)return null;if(p.siteId==='A004'&&require('./tag-public-catalog.cjs').configured(p.config))s={...s,kind:'public_entry_recovery',action:'匿名读取TAG公开配置和16组普通计费报价，逐档校准金额单位并保留流量冲突；旧登录验证继续保留，不据此声称会话恢复。'};const recipe=publicRecipes[p.siteId];if(recipe&&require('./'+recipe.module+'-public-catalog.cjs').configured(p.config))s={...s,kind:'public_entry_recovery',name:recipe.name,action:recipe.action};return{...s,siteId:p.siteId,entryUrl:p.config?.entryUrl||null,observedBlocker:p.lastOfficialRun?.blocker||null,runId:p.lastOfficialRun?.id||null,weeklyEnabled:p.enabled===true,acceptanceBasis:'consult_official_run_review_and_frontend_receipts',userActionRequired:!s.userHold&&p.lastOfficialRun?.status==='blocked'&&(s.kind==='credentials_required'||s.kind==='interactive_verification'),retryRequiresChangedEvidence:!['public_entry_recovery','same_source','identity_hold'].includes(s.kind),paymentAllowed:false};}
function checkpointAction(siteId,checkpoint){if(!sites[siteId]||!checkpoint)return checkpoint;return{...checkpoint,requestedAction:sites[siteId].action};}
module.exports={sites,forProfile,checkpointAction};
