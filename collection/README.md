# 机场采集工作流

这套程序把采集执行覆盖率和业务事实完整度分开。所有已知记录都进入计划；身份冲突、无官方入口、非机场目录项和用户指定跳过项也保留结果，不从分母消失。

## 一次完整运行

统一编排入口为 `collection/workflow.mjs`。真实端到端试跑记录位于 `work/collection-runs/trial-20261030-e2e/pipeline.json`，示例范围为 A074（YkkCloud），不是全站资料完整性验收。

```js
var workflow = await import('./collection/workflow.mjs');
await workflow.runWorkflow({browser, runId:'NEW_RUN_ID', recordIds:['A074'], limit:2});
// 读取留存原文，复核并填写该运行的 review.json 后：
await workflow.runWorkflow({browser, runId:'NEW_RUN_ID', batch:'core-auth-batchNEW_NUMBER', finalize:true});
```

首次调用创建明确范围的计划并采集；未跑完返回 `collecting`，无复核事实返回 `awaiting_semantic_review`。复核为空、引用不属于该记录、引文不在原件中或公开金额没有明示ISO币种时，不能入库。入库适配器支持经复核的公开页和有登录界面观察依据的登录资料；历史页面需原文中的账号界面依据，不能错标为公开页。报价、支付、退款、隐私、设备条件和未核实经营自述各有独立准入检查；经营自述不能产生成立日期或连续经营证明。

## 按字段缺项运行

```js
await workflow.runWorkflow({browser:collectionBrowser, runId:'NEW_GAPS_RUN',
  incremental:true, limit:2, credentialsForOrigin, credentialsForRegistration});
```

`incremental:true` 自动生成全目录去向、按报价/支付优先排序，复用已有采集运行及正式资料中的原件，再访问实际留存过的未读链接。相同地址已有合格原件时跳过；仅为修复没有正文证据的误空项做有记录的重试。旧采集时间不刷新，旧原件另存并重算哈希；外层JSON包装里的可见文本要解包，链接元数据不能当业务原文。

浏览器导航需等待新文档真正提交，再等待异步加载；网络一直不空闲时仍检查已加载正文。浏览器控制故障单列，不当网站停服或访问失败。采集临时页关闭，待验证页按上限保留。`actions.json` 是私有操作队列，记录验证码、邮箱验证、条款及登录断点，不能部署公网。

增量证据复用同时复制脱敏快照及其 `originalFile` 原件，核对 `originalSha256`；`scripts/repair-collection-originals.cjs RUN` 可为既有运行补齐漏带的原件，缺失或哈希不符直接失败，不能用重新抓取冒充旧原件。同一首页的空hash、`#/`、`#/dashboard`、`#/home`作为留存首页地址去重；普通页内锚点不当作新页面，重定向回已留证URL也不重复持久化。其他业务路由仍分别处理。

免费注册由精确origin的授权凭据回调提供账号，只在内存使用。支持普通表单、图标按钮、邮箱用户名与固定域名后缀分离的表单；请求一次邮箱验证码后停止重复发送。返回账号已存在时可转入正常登录，不重置密码。验证码、协议和付费要求必须分别判断；不自动接受新条款，不提交订单。未完成的双密码注册表单绝不能判为业务正文并关闭。

邮箱验证通过 `emailCodeProvider` 接口衔接。已有用户授权读取注册邮箱时，可给 `runWorkflow` 传入 `gmailBrowser: mailBrowser`，使用已登录的 Gmail 浏览器会话；不另加账号或扩大邮箱权限。连接器身份不匹配时不能搜索该连接器的其他邮件。浏览器适配器先核对账号标题和 Google 账号按钮，再按收件人及服务名检索，`in:anywhere` 包含垃圾邮件。只接受唯一匹配的注册邮件与验证码，并核对发送域名（站点配置提供时）、请求时间、明确有效期和目标注册 origin；过期、多封、用途不明或条款/人机验证出现时留断点。验证码只在内存传递，不写原件、日志、哈希或公开数据。当前内置适配器针对中文 Gmail 时间和6位邮件验证码，其他结构需站点扩展；时区通过 `timeZoneOffset` 显式设置。99吧本次实际检索和正常登录已验证；不能据此断言新账户创建成功。

