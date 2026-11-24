# 闪电猫、椰皮后台采集恢复验收（2026-11-19）

本轮完成 A006 闪电猫、A048 椰皮的独立后台采集、会话恢复、复核发布及真实每周调度验收。隐云、三分、黄鸭复用已验收证据，没有重复登录。其余站点不因此视作完成。

## 实站结果

- A048：读取四个产品、16组原付款周期总价。逐条验证原文范围、原文哈希、证据编号、真实采集时间及金额／周期。金额与旧数据一致，更新观察记录，不称新增16个价格。两份提案分别完成字面证据复核并发布；生产快照 `catalog-7c6a203a2fe64b6c58b2eb7f`。
- A006：真实正常登录后确认独立会话；精确选择 `a.nav-link[href="/user/profile"]`，排除隐藏下拉菜单的同名链接。实读7档独立套餐和4档叠加包；目录另有保留的历史周期，不能把目录10条全算本次重新核实。金额未变化，未伪造报价变更。
- 两站最终均由正常 `weekly_scheduler` 创建并完成 `managed_collection`，不是模拟时间或只手动调用采集器。最终任务账户提交数0、登录控件操作数0，证明会话恢复；原始正文及观察仍写入数据库。
- 最终均无 open/resumed 采集断点。支付和退款原字段哈希保持不变；无订单、无付款。
- 已在 Codex 内置浏览器实际验证两站公开详情页；后台匿名请求401。

## 固化到代码与逐站配置

1. `deploy-service/control-store.cjs`：停用站点仅在 `validateWhileDisabled:true` 明确配置且 standalone 验证任务时可被执行；常规定时／managed collection 仍要求 enabled。默认停用语义保留。
2. `lib/site-price-business-diff.cjs`：椰皮通过当次原文绑定后，仅时间／来源哈希／证据编号变化不再反复制造待审报价；金额、周期、配额、条款、来源地址和原文变化仍要求复核，原始观察不删除。
3. `lib/checkpoint-resume-url.cjs`：仅对既定SSPanel站点缺失next参数的历史 `/verify` 断点，回到已配置只读商店。不是猜测POST字段、解验证码或绕过保护。
4. 恢复任务失败后可再次显式续跑原断点；当前仍在执行或已成功者不能重复续跑，旧失败保留。
5. 黄鸭补充失败关闭保护：恢复会话的受保护账户身份不匹配时立即留断点，不能被页面Logout字样覆盖。仅负例回归，不重登录黄鸭。
6. 本地逐站配置 `collection/site-collectors/A006.json`、`A048.json`、`A165.json` 已保存生产实际配置；Oracle SQLite为运行配置持久化来源。
7. `hosting/pages/continue-repaired-checkpoints.cjs` 提供单站、逐个、终态后再继续的恢复验收脚本；失败即停并保留任务，不直接改SQL断点状态。

## 浪网 A165：新入口已核实，业务登录仍阻塞

原发布导航 `https://langwang.wavenetaff.com/` 实际跳到 `https://nkasja.wavenetttt.sbs/`。本次用户明确授权后，只向该域进行一次真实正常登录。采集器避开页签的登录和“测试登录（演示用）”，限定真实form submit，勾选已有记住我规则。

该正常请求返回HTTP404，归类 `native_login_endpoint_unavailable`。不称密码错误，不注册、找回或再次提交；采集器保持 disabled，未启用每周任务，没有发布新报价。旧门户公开客户端原件保存在 `/collector-state/recovery-sources/wavenet-public-client-20261119.json`；新失败原文已入证据库。别重复该404，下一步需要官方可用后台或新原生导航变化。

库洛米的当前服务器只读诊断仍是429 Vercel Security Checkpoint，不是套餐加载完成；没有绕过验证。未冒充已修复。

## 最终验证

- API与collector均为 `airports-observatory:recovery-20261118-v149`，容器healthy；web沿用v77，未改其他服务。
- 最终相关后台门禁98/98通过，原始失败日志保留，未拼接不同候选测试数。
- 未发现可验证免费的codex-auto-review工具，没有改用付费审查，也不宣称完成该工具的代码审查。
- 下表是实际调度结果，时间为UTC；前台按上海时间可加8小时。

- A006：run `a20d10dd-be60-46a2-8509-e98f5031538c`；session_observed / extracted_no_change；下一次 `2026-11-26T11:41:46.026Z`。
- A048：run `795ecbd7-251d-4372-b926-69a7b0748074`；session_observed / extracted_no_change；下一次 `2026-11-26T11:40:55.503Z`。

完整收据：`work/speedcat-yepfast-v149-final-acceptance.json`；原始每周执行诊断：`work/two-site-v149-weekly-private-safe-receipts.jsonl`。

最终队列核对：本轮三个站点无待复核提案、无本轮validation/managed_collection在途任务。每站仍保留一条2026-11-02前后创建的旧purpose=collection排队记录；独立执行端不领取这类历史任务，本轮未删除或重复执行。不能把全表queued数量当成本轮未完成数。
