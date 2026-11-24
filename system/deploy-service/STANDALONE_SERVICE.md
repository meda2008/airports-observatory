# 独立采集后台：本机运行与操作说明

## 逐字段性能维护入口

没有入口时先执行持久发现命令，种子登记在 `collection/performance-discovery-sources.json`。每个种子须绑定已保存原生链接的文件哈希与数组位置，或明确的已保存官网字段；不猜测路径。示例：

```powershell
node scripts/performance-maintenance.cjs discover --sites=A015,A008 --sources=oix-runtu-6338,v2tun-askahh-5 --actor=local_operator --out=work/performance-discovery-result.json
```

发现命令复用项目 `createStandaloneWorker`、租约和只读 `collectStandalone`，使用服务专属无头 Playwright。发现队列位于 `deploy-service/data/performance-discovery.sqlite`，不写正式业务资料、不自动生成业务提案；原文、原生出链、公开DOM投影及实际加载的媒体保存在 `work/performance-discovery/`。公开会话不继承官网登录态，不读取输入值，不注册、提交订单或接受协议。原生媒体的字节与DOM/HTTP响应元数据分别保存，不把缩略图冒充原图，也不把文件名当测试日期。

已观察的同一 seed 默认返回 `already_observed_no_network`，包括受阻记录，避免反复请求旧条款或验证断点；改变 URL 必须登记新 seed。发现结果始终待审核。只有归属与正文语义通过后，才增加对应公开采集合同并用正常 `apply` / `run` 跑正式逐站队列；不能把发现任务的完成状态当成性能字段准入。

逐站 `monitor` 还会返回 `discovery`，显示已登记候选、最近发现任务和明确的归属待核原因；它与可运行的正式性能路由分开，发现成功不会消除缺项。候选的 `businessFieldAdmitted:false` 表示发现流程本身没有准入业务字段，后续正式复核仍走原提案链。已采到正文或图但没有当前服务关联时，应登记 `reviewDisposition` 并保留原件，不重复当作新入口请求。

公开发布页需要展开列表时，仅支持已保存原件中明确可见的“显示更多”按钮：`visibleExpansion` 必须绑定原观察文件及SHA，要求唯一可见、非表单、`type=button`，自然等待启用最多5秒，不强点禁用控件、不改变页面脚本；自动跳到新域立即保留断点。明确原生邀请码片段仅在 `native_entry` 的 `allowNativeReferralFragment:true` 下按窄格式放行，仍禁止登录/注册路径。发现图片按实际加载资源采集，滚动触发惰性加载后按字节哈希去重，共用占位图不占测速图预算；图片仍待内容与归属审核。

主导航被拦后，浏览器可能只剩错误文档。后台在网络策略判断前保存已观察到的主导航URL，并为断点保留 `observedDestinationUrl` 及其来源；统一去除查询参数、片段和敏感路径，不发送凭据、不继续访问新域，也不将请求URL当成已读目标正文。浏览器文档URL的观察时间与请求时间分开，未知时留空；旧回执中的未知目的地不会用后来别页观察补填。

Shadowrocket公开评测页的评论验证码与访问验证分开处理：仅当存在可见、无表单的完整文章区域，且所有验证码输入和图片都属于真实评论表单（含评论文本框）时，记录 `commentFormCaptchaObserved`，继续读取已公开正文，不操作评论表单。文章不可见、验证码不在评论表单、Cloudflare框架或其他访问验证仍会阻塞；不会因此提交评论或禁用全站验证码检测。

使用持久 CLI 生成逐站速度/稳定性计划。默认只处理仍缺资料的字段；没有已登记的公开入口或没有可接受新采集时钟的解析合同，会报告 `needs_discovery_or_live_parser`，不排空任务。旧图片待人工转录、归属未核及精确留存重放合同不会因此变成实时采集器。

```powershell
node scripts/performance-maintenance.cjs plan --fields=speed,stability --out=work/performance-plan.json
# 已有资料的站点需明确指定刷新；apply只增补采集字段和公开参考范围
node scripts/performance-maintenance.cjs apply --sites=A001 --fields=speed --refresh-existing --actor=local_operator --out=work/performance-apply.json
node scripts/performance-maintenance.cjs run --sites=A001 --fields=speed --refresh-existing --mode=managed --actor=local_operator --out=work/performance-run.json
```