`node scripts/collection-field-audit.cjs RUN` 生成补充前后缺项统计、215条记录的子字段有值/空值盘点，以及HTML报告。false、0为有值；null、空字符串、空数组按缺失处理；混合数组同时报告有值项与缺失项分母，不以一个有值套餐遮盖其余空项。

2026-10-30的增量运行是 `collection-20261030-gaps-v2`。它处理101个任务，补充10条设备/使用条件和1条未核实经营自述；没有新增合格报价或具名支付渠道，不能称全字段完整。追加批次392已发布到既有GitHub Pages目标，具体提交、线上校验与阻塞见运行目录的 `CURRENT_EXECUTION.json`。

CLI也可分阶段执行：`node scripts/collection-pipeline.cjs init RUN A074` → CUA采集 → `analyze RUN` → 填写复核 → `stage RUN core-auth-batchNUMBER` → `build RUN`。构建依次执行核心资料汇总、公开投影、已复核字段一致性检查、派生结算重算、网站构建、后台测试、公开站测试和发布包校验。结算旧报告及每次失败日志留存；原始预测台账不变。每项套餐单独绑定来源，投影丢失金额会被拦截。

`PASS_LOCAL_END_TO_END` 仅指本地候选通过；程序不自动部署公网，不自动执行独立人工溯源、线路实测或填补未知结果。试跑已发现并修复结算重算遗漏、套餐明细引用丢失两处衔接问题。首个入库批次390留作失败候选历史；391是追加修正版，原始快照未改。

1. `node scripts/collection.cjs plan RUN_ID`：读取当前公开投影，应用 `collection/site-overrides.json`，生成不可覆盖的计划和断点文件。
2. 在已选择浏览器的 `cua_repl` 中导入 `collection/browser-driver.mjs`，反复调用 `runChunk({browser,runId,limit:3,credentialsForOrigin})`，直到 remaining 为0。浏览器入口使用 CUA 文档中的 Browser 对象。程序不另开浏览器配置，不导出cookies，也不启动隐藏网络抓取。
3. `credentialsForOrigin(origin)` 只能为该精确 origin 返回用户已授权的保存账号 `{origin,email,password}`。账号只在内存使用；没有匹配项就报告 login_required，不能把另一域或默认账号发给新发现域名。登录涉及新条款、图片验证或不支持表单时停止；不批量注册、不重置密码。
4. 普通页面读取可见正文、价格卡、政策和帮助链接，最多读取任务指定页数。只跟随页面已出现的同源只读链接，不猜接口、不读取应用内部状态。证书警告不绕过；下单、付款、订阅重置、安装和接受条款都不由通用程序执行。
5. 验证拦截自动记录并保留至多三个接手页，其余记录地址供单独恢复。`resumeTask({browser,runId,taskId})` 检查页面是否已通过，再留证；新的验证码必须取得当次确认。普通程序不能把“已尝试验证”当“已通过”。
6. `node scripts/collection.cjs report RUN_ID` 生成215条逐记录状态、九类字段、证据和缺项；`node scripts/validate-collection.cjs RUN_ID` 重算哈希、引用和敏感信息边界。
7. 所有金额与政策提取先是候选观察，需复核语义、原周期、币种、适用产品和时间。否定支付宝自动续费不证明支持支付宝；余额不当套餐价；速度宣传不当实测；版权或域名年龄不当成立日期；一条退款投诉不当政策。
8. 复核后的事实仍通过现有 `core-auth-batch*/sources.json + claims.json` 契约进入 `build-core-supplement.cjs`、公开投影、测试及发布流程。冻结的原目录/溯源/预测台账/首日证据不改；不能将这次批量候选直接覆盖既有已复核资料。

运行产物位于 `work/collection-runs/RUN_ID/`：plan、state、evidence、discovery-candidates、report、validation。原件是**脱敏的可见DOM文本快照**，不是完整原始HTML或HTTP字节；此表示类型写入每份快照。每页独立留原件、时间、哈希和引用；邮箱、订阅密钥和个人标识在持久化前移除。工作目录不由公网服务器提供。

## 站点扩展

已在 CUA 中选择浏览器后，使用该 Browser 绑定执行（不要在普通 Node CLI 中启动另一个浏览器）：

```js
var collector = await import('./collection/browser-driver.mjs');
await collector.runChunk({browser, runId:'YOUR_RUN_ID', limit:2, credentialsForOrigin});
// 单站选取仍复用同一流程与断点：recordIds:['A054']
await collector.resumeClearedGates({browser, runId:'YOUR_RUN_ID'});
```

