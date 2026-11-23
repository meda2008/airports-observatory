# 四条独立的数据链

2026-11-14本机持续测量已迁到独立Docker后台。`measurements.sqlite`的唯一采样写入端位于原生命名卷；本地管理API、CLI和复核通过受限Docker exec RPC访问同一数据库。Windows采样/client启动入口由持久化backend marker停用，旧库保留禁用fence及一致性备份。复用原始观测、冻结窗口复核和显式发布的规则不变。部署、健康、恢复及安全回退说明见 `measurement-sidecar/README-local.md`。

网页采集继续使用原站点配置、standalone 浏览器和 review/publish。新模块不替代或扩大它的登录、域名、支付权限。

1. 线路测量使用 `measurement-worker.cjs`，经用户配置的**本机 HTTP 代理**访问明确许可的 HTTPS 测试端点。没有 direct fallback；CONNECT 使用正常证书校验；重定向不自动跟随。先经同一代理访问出口回显端点，结果必须精确匹配预期出口 IP，再执行传输。routeId 是用户给本地代理线路的标签，不是运营主体认证。
2. 小流量探测使用独立 `stability` profile、间隔及流量预算。它统计指定线路到指定 HTTP 端点的探测结果，不是全站可用率，也不是 ICMP 丢包。失败/恢复仅定位到两次探测之间；缺测不当成故障。
3. 历史整理器按身份范围、信源和原日期角色整理现有资料，保留转手、别名未核、日期冲突及日期未知。捕获时间不替代测试、发布或运营时间，不计算连续经营年限。
4. 四种来源不合成分数。原始观测立即写入独立 `measurements.sqlite`；合格结论通过现有 collector 库的 pending proposal，由现有 review/publish 决定是否发布。网页第三方报告、站方自述、历史证据与独立测量保留原分类。

## 初始状态与秘密

首次部署时没有真实订阅，profiles为0、测量开关默认关闭，状态为`NOT_CONFIGURED`。2026-11-14的后续授权已从用户现有A010账号的原生订阅控件取得私有订阅，未购买、付款或新注册；当前仅该站的一条隔离线路配置启用。其他站仍未配置。worker在线不表示所有站已被实测。

该线路的正式首窗口为3次256KiB完整HTTPS传输，以及2026-11-14 01:57:26.849Z至02:00:26.849Z的10次HTTP探测（180秒）。下载数值是这3次小文件传输的样本P50，不是线路峰值带宽。P10/P50/P90采用经验nearest-rank：排序后取`ceil(q*n)`位置；3个样本的P10/P90实际上只是这3点的最小/最大值，不代表总体分布。响应头耗时包括代理CONNECT和TLS，用样本中位数表示，不是ping RTT。该短窗口HTTP成功比例不代表机场整体或长期可用率，ICMP丢包未测。

订阅及本地线路客户端的状态由用户的隔离代理客户端管理；本系统只消费明确配置的本地代理端口，不解析订阅、不导出浏览器会话、不扫描端口。HTTPS目标、出口回显目标、允许 origin、预期出口IP及网络/地区需用户实际配置；不根据品牌猜线路。

若本地 HTTP 代理需要认证，只在私有 `MEASUREMENT_SECRET_DIR/<opaque-secretRef>.json` 保存 `proxyAuthorization`，例如代理支持的 Basic/Bearer 值。配置和API仅使用不带路径的 secretRef；认证值不进原始观测、提案、日志或响应。目录默认位于已忽略的 `deploy-service/data/measurement-secrets`。不要把真实订阅、用户名、密码或鉴权值放进 URL/命令行。无secretRef时不发送代理认证。

默认带宽任务每24小时最多1MiB应用读取，探测每60秒最多1KiB；可调整但生产带宽最短1小时、探测最短10秒，另有独立日预算和30秒请求上限。应用读取量不等于内核或线路总流量。达到字节上限即截断，保守记为未完整完成，不计算吞吐。出口检查也计应用字节预算。预算耗尽、取消、worker租约过期、配置缺失各留缺测状态。

## 持久命令与接口

