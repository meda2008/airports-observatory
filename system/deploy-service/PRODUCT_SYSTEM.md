> 当前独立服务运行、恢复命令和安全边界见 [STANDALONE_SERVICE.md](STANDALONE_SERVICE.md)。本文件的旧阶段计数保留为历史基线，当前逐站结果以 outputs/standalone-recovery-current 为准。

# 航向：现存资料数据库与本地产品

2026-11-10。依据本聊天 2026-11-02 的原始产品要求：通用流程加逐站采集器、按周更新、数据库比较、按需求找入口、本人账号推荐链接盈利。继续采用 Linux 可部署服务；当前仅在本机集成与验证，已接通独立standalone后台采集服务，IAB仅保留维护入口；本轮不部署 vigorai.top，不调用付费模型。本轮终态见 outputs/collector-validation-current/summary.json。

## 当前可用入口

- 前台：`http://127.0.0.1:8081/`，目录、筛选、套餐详情、条款、来源、需求比较、变更记录。
- 后台：`http://127.0.0.1:8081/console.html`，管理员认证、采集器配置、单站/全站验证、执行与周更新开关、任务取消/重试、断点恢复、原文重解析、证据、提案复核、现存资料同步、本人推荐链接。
- 管理员令牌沿用私有 `deploy-service/.env` 的 `ADMIN_TOKEN`。若该配置不存在，本地启动器生成 `deploy-service/data/local-runtime/admin-token`。只在本机控制台输入，不发到聊天，不进入 URL、前端源码或浏览器持久存储。

在项目根运行：

```powershell
./scripts/start-local-product.ps1 -Port 8081
# 结束本机服务时：
./scripts/stop-local-product.ps1
```

本机 Node supervisor 管理五个子进程：web、publisher、旧 collector、collection controller、standalone；supervisor 自身另计。重启 Windows 后需再次启动，本轮没有安装 Windows 开机服务。运行日志与进程回执在 `deploy-service/data/local-runtime/`。启动器只绑定 loopback，并保持旧 collector 的 `COLLECTION_ENABLED=false`；新控制链使用数据库中的执行/周更新开关，首次默认均关闭，重启不把已有控制设置当成初始化重置。

controller 每 30 秒检查周任务到期，只在 `engineEnabled` 和 `weeklyEnabled` 均开启、站点启用且到期时排入 `managed_collection`。它不运行浏览器。standalone模式由独立服务使用隔离无头浏览器领取租约执行，不调用Codex浏览器或模型；iab_bridge模式仍需要内置浏览器执行端。旧 124 条 `purpose=collection` 排队记录保留，不被 bridge 自动领取；只有明确取消/重试操作才改变选定的旧任务。

## 数据与规范表

数据库：`deploy-service/data/collector.sqlite`，SQLite WAL，同一 Linux 主机上的 web / publisher / collector 共享。初始整理入库基线为全部目录 215 条、主要目录 146 条、2,427 条套餐及计费周期报价；实跑后的当前值以数据库和控制台为准。非主要目录是另外保留的记录，不混入主要目录覆盖率。

| 表 | 用途 |
| --- | --- |
| catalog_records | 全部目录、主要目录标记、当前入口、完整 core 与历史目录元数据 |
| catalog_plans | 一条套餐/周期报价一行，金额、ISO 币种、原符号、周期、额度、采集日期、完整结构 |
| catalog_payment_methods | 一条具名支付渠道一行；有渠道不等于交易成功 |
| catalog_policies | 退款、隐私、设备条件、试用，每字段保留状态、摘要与完整结构；包括未知状态 |
| catalog_field_states | 11 类字段的材料状态、缺项、待核项；有材料和实际验证分别记录 |
| catalog_sources / catalog_record_sources / catalog_field_sources | 来源元数据、目录关联、字段关联；无法解析的来源保持 unresolved |
| catalog_order_cleanup | 清理状态独立保存，不因取消待确认而抹掉已有支付证据 |
| catalog_imports / catalog_record_versions / catalog_publication | 有内容指纹的发布批次、不可覆盖的版本、当前版本指针 |
| catalog_referral_links | 部署公开种子中保留的、已经绑定本人账号证据的推荐链接 |
| sites / jobs | 逐站配置、周到期任务、租约、重试与失败退避 |
| evidence / observations | 原文、SHA-256 与逐次采集日期，保留原观察时间 |
| collector_capture_metadata | 按 observation 绑定只读 DOM 元数据及 evidence；不混入 body，不改变原文 SHA-256 |
| collector_profiles / collector_control | 可编辑配置与独立 revision、持久化执行/周更新开关、standalone / iab_bridge 模式 |
| collector_runs / collector_checkpoints / collector_events | 每次执行的配置快照/hash、结果与复核展示、断点、运维事件；不公开租约 token |
| proposals / changes | 待复核提案、乐观版本检查、复核者、旧新值及批准记录 |
| referrals | 真实账号页、同站同源、完整链接原文与利益披露绑定 |
| service_heartbeats | collector 与 publisher 分别报告状态与心跳 |

