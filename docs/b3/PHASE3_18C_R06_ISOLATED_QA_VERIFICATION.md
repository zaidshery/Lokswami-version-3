# Phase 3.18C R06 — isolated QA environment verification

## Finding and result

Earlier audit discussion identifies R06 as **“No verified isolated database, installed dependencies or usable role credentials.”** The complete original audit was not recovered verbatim. This report supersedes the historical “R06 unidentified” note in the R08 capture report.

R06's recovered environment prerequisites are verified for this disposable local run. All four roles completed real staff password sign-in; publication read-access restrictions and 18 authenticated article API assertions passed. This is not full CMS/publication/manual UAT or production readiness.

The owner authorized reversible isolated QA writes. No production target, provider credentials, external deployment or production data mutation was used.

## Candidate and build provenance

Run: **2026-10-11T17:16:18.414Z–2026-10-11T17:17:44.649Z**.

- Actual Git HEAD queried by the runner: **5237e5760ac8fe3e7c91254c692149f14b129e75**.
- Actual tracked tree: **fdb5e2151398f385a52ae4a6b53d256a67db811c**.
- Tracked source is compared against **HEAD**, including staged and unstaged changes, before and after **a fresh build:ci**. Reused builds are refused.
- Untracked files, including ignored configuration/source files, are checked before setup, before build and after build. Only the explicit installed-dependency/output paths, seeded media/audio and five evidence files are excluded; the exact exclusions are recorded in the report.
- Negative controls confirmed clean/approved-media fixtures pass while staged/unstaged tracked changes, an untracked page and ignored .env.local configuration are rejected.
- Production build passed with 175 generated pages.
- Build ID: **8-sZWAzFMuG8jldmhKJfu**.
- BUILD_ID SHA-256: **8972e300929c0a4372be3a1749928b3742235ae87aa563becdc2b56c19026be9**.
- Build manifest SHA-256: **b4f4dbd9bf300e0a65908e665a4899ec183d7e1cbc75a0a57354414c2313f900**.
- Lockfile SHA-256: **8c66dd8d1d731a4a6beb17724b349d5f830b3e04dc014ac74c06fa3478e5fee2**.
- Executed capture runner SHA-256: **93dd8eecb713d09854300480a6c91e3556341bd7818c6ccf58d4935ad32f7021**.
- Executed editorial helper SHA-256: **e0d261d86d77f31a3fea6080ca7fb39fc0c42296047c85a23d63cc29f35ae993**.

The candidate is the integrated foundation after #43. This PR adds documentation/evidence only. Git identity is queried rather than supplied as a hard-coded success label. The helper's captured bytes are hashed and compiled directly; those exact bytes execute the assertions, and their hash is recorded in both JSON reports.

## Isolation and fixtures

- Node 20.20.2; dependencies installed from the repository lockfile; Chromium 151.0.7922.34.
- QA-only MongoDB 7.0.16, bound to **127.0.0.1:27038**, with no Unix socket and fresh disposable storage. This is a test runtime, not a production upgrade recommendation.
- Unique database **lokswami_phase318c_qa_f337fc5e85**; actual initial collection inventory empty.
- Canonical reserved identities provisioned by **npm run cms:qa:provision** with explicit opt-in, exact database-name confirmation and fresh random passwords. No bootstrap-owner credentials or fabricated sessions.
- Media copied only into the isolated checkout's **public/demo/lokswami**. The existing guarded harness imported **8 actual source articles, 2 daily E-Papers and 1 monthly E-Magazine** from the verified read-only R08 snapshot.
- One explicitly disposable QA article was created and archived separately by the editorial API checks.
- The application environment is allowlisted; external provider credentials unset, social provider manual, publication automation/remote OCR disabled.
- The existing offline network guard blocked an external Node fetch before opening its socket. Chromium allowed only **http://localhost:3318**.
- MongoDB, provisioning, seeding, build, app and browser ran in one process tree/network namespace. Cleanup stopped only owned child processes.
- Passwords, actual auth secret values, password hashes and cookies stayed in private temporary configuration and are excluded from the reports, commits and evidence packet.

## Actual role and editorial proof

