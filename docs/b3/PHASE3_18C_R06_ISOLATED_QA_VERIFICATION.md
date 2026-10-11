# Phase 3.18C R06 — isolated QA environment verification

## Recovered finding and scope

Earlier audit discussion identifies R06 as **“No verified isolated database, installed dependencies or usable role credentials.”** The complete original audit was not recovered verbatim. This report verifies the environment prerequisites using actual MongoDB, canonical staff password authentication and Chromium; it does not equate those prerequisites with full editorial or publication UAT.

This supersedes the historical “R06 unidentified” note in the R08 capture report. The owner authorized completing this audit work, including reversible isolated QA writes. No production environment was configured, deployed or mutated.

## Verified target

Production candidate code: **5237e5760ac8fe3e7c91254c692149f14b129e75** (integrated foundation after #43). Run: **2026-10-11T16:39:36.006Z–16:40:53.115Z**.

- Node 20.20.2; dependencies installed from the repository lockfile; Chromium 151.0.7922.34.
- QA-only MongoDB 7.0.16, bound to **127.0.0.1:27038**, with no Unix socket and fresh disposable storage. This version is a test runtime, not a production upgrade recommendation.
- Unique database **lokswami_phase318c_qa_a834e0fd17**; actual initial collection inventory empty.
- Canonical reserved identities provisioned by **npm run cms:qa:provision**, with explicit opt-in, exact database-name confirmation and fresh random passwords. Four active canonical roles; no bootstrap-owner credentials or fabricated sessions.
- Media copied only into the isolated checkout's **public/demo/lokswami** directory. Existing guarded demo harness imported **8 real articles, 2 daily E-Papers and 1 monthly E-Magazine** from the read-only R08 snapshot.
- Allowlisted application environment; external provider credentials unset, social provider manual, publication automation/remote OCR disabled. The existing test-only offline network guard blocked an external Node fetch before opening its socket. Chromium allowed only the chosen **http://localhost:3318** application origin.
- **build:ci passed**, generating 175 pages. The application was started as a local production-build server; this was not an external deployment.
- Passwords, auth secrets and hashes stayed in private temporary configuration and are absent from this report, commits and public evidence.

MongoDB, seeding, application and browser processes were run in one process tree so they shared the same local network namespace. Every process stopped by the harness was its own child. No broad process killing or production cleanup occurred.

## Actual credentials and access proof

The browser waited for sign-in hydration, filled the real staff login/password controls, submitted them through the real Auth.js credentials flow, and followed the authenticated redirect. No session cookie was forged and no auth/API response was mocked.

| Role / reserved login | Password sign-in | Actual session role | GET /api/admin/epapers | Fatal page errors |
| --- | --- | --- | ---: | ---: |
| Super Admin / qa-super-admin | Passed | super_admin | 200 | 0 |
| Admin / qa-admin | Passed | admin | 403 | 0 |
| Copy Editor / qa-copy-editor | Passed | copy_editor | 403 | 0 |
| Reporter / qa-reporter | Passed | reporter | 403 | 0 |

All four QA user records had actual **lastLoginAt** writes afterward. The successful public report has **ok: true**, no failed assertions and no production writes. External font requests were blocked intentionally; aborted local prefetches during navigation are recorded separately from fatal JavaScript errors.

Development-server attempts exposed premature clicks before hydration and a loopback callback-origin mismatch in the test setup. The successful run used the production build and a consistent localhost origin. Those attempts are not counted as successful browser checks and did not prompt unrelated product refactors.

## Reproduction prerequisites

Use the existing guarded tooling in a fresh isolated checkout:

1. Install the locked Node 20 dependencies and matching Playwright browser. Start an owned MongoDB bound only to loopback with fresh disposable storage and a clearly QA-named database.
2. Set **MONGODB_URI** to that exact loopback database. Set **LOKSWAMI_CMS_QA=true**, **LOKSWAMI_CMS_QA_DB_NAME** to its exact name and all four **LOKSWAMI_QA_*_PASSWORD** values privately. Run **npm run cms:qa:provision**. The provisioner refuses production/remote targets, ambiguous names, missing opt-in/passwords and non-QA identity collisions.
3. Configure **LOKSWAMI_DEMO_DATA=true** and **LOKSWAMI_SNAPSHOT_DIR** to the verified R08 snapshot. Run **npm run demo:seed -- --source=lokswami --scenario=article --breaking=none**, then the same command with **--scenario=epaper**.
4. Give the local app a fresh private auth secret and consistent loopback **AUTH_URL/NEXTAUTH_URL/NEXT_PUBLIC_SITE_URL**. Unset provider credentials; use manual social delivery and the existing **scripts/phase3/offline-network-guard.cjs** through test-only NODE_OPTIONS. Limit browser requests to the exact local origin.
5. Build and start the production candidate locally. Sign in separately as each role; inspect the actual authenticated session and publication API status. Capture assertion results without credentials.
6. Stop only owned test processes. Treat temporary QA accounts/storage as disposable; this report does not provide a hosted persistent QA service.

## Limits and remaining acceptance

- Full snapshot import previously rejected unavailable video thumbnails under the required-thumbnail schema. Video/short fixtures were excluded rather than given invented thumbnails. Real provider playback remains unverified.
- Publication API **read access** was verified, not every upload, metadata/page edit, OCR/hotspot, release or archive action, nor all direct page boundaries.
- Four role sign-ins do not prove story submission, ownership/assignment, editorial review/changes, approval, scheduling, publication or archival. Full CMS lifecycle UAT remains separate.
- This does not establish remote staging/media-bucket isolation, production credentials, real-device/screen-reader acceptance, field performance, backup restoration, migration, rollback or launch readiness.

R06's recovered environment prerequisites are now verified for this disposable local run. Reprovisioning is required for future QA after its temporary processes/storage are removed.
