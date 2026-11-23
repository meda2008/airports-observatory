# 独立部署的机场观察服务

2026-11-10 产品整理后的当前入口、规范数据库表、前后台与运行方式见 [PRODUCT_SYSTEM.md](PRODUCT_SYSTEM.md)。以下保留早期实现与实跑记录，其中历史缺项数量不作为当前统计。

此目录包含独立运行的 Web、发布服务和调度器，不使用 Codex 定时任务。当前增加控制台管理的 `standalone` 独立后台路径，运行方式见 [STANDALONE_SERVICE.md](STANDALONE_SERVICE.md)。旧 `iab_bridge` 路径：调度器每30秒检查逐站到期时间，浏览器执行需要在线的 Codex 内置浏览器执行端；仅后台进程启动不等于网站会自动采集。旧 Worker 仍暂停，124条历史排队不自动领取。完整控制接口见当前产品文档，以下每分钟 Worker 等描述为历史路径。SQLite WAL供同一主机共享，不支持多台机器共享SQLite文件。

## 启动

从 D:/AI_Projects/Airports 执行：

```powershell
Copy-Item deploy-service/.env.example deploy-service/.env
# 编辑.env，设置随机ADMIN_TOKEN，以及你选择的LLM_ENDPOINT/API_KEY/MODEL。
docker compose -f deploy-service/compose.yaml up -d --build
```

本地已有.env时不要覆盖。默认只绑定127.0.0.1:8080，公网部署请用你自己的域名与HTTPS反向代理转发到该端口。不要把SQLite、.env、账号文件和原始采集证据映射为静态站点目录。API和Worker需要持续运行；GitHub Pages仅静态托管，无法承载本服务。

环境变量：STORE_FILE（默认/data/collector.sqlite）、ADMIN_TOKEN、LLM_ENDPOINT（完整HTTPS兼容chat/completions接口）、LLM_API_KEY、LLM_MODEL、POLL_MS（默认60000）。LLM未配置时页面原文仍保留，任务标llm_not_configured，不编造字段。使用LLM按你所选服务商计费；本次未配置或调用收费模型。

## 数据链

146份collection/site-collectors配置 → weekly due → 事务claim/续租 → Chromium逐站只读采集 → 原文hash与每次observations时间 → LLM精确引文提案 → 管理端复核批准 → revision递增/changes旧新值 → 公共搜索即时读新事实。

默认AUTO_REVIEW关闭。可设置AUTO_REVIEW=true，仅允许具名支付渠道和原文逐字摘要，经两次模型输出一致与字面校验后自动入库；价格及其他复杂变更仍要求管理端复核。两次同模型输出不称为独立人工审计。没有已核实事实时不会覆盖原值。

公开页面提供便宜、每GB流量价格筛选，展示原周期总额、折算公式和采集时间。没有可比实测的速度和稳定性明确弃排。原目录是只读基线；新事实落SQLite，API合并读取，不改写冻结证据。

## 逐站扩展与账号

每站JSON定义entryUrl、allowedHosts、adapter、maxPages、auth选择器等。登录密码只通过CREDENTIALS_FILE指向的私有JSON传入，格式为精确origin → {origin,email,password}；通过只读secret卷挂载，不放入镜像。不得把一个站的密码发给新发现域名。

通用auth模块支持显式配置的登录/免费注册字段和邮箱验证码provider契约，邮箱提供者必须绑定origin、recipient、request时间及有效期。当前未配置真实邮箱provider；需要给所选邮件服务写适配，不能宣称已自动收信。服务条款、CF/CAPTCHA和不支持表单均留断点，不绕过。浏览器采集器仅跟随已允许域名的可见只读链接；新官方/备用入口原文记为unverified_entry_candidate，需归属复核。

当前服务器Worker只读套餐/条款/公开支付说明，没有迁移旧Codex未支付订单执行器。现有订单采集代码仍在collection/unpaid-orders.mjs；上线前需专门适配与实站验收，绝不通过泛点击“付款”获取渠道。

## 推荐链接

管理员通过已登录账号页面取得原文后保存evidence，kind必须authorized_account_page。管理页录入siteId、完整url、evidenceId、披露并确认属于用户。store验证同站、同源、原文含完整URL；未核实链接不会公开使用。此版本没有替你生成推荐码，也未导入他人推荐码。推荐收益不参与排序。

## 验收及运维

node --test tests/deploy-*.test.cjs tests/needs-search.test.cjs

