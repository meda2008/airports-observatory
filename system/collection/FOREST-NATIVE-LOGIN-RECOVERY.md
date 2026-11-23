# Forest 独立候选后台恢复（2026-11-19）

仅A063当前候选 https://forest-01.com，不确认它与旧Nutbit/坚果的经营主体、名称沿革或运营连续性。使用用户此前对这个具体候选授权的账号，未传输旧Nutbit独有凭据。

## 已保留的实际证据

- 官网实际加载的布局脚本 `/_next/static/chunks/app/(dash)/layout-329901c07bc4b94c.js`，SHA256 42719cae67ca9914fdc52e9e6ce5e86a837ce30b35f7c404828a4989f30c57bb；原文保存在Oracle `/collector-state/recovery-sources/forest-42719cae67ca9914fdc52e9e6ce5e86a837ce30b35f7c404828a4989f30c57bb.js`。
- 站方明确调用同域 POST `/tJ8o-O6qU-0sC4cR-5eI2iL8-gR9hS4hM8?scheme=passport/auth/login`，唯一请求体email/password。
- `forest_scheme_login_v1` 仅允许上述域、路径、单一scheme和值，以及绑定账号的精确双字段；不放行注册、忘密、订单、充值、其他域或任意RPC。
- v119正常登录run614e7d1c-781a-480e-b7ae-36972f3e9ea8已保存站方生成的私有authToken，但通用流程返回配置登录页，仍保留post_login_entry/login_required失败，不把令牌存在当验收。
- 随后的profile流程暴露hydration竞态：账户页先显示退出等外壳，账号数据与登录标志稍后才完成；过早点击充值会返回登录。原失败run59286f92-77e8-4fd8-a2d5-dbf145d8a79f保留。
- 独立观察官网GET `scheme=user/checkLogin` 返回 success:true / data.is_login:true，且当前邮箱匹配。body与账号ID/邮箱不导出。

## v120代码

`lib/forest-session-proof.cjs` 只观察前端正常请求的精确原生会话响应，不注入令牌或主动调用私有接口。冷上下文无保存状态时先加载正常/login；有状态时等待profile原生确认，失败转正常/login且最多一次正常提交。打开充值配置前再次验证；不以静态退出按钮或空账户外壳代替。

`lib/forest-evidence-metadata.cjs` 将已选周期、单一面板和逐卡正文传递到复核端，只有同域指定路径且每张卡都能在正文中找到时保留。充值预览只保留固定五项可见标签、未输入金额/未点击支付标志和绑定正文；不接受其他站点数据。原文仍走现有采集时间、哈希、当前捕获与复核规则。

该站上下文预算90秒，避免短预算丢掉合法慢加载。未注册、改密、建单或付款。最终验收须以实际任务原文、解析字段、复核发布和独立冷/暖会话回执为准，本文不以测试代替实站。


## 后续实站发现与修复

v120 run6771344f-b8ab-450c-9ac7-686036b2e313确认原生会话、读取充值五项并解析payment无变化；报价未更新，因为新版卡片仅列产品条件，价格移到页面底部，必须选择产品与周期。

v121将每个产品的原生radio与月付/一次性周期逐个选择，读取底部“¥金额 立即购买”文本，绝不点击该按钮。绑定所选radio数量、标签、周期和价签；不给未选卡片套用同一价格。采集月付三档与一次性一档共四份独立正文，加钱包/首页/政策/续费说明共8页。

v121冷登录runb305d498-db16-40a8-bae3-598c99d19686保留：SPA成功登录不自动再次请求checkLogin，严格会话证据不足。v122登录后对账户页作一次正常导航，由官网客户端触发自己的会话读取。v122真实冷登录run2c2d05b9-aa67-4272-9fb8-7becd42f51d4已观察3个登录控件和匹配邮箱的原生会话成功，但钱包选项未加载完成即计数而留forest_wallet_options_changed。该失败不是密码错误，未重复猜密码。

