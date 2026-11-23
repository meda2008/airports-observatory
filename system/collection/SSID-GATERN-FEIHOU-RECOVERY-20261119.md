# SS-ID / Gatern / 飞猴云采集器恢复（2026-11-19）

当前已验收：SS-ID A059、Gatern A182、飞猴云 A216。下方保留过程记录，最终状态以末尾验收补记为准。

## 官网目录
- A059：登记官网 https://ss-id.com/ 的公开目录。100/200/300/500/600 GB 月套餐，原周期价格20/30/45/72/85。符号¥不自动断定ISO币种；流量与设备是站方声明。
- A182：gatern.com 的原生链接指向 s.gtnb.net；旧 cart.php 404，而门户原生首页进入 /intro，实际有8档公开起价。5档月付24/40/76/148/292，3档一年期一次付款188/388/788。GiB/TiB原单位保留，一次性套餐不伪装成每月流量。
- 两站旧报价移到 priorPlansNotRevalidated，保留原日期、来源和限制，不以未出现在公开目录推断停卖。

## 已通过验收
真实Docker采集 → 精确原文定位与SHA复核 → 入库 → 自动发布 → 前台读取 → 当前配置重复采集 → 正常weekly_scheduler作业。
验收 receipt：/data/recovery-receipts/final-collector-acceptance-1795098821463.json；本地 work/v159-final-acceptance.json。
两站各自没有报价阻塞；支付和退款原字段哈希不变；后台匿名401；无订单、无付款。
这两个公开目录不需要登录，所以不把匿名访问冒称为会话恢复。采集器只验收pricing，不能算全字段完成。

## 飞猴云进行中
原生后台已用保存私有会话验证user/info邮箱一致，读取8档可售产品。已沿官网env.js→fhy配置→T02主题找到启用glass客户端金额显示规则。
客户端 https://w1.feihouyun.com/assets/main-BYKNhgkf.js SHA256 640952bb50d8dbc35de4bb64692b144573c9d51203df11015716915bc3ad0403。
分单位转换采用官网(value/100).toFixed(2)，保留原始浮点数；1000G设备正文20与接口5冲突，maxDevices不填确定数。
只有实站恢复、采集及复核验收后才能启用该站每周任务。

未使用收费review；未找到且无法核验指定免费codex-auto-review，未声称完成正式代码审查。
## 最终验收补记（2026-11-19 14:50 UTC）

三站均已完成，当前运行API/collector为recovery-20261118-v160，web未重建。
- A059：5组当前公开月付报价，正常每周run e2df25d6-e240-4ac1-9fe6-5026c59d1ff6，next 2026-11-26T14:32:13.743Z。
- A182：8组当前公开起价，正常每周run 9f88a999-9d8c-4d83-8ee4-181bed5acae6，next 2026-11-26T14:32:18.558Z。
- A216：8档产品、23组当前可售周期报价。真实冷登录run 566364e1-1284-4c5a-b731-e025383b3980（signin1/account1/plans1）；保存会话复验run 7895d47a-a532-436b-8907-9d45ab2c9ff0（signin0/account1/plans1）；启用配置后重新验收，再由正常weekly_scheduler实跑，next 2026-11-26T14:49:57.521Z。
三站最终独立验收receipt：/data/recovery-receipts/final-collector-acceptance-1795099824509.json；本地work/v160-three-final-acceptance.json。公开快照catalog-95091cd7c451a573abf32ea5。
三站payment/refund原字段哈希与变更前一致，无未解决断点；后台匿名401。103/103相关测试通过（work/recovery-v160-final-candidate-gate.log）。
前台实际核验了SS-ID五档、Gatern新目录、飞猴云年付及月付筛选（13.9/29.9/49.9），临时标签页已关闭。
未将匿名采集算登录，不把三站通过算全库验收；没有订单、没有付款。旧私有会话及旧报价原始记录保留。
原初飞猴云测试拒绝了接口浮点尾差，已改为官网明示的toFixed(2)并复验，不把非整数原始价格静默截断。后台今后若固定客户端内容发生变动，会留下native_login_price_client_changed断点，不能继续猜单位。
