# 22条采集器断点处理台账

核验时间：2026-11-21 18:03:37（北京时间）。

**本轮2条报价采集链路验收通过，20条仍未通过；没有把配置修复、候选入口或单次登录计为采集成功。**

已通过的是胡桃A011和连接魔方A038：独立后台采集、原文定位复核、发布、匿名前台展示、真实每周到期排队和执行均已验证。验收范围仅公开套餐标价，不代表支付、退款、速度、稳定性或全字段完整。

## 实际调度结果

|记录|调度任务|结果|下次运行（北京时间）|
|---|---|---|---|
|A011|03806076-bcf0-4c0b-ba56-f7149fa397a6|completed / extracted_no_change|2026-11-28 18:02:18|
|A038|0bcb7f0a-b9ea-476b-8578-64f662f22edc|completed / extracted_no_change|2026-11-28 18:02:20|

这两条任务由真实时钟下的 `tickWeekly` 排队；不是模拟数据或只调用手动验证。仅让两条已验收任务提前到期测试，间隔仍为7天。旧入口Cloudflare记录保持open且保留原文，只是不再阻止已验证的新公开报价路径；没有宣称旧校验已经通过。

## 逐条状态

|ID|站点|入口|最新运行结果|本轮重跑官方任务|后续动作|
|---|---|---|---|---|---|
|A004|TAG|https://tagss.pro/|native_login_interactive_verification_required|否，复用旧原文/阻塞|正常登录接口要求交互验证。完成当前服务会话的验证后续跑；不得据验证点击判定登录或套餐采集成功。|
|A005|NiceCloud|https://nicecloud.cyou/#/plans|content_loading_or_layout_changed|否，复用旧原文/阻塞|当前8档报价已发布；Oracle访问受限。保留浏览器与后台差异，需有新入口或网络响应变化再尝试独立登录。|
|A011|胡桃|https://hutao.cloud/|报价验收通过、每周已启用|是|每次先验证hutaoindex.com原生入口关系，再匿名采集hutao.cloud公开套餐；不需要账号，不进入购买链接。|
|A014|FlowerCloud|https://api-flowercloud.com/|cloudflare|是|保留当前Cloudflare断点；完成同一后台采集会话验证或发现新官方入口后恢复。|
|A016|AmyTelecom|https://www.amytele.co/cart.php|cloudflare|是|套餐目录受Cloudflare保护；保留原文和任务，验证完成后从cart目录继续，不创建订单。|
|A022|库洛米|https://www.kuromis.com/personal-plan?plan_type=personal|vercel_security_checkpoint|是|实际为Vercel浏览器校验，不是套餐布局失败；完成验证后才检查personal-plan解析。|
|A024|忍者|https://app5.ninjiacloud.online/|cloudflare|是|当前入口Cloudflare；恢复同一采集会话或核实新官方入口后续跑，不重复账号认证。|
|A038|连接魔方|https://711-cloud.net/|报价验收通过、每周已启用|是|匿名读取711-cloud.net公开套餐，逐卡验证原生链接指回登记的linkcube.org用户中心；不访问购买链接，不将宣传带宽与可用率算实测。|
|A039|赔钱机场|https://xn--mes358aby2apfg.com/plan|login_required|否，复用旧原文/阻塞|需要已授权域名的正常登录及hCaptcha；不能用未登录页面判定没有套餐。|
|A043|旧Boost Net|https://efbng.guangzssytt.buzz/|terms_confirmation_required|否，复用旧原文/阻塞|当前品牌光速云由A149独立监控；旧Boost历史归属保持待核，不把A149报价合并为Boost历史报价。|
|A047|CyberGuard|https://www.cyberguard.best/|native_api_valid_account_required|否，复用旧原文/阻塞|用户本轮明确要求保留凭据断点，未再提交密码。|
|A055|咸鱼加速器|https://nexuscloud.ch/|cloudflare|是|当前入口Cloudflare；在原断点恢复后读取目录，不重复创建未清理订单。|
|A075|酒馆|https://nyxen.org/|cloudflare|是|当前入口Cloudflare；保留验证断点，不把验证失败记录成账号密码错误。|
|A152|旧寰宇云|https://dv2dsdgf.quanqiugttt1.club/|terms_confirmation_required|否，复用旧原文/阻塞|当前品牌全球云由A150独立监控；旧寰宇云历史归属保持待核，不能强行合并。|
|A159|极速云|https://191.101.132.80/|navigation_timeout|否，复用旧原文/阻塞|旧IP和新导航最终门户超时；需新的官方可达入口。不得关闭TLS校验或把同名候选价格合并。|
|A165|浪网|https://eqxmg.wavenetttt.homes/#/plans|native_login_endpoint_unavailable|否，复用旧原文/阻塞|当前9档已发布；Oracle正常认证404。仅新客户端契约、入口或响应变化才解除对应端点hold，不重复登录。|
|A176|九云|https://shop.starpro.one/#/plan|navigation_timeout|是|主门户及频道备用入口超时；保留原失败，发现新的频道原生入口后再试，不绕过证书校验。|
|A178|飞V|https://5qf0zkp6ut.flyvttt.sbs/|native_login_endpoint_unavailable|否，复用旧原文/阻塞|正常登录接口404；只在新官方入口或客户端契约变化后尝试，不当成密码错误。|
|A183|FlowerCloud重复记录|https://api-flowercloud.com/|cloudflare|否，复用旧原文/阻塞|与A014同址，复用A014本轮原文和阻塞；不得重复网络采集或计为独立信源。|
|A191|库洛米重复记录|https://www.kuromis.com/personal-plan?plan_type=personal|content_loading_or_layout_changed|否，复用旧原文/阻塞|与A022同址，复用A022本轮原文和阻塞；不得重复登录或计为独立验收。|
|A196|BiuBiu|https://ccount.biubiu.club/#/login|interactive_captcha|是|已授权新域并执行一次正常登录；站方返回Please complete the verification first。保留当前验证断点，不重试密码，不启每周。|
|A203|V2Tun旧入口|https://cp.v2-tun.net/cart.php|source_unavailable|是|旧cp.v2-tun.net已不可用；从V2Tun原频道及永久导航发现当前目录，第三方报价不能算官网报价。|

