# 边界云、X-Air、守候网络采集器恢复

本轮目标：复用已验收站点，修复可实际取得官网报价的缺口。源代码位于本仓库根目录。运行目标服务容器；没有部署到新服务器，没有付款。

## 当前验收与证据
- 边界云 A170 已完成：公开四分类读取、原周期报价解析、复核入库、自动发布、实际 weekly_scheduler。九组展示报价。年付189不能改写为可月付15.75；50GB流量包总价50，有效期不详；企业学习月卡9999为异常高价原文，是否占位或可成交未核实。历史报价单列。
- 边界云 receipt：work/bianjie-v161-final-acceptance.json；Oracle /data/recovery-receipts/final-collector-acceptance-1795103461001.json。前台IAB实际检查年付189等；标签页已关闭。
- X-Air A007 已部署：三个官网首页宣传卡与四条历史账户目录分离；不冒称登录后完整商品目录。重复采集发现仅标题偏移、来源ID/时间/hash变化，业务金额和字面条款相同；差异层只对已绑定本站来源准入后的pricing忽略这些元数据，金额、quote、sourceUrl改变仍复核。三个旧账户login_required断点继续保留，不能说账户登录已修好。
- 守候网络 A042：旧官网公告原生列出push.shvip888.com；发布页直连按钮实际打开cw.gosntp.com，商店路由/pages/pricing。IAB原有会话能看价格不算Docker会话成功；全新匿名Docker实际被导向登录。取得用户本次新接收域名授权后，绑定原保存账号（私有原件备份、原文件原位更新）正常登录成功。新上下文保存会话已真实恢复，逐轮读取六组周期，五档产品共27报价，没有再次登录或建单。

## 修复与失败保留
- 边界云分类切换后立即读取会得到旧分类，改为等待目标标题可见再读。首次失败记录在会话工具回执；正式运行通过后才启用。
- 边界云按量额度数字和GB分行，解析按原文空白兼容，不从“1元/GB起”外推价格。
- SNTP隐藏input不适合按checkbox角色定位，使用精确可见周期标签，读取前核对五张卡的目标周期显示；不触碰“立即购买/抢购”。
- SNTP独立诊断最初未获得完整页面，改用生产collectStandalone调用链复验，保存会话实际成功；临时内存注册器相对import错误只修正了测试入口，不误当生产代码问题。
- X-Air旧断言混存4+3列表，行为修正后变为current3/history4。原失败 work/xair-bianjie-v162-predeploy-gate.log，修复后验证另存。

## 其他站点
ByWave公开runtime-config声明同源API；site/security明确login_captcha_enabled=true。Docker保存状态没有可复用token/cookie，密码提交0；没有通过调用登录接口省略挑战，也未修改验证码开关。相关公开客户端、配置和诊断保留work/bywave-*。
Anyland最新保留原文来自非标准端口IP，尚未核实可由当前后台安全恢复的域名，不将旧资料算本轮官网新采集。Lumo最近保留的是历史未支付订单与取消记录，不把单张历史订单当当前目录。未重新建单。

免费codex-auto-review工具当前不可用，未擅自使用付费替代审查。

## 最终验收（2026-11-20，UTC原始记录为2026-11-19）

三站最终 receipt：work/v165-three-final-acceptance.json；Oracle /data/recovery-receipts/final-collector-acceptance-1795107086108.json。公开快照 catalog-946acff4b7db7fa3596ef158。
- A170：profile5，当前9组报价，实际每周run ea5e014e-cc50-473d-bd5f-a595d63449f3；无开放断点。
- A042：profile8，当前27组报价，正常登录与独立保存会话恢复真实通过，后续正常每周任务完成；旧匿名login_required已根据实际认证及报价成功证据解决，开放断点0。
- A007：profile5，当前3张官网首页宣传卡，4条旧账户报价单列历史。正常匿名每周任务完成；3个旧账户登录断点保留且仅与当前匿名宣传区任务独立，不能说旧账户已登录或完整商品目录已验收。
三站最终任务均managed_collection，入队actor均weekly_scheduler，报价结果extracted_no_change。支付和退款原字段hash与变更前一致。执行端无付款、无新订单。

### 前台契约问题及实际修复
守候网络旧历史上下文缺少完整createdAt和候选名称，前台直接createdAt.slice导致详情崩溃；未伪造日期补数据。三个前台源的可选日期检查与原始描述保留已修复，缺日期显示“日期未注明”。真实未完整日期的公共summary用于回归测试。
GitHub连接器传输失败，改用原有干净发布分支public-hangxiang-20261117；只提交index.js兼容及index.html脚本缓存版本。提交4b81e2d、53a41e5，JS版本3787f6e37d7c5a9c。未导出新静态数据，前台继续读取复核后的实时API。
Oracle前台与API的web.cjs代码hash已核对相同；仅修复展示bundle并滚动机场三服务至v165，均healthy。没有改域名、网关权限或其他服务配置。
公网实际权限检查：只读API域管理路径404；管理域无凭据401；容器内管理API无凭据401。API容器到公网的DNS诊断失败未通过放开隔离处理，改从Oracle主机验证公网权限。
IAB实际验收：边界云年付189；守候网络详情已恢复，月付18/28/38/48、季付49/76/103/130；X-Air全部三卡31/174/312与30/180/360天。临时页已关闭。截图位于共享outputs/oracle-recovery-20261118。
最终同候选相关门禁121/121通过：work/recovery-v165-final-candidate-gate.log。
Modern Web Guidance已按技能检索render optional dates与render missing data，未找到可选日期空值回退的对应指南；未取用无关指南或引入日期库、未用当前日期补齐缺项。

本轮三站通过的是明示采集范围，不是全库或全字段验收。ByWave仍需交互验证码且无服务侧有效会话，密码提交0；Anyland、Lumo现有原文不冒充本轮当前目录。其他既有已验收站点复用，没有重复登录或建单。


机器回执最终摘要：
- A170 profile5 run ea5e014e-cc50-473d-bd5f-a595d63449f3 count 9 next 2026-11-26T15:50:15.182Z blockers 0 retainedIndependent 0
- A042 profile8 run 7bbc8bb6-d916-4730-8633-ee36a3fd3c95 count 27 next 2026-11-26T16:39:25.733Z blockers 0 retainedIndependent 0
- A007 profile5 run 0ee34299-6b79-40e6-b3ec-67f1725599bf count 3 next 2026-11-26T16:38:53.938Z blockers 0 retainedIndependent 3