`run` 调用本机既有认证任务接口，由常驻 standalone Worker 领取，不在 CLI 内另开浏览器；`--mode=managed` 使用与周调度相同的 managed 入队类型，不表示已经等过七天。缺配置先 `apply`，缺入口先发现来源。令牌仍仅从本机私有环境读取，不输出。`--base` 可指定本机 API 地址，禁止把管理凭据发往外站。

逐站 `performanceReferenceFields` 只限制公开性能参考阶段，实际由 Worker 传给 performance runner；官网原入口、允许域名、登录设置和原财务采集字段保持。后台提案仍须逐份复核后批准发布，队列完成和新增历史报告不代表新增覆盖或当前独立实测。

2026-11-11 更新。本文件对应 `standalone` 执行模式。Web、调度、采集和发布由本机 Node 进程运行，不使用 Codex 定时任务，也不要求聊天或 Codex 内置浏览器持续在线。独立采集器使用服务专属的 Playwright 无头浏览器与会话目录，不接管用户日常 Chrome 配置。

本轮仅本机验证，不部署 `public.example.invalid` 或其他公网地址，不调用收费 LLM，绝不付款。当前独立采集路径只读：不创建订单、不打开付款动作、不注册账号、不接受新协议、不自动解交互验证码。

## 1. 启动、状态与进程

以下命令请在仓库根目录运行。

```powershell
./scripts/start-local-product.ps1 -Port 8081
# 停止时会核对本项目进程归属，避免误停其他 Node 进程
./scripts/stop-local-product.ps1
```

运行前先检查已有服务及 `deploy-service/data/local-runtime/processes.json`，不要重复启动。前台为 `http://127.0.0.1:8081/`，管理台为 `http://127.0.0.1:8081/console.html`。令牌只取本项目私有 `.env` 中的 `ADMIN_TOKEN`，或本机启动器生成的 `data/local-runtime/admin-token`；不写入 URL、代码示例、日志或浏览器持久存储。

supervisor 管理六个子进程，supervisor 本身另计：

| 子进程 | 程序 | 实际职责 |
| --- | --- | --- |
| web | `deploy-service/server.cjs` | 本机前后台与认证管理接口 |
| publisher | `deploy-service/publisher.cjs` | 将已经批准的资料同步到规范数据库与本地前台 |
| collector | `deploy-service/worker.cjs` | 历史 Worker，仍以 `COLLECTION_ENABLED=false` 暂停；不领取旧124条队列 |
| controller | `deploy-service/control-daemon.cjs` | 每30秒检查到期站点，按开关排入 managed 队列 |
| standalone | `deploy-service/standalone-worker.cjs` | 独立浏览器领取 managed 租约、采集、提取、留证据及提案 |
| measurements | `deploy-service/measurement-worker.cjs` | 独立测量/探测到期任务与原始观测；无配置默认暂停，结论不自动批准 |

测量、持续探测和历史整理的配置、秘密隔离、流量预算、管理接口与验收边界见 [MEASUREMENTS.md](MEASUREMENTS.md)。worker在线不表示已有真实订阅或每站实测。

子进程日志在 `deploy-service/data/local-runtime/`，分别为 `web.log`、`publisher.log`、`collector.log`、`controller.log`、`standalone.log`。supervisor 可重启退出的子进程，但不等于已安装 Windows 开机服务。重启电脑后仍需启动本机服务，或另行配置经过验收的系统服务。

## 2. 模式、每周更新与单站任务

数据库持久保存 `engineEnabled`、`weeklyEnabled`、`executionMode`；重启不重置管理员已经保存的配置。

- `standalone`：独立 Worker 领取任务，关闭 Codex 不影响该 Node 服务继续运行。
- `iab_bridge`：保留旧内置浏览器桥接路径，需在线执行端。可用作维护隔离窗口，不表示它在独立后台模式下仍能抢领任务。
- 总开关关闭：禁止新领取；运行中任务的终止通过取消与原执行端确认处理，不能把一个开关当成所有进程已经立刻退出。
- 每周开关开启且总开关开启：controller 检查启用站点的 `nextRunAt`。每站默认7天间隔，可按允许范围单独修改。仍有 open checkpoint 的站点跳过自动排队，避免反复跑旧阻塞；显式恢复或单站验证仍可处理它。

