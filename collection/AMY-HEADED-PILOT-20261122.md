# Amy有界面持久浏览器试点（2026-11-22）

## 范围与当前验收

先选A016 Amy，其他受阻采集器不推广。API为v335、collector为v332，web保持v165；仍三个Docker服务，同一个业务数据库。实际有界面实例已启动，仍停在正常Cloudflare验证。没有新报价、有效验证标记、采集复核或业务发布；每周任务仍disabled。不能把有界面启动与接管UI通过称为全链路完成。

## 代码

- deploy-service/headed-service-browser.cjs：独立原生Chromium进程、Xvfb私有显示、站点私有配置目录。CDP仅容器127.0.0.1的非零端口，不映射宿主机，不开VNC公网端口。没有stealth、UA覆盖、navigator覆盖或自动解题。继续使用已有容器的no-sandbox运行约束，未扩容器权限。
- deploy-service/private-browser-display.cjs：Xvfb不监听TCP，在进程退出时关闭。
- deploy-service/amy-service-session.cjs：接管与采集共用同一实例；验证阶段不自动点击。使用headed-profile目录持久化，恢复重新打开同一目录，不搬运桌面Cookie或旧headless状态；只有实际读取可见产品卡片后才写headed-verified-state.json。正常采集后关闭原生浏览器以落盘；下一次必须真实重新打开并读取套餐，才算恢复通过。
- 仍只允许Amy cart.php及必要静态资源/正常防护请求；不允许账号提交、购买、订单或付款。禁用ServiceWorker网络代理并保留SSRF检查。TLS校验保留。
- 旧pending-state.json、verified-state.json与旧诊断目录保留，不作为本次有界面验收证据。

## 实站记录

- 新会话：ca597845-17a4-4533-b87c-cb8226bb356e，2026-11-22T15:22:47Z创建，到16:22:47Z（北京时间11月23日00:22）截止；届时实例关闭，私有配置目录保留。
- 真实启动收据：/collector-state/browser-sessions/amy-service-assistance/headed-runtime-ca597845-17a4-4533-b87c-cb8226bb356e.json。
- 实测headless=false、配置目录700、浏览器Chrome156；读取到navigator.webdriver=false，未对其做修改。这是普通启动环境的记录，不等于站方验证通过。
- UI实跑收据：/data/recovery-receipts/amy-assistance-ui-v332.json、PNG；实际1280×900画面，无脚本错误，点击保护按当前命令状态生效，没有测试点击挑战。
- 现场原图本机work/amy-headed-current.jpg已人工查看，当前是真实空复选框。用户已收到同一会话的受保护接管入口，不能另开官网替代Oracle会话。
- 本地17项相关测试通过，原生启动参数和端口边界已测；容器非root加载、OCR、旧适配、TAG/Biu、截图几何、原接管以及headed/display门禁通过，部署退出码均0。

## 通过验证后的后续门禁

1. 同一浏览器读到真实套餐，自动排入validation；核验本次原文、时间、hash、逐卡金额及周期，不拿历史卡片冒充本轮。
2. 后台普通任务成功采集后关闭原生实例；显式再跑一次disabled validation，确认不经人工、同配置目录恢复后仍能读到真实套餐。
3. 对字面业务差异做复核后发布，验证匿名API及前台；若无业务差异，保留本次观察，不伪造新增。
4. 原阻塞记录保留；恢复/复核发布/前台验收都通过后，才决定启用每周任务并推广其他站点。

只读检查工具：hosting/pages/inspect-amy-headed-proposal-v332.cjs；它不自动批准提案。当前仍等待用户验证，不宣称链路完成。

管理员口令未进入代码、镜像或聊天；原登录私有文件不变。原始数据和私有线路未清理。为满足部署空间门禁，仅归档并校验五个不活跃旧源码副本，业务数据和Docker卷未改。免费codex-auto-review工具及免费条件未确认，未使用收费替代，不声称独立代码审查通过。

## 接管幂等与API单独更新

已加resume幂等：有效会话已排入采集后，重复点续采返回原任务，不再发送可能因浏览器已正常退出而失败的新命令。本地相关10项测试通过，API v334容器门禁通过，两项退出码0。collector更新前后容器ID及重启次数完全一致（94ba5893...，RestartCount=0）；原有界面会话未被重启。原v333脚本在bash语法预检就被拒绝，没有启动部署，失败原件与本机work/amy-api-v333-preflight-failure.txt保留；修正在新候选v334完成。

仍等待用户完成本次正常验证；未推广其他站点、未启用Amy每周采集、未批准任何报价提案。接管页当前无需开启新公网端口。

## 临时画面读取恢复

同一原生浏览器曾出现一次view读取异常（service_observation_failed）；实际浏览器PID78仍运行、目标仍是Amy cart.php、容器OOM计数0。一次只读snapshot后原会话画面恢复，没有刷新官网。API v335增加最多三次同会话只读画面重试，不对验证码失败无限重试；11项相关本地测试通过，容器门禁通过、部署退出码0。两次API单独更新前后collector容器ID/重启次数完全相同，原会话ca597845保持。当前仍需用户正常验证，不作为价格更新或恢复成功验收。
