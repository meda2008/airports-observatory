# Cloudflare环境排查与修复（2026-11-22）

本轮只修正正常浏览、隔离会话与诊断，不使用隐身插件、指纹伪装、住宅代理、外部解题服务、手工注入令牌或关闭TLS校验。不得将容器健康或控件可点击等同于验证通过。

## 现场环境

Oracle Linux arm64，Node v24.22.3，Playwright 1.64.1，Chromium 156.0.8078.4；服务用户1000:1000；共享内存1GB。没有证据表明浏览器过旧或共享内存不足导致此次验证。

## 代码修正

- deploy-service/public-browser-environment.cjs：A055咸鱼、A075酒馆及已登记A008公开目录的匿名会话独立保存；绝不加载账号会话。来源站点、origin、浏览器构建、direct出口绑定，最长7日，遵守Cookie实际过期时间，只保存第一方安全Cookie，不保存localStorage。正常正文读取成功且无阻塞才保存；挑战页面不能当成功状态。服务端文件权限600，不将本地浏览器Cookie搬到服务器。
- deploy-service/standalone-collector.cjs：接入公开会话恢复、正常资源诊断和有界等待。原版只按最初页面状态设置等待时限；v330现场表明加载壳后来变验证时仍短时退出。v331改为动态识别，等待总时限从最初观察时间计算，不反复延长、不刷新页面。
- deploy-service/standalone-worker.cjs：指定公开目录任务允许75秒总预算，验证自然等待最多45秒，其他站点不提高总任务预算。网站仍有权拒绝访问。
- 每次服务端receipt.json保存浏览器版本、请求结果、可选DNS探针、会话保存/读取和等待耗时，不记录Cookie值、请求查询参数或认证令牌。后台业务字段仍由既有解析和复核流程决定，不由环境诊断更新价格。
- Amy沿用专属同服务会话与私有状态模块；BiuBiu已有账号状态链路不与公开Cookie文件混用；未启用任何未验收站点的每周任务。花云重复记录继续复用已验收A014，库洛米Vercel不误称Cloudflare。

## v330实跑

A055 run=f5aa372d-beb2-4081-9729-7a854aed9fb3；A075 run=46bebc3d-c05d-414f-bb15-c18cf959eb9d。主要防护脚本/请求返回200；无防护POST被策略拒绝，无业务读取域被策略拒绝；均未通过。PAT请求401及可选brunhild.challenges.cloudflare.com失败不能单独作为根因。A196 run=764282a2-cfe1-4dfb-a425-5b769fbf2f21仍为biubiu_native_verification_not_ready，未提交账号，未付款。

v330暴露等待状态切换未覆盖，保留原失败；v331的相关98项测试通过，包括延迟出现Cloudflare、协议不点击、成功正文立即结束等待、隔离账号状态、过期/浏览器构建变更、脱敏诊断。Linux容器另验600权限。本机Windows不使用POSIX模式位来声称ACL验收。

## 官方约束

https://developers.cloudflare.com/cloudflare-challenges/troubleshooting/challenge-solve-issues/
https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/
https://developers.cloudflare.com/cloudflare-challenges/concepts/clearance/

站方保护配置、网络信誉和自动化判定不能仅由客户端代码消除。生产挑战不支持自动化框架；机器变化也不能通过复制clearance来解决。持续拒绝时需网站认可的API/数据入口、站方允许的采集身份或同一服务器会话的正常人工验证。没有站方授权不能擅自调整其WAF。

免费codex-auto-review工具及免费条件未能确认，未使用收费替代，不宣称已完成独立代码审查。

## v331最终现场结果（北京时间14:14）

- 两项部署退出码0；API/collector为v331，web仍v165，三者健康。公网前台200；后台采集器接口匿名401。没有启用原disabled站点。
- 咸鱼 A055 run=cdec8de1-350c-4349-aeeb-c7981a881773：自然等待45028ms、74次DOM观察、不重载，仍cloudflare。
- 酒馆 A075 run=d7d4724e-2adc-4634-ae42-32512aca2a94：自然等待45738ms、57次DOM观察、不重载，仍cloudflare。45秒是停止发起新观察的预算，最后一次DOM/心跳有少量收尾耗时；仍受75秒总预算约束。
- 两站均未保存成功会话，没有把验证页当业务正文。原始receipt记录主要防护请求200、无防护POST/业务读取域策略拒绝。
- BiuBiu本轮v330的实际普通空复选框点击有收据（side22），但仍未验证通过；未提交账号。v331不重复该操作。它的匿名缓存字段status=not_applicable，不能将其解读为该站的账号会话恢复已验收。
- 官方 https://debug.challenges.cloudflare.com/ 在同一Oracle未修改的浏览器环境中实际返回 Automated Browser Detected、navigator.webdriver=true；这证明官方诊断将此执行环境归类为自动化，不证明每个机场使用完全相同的规则。不会把隐藏webdriver、修改指纹或迁移桌面clearance列为修复。
- 官方诊断原文：/collector-state/public-source-probes/cloudflare-official-compatibility-v331.json。
- 最终运行收据：/collector-state/public-source-probes/environment-v331-final.json；API元状态追加记录：/data/recovery-receipts/environment-v330-live.jsonl、environment-v331-live.jsonl。
- 本轮无新增套餐/复核/业务发布，无建单付款；旧业务字段和原始时间不覆盖。代码环境修复已发布不等于站方验证已通过。

Amy没有在本轮重复创建新挑战会话，沿用已有接管断点。持续自动化采集需要站方认可的原生API、授权身份/接口，或站方为固定采集端设置受限访问策略；这些是网站一侧的权限配置，不能由本项目擅自修改。