剩余20条中：2条为同址重复记录（A183、A191），2条为历史品牌归属保留（A043、A152）；其余16个独立站点仍有验证、凭据或入口/网络/接口障碍。重复记录没有重复登录，也不算独立信源。

## 已固化的方法

- 胡桃：先验证发布页同时列出旧域与永久入口，再匿名采永久入口的3档套餐；不提交账号。
- 连接魔方：保留浏览器CF失败，正常HTTP GET返回有效HTML时按严格卡片、原生产品链接和计费周期解析；非200或验证页直接保留断点，不改变指纹、代理或证书校验。
- 连接魔方只在这个HTML报价scope忽略整页哈希及定位偏移带来的重复提案；卡片原文、价格、周期、流量、限制仍参与比较。原始响应和每次观测照常留存。
- 22份站点配置与现行入口对齐，补齐5个新网址采集器定义及BiuBiu新域定义；修正5处网址ID绑定，不向源码写入凭据。
- 后台受保护的采集器接口返回逐站恢复动作、同源主记录、用户保留状态。
- 公开诊断请求在发送前落日志，结果逐项保存；崩溃或重跑先检查已有记录，不再次盲扫。
- BiuBiu仅在Oracle私有配置增加本次授权的新域账号绑定，保留旧账户、备份和挂载inode；未注册、改密、建单或付款。

## 验收与证据

- 发布快照：catalog-0459ac6f64e65571ea79b833。
- 匿名前台实际浏览器验收：`/collector-state/frontend-acceptance-20261120/run-1795254006245/receipt.json`，两站各3行，API200，无登录跳转、写请求或页面错误。
- 当前镜像API/collector v311，web v165未更改。v311受影响测试68项通过，旧范围兼容检查25项通过；镜像非root模块、OCR、浏览器适配门禁通过。
- 无Token请求的管理读取、复核、配置写入接口均实测401。
- 最终Oracle收据：`/data/recovery-receipts/blocked22-final-verified-v311.json`。
- 本机最终JSON：`work/blocked22-final-verified-v311.json`。
- v308磁盘门禁失败退出63，未切换服务；归档旧源码副本并校验后，v309/v310/v311实际部署成功。数据库、旧数据和私有配置未丢失。
- 当前没有可用且可确认免费的codex-auto-review工具，未调用收费替代；本次没有独立代码审查通过结论。

本轮无订单、无付款。没有把SLA、宣传带宽、广告可用率、站方运营年数当作实测或已核实运营历史。
