# 四站本次正常登录授权与执行（2026-11-19）

用户确认：四站各尝试一次正常登录；不注册、改密、建单、付款，挑战留断点。
目的地：A071 board.cloudnier.com；A084 a66.jf033.com；A171 www.nicecc.cc；A186 fastlink.ws。

私有默认凭据按精确域名绑定，Oracle和本机均有写前备份；不在本文件保存凭据。容器只读secret不能原地写，首次备份因EACCES失败后改为宿主原文件原位写入，保留bind inode。A071/A084首轮无凭据提交，绑定生效后补跑；不是第二次密码尝试。

- A071 run90d8f2dd-c5f1-4f2b-a1a8-feba5156971e：正常登录响应200，账户Dashboard已读；通用login能力仍not_verified，未采到套餐。英语Purchase路由及登录后识别仍需专项修复，不能算通过。
- A084 run5c03d648-30b7-47f5-b682-c0dc27e9bcae：正常登录响应200、商店真实5档月付，24.99/39.99/49.99/79.99/119.99（页面符号¥，ISO不推断）。逐条SHA、正文定位、采集时间绑定复核；proposal2d119c0a-23c9-454b-b1c3-4f0f404d0a4c已发布catalog-edb04dbf85d96e9b4cab56c9。登录能力字段仍not_verified，不夸称独立会话续期完成。
- A171 run5d9f90f9-64bb-4f64-b629-a9f77649ab5b：表单正常生成POST /svc/a/2，email/password两字段，但运行策略拦截，未提交凭据；需核实同域官方脚本并添加精确端点适配，不能泛放行POST。
- A186 run34580349-93a3-4a02-9d88-63c201680374：正常登录响应200、商店原文已存；新增fastlink_literal_shop_cards精确路由/记录/卡片合同，4月付20/40/80/150与365天90。不把5Gbps营销、播放速度当实测，不推算其他周期。复用本轮原文重解析，无再次登录。

本轮所有实站receipt ordersCreated0/paymentExecutedfalse。每周任务不能仅凭配置nextRunAt认定已验收；未证明会话恢复的站点保留断点。正式免费code-review工具未核实可用，不宣称已做该审查。

FastLink原文重解析2cd467e5-82a3-42e9-8f17-41acdb9edddb，proposal95ee8b4d-6137-45dd-923c-982fadb2f03d五条本次原文SHA/定位/原采集时间复核通过；已发布catalog-7f031699c015236ba969e56f。v136部署exit0。

## 后续会话与专站修复（v137/v138，尚未全部验收）
- Nice 原生入口index-XpbVkl1R.js SHA c385f2e1d25acc57b65d675d9485d88e82b623c0ca7254644d1fe0e52f1e3fa3；原生导入appInit-COIpEc0V.js SHA 4128f9d88cb88a5ed208e5b8496f32bc22d52298a5d2749e666a0bcf1d3d9137，声明passport/auth/login -> /a/2，实际被拦截的同域请求为/svc/a/2、email/password两字段。专用nice_native_login_v1只允许该完整origin/path、无查询、精确匹配已有凭据的两字段POST，不放行注册/改密/其他写接口。
- v137正常认证已进入Nice账户并保存私有会话；误跑旧退款文档分支，导致capture_page_budget_exhausted。保留该docs断点，不谎称退款已完成。
- NieRCloud在内置浏览器点击已有“购买订阅”后真实路由为/#/stage/buysubs；套餐框架先出现、卡片异步加载，v137抓早导致无报价。原生user/info响应未含email，不能伪造native邮箱校验通过；v138补同域已登录路由的可见邮箱精确匹配，只输出布尔、不导出邮箱或订阅。
- SSPanel原文导航含图标，a:text-is(商店)实际命中0；改为已观察href=/user/shop的唯一可见导航控件。保留v137未持久化会话的失败，不把它算warm恢复。
- v138专站价格分支等待实际套餐卡片，不跳旧退款文档，不点击购买，不取支付接口。旧退款分支仅在原recipe下沿用。每周必须先通过真实新上下文0认证控件的warm采集。

## 最终验收 v140（2026-11-19）
- 最终相关门禁54/54，通过真实来源fixture、登录写接口边界、缓存身份校验、卡片解析、断点原路读取和差异语义测试；不把测试当实站成功。
- NieRCloud原文4档月付与旧库同价，reparse774dc30c / proposal50c5b780已发布；总16条保留12条未重读旧周期及原时间。Nice原文9档与旧库同价，reparse9feab5c6 / proposal7d7e0b20已发布。最终快照catalog-796a6722e925f3ea20f10a5b。
- NieRCloud warm df731fbf产生来源ID元数据变化提案ebf4aea3，已拒绝而保留原文。v140仅在A071已通过来源准入后的价格业务比较中排除来源定位/当前价格来源ID变化；金额、周期、quota、quote、限制、来源URL变化仍需复核。后续e013bdd1真实warm恢复成功且extracted_no_change。
- 四站最终独立新上下文warm均0登录控件、0认证提交、0建单、未付款。Nice原文文档/docs/3实际完整读取后才恢复capturebudget断点；未把退款条件当已核实。
- 真实周调度验收：四站当次nextDue调整到真实当前时刻，正常controller以actor=weekly_scheduler创建managed_collection任务，全部completed/session_observed/extracted_no_change。非人工导出或手动采集冒充调度。第一次验收脚本事件ID类型不符在事务中回滚，无日程变化；修复为使用DB自增事件ID后成功提交。准备与已提交收据分开保留。
- 定时任务配置为每7天的报价采集，其他字段没有借本次测试扩大为已验收。四站未解决断点数0，旧断点/失败原件保留并记录resolution。下一次为北京时间2026-11-26 13:10前后。
- 实际内置浏览器确认A071四档月付及A171七档月付可见，两个一次性套餐保留在数据及周期切换中；页面检查标签已关闭。API四站200，匿名后台401；支付/退款/清理字段哈希全部保持。
- Oracle API+collector v140健康、web v77健康，deploy.exit0；其他服务未改。未找到可确认免费的codex-auto-review工具，未使用收费替代或宣称正式代码review。
