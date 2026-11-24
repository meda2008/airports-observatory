# BiuBiu 用户验证后采集（2026-11-21）

本次用户完成Codex内置浏览器验证。实际读取`https://ccount.biubiu.club/#/plan`完整15张卡片，未点击订阅、配置或付款；原页面采完已关闭。

- 原始采集时间：2026-11-21T12:23:09.685Z（北京时间20:23:09）。
- 本机原始JSON：`work/biubiu-user-verified-cards-20261121.json`。
- 普通报价14档：45/季；26、35、64、94、154、300、586、1120/月；178、258、576、856、1136/年。
- 45为季度总价，30GB是每月额度；年包明确是年度总流量，不误写成月流量。
- 所有14档常规卡均写“无退款政策”，只作为套餐页声明，不代表实际退款执行验证。
- 独享节点定制卡明确“此套餐仅为介绍,请勿购买此套餐”；299/月卡面与正文99CNY/月起矛盾，单独保留且不计普通套餐最低价。
- “峰值2Gbps”“不限速”仅站方宣传，不是速度或稳定性实测。

## 固化代码

- `collection/url-collectors/biubiu-current-plans.cjs`：专站原文解析、季度/年度口径、介绍卡排除和退款声明。
- `deploy-service/biubiu-plan-cards.cjs`：精确域名及#/plan路由的完整卡片读取；不登录、不订阅。
- 已接入通用DOM采集与解析注册表，网站采集器描述绑定专站解析器。
- 本次原文从用户已验证桌面会话导入；观测不伪造后台jobId，autonomousCollectionVerified=false。

## 后台边界

Oracle的正常公开guest套餐读取返回404；此前服务会话的人机验证断点仍保留。没有重复提交密码、转移桌面令牌或清空旧失败，未据桌面验证启用每周任务。

本次仅验收可追溯的已登录网页采集、解析、复核与发布；独立Oracle登录/会话恢复仍未验收。CyberGuard未操作，无订单、无付款。

## 最终实际验收

- 原文证据：ev-bf07692f4b90191676c9ce3a6737574dc3fe810800f37099ef86c9b7e7d16d3c；SHA256 d41ab0a7537f553bd73d76e21b8000ea29a77ffc24f2ccf25c0f14fa00bae47c。
- 提案f3ac7bc5-4767-499d-aa4b-d0f93de47f0b已批准，当前快照catalog-00fb62d441cd08d0c529e522；51条旧目录报价保留为未复核历史，不冒充当前。
- 前台实际匿名浏览器14行通过，API200，无页面错误；季付/年度口径正确，介绍卡未混入表格。收据：/collector-state/frontend-acceptance-20261120/run-1795264429986/receipt.json。
- 后台/API v318健康，13项相关检查通过。免费codex-auto-review不可用，未改用收费审查。
- 首次发布后的验证脚本误检查了公开DTO未暴露的autonomousCollectionVerified字段；已核实提案实际批准且发布成功，改从规范数据库核对false，没有重复批准或重新发布。原验证脚本保留于work/review-biubiu-v318-before-projection-fix.cjs。
- 最终后端边界收据：/data/recovery-receipts/biubiu-public-and-held-backend-v318.json。原服务验证断点和每周关闭状态均已实查保留，无新凭据提交、无订单、无付款。