`resumeClearedGates` 只读检查保留页，已通过的自动留证、关闭；未通过的继续保留，不点击验证或提交登录。`completeConfirmedAccessGate` 仅支持在取得当前具体页确认后的简单访问按钮，不包含通用验证码求解器，不能长期预授权自动代过。它核对页签、当前地址和两分钟内的确认时间。

Cloudflare 扩展：`completeConfirmedAccessGate` 现在也支持 `action:'click_cloudflare_checkbox'`，只定位当前页面唯一可见的 `challenges.cloudflare.com` iframe 内的复选框，点击一次后重新判定页面。`runWorkflow({...,challengeConfirmations:[{tabId,url,confirmedAt,action}]})` 将此步骤接到该运行已保留的验证断点；具体页的当次确认仍必需。自动等待页没有控件、iframe不唯一、图片题或点击未通过时保留断点，不注入token、不绕过验证。点击日志仅记录动作与结果，不记录挑战令牌。V2Board只读菜单扩展支持页面实际出现且唯一的“购买订阅”“使用文档”，点击后等待异步加载；不会点击套餐卡“立即订阅”。

`node scripts/collection-report-html.cjs RUN_ID` 生成本地可筛选 `report.html`；它链接同目录留存原件，不能直接作为公网数据包发布。单站复采使用独立运行计划中的指定任务，已完成任务不会在相同运行里重复扫描。

- `adapters.mjs` 提供 generic、V2Board/XBoard、WHMCS、文档站和FlyBit五类适配器；负责选择已见页面的读取优先级。
- `site-overrides.json` 为具体记录指定适配器、页数预算、入口及已核准的重定向域。入口变更不是主体迁移证明。
- 复杂弹窗、周期切换和特殊登录应增加有明确只读边界的站点适配器，并针对真实留存结构写回归用例；不能在通用层用猜测接口绕过。
- `lib/collection-engine.cjs` 是纯解析和安全契约，可离线测试，不含网络或账号操作。

## 新机场发现

每个读取页面的可见链接会进入发现器：按主机去重、与已知入口去重、保存原链接和去推广参数的候选地址、引用来源和时间。候选默认 `candidate_identity_unverified`，自动入库关闭；同一目录/同一上游只算一个来源组。

候选后续需直接打开业务页面核实服务名称、有效套餐与发布页关系。推广站、同名服务、云手机、咨询站或域名待售不能自动认定为新机场。发现不等于推荐，更不等于两份独立来源。搜索页也可通过 `captureDiscoveryPage` 接入同一队列；它只处理已经实际打开的页面，不自动生成搜索变体或注册账号。

`node scripts/rebuild-collection-discovery.cjs RUN_ID` 从已留存原件重新解析候选，不访问网站；排除来源站自身和安装下载链接，保留重解析前的候选审计。候选页的“入口/套餐”链接可结合机场介绍标题识别；这只说明引用关系，不证明主体身份。当前适配器优先级扩展不等于所有主题、弹窗与结算流程均已支持。

## 当前能力边界

## 授权的未支付订单核实（2026-10-31）

`unpaid-orders.mjs` 是单独启用的建单模式，普通只读采集不变。运行计划必须显式设置 `unpaidOrderAuthorization.createUnpaidAllowed:true` 和 `paymentAllowed:false`，并限定记录及域名。用户本次授权范围为缺渠道的61条记录；先在老猫完成建单、读渠道、取消、重新打开同一订单核对终态，再运行批量。

建单前核对当前余额明确为零、已有未支付订单、正数应付金额和当前域名；不能确认时不建单。临时订单动作先写本地私有台账，再点击已观察到的建单控件。禁止点击结账、支付、选择外部收银或实际付款。新条款、验证码及归属冲突留断点。渠道记录只表示页面展示，不证明收款或通道实际可用。

建单后先保存脱敏可见原文及时间，再取消并重新打开同一订单确认“已取消/已关闭”。取消不明时停止新建，优先清理。请求挂起且没有确认订单号的情况不能称已建单或已取消：停止客户端请求、独立查看订单列表、批后再次核对，保留结果未确认的限制。私有订单地址、生命周期台账和截图不部署公网；公开来源URL仅保留明确标注的订单上下文，原件中订单标识脱敏。