模式通过已认证的 `POST /api/admin/collection/control` 设置，例如请求体 `{ "executionMode": "standalone", "engineEnabled": true, "weeklyEnabled": true, "actor": "实际操作签名" }`。存在有效的 managed leased 任务时不能直接切换模式；先停止并确认这些任务，再切换。不要把管理令牌放进请求 URL。

控制台可以保存逐站配置、发起验证、查看租约/开始/结束时间、停止/重试任务、从断点重新入队、读取证据及复核。站点启用、全局开关、周调度和运行模式是不同状态；排队不等于已访问，恢复请求也不等于验证通过。

独立 Worker 默认无空闲任务时按15秒轮询；`.env.example` 提供10秒配置示例，以实际环境为准。默认每批2项、并发2站；并发允许1至3。每站默认35秒时间预算，页数受逐站配置限制，单次最多8页。没有可领取任务或浏览器启动失败时退避，不能空转占用资源。

## 3. 一个站点一份配置与解析协议

`collection/site-collectors/*.json` 是保留的初始配置；控制台编辑后的当前配置保存在 `collector_profiles`。初始化只补缺失配置，不覆盖管理员版本。任务领取时固定 config 快照、hash、profileRevision 和 siteRevision；过期租约、取消、配置变化或资料版本变化都会阻止旧结果写入。

逐站配置包括入口、允许域名、采集字段、只读适配、加载条件、登录选择器、页面预算和更新间隔。入口换域只能成为待核候选，不能静默把旧凭据发送到未批准域名。原生帮助链接和备用入口需保留来源关系，不因站点数量增加而算独立信源。

解析器在 `collection/url-collectors/`。现阶段有73条记录、65个 origin 绑定了明确解析器；这只是配置覆盖，不表示73家已全部成功、其余站点没有未知项，或一个域名只有一个经营主体。既有专站解析优先；fallback 必须同时匹配 recordId、origin、路由和实际正文结构。未匹配返回空结果，不使用泛化文案补猜测字段。

上一验收阶段留存原文适用的新规则为14份、17条记录；实际15条记录取得候选结果，其中10站有报价字面结果、4条记录有支付声明、3条记录有退款原文，存在重叠。这些多数为已有报价的来源/条件细化，不能声称填了15家未知报价。修复后的币种、周期别名和繁简标题合并不增加重复套餐；未观察的旧周期继续保留原日期。

独立后台的 A200 实站提案另有单独验收：原生 SS-ID 页面5张价格卡与后台原文、hash、时间绑定，旧7条计划仍为7条。它与 A059 同源，不增加独立运营商或独立信源数。A057 政策正文也不能冒充新报价、支付或退款数据。A007 首页代表价与当前商品 SKU 无法可靠绑定，已拒绝将它重新当成当前报价。

## 4. 登录、会话与阻塞

登录仅在逐站明确配置了 login 选择器，或显式启用 discoverFromVisibleForm 且识别到唯一可见登录表单时尝试一次；两者都要求有且只有一组精确 origin 绑定、未标为失败的私有凭据。表单字段按实际可见DOM角色填写；按钮文字必须精确且唯一。默认读取项目私有凭据文件，也可通过 `CREDENTIALS_FILE` 指向专属私有文件；这里只记配置机制，不记录任何邮箱或密码值。选择器失效、凭据被拒绝或跳转未批准新域时留断点，不猜测密码或重复提交。缺少退出标识不宣称登录成功；可以在同一已批准origin只读返回原登记entry一次，仍按实际正文和登录证据分别记录。显式配置的 service_auth_login_v1 / action_login_v1 仅允许登录阶段HTTPS同源/api/的准确派发查询与当前邮箱/密码键，不开放任意POST。Cloudflare/RUM遥测和读取依赖失败另行记录，不扩大登录提交权限。

成功会话保存到 `deploy-service/data/standalone-sessions/`，或 `STANDALONE_SESSION_DIR`；文件按站点ID和 origin 摘要隔离。这些状态是敏感资料，不发布、不进入公开种子和代码仓库，也不从用户浏览器导出 Cookie。服务会话失效后按同域配置重新确认登录。

安全验证分为自然等待和交互验证。能在有界等待内自然完成的继续；Cloudflare 复选框、图片验证码、滑块或新的绑定协议留明确断点，当前没有通用的无人值守解题或跨浏览器会话接管能力。在其他浏览器完成验证，不意味着服务隔离会话也已通过。

