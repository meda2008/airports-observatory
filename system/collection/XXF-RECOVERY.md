# 小旋风后台恢复记录

2026-11-19：当前同域入口 `https://a01.xxfaffa01.cc/#/store` 会进入 `#/login`。公开表单本轮为英文，不使用旧的中文占位符作为必须条件；仅按唯一可见邮箱、密码和登录按钮发现控件，仍需原同域凭据。

官网实际加载 `assets/index-F-CYBvZO.js`；Docker保留原文于 `/collector-state/xxf-browser-client-20261119.js`。其启动函数原生声明 `POST /v1/sys/init data:{}` 和 `POST /v1/User/UserInfo data:{}`。前者读取启动配置，后者读取当前会话用户信息。`lib/xxf-native-read.cjs` 仅允许A061同一origin、无query/hash、这两个精确路径、空请求体或空JSON对象；不允许任意POST、字段更新、登出、订单或支付。用户信息响应不导出为公开原文。

初次去除旧等待后的实跑 `b991d870-9651-46c3-bcb5-46f7f9a94fee` 仍超时，回执已明确记录上述初始化POST被拦；失败保留。v101部署后需重新实跑才能判断恢复，不因单测或登录控件匹配就启用周采集。
`index-F-CYBvZO.js` 实际保留原文 SHA256：`319506a6c070e782f1f84679a5c7960d6b6fa2da61fb39b75fc443dccd5de50c`。未复用Node普通GET返回的161字节非客户端响应作为合同证据。

v101实跑 `b32ea7ef-878b-4a6d-8424-6cc6379859b5`：两个初始化读取已放行，实际进入 `#/store` 的登录后布局，原生套餐读取 `POST /v1/product/list` 被识别为下一处阻塞。商店实际加载的 `assets/index-Bo4_bfZd.js` 原文保存在 `/collector-state/xxf-public-store-client-20261119.js`，SHA256 `370fa1d610404259a27b562e237236ee63c69d7aa398c9b5657e39f5a6961cd7`；调用为 `e("/v1/product/list")`，实测原生请求体为空。v102只追加此路径的空请求体读取，不允许product/order、优惠码、账单、订阅密钥和节点列表接口。

官网主脚本使用 `navigator.languages` 选择支持语言并缓存locale。A061专属contextOptions使用正常 `locale:zh-CN`；不注入认证、验证码或localStorage。当前等待使用原生文字包含匹配，不再错误要求整个“每月可用流量”字符串独立精确出现。配置更新是浅合并，不能靠省略readiness字段删除旧配置；本轮改为显式替换合法readiness对象。登录后唯一用户中心文字标识只证明可见登录态，不证明账户身份、余额或套餐所有权。

最终验收：小旋风独立上下文恢复 `bd590f2f-709e-4e4a-bc19-7a7ada8bcebd` 登录控件0、session_observed、五分类29项字面报价、extracted_no_change。实际倒计时变化原文仍入库；业务比较在当前来源绑定校验后执行，价卡语义不变不产生提案。早期把比较放在解析阶段导致旧来源绑定被拒的失败已保留并修正。A061 profile9开放断点0，每周任务有效，下一次北京时间2026-11-26 01:37。
