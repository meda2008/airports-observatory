# X-Air A007 公开报价阶段恢复（2026-11-19）

内置浏览器核实官网首页有公开三档宣传价，且同一首页另有注册表单。通用采集器run6af2646e-1473-4bc5-a40c-7cec878cdbfd因此把含两项密码输入的整页误判为登录墙。并非公开报价本身要求登录，亦不是密码错误。

v133新增deploy-service/xair-public-section.cjs，限定A007、确切官网、publicOnly及专用recipe；新匿名上下文只读取#pricing可见区域，禁止其中出现表单/密码/iframe、禁止跨域和非GET/HEAD请求，不使用账号或触发任何按钮。只输出所选定价区域原文，representation明确不是全页正文。collection/url-collectors/xair-public-section.cjs解析三卡原文、时长和总量；现有www-x-air-org.cjs委派此分支，原账户目录和收银图片解析保留。正式相关最终门禁50/50（含原收银测试、真实Docker原文fixture复验）通过。

真实独立采集runfa0294d5-d34e-485f-bf33-9a5a5fb1adbc/job97069b88-34bc-4a2d-b63b-d71f2aad7ada：2026-11-19T02:45:34.951Z公开区域三卡31/30天150GB，174/180天1TB，312/360天2TB。是官网首页宣传，不是本次可下单或结账确认；是否与旧账户目录同款未核。每条名称前标“官网首页宣传”，保留历史账户目录4报价、原时间与不同数值，不宣称降价或替换35.02/199.24/358.63等旧报价；不把总量当每月额度，不推定ISO币种。

提案32399730-2040-479c-99dc-51a4506472bf仅pricing，3个原文quote逐条SHA/范围/观察时间校验，批准发布catalog-4bb9e01cf9416772b0d8e10e。前后payment/refund哈希一致，旧orderCleanup包含在payment内亦保持；私有复核回执/data/recovery-receipts/xair-v133-review.json。没有创建/取消旧订单，不触碰原支付待清理约束。

重复独立runbff8bd5d-4d40-403d-a0cb-797545f081ed/job29712d95-f770-4f87-90c8-b352e6129c43 completed/extracted_no_change无新阻塞或提案。下一次公开阶段UTC2026-11-26T02:47:45.546Z。API实际200/7报价/其中3宣传；内置浏览器实际显示带标注的312卡和旧358.63、480.59并列。页面来源时效不另添加前端杂项。

此阶段仅恢复公开价格定时采集；账户目录登录及支付仍需独立恢复，不得把publicOnly成功当成全字段/账号成功。整个任务76阻塞/7正文的范围没有因此完成。绝不付款。

## 同轮其他核验

prprCloud官网当前公开模块已变为index-BBbbsckQ.js。Oracle正常HTTP读当前模块与已登记公开capabilities均403，原文与SHA保存recovery-sources/prpr-public-*；正常匿名Chromium上下文同样403，显示Cloudflare Performing security verification，回执prpr-anonymous-browser-20261119.json。没有证据证明仅固定脚本名失效，没有执行保护挑战或更换出口，无新报价。旧队列不再次空跑。扬帆与云图具体新凭据目的地授权仍待回复。