TLS证书、TLS握手、DNS、连接重置、重定向循环、加载超时、登录、404/不可访问页和CF分别记录。保持 `ignoreHTTPSErrors=false`，不通过忽略证书或关闭防护消除错误。独立服务可继续下一站，不把加载壳、访问确认页或错误页算成有效套餐正文。

只读网络访问检查公开目标地址、主导航域名、允许路由和请求方法；不允许订单、支付、重置密码、删除、订阅等动作。仅本次明确的同源登录提交可发送相应表单请求；静态资源依赖与业务身份分开记录。

## 5. 留证据、差异、复核和发布

独立抓取留存在 `work/standalone-collection-20261110/<站点ID>-<jobId>-<runId>/`：`capture-N.json`、`receipt.json`、`accepted.json` 或 `runtime-error.json`。早期未带 runId 的目录继续保留；后续尝试使用新目录，不覆盖旧失败。保存的是脱敏后的可见 DOM 正文及有限元数据，不冒充服务器原始 HTML 字节。每次观察保存URL、原采集时间、正文SHA-256及任务/配置版本；同正文可共用 evidence，但不同观察时间与 metadata 按 observation 分开绑定。

解析结果先与数据库比较。未知ISO币种、起价、月折算、余额、充值促销、订单样例和未测试性能不自动升级。A181旧页只标¥、新页只标$，两者ISO都未知；不同符号的显示数值不能直接计算涨跌幅。退款原文只说明站方声明，不表示已执行退款。

有可靠差异时生成 pending proposal。控制台或明确签名的维护工具读取旧值、新值、引文、原任务时间和来源hash；资料及提案版本不一致时拒绝批准。批准记录可靠保存后再同步投影，发布失败单独标注并保留旧可读快照。采集进程不自动批准自己的提案；publisher也不把 pending 或 failed 记录发布为事实。

代理的字面核对报告标明 `independentHumanReview:false`。代码检查、代理资料核对、独立人工审查和网站运行效果是不同证据，不能互相替代。

## 6. 显式维护与原文复用

状态检查不写入业务结论：

```powershell
node scripts/standalone-maintenance.cjs status
```

以下维护操作必须提供实际操作签名，且应在无活动租约的维护窗口执行；不要放进无人值守“自动批准”循环。可暂切 `iab_bridge` 并保持旧执行端未连接，以避免独立 Worker 与本地重解析抢领同一刚排入的任务；完成后恢复 `standalone`。

```powershell
# 核验留存证据引用/hash后，应用有证据支持的配置恢复计划
node scripts/standalone-maintenance.cjs apply-repairs --actor="实际操作签名"
# 只重解析指定站点已留存的有效正文，不刷新原观察时间
node scripts/standalone-maintenance.cjs reparse --sites=A200 --actor="实际操作签名"
# 只对指定站点显式恢复一个仍open的断点
node scripts/standalone-maintenance.cjs resume --sites=A200 --actor="实际操作签名"
```

重解析复用原 evidence、原时间与原任务 metadata，标记 `retained_reparse`，不能据此宣称重新访问、CF已解除或素材更新。恢复会产生新任务并保留旧失败及父断点关系。

复核工具只接受已经冻结并逐字核验的报告，必须明确 `--approve-reviewed` 和 `--reviewer`；不因报告出现 approve 单词就自动发布：

```powershell
node scripts/apply-source-reviews.cjs --report="已核对报告的路径" --reviewer="实际复核签名" --approve-reviewed --receipt="本次决策回执路径"
```

工具再次检查 proposalId、siteId、expectedRevision、patch指纹、同站来源正文、原任务时间与引文。签名表示操作者的本次资料决定，不把代理报告改成独立人工审查。每个报告只覆盖它明确列出的提案；新实站提案需另行核对。批准后由 publisher 或管理台同步更新本地网站，不等同公网部署。

## 7. 单次执行、长期轮询和验收

正常使用既有 supervisor 常驻运行；单站调试时先检查是否已有任务/运行，不另外启动一组全队列执行器。需要一次受控执行时，给独立子进程设置 `SITE_ID`，并确认运行模式和队列：

```powershell
$env:SITE_ID = 'A200'
node deploy-service/standalone-worker.cjs --once --limit=1
Remove-Item Env:SITE_ID
```