v123只补钱包对第5个可见radio的有界等待，再做精确五项校验，不将尚未加载的空列表当成渠道变化。原旧会话及每次冷尝试会话均独立备份。最终价格与发布验收仍需查看实际v123任务结果。


## 完整采集、复核与会话恢复

最终完整采集runad91173b-6c8e-4e7b-9b92-126c249966d1 / jobf1e92e59-bcd9-4b64-8aa9-ce72b4f240a2（v123/profile7）读到8份原文，原生邮箱绑定会话确认，无阻塞，未填密码，订单/付款均0。月付29.88/68.88/188.88、一次性388.88逐项选择，保留产品、周期和价签元数据；四档与旧数值一致，不计新产品。

提案9b5046ba-117b-4f6d-a020-86da4396bca6只更新pricing。每档核对正文范围和SHA、原观察时间与原job绑定、服务端保留的selectedProduct/period/priceText及purchaseClicked:false；身份仍current_Forest_candidate_only_not_Nutbit_identity_confirmation。发布catalog-2f7da3029707256a96246b9d。

后续独立上下文run0eed85c2-1a5e-4c25-8e51-452fb2370a3f / job4cb85f38-a16b-4de1-aafd-25ddd7a4593a completed，无阻塞，authControlCount0，session_observed，pricing extracted_no_change，8份原文，无订单无付款。周任务下一次UTC2026-11-26T00:26:47.691Z（北京时间08:26）。冷登录的原生证明来自v122真实冷上下文，先前钱包加载失败保留，不宣称那次整站采集成功。

前台实际核对三档月付、支付和退款内容显示正确，但标题仍Nutbit，易误导候选归属。v124仅在公开API展示投影将该限定scope的A063命名为Forest（独立候选），原数据库name、历史修订和其他记录不变。该版本原计划仅重启API；实查旧采集器在API不可达期间累计重启8次，不能据计划声称未受影响。v125已补充两种执行循环的API退避恢复，下文记录实际验证。

最终相关门禁100项通过；原99/100失败为测试fixture误读真实用户归档名单，修复为临时root隔离，不修改生产归档名单或放宽断言。首失败和修复日志均保留。


## v125最终验收及共享执行端恢复

- 临时网络错误只在API传输封装中打上安全标记；HTTP408/425/429/5xx有退避，401/403、业务拒绝、配置/租约/原文冲突不重试。测量线路自身的fetch失败不冒充API故障。退避上限30秒，停止信号可中止，不记录认证信息。
- 测量循环恢复前先flush持久outbox，网页循环先走原有pending-submission恢复；不因API更新结束共享容器中的代理/另一循环，也不重新创建已持有的任务。
- Oracle分阶段部署v125：先启动新采集器，再正常更新API。实站日志：UTC00:44:05 measurement api_retry_wait，00:44:14 standalone api_retry_wait，00:44:29网页api_recovered，00:44:41测量api_recovered。部署前后采集容器ID均8f2fe1831458cf38c26a07c44eca1e7d5c691c4e241a30d4d9975a599c0882a2，RestartCount均0；部署exit0，三个机场服务健康。其他服务未改动。
- 最终v125真实冷登录runaf587055-3856-4a63-8fcb-fd7ce098edb6/job65743050-eaa0-477f-84c3-21f72aafffb8，profile7：3个认证控件、邮箱绑定原生会话确认、8份正文、completed、pricing extracted_no_change、无断点、无订单无付款。原可用会话已另名备份，没有删除。
- 周任务已验证启用，下次UTC2026-11-26T00:46:18.630Z（北京时间11月26日08:46）。独立暖上下文完整采集证据为run0eed85c2-1a5e-4c25-8e51-452fb2370a3f，0个认证控件。
- Codex内置浏览器实际核对前台标题Forest（独立候选）、三档月付/流量/设备/支付和退款；公开API另确认四档。后台无授权401。未声称旧Nutbit运营身份得到确认。
- 最终同一源码候选相关门禁118项通过，含HTTP故障退避、鉴权拒绝、持久outbox先恢复和不重复claim；不把合成故障测试当生产证明，生产证明为上述真实API滚动更新及容器计数/日志。
