# 本地运行入口

本轮统一使用根目录 Node 应用，默认地址 http://127.0.0.1:4000。只绑定本机回环地址，不启动注册、登录、付款、消息通知或持续采集。

```powershell
cd <REPO_ROOT>
```

需在项目根目录使用 Node.js 22+（当前推荐 Node 24）运行三服务与离线校验。下面保留旧版单进程只读核查接口的历史说明作参考。

## 数据与功能

- 统一215个名称候选，另外30条发现候选独立存放；类别根据现有原始资料补齐，尚未合并为独立经营主体。
- 搜索名称/域名、类别和技术证据等级筛选、24条分页、详情、支撑/反证、最缺证据、翻盘条件、来源哈希与台账。
- 189条有至少一个域名登记观察，14条有部分CT返回；1261个被引用来源保存在本地公开证据归档。所有未来可用概率仍是未知，历史价格/速度/星级仅作未核验旧主张。
- 材料冻结时间、服务响应时间、最后抓取、最后请求、业务验证时间分别保存。后台按字段TTL派生时效；不会把打开页面当作重新验证服务。
- `catalog/catalog.v1.json`、`source-provenance.json` 为安全运行数据；`catalog/forecast-ledger.v1.ndjson` 保留原245条哈希链；`catalog/archives/` 保留公开证据ZIP。`catalog/README.md` 说明数据口径。

## 接口

| 接口 | 用途 |
| --- | --- |
| GET /health 或 /api/health | 服务与数据版本、哈希 |
| GET /api/stats | 分类、证据与台账统计 |
| GET /api/catalog?q=&category=&evidenceGrade=&sort=&offset=&limit= | 分页查询；limit 1–100；sort为name或observedAt |
| GET /api/catalog/A001 | 单条完整判断与证据字段 |
| GET /api/catalog/A001/evidence | 原始来源、定位、哈希与公开证据归档入口 |
| GET /api/forecast-ledger?recordId=A001 | 原始预测条目与链校验状态 |
| GET /api/discovery | 未入库发现候选 |
| GET /api/evidence/archive | 下载已保存的公开证据包 |
| GET /api/export/json 或 /api/export/csv | 导出安全名录，未知不填成零 |

旧读取接口保留适配：`/api/airports`、`/api/categories/:category` 等统一使用新名录。`verified-prices` 和 `verified-only` 不再把旧采集标签当当前验证，返回0条并说明原因；价格筛选因缺统一周期与当前结算证据返回409。`/data.js`、源文件、Cookie、历史采集目录不再作为公共资产提供。

兼容启动器与早期前端/静态站构建目录已合并或清理；当前统一通过 `deploy-service/three-services/web.cjs` 与 `deploy-service/three-service-api.cjs` 提供服务。

## 验证与回退

```powershell
npm test
npm run check
```

测试覆盖全量分页、查询边界、字段未知状态、来源/台账、TTL、URL去敏、旧接口兼容、私有文件不可访问与篡改链拒绝启动。

# 公开站维护说明

公开更正提交模板保留于 `.github/ISSUE_TEMPLATE/evidence-correction.yml`。当前前端与三服务统一由仓库根目录构建并同源发布，不再保留独立的旧静态站产物。

