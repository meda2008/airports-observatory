# 六站原生报价采集器验收恢复（2026-11-20）

目标是完成此前仍受账号断点阻塞的独立采集链路，复用既有账号、已获授权目的地及真实原文，不重复注册、建单或付款。当前六站目录共128组周期报价，不把本轮核验数量称为新发现套餐数量。

|站点|记录|当前周期报价数|
|---|---|---:|
|大佬云|A219|19|
|云界线|A221|15|
|环球梯|A222|33|
|神行加速|A223|19|
|榴莲云|A224|23|
|闪电鼠|A225|19|

## 原始依据与复核
沿用 collection/official-entry-recovery.json 的六份独立站点目的地绑定，不自动扩展域名。每轮读取对应品牌的guest配置、声明的官网脚本、与私有账号邮箱匹配的user/info，以及当前套餐接口。原始响应在后台私有journal保存；价格JSON与脚本单位摘录进入证据表，保留URL、observedAt、源hash和精确原文范围。
复核128条价格行：源body范围与quote一致；原JSON周期字段除以100等于发布金额；官网客户端有对应单位显示规则。六站补丁均仅含pricing；原支付、退款字段由最终同层哈希检查独立核对。
六站本轮全部使用已保存、绑定未变化凭据的私有会话，账号email匹配；signinRequests均0，未注册、改密、重置、读邮件、读付款配置、建单或付款。旧正常登录及注册历史原件仍保留，不将本轮缓存恢复说成新冷登录。

## 固化的代码
- deploy-service/gateway-native-account.cjs：在user/info邮箱匹配后显式返回accountIdentityVerified；pricing-only任务不顺带读取支付配置。有效账号原件与会话不替换、不删除。
- deploy-service/heibao-evidence-contract.cjs：保留六站原生账号核验结果，不再在接收层丢失该布尔证明；未产生证明时不补true。
- collection/url-collectors/gateway-account-plans.cjs：要求已认证原始套餐来源；用currentPublicCatalog保留未匹配旧报价。接口未给sell时不保证新购资格，不把SLA或限速宣传写成实测。
- lib/checkpoint-resolution-policy.cjs：只在当前已认证账号身份、报价、原站点/原目的地和原配置一致时解决旧native_api_valid_account_required。不能据此清除CF、验证码、支付或其他特殊断点。
- 六份 collection/site-collectors/Axxx.json：逐站entry/allowedHosts/原生账号授权/报价字段/每周周期持久化；register=false，保留旧授权记录，不在本轮复用注册权。

## 前台实际验收
Codex内置浏览器逐一打开六页，页面标题、价格表和数据正常；六站均无详情读取错误。公共前台证据：共享outputs/oracle-recovery-20261118/gateway-six-frontchecks-20261120.json与gateway-front-20261120.jpg。保留配额说明冲突，如环球梯110GB接口与120GB描述冲突；没有代填未知设备数、速度或稳定性。

## 持续运行流程的真实故障修复
v167部署预检在空间不足时试图prune一个已停止的本项目构建器，实际返回driver not running，未发生服务切换。原失败文件保留于 /opt/airports/patches/20261118-recovery-v167/space-preflight.log；未重跑同一已冻结部署。
修复 hosting/pages/deploy-space-preflight.sh：先通过项目所有权marker校验，再bootstrap该专用builder，最后只清本项目构建缓存，6GiB门槛不降低。实际清理输出744.2MB，空间由6020172KiB增至6746680KiB；未清业务数据、数据卷、私有账号配置或其他项目缓存。
修复 hosting/pages/launch-recovery-deploy.sh：即使子脚本在自身trap安装前退出，也写deploy.process.exit；仍用不可覆盖launch标记与锁阻止重复启动。隔离fixture实际exit73被记录，重复启动被拒，缺失builder所有权marker被拒61。
v168使用独立新部署编号，deploy.exit与deploy.process.exit均0；API和collector为v168，web保留健康的v165。

最终验收与正常每周任务的准确终态见末尾机器回执补记。不能把本轮六站通过算成全库或全字段完成。
指定免费codex-auto-review工具本轮仍不可用，未用付费替代；单元/接口与实站验证不声称正式独立代码审查。

## 最终验收补记
验收时间：11/19/2026 17:26:03；快照：catalog-61e2a06ee616d106e17fecb3。
不可变云端回执：/data/recovery-receipts/final-collector-acceptance-1795109163915.json。
六站正常 weekly_scheduler 任务均 completed、session_observed、extracted_no_change；账号身份核验通过，signinRequests=0，未解决断点=0。每周周期604800000ms，下次执行为北京时间2026-11-27 01:22前后。
本轮128条为当前周期报价总量，不是新增128款产品。支付和退款原始文档哈希六站均未变；内部匿名管理接口401；paymentExecuted=false。
相关最终代码门禁114/114通过（work/recovery-v168-final-gate.log）；配置同步后的受影响契约6/6复验通过，不与前者相加。
最终容器健康：API v168、collector v168、web v165；其他现有服务保持运行。六站报价范围通过，不代表全站全部字段验收。
