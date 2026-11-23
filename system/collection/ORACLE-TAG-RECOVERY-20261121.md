# Oracle采集器断点恢复 2026-11-21 v324

## 当前结果

- 本轮从15条断点中恢复TAG(A004)官网报价自动采集链路，剩14条（10个独立站点和4条同源/历史归属记录）。不是全库缺少报价的数量。
- TAG旧登录验证仍保留。新增任务为官方匿名公开目录：GET /api/v1/guest/comm/config和/guest/plan/fetch，不加载私有会话、不提交账号、不绕过验证。
- 5个普通产品共16组原始计费周期总额；私人定制canPurchase=false单列排除；reset_price不作为新套餐。已有16组价格不算16条净新增。
- 每个普通产品正文明确CNY重置金额，和reset_price逐档交叉校准100分单位；应用到同目录计费字段是公开标注的单位推断，未核对当前前端金额渲染或结账。
- Gold正文999GB、接口1000GB冲突均保留；Special为一年一次发放200GB，未当每月200GB。
- 旧历史报价保留。TAG已有退款/支付原文直接复用，未重复发布为新增。

## 真实链路收据

- 首次独立采集：d4a1c0b7-3857-492a-9596-cd58088aefbf / 77a36545-336b-4fa4-8539-e79b1456f065。
- 复核提案：6769673e-1359-492b-bb18-4c30795bc2b2，已批准自动发布catalog-2ba059ada61aa20cf120fab7。
- 第二次全新匿名读取：bc89005b-bf25-4ee5-b31b-49f6745b8b5c，completed/extracted_no_change。
- 真正每周调度：fec3ed8a-03a6-4349-b118-8e940462e8a7 / a86a8497-8594-4df2-b341-95b85f3b8602，completed/extracted_no_change。
- 下次2026-11-28T15:03:47.193Z（北京时间23:03）。只启用报价能力，不宣称所有字段验收或登录恢复。
- 前台匿名真实浏览器显示16行，页面/API200，无写请求、无页面错误；截图与收据 /collector-state/frontend-acceptance-20261120/run-1795273307600/receipt.json。
- 管理读取、复核写入、配置写入无权限均401；BiuBiu和CyberGuard保持关闭且未重试。
- 最终收据 /data/recovery-receipts/TAG-public-final-v324.json；本机 work/TAG-public-final-v324.json。

## 已固化代码

- deploy-service/tag-public-catalog.cjs：严格限定TAG公开域名、用途、字段与两次正常GET；强制身份声明匹配、TLS校验、大小/时间限制，不进行账户认证。
- collection/url-collectors/tag-public-plans.cjs：逐产品计价校准、保留原始JSON字符区间、原文/时间/哈希、全部普通周期、定制排除、配额冲突。
- standalone-collector/control-plane/index/checkpoint-task-scope：接入执行、来源分级、解析、旧认证断点与新公开报价任务分离。旧失败不删除，新公开目录失败仍阻塞本任务。
- A004站点及网址采集器源配置同步已验收的公开报价recipe，私有旧凭据不删除、不传播。
- tests/tag-public-plans.test.cjs：实际保留目录样本、单位冲突拒绝、身份限制、仅匿名GET、旧断点精确作用域。

## 部署及检查

- v323构建成功，但禁网门禁测试失败：模拟HTTP仍调用真实DNS。服务没有切换；原失败保留。
- v324通过明确依赖注入修复测试隔离，生产仍使用真实assertPublicUrl；保留原安全边界。部署两项退出码0，API/collector健康，web v165未变。
- 相关26项本地测试通过；断点/公开目录回归16项通过（两组存在重叠，不能相加为42项不同测试）；非root、OCR、旧浏览器适配及实际保留控件图像门禁通过。
- 免费codex-auto-review工具未发现、免费条件不可确认，没有使用收费替代，也不声称独立代码审查通过。

## 其他新线索及断点

- NiceCloud：原导航ncink.cc列出nicecloud.me/.org；本轮新的两备用入口Oracle仍403，不传凭据，不重跑已被拒的.cyou认证。
- 极速云候选：第三方目录将js.jisucloud8.com与旧IP并列。该域原生“此域名已停用”页面列jisu528.com和极速云导航.com；二者正常302到666.xn--666-nr6el54efma316u.com。此链只证明候选站自己的迁移，不证明与A159旧IP经营主体连续，尚不合并报价/凭据。
- 候选门户普通HTTP返回/_guard/html.js?js=easy_click_html，正常Docker浏览器domcontentloaded等待25秒超时；未进行验证点击、凭据、订单或业务提取。实际失败终态保留，不仅保存started。
- 赔钱新的已认可域名公开目录正常GET失败；未重复登录或建单。官网频道主要为促销，未把过期优惠当现价。
- V2Tun旧频道和咸鱼频道公开/s路径都返回频道介绍重定向，没有新官方报价；Amy历史频道仍只指回原官网，不用SEO同名站数据替代。
- 未重跑BiuBiu、CyberGuard、库洛米旧验证；旧Boost/寰宇和同源记录保留历史身份与去重规则。
- 本轮公开原始材料在 /collector-state/public-source-probes/*v323 和*v324，均有请求前日志、URL、HTTP状态、采集时间和SHA；不得把返回200的访问控件算业务字段已读。
- 无注册、订单或付款，数据库和私有配置未删除。