```powershell
node scripts/measurements.cjs status
node scripts/measurements.cjs configure --profile=private-local-profile.json --actor=local_operator
node scripts/measurements.cjs control --enabled=true --actor=local_operator
node scripts/measurements.cjs enqueue --id=explicit-profile --actor=local_operator
node scripts/measurements.cjs run --id=explicit-profile
node scripts/measurements.cjs observations --id=explicit-profile --out=work/raw-observations.json
node scripts/measurements.cjs summary --id=explicit-profile
node scripts/measurements.cjs propose --id=explicit-profile --catalog-db=deploy-service/data/collector.sqlite --actor=local_operator
node scripts/measurements.cjs propose --ids=bandwidth-profile,probe-profile --window=review-window-selection.json --catalog-db=deploy-service/data/collector.sqlite --actor=local_operator
node scripts/measurements.cjs timeline --site=A015 --catalog-db=deploy-service/data/collector.sqlite --out=work/A015-timeline.json
node scripts/measurements.cjs control --enabled=false --actor=local_operator
```

profile示例（禁用且未配置端点，不会联网）：

```json
{"id":"user-line-bandwidth","siteId":"A001","kind":"bandwidth","enabled":false,"synthetic":false,"identityVerified":false,"network":null,"region":null}
```

`network`/`region`尚未知时可以省略，不能用猜测值填充。启用前需配置 `proxyUrl`（数字 loopback HTTP）、`targetUrl`/`egressUrl`（生产HTTPS）、`allowedTargetOrigins`、`expectedEgressIp`、`routeId`，并明确当前服务归属。`identityVerified`为人工归属审核结果，worker不会自行设置。至少3次完整带宽样本或10次探测且实际窗口不少于60秒才可形成待审结论；若预期计划槽缺失则拒绝可用率结论。修改配置产生新revision，旧样本不混入新线路结论。

管理API沿用现有 Bearer 管理鉴权：`GET /api/admin/measurements` 含逐站就绪状态，`GET .../observations?profileId=...`、`GET .../summary?profileId=...`、`GET .../timeline?siteId=...`；POST `.../profile`、`.../control`、`.../request-run`、`.../propose` 均要求 actor。配置请求体为 `{actor,profile}`，控制为 `{actor,enabled}`，到期/提案为 `{actor,profileId}`。批量提案可传`profileIds`，同站速度与探测共用一个待审版本，避免相互造成版本冲突。CLI窗口文件为`{profileId:[observationId,...]}`，仅允许同revision完整前缀，不能跳掉中间失败或缺测。request-run仅设置到期，不代表执行成功。

公开 `GET /api/measurement-status` 仅显示四模块就绪状态、是否配置和 `combinedScore:null`，不返回路由、私有配置或观测详情。

## 独立后台与验收边界

未迁移的本地部署可由 `node scripts/local-product.cjs` 管理`measurements`及`line-client`子进程。本机现已切换Docker backend marker，Windows supervisor只管理原有五个非测量子进程，不再启动Windows测量/client；网页采集开关保持。真实订阅秘密只由隔离客户端持有，测量worker只读代理认证ref；不会改系统代理、启动TUN或使用DIRECT fallback。

通用Docker compose的`measurement-route` profile见`measurement-sidecar/README.md`；本机独立持续部署使用`compose.local-measurement.yaml`，操作见`measurement-sidecar/README-local.md`。本机原始569条记录已完整迁入原生卷。容器中新增3次完整下载与10次/180秒探测已复核发布，并实际测试worker进行中SIGKILL、租约缺测保留、代理崩溃和后续自动续采；故障注入记录不混进此前已发布的成功窗口。历史Windows窗口、早期Docker资格及其收据继续保留。没有进行公网部署或整机/daemon重启。

`node deploy-service/measurement-worker.cjs --once` 可执行一次有界tick；常驻模式每秒检查到期profile，保存租约、配置revision、原始成功/失败/缺测及worker heartbeat。关闭measurement控制会取消进行中的测量，网页采集不受影响。没有默认订阅或目标，也没有自动审核。

本地fixture用真实HTTP服务器和本地代理验证传输/出口失败/恢复/缺测/落库/待审链。`synthetic:true` 只能在显式fixture数据库和TEST记录验证提案；生产管理API禁止synthetic profile，`core-info`也拒绝把synthetic记录渲染为实测。fixture性能只说明工程链路可执行，不证明任何机场线路性能。