本轮原始运行、失败、适配修复和逐记录结果保留在 `work/collection-runs/collection-20261031-unpaid-v12/`。同入口的别名记录共用原件，来源绑定应保留全部实际记录ID，但独立性不升级。

## 官网入口检索与账号恢复补充（2026-10-30）

`official-search.mjs` 为主目录缺报价/支付方式的记录按官网域名去重，每域名一个聚焦查询，保存可见原文、URL、采集时间、哈希。搜索结果仅为 E0 发现线索，不能直接补报价或支付字段。中文“异常流量”同样属于搜索验证；遇到后熔断该搜索服务，不把剩余机场标成失败。可用的现有搜索工具可补做未执行或被挡住的查询，其原始返回、实际查询范围与记录时间另存 `search-connector-batch-*.json`，使用 `reconcile-official-search.cjs RUN` 合并状态；不自动购买搜索服务或绕过验证。批量返回属于同一检索材料，不能算多个独立来源。

统一入口可传 `incremental:true, officialSearchLimit:3`：普通缺项队列结束后接着按断点检索官网入口，返回 `discovering_official_entries` 或 `official_search_blocked`；后者由调用方使用已连接的搜索工具并保留回执，再从同一入口恢复。没有复核事实时仍停在 `awaiting_semantic_review`，不会把搜索覆盖率或登录恢复变成已补齐的业务字段。单站流程不能隐式扩展成全目录搜索。

打开候选原页前调用 `preflightOriginals`，与正式证据库的URL、导航地址和原请求地址对照；已留存页直接复用，普通页内锚点不增加来源。品牌变化、返佣购买跳转、旧抓取缓存和原页不可访问均保留不确定性，不把宣传页金额当当前官方实付价。

授权默认账号回调应标 `accountKnown:false`，已有同域保存账号标 `accountKnown:true`。默认凭据能尝试登录，但不能据此认定账户已存在并阻止免费注册。普通登录支持“立即登录”，提交后等待密码表单消失和页面状态变化。提交注册、账号已存在、能正常登录分别记录，不混为新注册成功。已激活账户页中的修改密码表单作为只读页面识别，绝不向其中填写或提交凭据。只读“购买订阅”“使用文档”菜单识别已扩展至其他主题，仍限当前页面实际出现且唯一的标签。

更新采集模块后应在新模块实例中执行，并核对实际加载的版本；持久浏览器工具中的模块缓存不能充当修复已生效的证据。真实网页登录结果与离线回归分别留档。

兼容性修订可在复核决定中明确 `retainPriorSourceIds:true`，保留当前正式字段已有来源，再追加新原件；不能用于放宽报价或支付准入。旧教程限制需要保留，新页面的版本声明只修订相应未知项，不能包装成安装或连接测试。公开投影保留完整来源引用，不再按前6个截断；来源数量增加不提升独立性等级。

渲染正文以“404”及“页面不存在”等错误提示开头时记为 `error_page_observed`，原文可留存但证据等级为E0，不当作条款正文，也不声称已观察到HTTP状态码。登录页有同名页签和提交按钮时，仅允许点击表单内唯一可见的匹配提交按钮。

## 官网公开公告的增量核实

`node scripts/find-unread-official-announcements.cjs RUN` 从正式原件和历史采集原件的可见链接中找官网直接链接、尚未留存的公开公告频道。仅同域官网原件可提供入口关系；第三方客户端文档、客服机器人和群邀请不自动当机场公告。`t.me/s/频道`只读公开预览有单独白名单，不放开其他网站的私有订阅路径。该过程不登录Telegram、不加入频道、不安装客户端。

`public-announcements.mjs` 的 `capturePublicPost` 将一个实际可见的消息正文、永久链接及其自身 `time[datetime]` 绑定留证。频道日期标题、采集时间和消息发布时间不能互换。可编辑公告的当前正文不能证明原发布日正文相同，不能直接作为事前回测命中。

兼容性历史说明可显式保留原摘要，校验要求：原摘要和旧限制不变，只追加一条有原始发布时间、同一消息引用及当前适用性未知提示的历史备注。它不变成当前故障、最近一个月事件或实测。复核基线在 `prior-context.json` 固定，构建生成的新公开文件不能反过来改变前次语境；公开投影同时核对摘要、来源和完整限制文字。

