# 运行指南 — Airports Observatory

需在项目根目录使用 Node.js 22+（推荐 Node.js 24）安装依赖并运行服务。

```bash
npm ci
```

---

## 1. 本地三服务启动命令（对齐根 `package.json`）

在开发或本地验证三服务拓扑时，按顺序分别启动以下三个进程：

```bash
# 1. 启动内部 API 服务（deploy-service/three-service-api.cjs）
npm run start:api

# 2. 启动采集器运行时（deploy-service/collector-runtime.cjs）
npm run start:collector

# 3. 启动 Web 入口服务（deploy-service/three-services/web.cjs）
npm start
```

如需以单进程独立模式运行（`deploy-service/server.cjs`），可使用：

```bash
npm run start:standalone
```

---

## 2. 端口拓扑说明

- **`web` 服务（容器内监听 `8080`，宿主机默认映射到 `127.0.0.1:8081`）**：对外提供静态页面与受控 API 反向代理入口。
- **`api` 服务（仅在内部 `backend` 网络提供服务）**：仅在内部 `backend` 网络监听并承接来自 `web` 与 `collector` 的业务与状态请求，不直接暴露公网。
- **`collector` 服务**：作为后台采集运行时主动与目标站点及内部 `api` 通信，不对外暴露监听端口。

---

## 3. Docker Compose 启动方式

在配置好 `/run/secrets/*` 凭据挂载后，可通过 Docker Compose 一键编排并启动 `web` / `api` / `collector` 三服务：

```bash
# 构建并后台启动三服务
docker compose up -d --build

# 查看服务运行状态
docker compose ps

# 停止并清理容器
docker compose down
```

---

## 4. 语法检查与测试验证命令

每次修改代码或配置后，在项目根目录执行以下校验命令：

```bash
# 执行语法检查（node --check）
npm run check

# 执行完整测试套件（node --test）
npm test
```

---

## 5. 数据与常用只读接口参考

- 目录与证据数据：`catalog/catalog.v1.json`、`source-provenance.json`、`catalog/forecast-ledger.v1.ndjson`、`catalog/archives/`、`catalog/README.md`。
- 常用只读接口：
  - `GET /health` 或 `/api/health`：服务与数据版本、哈希
  - `GET /api/stats`：分类、证据与台账统计
  - `GET /api/catalog?q=&category=&evidenceGrade=&sort=&offset=&limit=`：分页查询
  - `GET /api/catalog/:id`：单条完整判断与证据字段
  - `GET /api/catalog/:id/evidence`：原始来源、定位、哈希与公开证据归档入口
  - `GET /api/forecast-ledger?recordId=:id`：原始预测条目与链校验状态
  - `GET /api/discovery`：未入库发现候选
  - `GET /api/evidence/archive`：下载已保存的公开证据包