`--once`只领取已经排队且符合模式/开关的任务，不等于创建任务，也不把本次结果自动批准。日常不加 `--once`，Worker持续轮询，controller负责下一次到期排队。可配置 `STANDALONE_POLL_MS`、`STANDALONE_CONCURRENCY`、`STANDALONE_BATCH_LIMIT` 和 `STANDALONE_JOB_BUDGET_MS`；以代码验证的范围为准，不无限增加并发绕开站点限流。

本轮证据分开保存：

| 路径 | 证据含义 |
| --- | --- |
| `work/standalone-20261110/parser-reuse-report.json` | 逐站配置/留存材料适用与候选，不是实站成功表 |
| `pending-source-review.json`、`pending-currency-clarification.json` | 留存提案的代理字面核对、币种不可比说明 |
| `standalone-a200-source-review.json` | 指定A200真实独立后台提案的原文核对 |
| `source-review-decisions.json`、`standalone-a200-publication-decision.json` | 操作者明确签名后的资料决策；发布结果还需看当前快照 |
| `new-standalone-material-audit.json` | 当时新原文的可用性审计，含误把CF/条款/404当正文的发现 |
| `work/standalone-collection-20261110/` | 独立后台各次原文、时间、结果与失败 |
| `deploy-service/data/local-runtime/` | 当前进程归属、服务日志与心跳 |

本轮已修复并复验 SQLite 竞争锁、导航过程中的观察竞态，以及英文 CF、404、条款页误判；另修复支付声明覆盖既有收银台证据的问题。4条支付字段的原渠道、证据等级、订单清理状态和原日期已恢复，新官网声明单列并保留各自日期。旧原文和旧错误结果不静默覆盖。

上一验收首轮原始93家断点均有真实独立后台终态：当时3家取得有效正文（5页），90家仍受阻。12份有原文支持的配置修正已经应用，不能据此称12家验证通过。A057 已通过实际到期排队、独立采集与回执链；A200 已通过真实采集、差异提案、字面复核与本地发布链。最终计数见 `outputs/standalone-recovery-current/summary.json`，逐站结果见同目录 `records.csv`。全量配置报告另在 `outputs/collector-validation-current/`，其历史尝试数和 open checkpoint 条数与原始93家口径不同。

上一验收候选的189项自动检查已通过，日志为 `work/standalone-20261110/final-candidate-gates.log`。本机接口、资料发布、数据库及进程验收由 `node scripts/verify-standalone-local.cjs` 留回执。未来周调度使用受控时钟验证与本机真实到期排队证明，不声称已经等待7个自然日；验收期间旧 IAB 执行端保持断开，但未执行关闭整个 Codex 应用或 Windows 重启实验。

## 8. Linux部署准备范围

现有 Dockerfile 安装本项目固定版本 Playwright及Chromium；compose 已列出 web、publisher、历史worker、controller、standalone。将来可在 Linux 同机共享 SQLite WAL与服务专属私有会话目录，使用进程管理或compose维持运行；本轮未启动公网部署，也未把本机验收当Linux容器实测。

部署前仍需验证镜像构建、浏览器系统依赖、SQLite一致性备份/恢复、单机卷权限、退出与取消回收、DNS/TLS/出口可达性和反向代理。凭据应通过私有只读挂载配置 `CREDENTIALS_FILE`；持久会话通过 `STANDALONE_SESSION_DIR` 指向受权限保护的数据卷，不能依赖容器临时层。不要将凭据、会话、注册邮箱、原账户页面或私有证据打入公开镜像/种子。旧 Worker 保持暂停，避免与 managed 路径重复采集。

自动后台服务已经具备可独立执行的程序路径；逐站材料与解析仍有明确缺项。资料主目录缺项暂为报价11、支付19、退款62，可靠细化不能计成填满未知，也不能把验证阻塞或没有正文的站点说成完成。

## 9. 2026-11-11 冻结90家断点修复增量

本轮基线为 work/standalone-20261111/baseline.json 的90个站点，不与原始93表、全量146配置表混计。42家配置有原文支持的改动；31家有针对性独立后台实站重试，按最后一次真实浏览器结果13家取得可读正文，8家在实站执行时提取过字段。后续留存重解析与同入口别名复用不增加这些实站数。仍有77家未恢复或没有新依据可重试，其中59家未重复旧阻塞。

