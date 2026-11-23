# 五树与闪狐后台恢复记录（2026-11-18）

五树 A053 使用 `deploy-service/five-tree-native-api.cjs`。用户已明确授权原入口 a04.xiaomiaffa01.cc 的保存账号向官网声明的 t01.xiaomicf.com 正常认证，只读采集。

- 唯一写请求是 POST `/v1/p_login`，字段仅 email/password。没有注册、改密、订单、支付实现。
- GET `/v1/p_getPlanList?authtoken=null` 必须返回未认证拒绝；正常登录保存的令牌必须得到成功套餐列表，才记录受保护会话可用。此验证不等于收集或核实账户身份详情。
- 私有会话在 `STANDALONE_SESSION_DIR/five-tree-native/A053.json`，凭据仍只从私有凭据文件读取。会话绑定入口、后台和凭据散列，拒绝跨站复用；过期最多正常重登一次。
- 认证响应只留在私有目录；公开证据只包含无账号、密码、令牌的套餐响应，证据 URL 不含 authtoken。
- `products.html` 明确使用 `month_price / 100`。保留的官网脚本 SHA256 为 `a13606b0172703296fbf03a7a5608683c16bd99b714a985e3b5f70d98af75cb2`。只更新四档月价；接口其他周期不自动升级为已核实可选报价。
- 专站解析器为 `collection/url-collectors/five-tree-native-plans.cjs`，保留 JSON 原始拼写、字面范围、散列和时间；兼容旧套餐名的月付后缀，保留其他历史周期。

Oracle 真实冷登录运行 `d8706aaa-41cd-4d00-9ba1-a5cf59e2704b` 成功；下一次运行 `4c68750c-28a8-4382-879d-aa3aed09992b` 使用缓存会话、signinRequests=0。最终配置 revision5 实跑 `83b48c34-2804-42b0-99a4-ce2a23badea6` completed，报价无变动，旧登录断点按该记录解除。月价20/35/75/140与旧价一致，不能计为四档新产品。发布快照 `catalog-f902afee551f2ed3ae636eee`；内置浏览器已核对前台四档月付。

闪狐 A185 的配置增加唯一可见个人中心标识 `a[href$="/profile"]:visible`。无会话访问 `/shop` 会返回 `/login`，该登录页没有此标识。`lib/flashfox-remember-login.cjs` 仅修复此站 `/login` 的已核实错误标签：输入 ID Remember_me、标签 for=termsCheckbox、文字必须严格为“自动登录”；不泛化到其他复选框或协议。

Oracle 闪狐冷登录 `11c96b8e-5688-4fb1-8b1a-6ddc7a98cfe2` 实际勾选自动登录并采集成功；下一上下文运行 `e59032f8-05ef-4314-bccf-244bb8c788ff` authControlCount=0，直接复用会话且套餐未变。旧私有会话已备份，没有删除历史原文。

两站配置快照在 `collection/recovery-configs/`，是此 Oracle 环境的已验证版本和授权记录，不含凭据。换环境应重新验收后才启用周任务，不能照搬历史验收状态。最终运行镜像 recovery-20261118-v87；本次没有订单或付款。其他未解决站点仍保留断点。
