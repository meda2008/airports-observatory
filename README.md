# Airports Observatory

机场套餐、条款与采集复核三服务单仓库（API + Collector + 同源公开目录/管理后台）。

仓库根目录即为唯一项目根与 Docker build 上下文。旧版 2026-11-02 纯静态站点产物及早期 `system/web/`、`system/public-site/`、`system/server.js` 已归档清理，不再保留。

## 仓库目录结构

```text
.
├── .github/ISSUE_TEMPLATE/evidence-correction.yml   # 社区公开证据更正模板
├── catalog/                                         # 公开种子目录与溯源基线（无私有归档）
├── collection/                                      # 逐站采集配置、配方、契约与解析器
├── deploy-service/                                  # 三服务容器编排、API、网关、public/ 前后台
│   ├── compose.three-services.yaml                  # 推荐：api / collector / web 三服务隔离拓扑
│   ├── compose.public-gateway.yaml                  # 公开前端/只读API/受鉴权后台网关叠加配置
│   ├── Dockerfile                                   # 基于仓库根目录构建，/app 运行期只读
│   ├── Caddyfile                                    # 同源前端与三服务反代加固模板
│   ├── three-services/                              # web.cjs、public-gateway.cjs、healthcheck 等
│   └── public/                                      # 同源公开目录（index.*）与管理控制台（console.*）
├── hosting/                                         # 部署防呆脚本（磁盘与镜像层预检）
├── lib/                                             # 公共领域库（含迁入的 core-view.mjs）
├── scripts/                                         # 采集计划、审计与校验工具
└── tests/                                           # 单元测试与前端/网关安全回归测试
```

## 快速运行与构建

使用 Node.js 22.13+（推荐 Node 24）：

```powershell
npm ci
npm --prefix deploy-service ci
npm run check
node --test tests/three-services-web.test.cjs tests/public-gateway.test.cjs tests/three-services-packaging.test.cjs
```

以仓库根目录为 Docker build 上下文构建镜像，并查看三服务部署文档 [deploy-service/three-services/README.md](deploy-service/three-services/README.md) 与 [deploy-service/PRODUCT_SYSTEM.md](deploy-service/PRODUCT_SYSTEM.md)：

```powershell
docker build -f deploy-service/Dockerfile -t airports-observatory:local .
docker compose -f deploy-service/compose.three-services.yaml config --services
```

## 网关与安全隔离模式

- **公开前端域名（`PUBLIC_WEB_HOSTS`）**：仅同源提供公开只读页面与只读 `/api/*`（`/api/stats`、`/api/catalog`、`/api/search`、`/api/airports/Axxx` 等），强制剥离请求 `Authorization` 头，并拦截 `/console*`、`/assistance*`、`/api/admin/*`、`/internal/*`。
- **公开只读 API 域名（`PUBLIC_API_HOST`）**：仅开放白名单只读接口并按 `FRONTEND_ORIGIN` 返回精确 CORS。
- **独立管理域名（`ADMIN_HOST`）**：需要高强度 `ADMIN_TOKEN`（Bearer/Basic）鉴权，拒绝跨站写请求，继续屏蔽 `/internal/*`。

## 脱敏与数据边界

- 所有个人邮箱占位常量已替换为 `collector@example.invalid`，文档中私有目录与后台示例域名均已脱敏；真实账号凭据、会话状态、代理配置与令牌须通过容器只读 secret 挂载或私有环境变量传入，严禁提交进源码或镜像。
- 公开目录展示仅反映已复核且保留来源边界的数据，材料更新不等于付费可用，未提供统一可比实测时不展示速度或稳定性排名。
- 如发现公开记录与原始来源存在偏差，请通过 `.github/ISSUE_TEMPLATE/evidence-correction.yml` 提交可公开复核的来源 URL 与观察时间（禁止提交账号、订阅链接、密码或付款资料）。
