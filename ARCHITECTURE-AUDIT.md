# Architecture and reliability audit

## Service boundaries

- **Web** serves a fixed frontend asset allowlist and proxies API calls. The public gateway separates anonymous catalog access, authenticated management, and internal RPC. The browser consumes reviewed publications; it never reads collection storage directly.
- **API** owns SQLite, job and review state, and catalog publication. Observations and raw evidence are distinct from reviewed proposals and public record versions. The legacy Express app exposes read-only seed data.
- **Collector** runs web and measurement loops, claims and renews fenced leases, and submits captures to the API. A supported legacy worker can also use local SQLite. A retained replay uses the original capture and timestamp and must not advance the live collection schedule.

## Findings and tasks

| Priority | Finding | Fix or acceptance criteria |
| --- | --- | --- |
| P1 | Search reopened and parsed the full seed catalog on each request. | **Implemented.** Use a per-root snapshot reader keyed by file identity and change time. Keep SQLite-backed search current after publication. |
| P1 | Public catalog list/detail and admin evidence fetched unrelated rows. | **Implemented.** Batch page projections and query detail/evidence by ID. Preserve existing totals and expose an explicit filtered count. Revisit SQL-side filtering if catalog growth makes record-core decoding material. |
| P1 | A cold start could verify all raw evidence bodies and advertise an empty published API as healthy. | **Implemented.** Use retained metadata for initial publication, keep streaming body verification for explicit export, and return 503 until publication exists. |
| P1 | Temporary SQLite contention could look like a permanent collector rejection. | **Implemented.** Return retryable 503 for SQLite busy/locked errors; keep conflict and input-error handling distinct. |
| P1 | Replay could claim unrelated work or update live scheduling state. Captured article-image metadata could be lost at intake. | **Implemented.** Enqueue and claim the exact replay in one transaction, preserve the original observation time and live schedule, and retain bounded source-bound heading/media associations. |
| P1 | Static-site removal left the collection pipeline pointing to generated inputs that no longer exist in the checkout. | **Implemented in the active planning and review paths.** Reuse the canonical projection and source indexes. Historic release and specialist tools still need a separate audit for removed paths. |
| P1 | Legacy browser collection lacked an overall deadline. The HTTP collector could overlap interval and explicit lease renewal. | **Implemented.** Bound the legacy job, close its browser context on timeout (including late allocation), share one HTTP renewal, and clear timers on exit. Newer site-specific native adapters retain their existing budgets. |
| P1 | Browser egress validation and socket establishment must agree. | **Implemented for service Chromium.** After a route admits the request, the job-local proxy uses the validated public IPv4 addresses for that host and port. Direct connections also verify the socket peer. Browser TLS still verifies the original hostname. |
| P2 | Visitor requests raced with reset, pagination, or a newly published snapshot. Admin polling replaced unchanged DOM; assistance reassigned unchanged screenshots. | **Implemented.** Fence stale responses, preserve last successful views and user selections, and skip unchanged regions and frames. |
| P2 | Plan restrictions and mobile latency tables were difficult to inspect. Date-only promotions used an implicit timezone. | **Implemented.** Show existing plan condition notes, allow keyboard scrolling for the latency table, and compare date-only values in Asia/Shanghai. |
| P2 | Collector parsers and lifecycle mishandled VM DOM globals, dispatch overlap, fast polling, and ambiguous unpaid-order cleanup. | **Implemented.** Use document URL, disjoint exact parser dispatch, bounded polling, and preserve cleanup holds unless the matching order is confirmed cancelled. |
| P2 | Static files were read on each request, incomplete proxy streams could leave upstream work running, and operational logs could grow without rotation. | **Implemented.** Preload fixed assets, return conditional 304, tear down broken streams, and configure bounded local logs. Management writes require exact HTTPS Origin. |
| P2 | Clean-checkout tests assumed private retained captures were present. | **In verification.** Name missing historical inputs explicitly; keep tests of synthetic and tracked inputs mandatory. Report skips separately from a pass. |

## Local measurement

On the Windows development machine with Node 22.22.0, the catalog-loading code path took a median of **230 ms** (30 eager loads, p95 317 ms), versus **0.077 ms** on a warm snapshot hit (300 lookups, p95 0.253 ms). This is an in-process loader measurement on the checked-out seed data, not HTTP latency or production throughput. A changed snapshot still costs a load and parse.

## Before merging

- [x] Reconcile this branch with the collector recovery and publication changes already merged to `main`.
- [x] Verify browser transport with local Chromium navigation, redirects, request bodies, and HEAD reads. Local HTTPS fixtures verified the original TLS server name and rejection of an untrusted certificate. A native Chromium process connected over CDP also passed proxy authentication and navigation.
- [x] Run syntax checks and the full regression suite with the egress changes. `npm test` reported 1,845 passed, zero failed, and 742 skipped. Both Compose service models parsed during the initial audit.
- [x] Inspect the diff for private source files, credentials, and local databases before publishing the PR.

## Browser transport scope

The service Chromium paths, including persistent profiles, use an authenticated proxy bound to the collector's loopback interface. Approved host and port pairs are scoped to a job or persistent assistance session. TLS remains end to end. For `authenticated_local_proxy`, the mounted upstream receives a CONNECT request with the approved numeric address. The upstream operator controls the final dial and exit route. Target-specific routing and production proxy compatibility still require validation with the deployed configuration.

The proxy enforces destination addresses. HTTPS request paths and methods are handled by the existing browser route policies. The separately scoped native HTTP clients and operator tooling have their own transports. Production deployment, real-site navigation, and replay of unavailable private originals remain unverified.