The browser waited for React hydration, filled actual staff login/password controls, submitted through the real Auth.js credentials flow and followed the authenticated redirect. Auth/API responses were not mocked and session cookies were not forged.

| Role / reserved login | Password sign-in | Actual session role | GET /api/admin/epapers | Fatal browser errors |
| --- | --- | --- | ---: | ---: |
| Super Admin / qa-super-admin | Passed | super_admin | 200 | 0 |
| Admin / qa-admin | Passed | admin | 403 | 0 |
| Copy Editor / qa-copy-editor | Passed | copy_editor | 403 | 0 |
| Reporter / qa-reporter | Passed | reporter | 403 | 0 |

All four QA user records have actual **lastLoginAt** writes. The retained report has **ok: true**, no failed assertions and no production writes. Intentional external font blocking is separate from fatal JavaScript errors.

The 18 actual API assertions cover: three public GETs preserving views/updatedAt; Reporter direct-publish denial, owned draft creation and submission; draft exclusion; Admin assignment; Reporter approval denial; assigned Copy Editor review/copy-edit/handoff and approval denial; Admin approval/future scheduling; future-scheduled exclusion; explicit publication/reader visibility; Super Admin archival/reader exclusion. These verify one article lifecycle, not every content/workflow variant.

## Retained evidence and exact command

- [Sanitized browser/isolation/provenance report](evidence/R06_BROWSER_REPORT.json)
- [Editorial API assertion report](evidence/R06_EDITORIAL_REPORT.json)
- [Exact captured runner source](evidence/R06_CAPTURE_RUNNER.txt)
- [Exact editorial helper source](evidence/R06_EDITORIAL_CHECKS.txt)

The exact successful command, from the captured workspace root:

```sh
R06_EXTRA_UAT=1 qa-runtime/node_modules/node/bin/node r06-orchestrate.cjs
```

The .txt files preserve the executed .cjs sources as evidence; they are not product entry points. Their historical scratch/runtime paths require adjustment for a different checkout. The source hashes in the JSON match the captured runner and editorial helper text. The runner creates an owned loopback Mongo process, fresh random QA database and credentials; verifies Git/build provenance; executes actual browser/API checks; and stops its own children.

## Reproduction prerequisites

1. Use a fresh isolated checkout, locked Node 20 dependencies, matching Playwright browser and an owned QA Mongo binary. Use disposable loopback storage.
2. Provision canonical identities using the existing guarded **cms:qa:provision** command: **MONGODB_URI**, **LOKSWAMI_CMS_QA=true**, exact **LOKSWAMI_CMS_QA_DB_NAME**, and four private **LOKSWAMI_QA_*_PASSWORD** values. The provisioner refuses production/remote targets, ambiguous names, missing opt-in/passwords and non-QA identity collisions.
3. Point **LOKSWAMI_SNAPSHOT_DIR** at the verified R08 snapshot and enable **LOKSWAMI_DEMO_DATA=true**. Seed **--source=lokswami --scenario=article --breaking=none**, then **--scenario=epaper**, using **npm run demo:seed --**.
4. Use a fresh private auth secret and one consistent loopback origin for AUTH_URL/NEXTAUTH_URL/NEXT_PUBLIC_SITE_URL. Unset external credentials; use manual social delivery and test-only **scripts/phase3/offline-network-guard.cjs**. Restrict browser requests to the exact local app origin.
5. Build freshly and run the production candidate locally; do not bypass build or provenance assertions. Sign in separately as every role and execute the retained checks.
6. Stop only owned processes. Accounts/storage are disposable; this report does not provide a persistent hosted QA service.

## Remaining acceptance

Full snapshot import previously rejected unavailable required video thumbnails; videos/shorts were excluded rather than given invented thumbnails. Provider playback remains unverified.

Publication API read access was checked, not every upload, metadata/page edit, OCR/hotspot, release/archive action or direct page boundary. Story packages, ownership variants, changes requested, media and full manual UI flows remain UAT work.

This does not establish remote staging/media-bucket isolation, production credentials, real-device/screen-reader acceptance, field performance, backup restoration, migration, rollback or launch readiness. Reprovisioning is required after the disposable environment is removed.