全队列执行结束可说明每条记录被处理，不意味着所有字段都有事实。登录失效、验证、归属冲突和不可访问必须逐条保留。实际速度/稳定性仍需可授权的线路、探针位置/运营商/时段/逐次样本与分位数；历史评测和宣传仅作原始观察，程序不产生虚构测速、经营年限或生存概率。

## 新入口发现与归属复核（2026-10-31）

- 旧原生链接队列为空时使用 `collection/official-entry-discovery.mjs`，按名称搜索，不把查询限定在旧域名。结果是E0线索；Google `/goto`只代表未解析的搜索跳转。
- 从已保存的`entry-discovery-plan.json`/`entry-discovery-state.json`续行；验证页不点击，保留原文/哈希/时间。不要把一次搜索完成记为原站采集完成。
- 搜索服务阻塞时，可用`node scripts/discover-entry-github.cjs RUN`检索此前未执行的记录。仓库自称官方不能证明官方；含“这里替换成你的机场官网链接”等占位符的材料不得作为归属证据。仓库属于同一推广者时按控制者归组，独立性仍未知。
- 先查旧归档中的迁移/跳转/条款定义，再到新入口核实。没有官方关系原件时保持unresolved；旧记录是推广或错品牌也不证明新候选一定不同。
- 同名新候选原文放`catalog/independent-candidates/entry-discovery-20261031/`；`reviewed-entries.json`的摘录必须逐字匹配冻结原件。`identityReview.sources`沿用旧原件哈希和原采集日期，不冒充今日验证。
- 当前执行v24：68条未执行名称线索已覆盖一轮检索（32 Google +36 GitHub），四个候选归属未解决；主目录报价/支付/退款缺失仍24/62/78。后续原件核验队列在v24的`candidate-original-review-queue.json`，不代表这些都是官网。

## 统一总控（v25）

正式总控入口仍为 `runWorkflow`，传 `unified:true`。旧调用方式保留兼容；新总控统一衔接缺项计划、原文复用、未读链接、名称发现/GitHub后备、归属准入、已授权登录与免费注册、邮箱验证、未支付订单/取消恢复、语义复核、入库构建及发布核对。

```js
await workflow.runWorkflow({
  unified: true, browser, runId: 'NEW_SINGLE_RUN', recordIds: ['A171'],
  createUnpaidAllowed: true, limit: 3, orderLimit: 2,
  credentialsForOrigin, credentialsForRegistration, emailCodeProvider,
  identityReviewer, semanticReviewer,
  finalize: true, batch: 'core-auth-batchNUMBER', publish: true
});
// 批量时增加 pilotRunId，且该单站必须已复核终结、无待清理订单。
// 用相同 runId 和同一范围再次调用即可续跑；不重开已完成的订单任务。
```

- 新总控代码为`collection/unified-workflow.mjs`，`unified-state.json`记录逐阶段结果。来源复用有哈希校验并保留原采集时间；已完成的Google/GitHub检索不会再跑。未知归属的原生公开页面可只读留证，但不向其提交登录/注册凭据。
- `identityReviewer`和`semanticReviewer`是明确的审阅接口，可返回结构化复核对象，或写入本运行的对应review文件。接口没有模型供应商和付费API依赖。本项目当前由Agent按原文逐条复核；没有复核材料时总控返回等待复核，不能自造批准。
- 新入口准入必须引用属于该记录的E1原件、精确引文、原件哈希和明确的新域名；搜索摘要或归属未确认材料不能授权新域。该准入仅允许读取，不证明法律经营主体或历史连续性。
- 未支付订单使用独立子运行`RUN-orders`保留私有生命周期；先检查并恢复本运行未清理订单，再处理新任务。余额不明、原有未付订单、条款、验证、主题歧义一律留断点。无已验证订单适配器的记录单列`unavailable`，不从范围中消失。
- `resumeUnpaidCleanup`仅可取消该运行journal记录的临时订单。取消终态未确认时，全批停止新增订单及发布。付款永远不允许；总控不能接受`paymentAllowed:true`来开启付款。
- “本次订单视图未见具名支付方式”是合法的未知观察，不是“不支持支付”。此类入库需零余额依据、支付视图原文、取消终态原文与哈希，DTO仍为unknown、methods为空，缺失计数不减少。
- 浏览器总控只写入带复核哈希及授权范围的后台任务，不在浏览器环境启动进程。在终端运行 `node scripts/unified-worker.cjs --watch RUN`，工作进程执行入库及`scripts/unified-release.cjs`发布作业，再把回执写回同一运行；总控用相同参数续跑即可读取结果。发布依次完整构建/测试、推送既定静态站、等待部署、核对线上文件。`unified-release.json`保留构建清单哈希与提交。恢复不会重复已成功的构建/推送；候选或review改变会拒绝混用。多运行发布由锁串行化，后台窗口隐藏。
- 没有新事实时终结为`completed_with_blockers_no_new_facts`，不发布空更新。运行终结与业务字段完整度分别报告；当前98条批量不是98家资料补齐。

