# Independent local measurement runtime

Use `compose.local-measurement.yaml` alone with an explicit Compose project name.
It starts only the proxy and measurement worker. It has no published ports and
does not mount the collector database. Images are local and never pulled.

Required environment values:

| Variable | Meaning |
| --- | --- |
| `MEASUREMENT_LOCAL_VOLUME` | Existing, consistently initialized native Docker volume |
| `MEASUREMENT_PROXY_BINARY` | Verified Linux amd64 mihomo executable |
| `MEASUREMENT_PROXY_CONFIG` | Existing private configuration file |
| `MEASUREMENT_AUTH_DIR` | Existing private authentication directory |
| `MEASUREMENT_LOCAL_HELPERS` | Absolute path of this helper directory |
| `MEASUREMENT_LOCAL_IMAGE` | Optional explicitly validated replacement image ID |
| `MEASUREMENT_PROXY_PORT` | Explicit loopback listener port from the existing route profile |

The default image is pinned to the verified final-customer image ID. The binary,
configuration, authentication files, and helper directory are mounted read only.
No route policy, TLS behavior, sampling budget, profile schedule, or approval rule
is changed by this compose file. The existing database controls whether sampling
is enabled. Starting the worker against an enabled migrated database starts real
scheduled sampling, so cutover orchestration must first pause and drain the old
executor, import a consistent database, and establish a single writer.

The proxy health check verifies its loopback listener. It does not establish route
identity, egress verification, or measurement acceptance. The worker health check
reads the canonical database heartbeat and accepts a fresh running or paused
state; it does not create or initialize a missing database. Docker health state
is diagnostic. `restart: unless-stopped` recovers exited processes and daemon
restarts, but Docker does not automatically restart a merely unhealthy process.
The worker supervisor polls only the local proxy TCP listener every two seconds.
After ten seconds of uninterrupted listener failure it gracefully stops the
worker, force kills after another ten seconds if necessary, and exits 75 only
after the child exits. Docker can then restart the container. External target
failures while the local listener remains healthy do not restart the worker.
Failed observations remain recorded. Process signals stop and await the child.

The two services share a network namespace to preserve the explicit loopback-only
proxy contract. Use Compose to restart or recreate the proxy and its dependent
worker together. `depends_on.restart: true` covers explicit Compose dependency
updates; if using raw `docker` recreation, recreate both services. After recovery,
verify both health states and a new real scheduled observation. A health check
alone is insufficient restart acceptance.

Host website integration uses `measurement-connection.cjs` and a restricted
`measurement-rpc.cjs` command through local `docker exec` stdin. No TCP bridge,
Docker socket mount, or second writable SQLite copy is exposed. The host marker
`data/local-runtime/measurement-backend.json` selects the stable worker container
name; CLI and administrative API operations (including schedule/control and
proposal links) go to that canonical Docker database. Backend failures are
explicit errors and never fall back to local sampling. The local supervisor
does not launch Windows sampling/client children while this marker exists.
The legacy database also retains a durable disabled executor fence; ordinary
measurement enable does not remove that fence.

The current local installation uses project `airports-local-measurement`, volume
`airports-measurement-live` and private env file
`deploy-service/data/measurement-migration/20261114/runtime.env`. From the project
root, inspect/manage the service without starting another supervisor:

```powershell
$runtimeEnv = 'deploy-service/data/measurement-migration/20261114/runtime.env'
$composeFile = 'deploy-service/measurement-sidecar/compose.local-measurement.yaml'
docker compose -p airports-local-measurement --env-file $runtimeEnv -f $composeFile ps
docker compose -p airports-local-measurement --env-file $runtimeEnv -f $composeFile up -d --wait
node scripts/measurements.cjs status
```

The native volume retains original observations, revisions, due dates, budgets,
leases and proposal links across container replacement. Private route/auth files
are mounted read only, not copied into the image. The migration journal and
consistent legacy backup are retained under the ignored measurement-migration
directory. Do not enable the old Windows database as a rollback shortcut: fence
and drain Docker first, export a consistent **current** canonical database with
all newly acquired rows, stop Docker sampling, then restore it under a new
explicit Windows executor/context. Keep both versions and validate all raw
IDs/hashes before enabling the replacement. No live Windows/Linux dual-write
bind mount is supported.

Focused helper verification: `node --test deploy-service/measurement-sidecar/local-runtime.test.cjs deploy-service/measurement-sidecar/local-worker-supervisor.test.cjs`.

When validating normalized Compose output, verify every `tmpfs` list entry begins
with an absolute container path. Quote options containing commas in YAML flow
lists; successful `compose config` parsing alone does not validate mount syntax.
