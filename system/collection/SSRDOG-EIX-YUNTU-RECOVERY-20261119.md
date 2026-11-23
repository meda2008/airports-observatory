# SSRDOG、E-IX、云图采集恢复验收（2026-11-19）

本轮完成3个价格采集器的真实后台采集、复核发布与正常每周调度验收。不是全站、全字段、全部机场验收。浪网404、库洛米验证及此前已验收站点不重复采集或登录。

|站点|当前报价组数|保留历史组数|采集方式|下一次上海时间|阻塞当前价格任务 / 保留独立断点|
|---|---:|---:|---|---|---|
|A019 SSRDOG|2|4|anonymous_public_no_account_required|2026-11-26 21:32:34|0 / 1|
|A044 E-IX|3|15|anonymous_public_no_account_required|2026-11-26 21:32:40|0 / 1|
|A172 云图|20|13|verified_account_session|2026-11-26 21:11:32|0 / 4|

- 云图：通过官网声明的 apiapi.ytjcok.com 正常登录，并用受保护 user/info 的邮箱匹配核实身份；取得5个可售产品、20组原周期报价。客户端Shop模块SHA 937463b5101211d5b67f44833cb37c154c0722a0d0fe00b8a795928facee167c绑定价格除100及toFixed(2)规则。保留28214.999999999996等原始数值，显示282.15，不从月均价推总额、不推定币种。不调用支付或订单接口。
- 云图初次20组报价提案28adbe43-db7d-4eb0-a4d2-d1093c1c0089逐条核对来源、原始UTF16范围、哈希、采集时刻和价格单位后批准。随后只复用原文重解析，将13条历史报价从当前列表分离，提案80a894ac-05a5-4bbc-8df4-45399b1b1daf批准。历史原文及原日期未改。
- SSRDOG：当前公开目录只核实轻量35/月、标准45/月，两组；4条其他旧周期保留历史，未认定停卖或旧账号不能续费。
- E-IX：公开目录核实45/月、75/月、199/年三组；1024G为站方描述的一次性额度、12个月有效，不保证自动续费。15条历史报价单列，旧新疆150G的35不再充当当前公开目录起价。
- SSRDOG和E-IX原文重解析的提案分别16b3f055-aca4-408d-ac99-d55905b2a6ef、aa88f1df-38e6-4a62-9475-f9d234be0f37；逐条复算价格、quote范围、哈希和观察时刻，历史对象与更新前原件逐项一致后批准。

## 固化的方法

1. `lib/anonymous-price-acceptance.cjs`明确区分匿名公开报价与账号会话，不以无需登录冒充登录成功。`standalone-collector.cjs`在publicOnly模式下不加载已有私有Cookie或临时会话，也不覆盖其文件；接收端只为真正standalone匿名观测保留此证明。
2. `deploy-service/two-site-native-login.cjs`增加云图的精确站点契约、正常认证与私有令牌恢复；仅限guest配置、登录、user/info和plan/fetch，公共客户端文件另作只读GET。账户不匹配、验证码、拒绝、客户端哈希变化均留断点。
3. `collection/url-collectors/yuntu-native-plans.cjs`实现云图逐站解析；只解析show/sell的原周期字段，排除重置流量包，不把宣传速度、稳定或版权日期转成实测／运营历史。
4. `lib/current-public-price-catalog.cjs`及两站解析器将本次公开目录与历史报价分离，历史数据仍保留在priorPlansNotRevalidated和数据库变更记录中。
5. `lib/checkpoint-task-scope.cjs`按当前价格任务范围判断阻塞。旧参考资料或云图旧网页入口断点继续保留；不能用价格采集证明它们修好。登录、接口、验证码和价格解析故障仍阻止价格任务。
6. 四站源JSON已同步在`collection/site-collectors`；运行配置持久化在Oracle SQLite。A049未通过，保持停用。

## 实际最终验收

- 3个最终任务均由正常weekly_scheduler创建managed_collection并完成，未模拟采集；下一次恢复普通7天周期。
- 云图最终任务复用私有令牌：signinRequests=0、accessRequests=1、priceRequests=1；两个公开采集器从匿名空上下文开始，账号提交0。三站新订单0、付款false。
- 支付与退款原字段哈希均与本轮开始基线一致。当前价格任务阻塞0；6条旧网页／参考资料断点保留，不称全字段通过。
- 已在Codex内置浏览器实际检查三站详情页。E-IX起价已由旧地区套餐35修正为当前45，SSRDOG只显示本次两档，云图月付20/40/79且当前目录20组。
- 内部管理API匿名401；公网airports-admin.vigorai.top/api/admin/collectors匿名401，公开只读API主机不暴露管理路由（404）。未修改后台鉴权。
- 最终相关门禁116/116通过，含真实留存原文整合、单位与浮点规则、历史分离、匿名上下文隔离及调度范围检查。代码审查工具codex-auto-review未找到可验证免费入口，未改用付费审查。

## 部署与磁盘问题

v154镜像导入因no space left on device失败，旧失败build.log与零字节exit标记保留，不把它当成功。现有v153服务当时保持健康。

按事先清点的计划只删除141个未被任何容器引用、版本低于v149的本项目旧镜像标签；保留当前镜像、全部容器引用镜像及回滚版本。未删除业务数据卷、数据库、原文、账号、线路配置或其他服务。随后仅清理已确认归属本项目的BuildKit缓存；专用ownership标记校验防止清理其他builder。

`hosting/pages/deploy-space-preflight.sh`和后续部署脚本增加空间预检，空间不足时先清本项目可回收缓存，仍不足则在构建及服务切换前停止。最终API/collector为v156 healthy，web沿用v77；最终磁盘约7.4G可用。其他服务未操作，末次检查健康。

## 仍未修复

扬帆A049：本次授权新域a02.yfy02.com的正常登录。真实后台在提交账号前被前端导向error-page；auth请求0。公开客户端确有调试检测跳转逻辑，但不据此声称已证明唯一原因。匿名只读诊断同样跳错页；公开配置及其声明依赖中尚未确认可用正常业务API。未停用检测、制造devkey、猜接口、注册、改密或付款；保留原件及断点，停用每周任务，不判密码错误。

prprCloud：一次只读入口诊断返回403 Just a moment，未绕过；浪网和库洛米按用户要求跳过。其他原有CF、凭据、入口身份断点不算通过。

## 证据

- 最终收据：`work/three-sites-v156-final-acceptance.json`
- 三站真实周任务的安全诊断：`work/three-sites-v156-weekly-safe-receipts.jsonl`
- 云图复核：`work/yuntu-v153-price-review.json`、`work/yuntu-v155-price-history-review.json`
- 两个公开目录复核：`work/public-pair-v156-history-review.json`
- 源配置导出：`collection/recovery-configs/ssrdog-eix-yuntu-yangfan-v156-20261119.json`
- 原始执行回执及私有认证日志仍在Oracle专用目录，未公开密钥。
