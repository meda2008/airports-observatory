# Airports Observatory system source

Source snapshot of the three-service system: API, collector (web collection and line probes), and web frontend/admin console. Existing repository root static-site files are retained unchanged.

## Run

Use Node.js 24. Install root dependencies with `npm ci` and service dependencies with `npm --prefix deploy-service ci`. The Docker build context is this `system/` directory. Build with `docker build -f deploy-service/Dockerfile -t airports-observatory:local .`, then follow `deploy-service/PRODUCT_SYSTEM.md` and the three-service Compose configuration. Supply private environment, admin/internal tokens, account bindings, mailbox OAuth and optional line configuration outside source control. No production secrets or live database are included.

## Snapshot boundaries

Personal mailbox constants are replaced with `collector@example.invalid` in this public copy; bind them to your own explicitly authorized mailbox before enabling email login. A password literal in a negative privacy assertion is replaced with a non-production fixture value. The running local/Oracle source was not edited by this publication.

Catalog files are source seed material, not a copy of the live Oracle database. Private runtime data, browser sessions, operational logs, archived captures, import staging, dependencies and generated builds are excluded. Historical tests requiring local catalog archives need those separately retained datasets. Do not enable a site's weekly task until real collection, session restoration, review/publication and frontend acceptance pass. Never execute payments during collection.

## Latest accepted changes

- A080 native first-party app login, visible form selection, owned session recovery, literal payment-channel extraction and complete five-card pricing parsing.
- A006 exact public terms recipe, refund/privacy parsing with evidence offsets and document-date limitations.
- Scope-specific legacy checkpoint isolation; new failures and extra collection fields continue to block scheduling.

Related offline regression: `node --test tests/speedcat-night-native.test.cjs tests/native-access-gate.test.cjs tests/night-native-checkpoint-scope.test.cjs tests/cylink-wallet-checkpoint-scope.test.cjs`.

Publication is source-only on a separate branch. It does not deploy or overwrite the current public website.