套餐中的 JSON 原结构和完整目录元数据同时保留，以避免规范列不能表示某个特殊网站时丢字段。来源原始正文继续留在原 evidence 与原归档中；公共接口只返回白名单事实和安全来源元数据，不公开账号、配置、原文私有页面或浏览器会话。

初始资料基线的主目录缺项为：报价 11、支付 19、退款 62、隐私 96、设备条件 9；这些历史计数不是本轮采集新增，也不是进行中实跑的最终统计。所有速度/稳定性仍无统一可比实测，比较接口明确拒绝排名。只有 2 条已绑定本人证据的推荐链接，其余不填他人推荐码。

## 更新与发布的实际路径

1. **现存资料读取**：复用 `export-current-inventory.cjs` 的规则。revision=0 种子不能覆盖较新的目录；只有 approved proposal、changes、版本和当前字段相符才叠加。
2. **规范化发布**：`catalog-db.cjs` 在一个事务内写入规范表、来源关系、字段状态和版本。失败回滚；同样内容不发新版本。展示时钟、滚动窗口边界等派生变化不当作新增观察。原采集日期保持不变。
3. **后台 publisher**：每 30 秒检查来源文件指纹、已批准 changes 和推荐链接变化，有变化才重建投影；每日重新评估时效。只读本地已有材料，不抓 URL、不调用模型。管理端“同步现存资料”走同一实现。
4. **受控采集**：当前 registry 有 146 份配置，127 份 enabled、19 份 disabled；配置存在或 enabled 只代表静态执行资格，不代表该站采集成功。控制台可编辑配置、验证单站或全部启用站、启停执行、切换周更新。新任务只由在线 IAB bridge 领取，旧 collector 继续暂停；同站 managed queued/leased/待复核任务互斥，legacy queued 可保留并存，任意真实在途或待复核任务阻止重复执行。
5. **材料与恢复**：租约内保存脱敏原文、原观察时间、SHA-256 和 observation 级 DOM metadata，再由专站字面解析器产生差异。阻塞保留 checkpoint 并退避。恢复建立新 job/run，仅对当前允许域的安全只读入口或 SPA 路由恢复，不把点击恢复当成 CF 已解除。原文 reparse 复用旧 run 绑定的正文、原观察时间和 metadata，新建任务重新解析，明确标记 `retained_reparse`，不能宣称重新访问或验证挑战已消失。
6. **复核与发布**：控制台读取来源原文、时间和 SHA 后，携带 expectedRevision 批准/拒绝。批准记录先可靠保存，再同步发布；发布失败会明确返回 sync_failed，旧快照继续可读，可重试同步。
7. **商业入口**：推荐收益不参与价格排序。已绑定本人同源证据的链接标 sponsored 并披露利益；其他入口去除继承的推荐参数，候选归属与经营主体未核实状态明确展示。

同源认证可复用已有登录会话；对项目已有私有 vault 和配置选择器支持一次受控登录尝试，凭据不进配置接口、日志、原文或 metadata。缺少凭据、登录失败或需要交互验证时记录阻塞，不循环重试。此轮不自动提交注册、交互验证码/CF、邮件验证、新 TOS、订阅或订单，绝不付款。只读 recipe 可切换套餐周期/筛选、读取已渲染卡片，不能将这些操作升级成订阅或交易执行。服务器未接通无人值守浏览器、未支付订单执行器、真实邮箱 provider 或 CF 自动通过通道。

