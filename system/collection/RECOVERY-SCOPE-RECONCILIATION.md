# 价格采集恢复的断点范围校验（v134，2026-11-19）

目标仍是处理原76阻塞和7正文未解析，未缩为公开价格子集。实际检视发现：原eligibleCheckpoint对PATH类失败只要求同域及价格成功，若未来给只读公开阶段开启reconcile，可能把历史账户/支付流程失败作为普通路径失败清掉。当前X-Air未发生这种清除，不能声称回滚了已发生的误操作。

本次收紧lib/checkpoint-resolution-policy.cjs：
- 支付/收银/订单/退款/隐私/兼容/测速/稳定性阶段不能仅凭价格+登录成功清除。
- 原配置显式要求login或authenticated/cashier/wallet/financial/order流程，公开价格且没有登录证明不能解除其路径失败。
- 无会话证明时，旧业务子路由必须在实际主来源读取路由里出现；首页报价不替代另一业务路由。
- 保留原验证、凭据、来源域、配置版本、原文范围、最近验证、真实执行等已有门禁；不放宽CF/验证码或删除原断点。

同一最终候选相关29项检查通过。Oracle v134部署退出0，API和collector健康；collector restart0，其他服务无变更。公开API实际A007仍catalog-4bb9e01cf9416772b0d8e10e /7条，未改价格或支付数据。

部署后实际调用现有reconcile接口dryRun，对9份已开启复核选项、仍有历史未解决断点且最近状态成功的配置作审计。全部保持held：部分需要更新的实际成功时间，部分未重新验证原特殊挑战或登录。resolved0，mutationsfalse，未强开opt-in、未刷新来源时间、未把旧成功重写成当前实跑。

权威原始审计/data/recovery-receipts/checkpoint-scope-v134-audit.json，本机outputs/oracle-recovery-20261118/checkpoint-scope-v134-audit.json。该快照有158份配置：最后状态completed67、review_approved28、blocked49、never_run14；这些是配置数，不是独立机场数，也不是“原76已减少到49”的同批次统计。14未运行配置均禁用，检查含名称/归属冲突、无入口或已有人工持有原因，不能为刷通过而启用。历史open/resumed共329行、111份记录，包含重复历史回执，不等同111个当前故障网站。

同轮只读FlowerCloud旧官网flowercloud.net仍CF，未点击挑战或绕过。待授权的云图/扬帆新目的地及四站默认账号尝试未获答复，不视作批准。当前没有pending提案可漏复核。本轮无新报价、无新采集事实发布、无订单/付款；完整目标继续未完成。
