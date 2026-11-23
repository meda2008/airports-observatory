# GLaDOS 邮箱登录采集器恢复

2026-11-19（北京时间）。用户授权将 GLaDOS 加入专用 Gmail 只读验证码用途；WgetCloud 绑定保留。

- 仅 A009 / https://glados.rocks/console/shop 使用 `glados_email_readonly`。
- 真实公开客户端：Axios baseURL `/api`，POST `/authorization` 请求 `{address,site}`，POST `/login` 请求 `{email,mailcode,method,site}`。读取 `/api/user/session` 验证会话。
- 真实历史邮件元数据核实：发件人 noreply@glados.network，标题 GLaDOS Authentication Code。验证码严格匹配本次请求时间、收件人、发件人、标题及有效期；先收件箱后垃圾邮件。不导出邮件正文、验证码或令牌。
- 正常页面按钮 Get Code / Login。仅允许精确匹配当前邮箱、当前验证码的原生认证请求；不注册、不重置、不建单、不付款。交互验证返回断点，不重发。
- 会话保存后由通用采集器读取商店并走原有差异复核，不因登录返回成功而推定套餐采集成功。每周任务须冷登录及独立会话恢复采集通过后启用。
- A181 glados.space 不自动扩展邮箱用途或继承 A009 的身份与套餐证据。

验收结果以 Oracle 实站回执为准，尚未在本文宣称成功。


## Oracle 实站验收

- v114 首轮 run3ffa62c2-28ce-4a66-8c3f-b19570a33363：真实发送及收件箱取码成功，因登录响应没有对象code而保守留断点；失败保留。
- v115 run8f39354a-2e16-488a-92f6-6bde6b9812e2：再次正常取码，原生 `/api/user/session` code0 确认会话，读取真实商店卡片。登录响应HTTP200但无对象code，不据此误判密码错误；以独立原生会话读取为准。
- 真实商店在2026-11-19 07:26:35（北京时间）显示30天总价 Basic $2.21 / Pro $4.26 / Team $18.53；$只保留符号，不推定ISO。每月1日重置流量，与30天有效时长分开。最高带宽不是实测。
- v116测试发现跨卡正则可能错取下一档流量，修为每个Order Now边界内独立匹配，缺一档就不解析整组三档。
- v117仅为A009既有精确中文套餐别名绑定规范产品名，避免旧30天卡与新30天卡重复显示；不扩展其他站点或周期别名，不抹掉历史证据/修订。
- 完整原文重解析run2695f106-0d5e-4127-bf90-516880596166，提案5ea5afd9-0190-4dc9-ac85-c1987c5ad7c9经字面范围、SHA、原观察时间及历史评测非实测标注复核，发布catalog-a2087f9fac2da0a10b603090。公开API已读回三档。旧报价符号不同，不计算汇率调整前涨跌幅。
- v117独立上下文warm run0290f249-ed90-443d-9d57-b12ccc098b0d：emailLoginChecks只有native_session_observed，无取码请求，登录恢复成功，套餐extracted_no_change、无阻塞、ordersCreated0/paymentExecutedfalse。
- 周任务保持启用，下次UTC 2026-11-25T23:35:09.779Z（北京时间11月26日07:35）。本次验证证明当前会话恢复，不证明永久无需重新认证。
- 最终候选相关测试76项通过；Oracle v117构建/非root加载门禁/健康检查通过。后台未授权访问401。

暖会话附带历史评测复核已完成，快照catalog-be957384f8254e4009f40fe2，原始57Mbps材料日期2026-08-03，不是本次线路测速。
