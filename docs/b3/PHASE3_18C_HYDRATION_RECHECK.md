# Phase 3.18C — fresh integrated hydration verification

Checkpoint: 12 October 2026. Tested foundation: **4d15bf741f85603272f0f3f6c1f9fa4906f63aff**; tree **22aa8389f396bd15b3c6efcc11b798fe49228064**. The scoped hydration correction is already merged in [PR #50](https://github.com/zaidshery/Lokswami-version-3/pull/50). This increment adds retained verification evidence, with no additional application correction, merge or deployment.

## Result and correction

The integrated foundation passes a fresh production build, focused regressions and actual authenticated CMS navigation. All **96 route cases**, **16 credential sign-ins/session-role assertions** and **28 denied-route feedback checks** pass with **zero global uncaught errors and zero hydration console errors**. All five existing production browser smoke tests pass without skips, unexpected failures or flakes.

The earlier linked checklist at `56d76755516af057e228f04cbe5d649671050f80` predates #49/#50. The newer checkpoint at [a4c773c](https://github.com/zaidshery/Lokswami-version-3/blob/a4c773c69716a55025745e5be48a8c625aad87c5/docs/b3/PHASE3_18C_FINAL_CHECKLIST.md) already records their completion but states that the new raw local reports were not published before the prior environment disconnected. The fresh report retained here is a new run, not a reconstruction of those missing reports.

#50 wraps streamed page children in their own Suspense boundary with the existing bilingual newsroom loading component and puts the shell's mount hydration update inside `startTransition`. It changes only AdminShell and its regression coverage. Authentication, ownership, workflow policy, dependencies and publication semantics are unchanged by that correction.

The candidate's pending-page SSR regression was copied into a separate disposable checkout of pre-fix foundation **0396d1565270f011e078dfb87b2698405760063f**. It fails there with uncontained synchronous suspension; the four existing tests pass. The same suite passes on current foundation. This is a controlled component-level reproduction of the missing boundary under installed React **18.3.1**; it does not recreate the original six production HTML hydration errors. The browser matrix below tests the actual Next App Router production runtime.

## Fresh validation

| Check | Observed result |
| --- | --- |
| Focused AdminShell, timestamp, workflow-transition and metadata suites | 4 files / 21 tests passed |
| Typecheck | Passed |
| ESLint on AdminShell and its regression file | Passed with no warnings or errors |
| `npm run build:ci` from freshly installed dependencies and cleared output | Passed; 175 generated pages |
| Pre-fix negative control | Expected failure: 1 failed / 4 passed |
| Actual-password CMS route matrix | 96 passed; 28 denial checks; no fatal/hydration errors |
| Existing `admin-critical-flows.spec.js` against the same production artifact | 5 passed; 0 skipped / unexpected / flaky |

Node: **20.20.2**. Installed Next: **15.5.22**; React: **18.3.1**; Vitest: **4.1.10**; Playwright: **1.62.1**. Chromium: **151.0.7922.34**. Disposable MongoDB: **7.0.16**, a local QA runtime rather than a production upgrade recommendation. `npm ci --no-audit --no-fund` installed 657 packages from the unchanged lockfile. Runtime dependencies were restored before validation; no repository dependency files changed.

Build ID: **Q_pPrBGDGktxSd2U2MYNv**. Lockfile SHA-256: **8c66dd8d1d731a4a6beb17724b349d5f830b3e04dc014ac74c06fa3478e5fee2**. Build-manifest SHA-256: **c5cf00c9cad3bf7c43c356c57f1b7afce6ecaec065643555eefdd77e3a51e6c3**. The runner queries source HEAD/tree and artifact identity itself. Tracked source was clean before and after the successful run. This is focused local verification; it is not a new full 3,419-test CI run. [Existing exact implementation-head CI](https://github.com/zaidshery/Lokswami-version-3/actions/runs/38229512354) was independently fetched and remains successful for **fd93d8245096cd4c6aa99d5f681ed33a3582f9e6**.

## Actual browser matrix and isolation

Each of Super Admin, Admin, Copy Editor and Reporter is tested in Hindi and English, with Asia/Kolkata and America/Los_Angeles browser timezones. Each of the 16 contexts signs in using the actual staff password form and asserts its returned Auth.js session role. Cookies and API responses are not fabricated or mocked. All four reserved identities have actual `lastLoginAt` writes.

Each context opens `/admin`, `/admin/work`, `/admin/content-queue`, `/admin/review-queue`, `/admin/assignments` and `/admin/my-work`: 16 dashboard visits plus 80 queue visits. Copy Editor/Reporter are redirected from the three management queues to Work Queue with `access=denied`; Super Admin's frozen My Work restriction is also asserted. All 28 denials display the expected localized feedback. The runner waits until every newsroom-loading status is removed, including overlapping streamed boundaries. Uncaught-error and hydration-console listeners remain active from sign-in through all navigations. An authenticated E-Paper API read separately returns 200 for Super Admin and 403 for the other roles in each context.

The fresh randomly named QA database started with zero collections. MongoDB was owned by this runner, bound to **127.0.0.1:27039** with no Unix socket. The application used **http://localhost:3319**, private random auth secrets, canonical reserved QA accounts and the repository's guarded provisioner. The runtime environment was allowlisted; external provider credentials were absent; social delivery was manual and publication background processing/remote OCR disabled. The existing test-only Node egress guard blocked external sockets, and Chromium allowed only the exact local application origin. Every owned browser/server/database process was stopped. Passwords, hashes, cookies and auth secrets are excluded from retained evidence.

Seven preliminary runner/setup attempts were not counted as passes: two stopped before sign-in because runtime binaries were incomplete, two stopped on the runner's loopback hostname mismatch, and three stopped on ambiguous navigation/main/loading selectors. The last selector attempt completed 47 cases with no fatal errors before aborting. Runtime restoration and runner-only corrections were followed by the complete fresh-database run retained below; no application assertions or authorization rules were removed. The final wait requires all newsroom loading statuses to disappear, not only one matched status.

## Retained evidence and reproduction

- [Raw successful browser/isolation/provenance report](evidence/HYDRATION_RECHECK_REPORT.json)
- [Exact successful runner source](evidence/HYDRATION_RECHECK_RUNNER.txt)
- [Playwright execution configuration](evidence/HYDRATION_RECHECK_PLAYWRIGHT_CONFIG.txt)
- [Pre-fix negative-control output](evidence/HYDRATION_RECHECK_NEGATIVE_CONTROL.txt)

The runner bytes have SHA-256 **8accc96e7d72a3b9a06e34209d6d3ba566aea49a66a70791121119d9b2891925**, matching the hash in the raw report. Evidence text preserves the executed source; these are not new product scripts. Reproduction requires adjusting the captured scratch paths: the runner expects a sibling `lokswami` checkout and `qa-runtime/node_modules/node/bin/node`, a fresh production `.next` artifact, full MongoDB/Chromium executables in `/tmp/lokswami-hydration-runtime`, and the captured Playwright config saved as `qa-runtime/playwright-recheck.config.mjs`. Run from the isolated checkout with:

```sh
../qa-runtime/node_modules/node/bin/node ../qa-runtime/recheck.cjs
```

The runner then provisions its own fresh loopback database/accounts, runs actual browser/API checks and stops only its owned processes. A separate fresh build is required when the application source changes. The retained JSON is the successful final execution output, not hand-authored per-case evidence.

## Acceptance limits and next work

The fixture database contains no representative articles, story packages or publications. This run does not repeat seeded deadline/timestamp comparisons, changes-requested/revision/ownership lifecycles, media playback, verified remote upload receipts, E-Paper/E-Magazine conversion/release/archive, rollback or migration. It does not certify reader acceptance, dark theme, real devices, screen readers, field performance or remote staging/production configuration.

The dashboard currently contains a nested `main` element in `ActionFirstDashboard` inside AdminShell's `main`. Record that for CMS accessibility acceptance; it was not changed in this hydration verification scope.

Hydration is corrected on the tested foundation; full **3.18C CMS acceptance remains open**. Continue with verified isolated QA-storage configuration, uploads/media ownership/cleanup, representative editor handoffs and real daily E-Paper/monthly E-Magazine publication controls. The MP4 SOP discrepancy is already resolved in [PR #49](https://github.com/zaidshery/Lokswami-version-3/pull/49): video is optional and title/cover remain required. No advance to migration, staging, production launch or Phase 4 is claimed here.