GET /health；GET /api/search；GET /api/changes。管理接口必须Bearer令牌，含jobs/proposals/evidence/review/referrals。令牌不保存到浏览器持久存储。

持久卷备份需一致性SQLite备份，勿仅拷贝运行中的主文件丢WAL。任务lease过期可恢复；后台错误不会标成机场停服。升级前备份数据卷。Docker build日志留在work/site-collector-service/docker-build.log。

当前验收边界：本地HTTP+真实SQLite链路和浏览器页面已验证；外网部署需要服务器/域名及模型配置。自动注册/邮箱/未支付订单的服务器实站成功率未验证，不能宣称所有网站可无人干预完成。

## 验证页面处理（2026-11-03）

后台采集器和登录模块现在共用 `collection/challenge.mjs` 的可见控件识别：图片验证码、滑块/交互验证、CF、访问入口分别记录。CF 无交互等待最多12秒；自然放行后继续，出现交互控件或超时则跳过该站。登录前后都检查，不会在验证码未处理时盲目重复提交密码。仅在帮助正文提到 captcha 不算出现验证码。

阻塞时 Worker 将 `verification_checkpoint` 存入独立证据，包含页面原文、类型、阶段、采集时间和观察记录；不会送给字段提取器或升级为业务事实。通过已有管理员 evidence 接口按 ID 查阅。原有作业退避继续生效，其他站继续运行。此项不是永久浏览器会话恢复：当前 Worker 会关闭 context，新 context 可能再次触发验证；不能宣称人工验证一次后所有服务器任务永久复用。

GitHub 仓库核验和后续接入见下节。CF/访问验证的 `clickConfirmedChallenge` 仍要求精确页面、控件动作和两分钟内的本次确认；没有第三方打码服务、令牌注入、隐身浏览器补丁或付费识别服务。

## GitHub 能力接入与实测边界（2026-11-03）

- 本地图片识别：采用 https://github.com/sml2h3/ddddocr ，MIT，固定安装 `ddddocr==1.5.6`，Python 必须低于3.13。Windows隔离环境在 `deploy-service/data/ocr-venv`；服务器可设置私有 `OCR_PYTHON` 路径。没有把图片、验证码或密码发送给商业服务。当前 Docker 镜像尚未包含 Python/OCR 依赖，不能宣称镜像内 OCR 已验收。
- CF：核验 https://github.com/techinz/playwright-captcha ，Apache-2.0。它是Python实现，文档建议隐身浏览器补丁以提升点击成功率，还提供外部商业API模式；未直接安装或移植整库。当前原生控件点击适配放在 `collection/verification-actions.mjs`，与现有内置浏览器/Playwright共用，不调用商业API，不安装扩展，不伪造CF令牌。只允许正常呈现 `challenges.cloudflare.com` HTTPS资源；不允许向它顶层导航，也不放开任意第三方域。
- 登录：沿用已安装的 https://github.com/microsoft/playwright ，Apache-2.0。`collection/builtin-auth.mjs` 让 IAB 和服务器复用 `deploy-service/auth.cjs`。当前 X-Air 已增加从可见表单核对的独立auth选择器；有正向登录标识才报告authenticated，密码框消失但落到错误页不算成功。

统一入口 `runChunk` 和 `createCollector` 均接收 `verificationOptions={ocr,confirmationProvider}`；本地OCR可由 `createLocalOcr()` 创建。confirmationProvider 必须取得当前页面实际用户确认，返回精确tabId、URL、动作及confirmedAt，不能由调度器自行生成批准。未接入确认通道时，默认继续保存断点，不会因安装了OCR就自动点击所有挑战。当前运行中的无交互Worker没有配置真实confirmationProvider；后台全自动解题尚未启用。

普通验证码使用全截图在本地按可见元素坐标裁剪，解决IAB截图clip位置未生效的问题；支持设备缩放；复核两次裁剪图片指纹，发生变化就拒绝填写。单次图片识别授权限同页一次填写，最长15分钟供本地依赖初始化/修复；CF点击保持原有两分钟界限。只写验证码框，不等同于登录、建单或付款。识别值不写公开日志，置信度缺失标null，不伪造准确率。

真实安装引擎检查：`node scripts/verify-local-ocr.cjs`；覆盖跨运行环境字节、本地裁剪、2倍设备缩放、图片区域内外变化。合成4826样本通过。X-Air实站已在本次确认下运行OCR并填写，但截图视觉转录与模型输出有分歧；未提交登录，随后清空了误识别结果。默认、beta模型都给同一有分歧结果，不能把双模型一致当作正确。完整原文、失败、修复与未验证状态保存在 `work/site-collector-service/github-integration-20261103`。本轮没有真实CF点击成功或实站自动登录成功的证明，不作成功率承诺。

