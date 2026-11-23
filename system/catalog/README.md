# 本地可运行名录的数据口径

2026-10-26新增`current-evidence.v1.json`作为独立追加层，原`catalog.v1.json`、`source-provenance.json`和245条原始台账不覆盖。新层逐条保留本轮检查状态、公开标价和渠道说明的限制、近30天限定扫描的投诉/恢复线索；所有原始材料在`refresh/2026-10-26/`，可按hash与新证据ZIP定位。下方首日说明适用于原冻结数据；新层不是对旧预测的事后改写。

这批数据从2026-10-25冻结的只读调查导入，不重新联网，不生成新概率，不修改原有data.js。

- catalog.v1.json：215条名录候选，30条未入库发现候选单列；不是245家独立运营商。
- source-provenance.json：仅包含主名录引用过的公开观察、原帖/评论定位和来源哈希。来源I0/I1不代表概率；没有I2经营可用性升级。
- officialUrl是继承或抓取过的候选域名，identityStatus均未核验。去掉了查询、片段、认证和推广路径；不能当成推荐链接或已确认官网。
- evidenceFrozenAt是调查冻结时刻；observedAt才是实际取得材料的时刻，允许为空。lastAttemptAt不是服务验证时刻。后端必须按字段TTL派生freshness。
- 所有forecast均abstain、概率null、scorable=false。星级/速度/价格/支付旧主张只在legacyClaims内保留，不能冒充当前事实或进行概率排名。
- 公开套餐为机器筛选文本，支付为公开说明，均非实际结算/可退款/付费节点验证。
- 社区统计是固定仓库窗口内的发帖与留言活动，不是独立投诉人数或投诉率。原帖域名相等也不证明经营主体。
- domainObservations的注册创建日期不是运营年限，到期不是跑路日期，CT缺失/限流不是无证书。
- aliasRelations只由精确同host线索建立，没有自动合并主体。
- 为防止旧敏感材料被服务，未复制原始data.js、notes、Cookie、账户或注册过程。原始快照仍在调查交付包，应用只展示脱敏的摘要及hash。

当前源级URL按安全导航规则处理，精确请求需使用原始离线证据包复核；源hash与容器对象定位保持原样。新采集应追加快照和版本，不覆盖今天台账。

## 长期复算材料

- `forecast-ledger.v1.ndjson` 是首日245条弃判记录的原样副本，哈希链没有改写。
- `archives/public-evidence-2026-10-25.zip` 是公开证据包的原样副本；来源登记的archiveRef/originalContainers可定位包内原始响应或失败元数据，不依赖聊天工作目录。
- 归档只允许明确白名单下载，不把原始HTML、原项目数据或凭证目录作为静态目录公开。

## 遗留分类补全

15个原unknown条目按vpn_resources.md父子分节与粗体名称行补分类，不按名称猜业务。classification-evidence.json保留节标题/名称/行号及原文件hash。Vircs同时被列在代理和VPS两节，保留unknown并显式标记冲突；分类不代表经营主体或当前业务已核验。

## 导航与公开查询重放

`url`/`navigationUrl`仍是去查询、去片段和推广路径的导航地址。`originalRequestUrl`仅在归档元数据证明已实际请求且参数安全时保留原始HTTP目标；不能安全恢复时为null并提供originalRequestReason。`publicReplayUrl`允许crt.sh的q/output、CertSpotter的domain/include_subdomains/expand以及经过值校验的公开GitHub查询，或从原始对象恢复的GitHub评论公开定位。跳过的CT请求标planned_not_collected，不能据可重放链接声称当时已抓取。普通官网仍使用安全导航地址，不恢复推广或认证参数。requestUrlProvenance/replayUrlProvenance给出归档条目、定位及hash；不联网、不补猜页码，不改245条原始台账或证据ZIP。
