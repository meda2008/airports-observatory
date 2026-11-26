# Three service packaging

`../compose.three-services.yaml` is a standalone replacement configuration. Do not combine it with the legacy Compose files, which define additional services. All three roles use the same locally built application image; `pull_policy: never` prevents implicit pulls.

The `api` role owns `/data/airports.sqlite`. Only this role mounts the business data volume. `collector` owns browser sessions, evidence and delivery outbox under `/collector-state`; it receives its internal API credential and measurement inputs as read-only bind mounts. `web` has no volumes or credentials and exposes only the fixed public asset allowlist and the API/health reverse proxy. `/internal/*` is never forwarded by the web helper.

The only published port is `127.0.0.1:${WEB_PORT:-8081}`. Use `WEB_PORT=18081` and distinct `AIRPORTS_DATA_VOLUME` / `COLLECTOR_STATE_VOLUME` for isolated validation. Container API port is 8080. The API checks `/ready` for a published catalog before its dependents start. `/health` reports process liveness. The healthchecks use Node.

This is a local Docker Desktop deployment. The final browser address is `http://127.0.0.1:8081`; no public hosting, DNS, TLS endpoint or Internet-facing port is configured. API joins only the internal `backend` network. Collector joins `backend` and the ordinary `egress` bridge for authorized collection. Web joins `backend` and an ordinary `ingress` bridge: Docker Desktop requires that additional bridge to publish its localhost port; an internal-only web network did not produce a usable port mapping. The ingress bridge does not publish API or collector ports.

API runs as UID/GID `1000:1000`. Before its first start, initialize the new business volume for that owner, with the data directory mode `0700` and canonical `airports.sqlite` mode `0600`. Check effective ownership and permissions inside Linux; host Windows ACLs do not establish container volume permissions. Never loosen database permissions to work around an incorrectly initialized volume.

Set `INTERNAL_TOKEN_FILE`, `ADMIN_TOKEN_FILE`, `MEASUREMENT_AUTH_DIR`, `MEASUREMENT_PROXY_CONFIG` and `MIHOMO_BINARY_FILE` to approved host files/directories before startup. The variables contain paths, never credential values. Missing paths fail instead of creating empty directories. Do not commit those private inputs. Bind paths are resolved relative to `deploy-service`, the Compose file directory. The binary default points to the already retained Linux Mihomo v1.19.34 carrier.

Collector runtime controls come only from the API's persisted state; starting a container is not authorization to enable sampling. Set `MEASUREMENT_PROXY_PORT` to the verified configuration's loopback proxy port and `WEBSITE_CREDENTIALS_FILE` to the approved existing website credentials JSON, mounted read-only. Prepare and verify the migrated SQLite file before cutover. This packaging does not itself perform a migration, change controls or start a sampler.

For the first migration, retain the original catalog, measurement and discovery databases and their receipts. Stop legacy writers and obtain consistent SQLite backups, including a proper checkpoint or SQLite backup operation where WAL is active. Use `lib/unified-database-migration.cjs` to create a new canonical database in a fresh target volume; do not overwrite the source databases. Preserve migration attestations, source hashes, row counts and integrity checks, then set the target ownership and permissions above. Collector sessions and JSON outbox stay in their separate state volume; they are not an additional SQLite business database.

Validate the new topology first on localhost port `18081` with its dedicated volumes. Verify API health, static pages, admin authentication, denial of `/internal/*` through web, the migrated evidence counts and hashes, and collector connectivity. Preserve persisted control state and obtain any required collection authorization before enabling work. Stop the old services before moving the validated topology to final localhost port `8081`; do not run two active writers or executor owners. Keep source databases, legacy service settings, private path settings and validation receipts until the cutover has been accepted.

For rollback, stop all three new services and preserve their volumes and logs. Restart the retained legacy topology against its original consistent databases and restore the matching local backend marker. Do not point legacy code at the unified database or merge post-cutover writes blindly into old sources. Any new evidence produced after cutover must be reconciled explicitly before resuming collection. Rollback does not require deleting volumes, original data or failed-run evidence.

The free `codex-auto-review` tool was not available in the connected tool inventory or local command discovery for this acceptance run; its free conditions therefore could not be verified. The executed tests and runtime checks are validation evidence, not a replacement code review. No paid review service was used.

Safe syntax check from the repository root:

```powershell
$env:MEASUREMENT_PROXY_PORT = '7890'
$env:WEBSITE_CREDENTIALS_FILE = './data/three-services/website-credentials.json'
docker compose -f deploy-service/compose.three-services.yaml config --services
node scripts/verify-deploy-catalog.cjs
node --test tests/three-services-web.test.cjs tests/three-services-packaging.test.cjs
```

Expected service names are exactly `api`, `collector`, `web`. The repository input contains 215 records. Cold start publishes 207 after applying the curation manifest to archive 8 records. The tests use temporary local HTTP listeners and do not access private data or external sites.