配置 revision 与业务文档 revision 分开管理；每次 claim 绑定配置快照/hash 和当时业务 revision。原文、observation、metadata、提案和 run 结果在同一事务内经过租约有效、未取消、配置/业务版本未变化检查。每个提案字段必须至少绑定本次 capture 的 evidence；额外旧 evidence 必须同站，旧 catalog 来源必须同站绑定且 resolved。提案批准仅表示复核通过：run 展示 `review_approved` 或 `review_rejected`，原采集态另留 `collectionStatus`；公开发布仍须 publisher/sync 成功，不能把 reviewed 直接叫 published。

## API

公开：`GET /api/stats`、`GET /api/catalog`、`GET /api/airports/A001`、`GET /api/search`、`GET /api/changes`。

目录支持 scope=primary/all/other、q、payment、price=available/missing、refund=available/missing、page、limit。比较沿用后台唯一计算规则，未知 ISO 币种、按天周期、售罄、额外收费等不强行换算。需求文本解析有能力边界，未能解析时明确返回 unparsed_needs。

认证后台保留：`GET /api/admin/status`、`/api/admin/jobs`、`/api/admin/proposals`、`/api/admin/evidence?id=…`、`/api/admin/referrals`；`POST /api/admin/review`、`/api/admin/sync`、`/api/admin/run`、`/api/admin/referrals`。证据接口的 `captureMetadata` 返回 observation/job 绑定的 DOM 元数据，原文显示可能再次脱敏，`sha256Basis=original_retained_body` 指明 hash 的原始留存依据。

采集控制新增 `GET /api/admin/collectors`、`GET /api/admin/collection/status`，以及配置、验证、开关、任务取消/重试、断点恢复、reparse、runner heartbeat/claim/renew/result 接口。完整请求/返回及权限边界见 `work/collector-control-20261110/CONTROL_API.md`。排队响应不是已执行回执；现有前台统一消费已发布数据库，不另算业务事实。

## Linux 部署包与边界

`compose.yaml` 包含 web、publisher、collector、controller；生产配置保留 Caddy HTTPS 与 vigorai.top 目标。本轮未修改公网。首次空数据库通过 `seed/catalog-bundle.json.gz` 导入整理后的公开资料，原正文和私有浏览器状态不打进镜像；该种子的内容指纹在 `seed/manifest.json`。需要完整运维/采集历史时另迁移一致性 SQLite 备份与私有归档，不能只拷运行中的主文件丢 WAL。

```powershell
node scripts/import-product-catalog.cjs # 一致性备份后，从已有资料整理入库
node scripts/export-product-bundle.cjs # 更新部署公开种子
node scripts/verify-product-local.cjs  # 正在运行的本机 API、DB、认证、空同步验收
node scripts/verify-product-package.cjs # 离线 Node COPY 布局、全新数据库与复核发布烟测
```

先前产品阶段已验证 SQLite 完整性、外键、统计口径、匿名拒绝、原时间、空同步、旧排队作业不变与隔离复核。内置浏览器已验证桌面/手机布局、目录筛选、完整详情、需求比较、无实测拒排，以及隔离管理提案的证据读取/批准/公开显示/清除令牌。

真实 Docker 构建未通过验收：本地没有基础镜像，离线构建命令又被自动审批以 blocked by policy 拒绝。通过的是源级打包依赖与离线 Node 文件布局烟测。本轮已对127个启用配置逐站实试，19个停用配置保留原因；39站取得可读正文、93站当前结果受阻，两类可部分重叠。材料覆盖和字段能力以 `outputs/collector-validation-current/` 为准；未做公网或真实无人值守采集验收，未付款、未调用收费 LLM。指定的免费 codex-auto-review 工具不在本会话可用工具中，未用收费审查替代；自动测试和本文内容不等于该独立代码审查。

原产品阶段回执在 `work/product-system-20261110/`，包含历史要求摘录、一致性备份、表与字段清单、失败后修复的验证日志、实机验收和截图。

本轮控制链契约、测试与终态运行回执在 `work/collector-control-20261110/`。本文件保留产品/部署边界，不把静态配置、工程测试、页面可读、字面提取、商业条款合格、人工复核与公开发布混为一种通过。