## 本地统一流程实跑更新（2026-11-03）

本节记录较上文后发生的实跑，不将此前验收边界追溯改写为成功。

`collection/workflow.mjs` 现在支持 `contentRecovery:true` 分支：从最新 SQLite 已复核覆盖层盘点缺项 → 校验保留原文 hash 和同源 → 断点恢复可执行帮助页任务 → 发现缺报价记录的搜索线索 → 站点专用字面解析 → 保存原观察时间与证据 → 待语义复核提案。复核后本地 API 即时消费已批准事实。`collection/site-collectors/<ID>.json` / overrides 保留逐站 auth 和 knowledgeAdapter；周任务也转交这两个配置。此分支必须注入现有 Codex IAB，不能从无人值守终端自行获得 IAB。

当前回合执行 `unified-fields-20261103`：20 个正文恢复任务（21条名称记录），13 个缺价定向搜索任务；不是146站都重新访问。12个任务取得观察材料不等于12项补齐。A155“安全登录”已经在实站成功；登录识别修复为提交后等待表单状态转移，并以正向标识确认。A162常见问题的优惠原文和A155下载中心客户端要求已经逐字复核入SQLite；A162/A153本人账户推荐链接已校验并供本地搜索使用。优惠有效期、返佣绑定和实际结算仍未知。

`collection/owned-referral.mjs` 仅处理具本人账号标识的可见邀请页；默认复用已有邀请码，必要时单次免费生成，绝不提现或付款。复制前聚焦相同标签页，复制后同时检查同源URL及当前表格中的邀请码。批次仍有四站返回跨站剪贴板旧值，已拒绝入库；该能力不能宣称全站通过。真实订单建单/取消没有在本轮新增运行，原有清理保留项不重建。

实跑及复核回执位于 `work/site-collector-service/unified-run-20261103/`，统一入口回执在 `work/collection-runs/unified-fields-20261103/optimized-workflow-result.json`。再次运行该run会复用终态任务与已复核事实，返回 `runnable_queue_exhausted_with_gaps`、`dataComplete:false`，不会把空队列当成全部数据完成。增加新原始线索或当前验证获确认后才重新排对应任务。

当前最新盘点 `outputs/database-inventory-current/`；146条主记录仍缺报价14、支付28、退款66。全部速度/稳定性均缺合格实测，不能用宣传补值。推荐收益不参与排序。`node scripts/verify-unified-local.cjs` 可复验实际运行的本地HTTP、优惠/设备条件和两个自有推荐链接。最终相关门禁65/65通过；不等于实站覆盖率、CF通过率或全部字段完整。

本轮未部署公网、未使用付费模型/打码服务、未付款。免费codex-auto-review当前不可用，未用其他收费代码审查替代。两条新事实由另一代理核对原文，属于内容核对，不是独立人工复核或代码审查。

## 已指定的生产目标

本次两页条款确认后的续采：A149光速云、A151星岛梦已实际登录并解除原条款断点。分别读取5篇、4篇未读客户端教程（已读Windows文章复用），iOS说明逐字自查后补入compatibility，明确`literal_source_self_review_not_independent`，不称独立人工复核。两站退款/隐私原文仍缺；既有报价和支付不重扫、不建单。新增显式`includeClientGuides`开关，默认不读客户端教程，仅逐站启用时采集可见教程卡片，付款/订阅动作仍拒绝。原文、页面日期、采集时间、审核及恢复回执在`work/site-collector-service/terms-resume-20261103/`；本次相关最终门禁68/68，本地HTTP及浏览器已确认新条件展示。旧版IAB保留页的关闭接口返回不可用，本次新建的两张采集页已经关闭。

Linux + vigorai.top，模型待定。DNS的A/AAAA记录应指向实际Linux服务器；服务器开放80/443。若该域名已有网站，先确认切换计划，不能覆盖既有业务。

```sh
docker compose -f deploy-service/compose.yaml -f deploy-service/compose.production.yaml up -d --build
```

Caddy在DNS正确且端口可达时申请HTTPS证书。无需把8080直接暴露公网。尚未提供SSH地址/登录用户或已有服务器连接，因此本地准备不等于已部署vigorai.top。
