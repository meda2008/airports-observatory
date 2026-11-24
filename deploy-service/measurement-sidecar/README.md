# 测量 worker 与本地代理 sidecar

`compose.yaml` 中 `measurements` 使用 `network_mode: service:measurement-proxy`，两者共享网络命名空间。代理只绑定 `127.0.0.1:7890`；没有宿主端口、公共代理、host network 或 `host.docker.internal` 回退。worker 没有主 collector 数据卷或管理服务的 `.env`，只读挂载自己的认证目录。网页服务及 measurement worker 共享独立 `measurement-data` 卷，数据库为 `/measurement-data/measurements.sqlite`，与 collector 库分开。

两项服务均属于显式 `measurement-route` profile。普通 `docker compose up` 不启动它们，避免未配置的代理阻塞原网页采集栈。这里的就绪配置不会启用 measurement store 总开关，也不会创建真实线路 profile。

## 私有配置

`config.example.yaml` 是 Mihomo `-f` 接口的空模板：没有订阅、provider、真实节点或 DIRECT 回退，全部请求 REJECT。运行真实线路前，由操作人自行准备经审核的客户端镜像和私有配置。本仓库不下载镜像或订阅；`pull_policy: never` 要求镜像已在本地。镜像的来源、版本、许可及 digest 需由操作人核实，不以模板名称充当核实结果。

在仓库及构建上下文**之外**保存代理配置和只含代理认证的 secret 目录，权限限制为实际操作人/容器服务身份。不要把这些内容提交到仓库、写进命令行或粘贴到日志。通过外部 env 文件设置以下非秘密路径/镜像参数：

```dotenv
MEASUREMENT_PROXY_IMAGE=operator-approved-local-image@sha256:REPLACE_WITH_VERIFIED_DIGEST
MEASUREMENT_PROXY_CONFIG=/absolute/private/path/proxy-config.yaml
MEASUREMENT_AUTH_DIR=/absolute/private/path/measurement-auth
```

代理配置以只读单文件挂入 `/run/secrets/measurement-proxy/config.yaml`，认证目录只读挂入 worker 的 `/run/secrets/measurement-auth`。`create_host_path: false` 会在路径不存在时失败，不会替操作人创建空目录。sidecar 根文件系统只读，运行缓存限于 `/tmp`，不挂载 collector DB、Docker socket 或宿主家目录。不要把订阅原文当成 worker 的认证 JSON。

使用相同项目名和原有网页部署 env 设置启用 profile，例如：

```powershell
docker compose --env-file /absolute/operator-compose.env -f deploy-service/compose.yaml -f deploy-service/compose.production.yaml --profile measurement-route up -d measurement-proxy measurements
```

不要用本示例覆盖现有管理鉴权设置。真实私有 profile 仍须显式设置数字 loopback `proxyUrl`、许可 HTTPS target/egress origin、预期出口 IP 和 routeId；沿用 worker 的审核和流量预算边界。容器启动、代理端口可读和 fixture 成功都不证明真实线路可用。

既有部署若曾将测量库放在 `/data/measurements.sqlite`，新卷不会自动迁移原库。迁移需另行停写、备份、核验并由操作人执行；本次没有读取、搬动或修改任何实际 DB。

Dockerfile 只复制部署运行代码、公开静态资源和 OCR 脚本，不再整目录复制 `deploy-service`。私有路径必须保持在构建上下文之外；认证默认目录 `deploy-service/data` 和 `.env` 也由既有 `.dockerignore` 排除。不要把秘密放进 `.cjs` 运行代码或公开目录。

## 无网络双容器 fixture

`compose.fixture.yaml` 只使用已经缓存的 Node 22+ 镜像，`pull_policy: never`，不构建、不拉镜像。sidecar 使用 `network_mode: none`；worker 仅加入它的 namespace。它们只读挂载公开 fixture 源码及空配置，没有 DB、订阅或宿主端口。

先将当前 shell 的 `MEASUREMENT_FIXTURE_IMAGE` 设置为已核实的本地镜像 ID，再执行：

```powershell
docker compose -p airports-measurement-fixture -f deploy-service/measurement-sidecar/compose.fixture.yaml up --abort-on-container-exit --exit-code-from fixture-worker
docker compose -p airports-measurement-fixture -f deploy-service/measurement-sidecar/compose.fixture.yaml down
```

fixture 在同一 loopback 上读取 synthetic `/identity`，再读取 4096 字节 `/download`。输出仅表示共享 loopback 工程验证通过，`measurementVerified:false`，不是线路吞吐；不写任何生产记录。只清理这个独立 fixture 项目的资源，不能停止或删除其他项目容器。

静态及 opt-in Compose 检查：

```powershell
node --test tests/measurement-sidecar-compose.test.cjs tests/deploy-worker-packaging.test.cjs
# 设置 RUN_MEASUREMENT_COMPOSE_VALIDATION=1 后，同一测试增加 Docker CLI config 校验。
```

Compose config 检查使用公开 `compose.example.env` 和 `--no-env-resolution`，不会展开服务 `.env`。它只证明配置可解析，实际运行证据应单独记录。

