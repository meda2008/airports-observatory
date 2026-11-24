# Amy Oracle同会话验证、保留与续采（2026-11-22）

## 交付边界

API和collector已部署v329，web仍为v165，保持三个Docker服务、同一个SQLite数据库。已完成的是服务会话接管与恢复执行端，不代表Amy站方验证通过或已取得新报价。TAG复用，BiuBiu/CyberGuard保留，其他站点本轮未重复登录。

## 已部署流程

1. 管理员打开 https://admin.example.invalid/api/admin/assistance-page 。沿用后台认证；公开API域名无此接口。
2. 打开A016专属Oracle浏览器，使用固定Amy cart.php、有效TLS和受限正常请求。正常验证框唯一可见时可进行一次普通操作；不自动回答图片题、不注入令牌、不绕过保护。
3. 画面和点击经API队列传入同一服务浏览器；每条命令编号、截图指纹及事件留存。过期画面、并发命令、离开验证页、没有真实可操作控件均不能点击。
4. 每10秒观察已有页面，不重载官网；验证就绪并读到真实套餐后，保存私有有效状态并自动排入普通验证采集任务。新的业务数据仍需既有差异复核，发布器只发布批准材料。
5. 未验证临时状态使用独立pending-state.json（已实查600权限），不能当验证成功。只有真实套餐读取成功才写verified-state.json；每次成功读取更新私有状态，最多保存/尝试30日且仍由站方验证。
6. 服务重启后识别上下文丢失、撤下旧图，明确要求重新打开；旧命令不盲目重放。所有原会话和事件保留，不用桌面Cookie充当Oracle验证结果。
7. 只有真实采集、有效状态恢复、复核发布和前台展示通过后才能启用每周任务。本轮Amy保持disabled。

## 代码入口

- deploy-service/browser-assistance-store.cjs：同库命令与事件、权限后的单站队列、截图指纹、失效/恢复、自动观察。
- deploy-service/browser-assistance-runtime.cjs：Docker独立轮询，和网页采集、线路测量并行，不依赖Codex在线。
- deploy-service/amy-service-session.cjs、amy-visible-checkbox.cjs：正常验证、受限请求、私有状态、真实DOM产品读取。
- collection/url-collectors/amy-visible-plans.cjs：逐卡绑定原文、时间、哈希，原始周期总额，不做均摊/结账推断。
- deploy-service/three-service-api.cjs、collector-web-runtime.cjs、standalone-collector.cjs：接到控制面与普通采集/复核流水线。
- deploy-service/public/assistance.html、assistance.js：受保护接管页面；原生按钮、键盘坐标替代、禁用不可操作验证。

## 实际验收

- 本地相关15项测试通过；容器非root、OCR、旧适配、TAG/BiuBiu回归和接管检查门禁通过，部署两项退出码0。
- 真实受保护UI显示Oracle 1280×900画面，无脚本错误，键盘Tab顺序已验证。用户实际登录并接管，反馈验证仍过不去。
- 同会话重启恢复已实跑：原e235998c会话重启后recovery_required且旧图撤下；后续会话正常新建，原记录保留。
- 匿名接管页/状态接口401，公开API域名同路径404；后台复核接口仍401。管理员密钥仅落本机受限私有文件，未贴到聊天、进入镜像或公开资料。
- 有效验证文件未生成，无新增报价/复核/发布。前台保留原4组报价，原采集时间2026-10-27T17:05:58.508Z，不改成当前采集。
- 真实收据：/data/recovery-receipts/amy-assistance-ui-v326.json、amy-assistance-ui-v327.json、amy-assistance-final-v327.json、amy-assistance-v328-live.jsonl。

## 验证问题的实际结论

普通有界面Chromium及普通原生Chromium诊断均未取得站方通过结果，未采用伪装自动化或代理切换。原生浏览器测试的配置保存在独立私有browser-sessions目录，不混入公开源材料。两种诊断未解决问题，所以未替换为默认执行方式。

检测到brunhild.challenges.cloudflare.com只读请求，DNS仅返回IPv6；Oracle主机无公网IPv6默认路由。没有因此修改主机网络或使用猜测IP。Cloudflare官方明确说明部分*.challenges.cloudflare.com子域网络失败是预期且非致命的，不能当作本案确定根因：
https://developers.cloudflare.com/cloudflare-challenges/troubleshooting/challenge-solve-issues/
官方也不支持自动化框架解决生产挑战：
https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/

当前仍需要站方正常允许的服务会话、可用只读官方入口或站方协助；不能由客户端代码保证通过。接管入口可持续使用，不能把工程接管成功升级为报价已核实或验证已通过。

没有购买、付款、找回密码、注册或新周任务启用。原始记录、旧价格、私有线路和账号配置保留。为满足部署空间门禁，仅归档并校验五个不活跃旧源码副本，没有清理业务数据库、私有配置或Docker卷。免费codex-auto-review工具及免费条件不可确认，未改用付费审查，也不宣称独立代码审查通过。

## v329 修正

普通验证框操作增加空复选框像素证据检查（同时保留原生可访问性与唯一性检查）。转圈组件不再仅凭iframe或占位AX节点判为可操作；不识别图片题。相关本地15项测试通过。用户已接管但仍未通过，不能要求重复空点，也不能认定站方已放行。最终容器状态及现场收据见 /data/recovery-receipts/amy-assistance-v329-live.jsonl。


现场补充：v329部署两项退出码均0，三个服务健康。16:51Z画面仅转圈且interactive=false；16:53Z正常空复选框已出现（截图人工查看），interactive=true，不能将这一状态继续称为转圈。受保护UI实跑通过，原始截图与JSON位于 /data/recovery-receipts/amy-assistance-ui-v329.*。首次UI检查分别暴露图片尚未完成加载和实时控件状态已改变的问题，测试已等待图片实际解码并按当前状态验证点击保护；原失败保留在执行记录。最后仍challenge、sessionSaved=false，无新报价或发布。新接管会话233ac9b7-0fec-4c12-b357-af357d05b1d9至北京时间01:50有效。