### 缺项专向检索与收银台预览（v26）

总控传 `targetedDiscovery:true` 时，在已完成的名称检索之后追加缺项专向搜索计划。`targeted-search-plan.json`按当前缺项和已有域名生成查询；搜索连接器的原始返回通过 `scripts/gap-entry-search.cjs` 的 `retain` 接口保留时间与哈希，再用同一总控续跑。相同查询的别名记录共享回执。搜索结果为E0线索：只有已绑定官网同源的未读页面可自动入采集队列，其他候选仍需归属复核，不提交凭据，不把搜索摘要变成价格或条款事实。

收银台预览默认只跟随唯一、同源、可见的checkout/cashier导航链接。动态“确认支付”按钮不因名称自动放行。单独适配的 `cashierPreviewMode:'unconfigured_zero_balance_checkout'` 仅允许在明确零余额、订单未显示支付渠道或绑定支付工具、无卡号/密码字段时，点击一次“结账”以展示收银台；不会选择渠道、扫码、输入支付凭据或确认扣款。本轮A073实站验证：结账打开支付宝扫码页，订单随后取消。此适配不能直接外推到其他主题。

页面跳转期间的临时读取错误只重试读取，不重复点击结账；取消后等待明确终态。命名支付渠道的未支付订单证据也必须附同任务取消原文和哈希，证明零余额且未付款，才允许入库。临时二维码、支付URL参数和订单标识不进入公开投影。

已完成且已取消的独立订单运行，可通过 `completedOrderRuns:['CHILD_RUN']` 在统一总控中导入；检查范围、清理状态与未付款标识后合并原件，避免为发布重新下单。入库和发布仍通过终端 `unified-worker --watch RUN` 执行。

### v27 主题与公告入口补充

`sanfen_config_then_order`只识别已观察到的“选择周期”配置、单个带正金额的“前去支付”下一步；必须仍通过零余额、无原有待付订单、无条款及支付凭据等前置检查。不能把这条规则用于其他主题，也不从¥符号推定ISO币种。本轮入口加载/导航超时，未取得该主题真实建单成功，适配测试通过不等于实站成功。加载中出现undefined/Invalid Date时等待其消失，不能把占位零余额当真实余额。

官网留存正文中的明确“Telegram频道 @名称”也可以发现公告入口，只有显式频道声明可用，客服机器人及普通用户提及不自动进入。仍保留父原件和时间；公开频道不登录、不加入、不发消息。频道简介与消息正文分别采集：简介无发布日期，不套用附近消息日期；历史TOS变更通知不能代替当前完整退款条款。

新增公开支付声明可用`preservePriorPaymentEvidence`追加：校验旧支付观察、最强证据的渠道/来源/日期/等级完全不变。公开文字声明不能替代已有收银台观察，网站将其单列在“其他来源的支付说明”中；新增说明不自动减少缺失记录数。

### v28 收银台续采

奶优与Coffee Cloud原有已取消订单均留有“结账”但无渠道的订单页，本轮在重新通过零余额、无原有待付订单及无绑定支付工具检查后，使用受限预览适配取得下一层渠道；本次两笔订单均已确认取消，未付款。钱包页面必须等待金额出现，再按余额标签核对，不能只等待先行渲染的标题。结账使用一次性导航等待，超时后仅继续读取，不重复点击；页面跳转期间的原件与取消证明分别保留。

复用已有原文后，同一支付原件可能同时出现在普通复用结果和带取消证明的订单结果中。支付复核须按决策引用的取消证明选择对应生命周期，不能让普通原文复用行遮蔽它。`completedOrderRuns`中已有已取消、未付款的结果会抑制新建同一记录的订单；未取消或仍需清理的结果不能启用这项复用。父流程导入后仍保留原采集时间和原件哈希。