修复覆盖唯一登录表单、嵌套按钮、同源受限RPC、真实SPA套餐路由、原文就绪等待和读取预算。新增/扩展JMS、泡芙、一云梯、龙猫、TNT、奶优、EdNovas、魔戒、闪电、泡泡狗等专站解析。报价更新保留未观察的旧周期、旧限制与各自来源日期；历史售罄不沿用新价格日期。合同字段使用 retainedContractFields；历史费用通过原sourceId解析原采集时间，未知保持null，不能借用plan或本轮时钟。

部分页面成功但后续页面阻塞时，原blocked回执不改：只在已接受并保存原文回执后，一次性触发独立retained_reparse子任务，检查站点/配置版本与来源绑定；断点和失败均保留，绝不自动批准。对应receipt目录有 partial-reparse-attempt.json / partial-reparse.json。

本轮实站0建单、0付款；原124条legacy collection任务与订单清理记录保持不变。原文、失败、拒绝和最终批准分开留存。最终资料批准清单与各冻结报告hash见 work/standalone-20261111/PUBLISHED-FINAL.json，当前本机接口/进程/SQLite验收见同目录live-acceptance.json。最终代码门禁以final-gates-release-meta.json和final-candidate-gates-release.log为准，早期打包失败和页面契约失败记录保留，不拼接旧绿灯。

当前90家逐站结果：outputs/standalone-recovery-20261111/records.csv；全量配置结果：outputs/collector-validation-current/；原93家历史范围结果：outputs/standalone-recovery-current/。3种范围定义不同。运行操作示例：

```powershell
node scripts/standalone-maintenance.cjs status
node scripts/reparse-retained-manifest.cjs --actor="本次操作签名" --manifest="已冻结且核hash的原文清单" --output="本次回执.json"
node scripts/export-standalone-recovery-batch.cjs --baseline="本轮基线.json" --output="本轮报告目录"
node scripts/verify-standalone-recovery-local.cjs --work="本轮工作目录" --report="本轮报告目录" --before="冻结before.sqlite"
```

重解析仍需维护窗口与明确actor，不联网、不刷新源日期、不自动批准。最终收尾恢复engineEnabled/weeklyEnabled=true、executionMode=standalone，旧IAB runner保持断开。没有安装Windows开机服务、重启Windows或关闭整个Codex应用的实测，未构建Docker镜像或部署公网；不能据本机验收宣称这些范围已验证。

## 逐站性能监控状态（只读）

运行 node scripts/performance-maintenance.cjs monitor --out=work/performance-monitor-current.json 可汇总每站缺项、可执行来源、周任务开关和到期时间、运行/待审/断点状态，支持 --sites=A056。受鉴权接口 GET /api/admin/performance/monitor?sites=A056 提供同一契约。

周任务开启不等于性能来源已接通；scheduledPerformanceFields 仅列配置及新采解析合同均具备的字段。needs_discovery_or_live_parser 不算已监控；断点不自动重试，提案不自动批准。plan/apply/run 仍负责显式字段修复和受控排队。

## 显式公开性能来源 scope

当官网采集器 disabled 或受官网断点阻塞时，可以仅为已登记的新采性能来源配置独立 scope；不会开启官网账号/财务采集。A159 不允许启用此 scope。

node scripts/performance-maintenance.cjs plan --sites=A047 --fields=stability --public-only
node scripts/performance-maintenance.cjs apply --sites=A047 --fields=stability --public-only --actor=实际操作签名
node scripts/performance-maintenance.cjs run --sites=A047 --fields=stability --public-only --mode=managed --actor=实际操作签名

配置仅增加 publicReferenceEnabled 与 publicReferenceFields，官方 enabled/auth/allowedHosts/fields 不变。任务仍使用既有 managed_collection 与租约，collectionScope 为 public_references；独立 performance_reference_schedule 保存周到期时间。只运行公开登记目标，隔离浏览器状态，不读取官网入口和账号，不采财务。旧官网断点不会阻塞此独立 scope，公共 scope 自身断点仍阻塞自动重试。原文采集后即保存，业务字段仍待复核而不自动批准。

monitor 的 fieldStates 区分官方与公开性能 scope、各自到期时间和断点；周开关仍受全局 engine/weekly 控制，取消、版本、租约约束同样生效。
