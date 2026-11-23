# 本地运行入口

本轮统一使用根目录 Node 应用，默认地址 http://127.0.0.1:4000。只绑定本机回环地址，不启动注册、登录、付款、消息通知或持续采集。

```powershell
cd D:\AI_Projects\Airports
.\start.ps1
```

`start.ps1` 后台启动并保存日志与进程身份；重复运行时验证数据哈希并复用已有实例。停止使用 `.\stop.ps1`。也可前台运行 `npm start`，按 Ctrl+C 停止。需要 Node.js 22+；本轮使用已安装的 Node 22.22.0 与现有 Express/CORS，没有替换系统运行时或安装付费服务。

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

`vpn-finder-app/server.js` 兼容启动器也使用同一服务和新页面，默认3001。原3001已有进程未获归属确认，本轮没有停止它。`airport-manager` 是另一份未完成的FastAPI/React骨架，本轮没有虚构补齐其业务或将其作为运行入口。

## 验证与回退

```powershell
npm test
npm run check
```

测试覆盖全量分页、查询边界、字段未知状态、来源/台账、TTL、URL去敏、旧接口兼容、私有文件不可访问与篡改链拒绝启动。页面另做真实浏览器联调。代码review未调用收费替代；当前没有确认免费codex-auto-review可用及其免费条件，因此这些是实现测试与运行证据，不冒充第三方代码审查。

改动前的root server/package和vpn-finder-app server/package保存在 `_backups/runtime-20261025-211207/`。本轮没有编辑两份原始 `data.js`；根旧文件在作业期间另有4个verified标签变化，已保留，不当作新取得的原始验证证据，运行名录仍使用catalog冻结快照。需要回退时先停止本项目记录的PID，再从该目录恢复对应文件；不要删除已有数据或停止3001的未确认进程。
# 公开站维护补充（2026-10-26）

公开地址：https://meda2008.github.io/airports-observatory/ 。`#/verify`提供按需版本核对与离线工具下载；`#/ledger`显示有明确时点的结算检查。当前没有数值预测，Brier保持空值。

```powershell
npm run test:public
npm run check:public
npm run verify:online
```

在线核查只读访问已绑定的GitHub Pages目标并追加保存报告，不是持续监控。发布先在`public-site/`构建与检查，运行`node scripts/publish-github.cjs`，等待Pages构建同一提交后再核查。详细契约见`public-site/README.md`。工具不需要也不应读取机场账户或原始完整档案。