## 真实生产镜像的未配置状态验收

`Dockerfile.dockerignore` 是该 Dockerfile 专属的运行文件白名单；真实代理配置、认证、数据和本目录验证日志不进入构建上下文。构建会按 Dockerfile 拉取官方 Node 基础镜像，并安装锁定依赖及 Playwright，必须有相应外网授权；它不会获取机场订阅。

构建使用同一官方 Debian HTTPS 源及有界 APT 重试。slim 基础镜像缺少系统证书时，从官方 Node 自带的公共 `tls.rootCertificates` 生成标准 CA bundle；不读取用户证书或秘密，不关闭 TLS 校验。首次 HTTP 连接失败及 HTTPS 缺 CA 的失败日志分别保留，不能用后续成功覆盖。

```powershell
docker build --pull -f deploy-service/Dockerfile -t airports-observatory:real-line-readiness-20261114 .
docker compose -p airports-measurement-readiness -f deploy-service/measurement-sidecar/compose.readiness.yaml up -d
docker compose -p airports-measurement-readiness -f deploy-service/measurement-sidecar/compose.readiness.yaml logs --no-color
docker compose -p airports-measurement-readiness -f deploy-service/measurement-sidecar/compose.readiness.yaml down --volumes
```

readiness 项目使用真实生产镜像，在独立新空卷上执行实际 `measurement-worker.cjs --max-ticks=3`。它的 namespace-holder 没有网络和代理端口，只是惰性等待进程，不能称为真实 proxy。worker 完成后，检查器将只读挂载的 DB/WAL/SHM 文件按原字节复制到自身 tmpfs，核对复制与检查前后原件 SHA，再用只读 SQL 确认开关关闭、0 profile、0 run、0 observation、heartbeat stopped，输出 `NOT_CONFIGURED`。这避免 SQLite WAL 的辅助文件访问需求导致只读卷查询失败；首次失败日志保留。不会启用测量、访问线路或修改主库。检查器还确认镜像未包含部署 `.env`、部署 data 或本目录，并记录镜像内实际测量源码 SHA。

该项目没有公开端口、真实 secret 或宿主 DB 挂载。示例清理命令只能针对这个独立 readiness 项目；不得套用到现有生产项目。镜像构建成功和容器未配置验收不代表远程服务器已经部署，也不代表任何线路测量已完成。

## 官方 Linux 二进制 sidecar（不依赖代理镜像 registry）

`compose.native-binary.yaml` 是 base Compose 的附加 overlay，复用已经构建的应用镜像，只读挂载外部已验证的 Linux amd64 `mihomo`，直接作为 entrypoint。worker 继续共享 sidecar namespace；原有只读配置/认证、无公开代理端口、能力限制和 opt-in profile 不变。该模板不会把二进制或订阅写入镜像。

root 已通过 IAB 核定官方 v1.19.34 的 `mihomo-linux-amd64-compatible-v1.19.34.gz` 下载链接及压缩包 SHA-256：`2763f5b414527f7baf6dc57e3f82f3ab561eedf34bfd7c2f2cde1f7e592efe06`。发行源为 MetaCubeX/mihomo 的官方 GitHub release；这个哈希的来源核验由 root 完成，本模块另外验证下载字节，不能将版本输出当作官方签名或线路验收。

原包及解压文件保存在已经忽略的 `deploy-service/data/measurement-runtime/linux-runtime/v1.19.34/`，不进入 Docker build context。通用本地 helper 不联网、不执行文件；调用者必须提供自己的原包路径、已核 SHA、runtime 目录和新的收据路径。示例：

```powershell
node deploy-service/measurement-sidecar/prepare-linux-runtime.cjs --archive=PRIVATE_ARCHIVE.gz --sha256=VERIFIED_SHA256 --directory=PRIVATE_RUNTIME_DIRECTORY --receipt=NEW_PRIVATE_RECEIPT.json
```

helper 在解压前严格核对压缩包 SHA，再校验 ELF64 little-endian x86_64、解压后 SHA 和落盘字节。已存在且内容不同的 `mihomo` 不会被覆盖；校验失败不执行二进制。

为实际部署另建一个外部 env 文件，设置 `MEASUREMENT_NATIVE_IMAGE` 为已构建应用镜像，并将 `MEASUREMENT_PROXY_BINARY` 指向已验证二进制的绝对路径。保留外部私有 `MEASUREMENT_PROXY_CONFIG`、`MEASUREMENT_AUTH_DIR` 设置。然后在原有 Compose 参数后增加：

```powershell
-f deploy-service/measurement-sidecar/compose.native-binary.yaml --profile measurement-route
```

准备与预检只运行无外网 `mihomo -v`，不会读取订阅、启动实际代理或产生线路观测。真实配置检查、route/出口核验及测量由主线在既有授权范围内另行执行；使用该 overlay 不代表已经完成这些步骤。原始下载、解压、版本与容器隔离结果见本目录的 Linux runtime 验证收据。
