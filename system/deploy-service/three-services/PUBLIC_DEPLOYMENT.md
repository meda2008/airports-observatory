# Independent public deployment — awaiting target server

Current public frontend remains https://airports.vigorai.top on GitHub Pages.
The live candidate has NOT been enabled against an unverified public API.

## Target and isolation

Obtain the intended Linux SSH host/alias and username before any migration.
Inspect current Docker networks/volumes, disk capacity, 80/443 listeners and
existing reverse proxy. Do not replace its global configuration or existing
api.vigorai.top service. Use a dedicated Compose project and unused localhost
port, e.g. 18081, with explicit dedicated data/state volumes.

Candidate new hostnames (not added to public DNS yet):

- airports-api.vigorai.top: public read-only routes; CORS only for the frontend.
- airports-admin.vigorai.top: authenticated console and management API.

Use compose.three-services.yaml plus compose.public-gateway.yaml. Do not combine
the legacy compose.production.yaml, which creates another global 80/443 proxy.
Route the two new hostnames through the selected server's existing TLS reverse
proxy to the dedicated localhost web port, preserving Host. Do not disable TLS,
expose /internal, publish the SQLite volume or place credentials in the image.
The public API host strips client Authorization and blocks management routes.
The management host requires the existing admin token as Bearer or Basic
username admin; cross-origin writes are rejected. Internal collector token is
distinct and stays private to API/collector.

## Preservation and cutover

Canonical source database is approximately 3.88GB; do not read it into one
Buffer for hashing. Use three-services/backup.cjs with explicit source and
fresh destination inside the API container. It uses SQLite backup, pins a read
transaction and streams SHA256. Verify the receipt, record counts, evidence,
pending proposals, schedules and private state before server transfer. Never
copy only the live SQLite main file while ignoring WAL.

Keep original data volumes and measurement secrets. For execution cutover,
pause/stop the old collector before enabling a new collector, then take the
final consistent backup. Do not leave duplicate weekly jobs or measurement
executors running. Restore onto new named volumes and mount private website
credentials, proxy configuration and tokens read-only using their explicit
target paths. Keep unresolved approvals/checkpoints; do not bypass verification
or enable payments. Restore the previous executor if server acceptance fails.

## Automatic collection, review and frontend update

The persisted controller already schedules weekly work in standalone mode.
Each site keeps its configured parser/session/checkpoint. Captures produce
versioned proposals; only reviewed proposals enter catalogDb.sync(). The API
now also reconciles approved data every 30 seconds in-process using the existing
publisher, so failed publication can retry without another process or Codex.
No new semantic auto-approval policy is introduced.

Build the frontend once after the public API has been verified:

```
node hosting/pages/build.mjs --source SOURCE_SITE --output NEW_OUTPUT --hostname airports.vigorai.top --api-origin https://airports-api.vigorai.top
```

Live mode calls public GET endpoints directly with credentials omitted; it
does not load static catalog archives or silently substitute old data on API
failure. The current visible tab polls publication identity every 60 seconds
and reloads the shown data when the approved snapshot changes. Static archived
evidence remains retained, but new approved data needs no export or rebuild.
Publish that one configuration change only after successful API DNS/TLS/CORS
acceptance. Keep current static frontend functional until then.

## Acceptance

1. Original services and frontend healthy, restore backup integrity passed.
2. All three target containers healthy; only web localhost port published.
3. Real configured site capture executed by target collector; checkpoint or
   proposal retained, original body/time kept. No synthetic data counted.
4. Inspect an actual proposal against evidence; version-matched review then
   publication. Unapproved material must remain absent from public catalog.
5. Anonymous public API 200 and exact CORS; admin unauthenticated 401; cross-host
   management/internal routes denied; cross-site writes denied.
6. Public frontend browser sees the changed approved snapshot without manual
   export or rebuilding, over valid HTTPS without ChatGPT login.
7. Restart target containers and verify persisted jobs/checkpoint recovery;
   no duplicate executor. Recheck existing services.

Local-only receipts already exist in outputs/sites-hangxiang-20261116/:
DOCKER_GATEWAY_LOCAL_20261117.json (10 real API gateway checks),
LIVE_API_DOCKER_20261117.json (live frontend module reads real Docker data).
They are NOT public-host or complete collection/review/publication acceptance.
