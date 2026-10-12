# CMS acceptance increment 03

Checkpoint: 12 October 2026. Foundation is **0396d1565270f011e078dfb87b2698405760063f**, tree **a29a79fe44a4cf849c61b0dc0d0a8db9ee5433da**. This is a technical closure checkpoint, not full CMS or launch acceptance.

## Reviewed corrections merged

| PR | Correction | Reviewed head | Foundation merge |
| --- | --- | --- | --- |
| [#46](https://github.com/zaidshery/Lokswami-version-3/pull/46) | Work Queue and dashboard timestamps explicitly use India time | 5cd4f984e0b9426a1a453bf3a247719b52b112f4 | 66348cb3c8d30a78d8cf40084418be4792f6036c |
| [#47](https://github.com/zaidshery/Lokswami-version-3/pull/47) | URL-driven denial feedback waits for shell hydration | 2d6fb63e3b3b631eff429709dd8f9c71299ee2ce | bf5f47978963c23145a3ac97ee4a6765f8614c1e |
| [#48](https://github.com/zaidshery/Lokswami-version-3/pull/48) | Healthy bundle runtime exceptions no longer trigger stale-asset reloads | 021a02ba4bf802568a796d759404807f121c4233 | 0396d1565270f011e078dfb87b2698405760063f |

Each PR was independently reviewed on its exact head, with green CI and zero unresolved review threads before guarded merge. #47 was retargeted to updated foundation after #46; its resulting merge tree exactly matched the already tested implementation tree. The earlier ownership correction #45 remains merged at ab2e3aa.

## Validation

| Gate | #46 | #47 | #48 |
| --- | --- | --- | --- |
| Full Vitest | 408 files / 3,409 tests | 409 files / 3,413 tests | 410 files / 3,418 tests |
| Production browser checks in CI | 2 passed | 2 passed | 5 passed |
| Lint | 0 errors / 329 warnings | 0 errors / 329 warnings | 0 errors / 329 warnings |
| Typecheck and production build | Passed | Passed | Passed |
| CI run | 38184644986 | 38186416546 | 38201406325 |
| CI job | 114604257211 | 114609584221 | 114655406741 |

The auth-guard and synthetic credential regressions pass separately; the configured-owner credential check is not real canonical QA account proof. No test result here is substituted for complete live newsroom acceptance.

#48's actual inline-script negative control on unchanged foundation bf5f479 fails the two runtime-error cases and passes the three real resource/retry cases. The candidate passes eight focused/adjacent cases and typecheck. CI's three added browser tests deliberately raise controlled errors: two healthy-bundle exceptions must remain visible without reload, and a real failed script must recover while preserving the redirect query. The existing two fatal-error-guarded smoke cases remain intact.

Local #48 validation used a new detached exact-head checkout, successful fresh npm ci, Node 20.20.2, Next 15.5.22 and Playwright 1.62.1. The empty-output build passed. Its first browser invocation failed because the QA adapter referenced a removed Playwright module path. Only the adapter was corrected. The successful browser-only continuation checked the source, lockfile, build-ID and manifest hashes before explicitly reusing that fresh artifact. All five committed browser cases passed in five guarded contexts, with zero unexpected, skipped or flaky cases; six external requests were blocked. Application source hashes stayed unchanged. Only the disposable QA analytics data file changed through local telemetry.

Build ID: **8Q1CZGZZkONcLjRtXYAjO**. BUILD_ID SHA-256: **6b3a9a7eeff06e8f0ced6950a8bc66d4d7bf419b7a96a98493d36404f66e7cd2**. Manifest SHA-256: **f59e90cd3c64c7691b867962144035a329be168314f9c2a1caed86a904c2912b**. This anonymous error-handler/browser verification is not Mongo-backed CMS workflow acceptance.

## Scope

- #46: components/admin/WorkQueueWorkbench.tsx; components/admin/ActionFirstDashboard.tsx; tests/cms-timestamp-hydration.test.tsx.
- #47: app/(admin)/admin/AdminShell.tsx; tests/admin-shell-redirect-hydration.test.tsx.
- #48: app/layout.tsx; tests/asset-recovery-runtime-errors.test.ts; tests/e2e/admin-critical-flows.spec.js.

No auth/workflow policy change, unrelated cleanup, deployment, domain transition or production data write occurred. The speculative shell mount-transition experiment failed broader production validation and was discarded; it is not in the merged product.

## Broader CMS failure is separate

Retained [CMS01 pre-change diagnostics](https://github.com/zaidshery/Lokswami-version-3/blob/bc36ce9b43ebb5e9603a69f1ca309e6b6fe77e0e/docs/b3/evidence/CMS01_ROUTE_DIAGNOSTIC.json) record three HTML hydration errors on source ee8faf6, tree 056118420d876a45d24c0e0732b81bf05f493ce5. That is exactly #46's unchanged foundation base tree. This proves the HTML issue preceded the timestamp correction and permits separately closing its verified scope.

The last pre-#48 combined CMS run completed 80 queue/role checks and 16 dashboard checks on head 2d6fb63. All timestamp and access-feedback comparisons passed, including 28 denied-route scenarios and four real deadline comparisons. The overall run failed: ten global errors and two target Review Queue documents had HTML hydration errors. Further diagnostic traces encountered streamed Suspense comment markers at the shell content container. This is not certified as resolved by the stale-asset reload correction.

Those later raw CMS JSON files and the discarded transition-trial files were removed by workspace maintenance before their first Git publication. Their outcomes remain in PR metadata and the execution record; they are not invented or relabelled as retained raw evidence. The earlier CMS02 packet is retained at [7f51092](https://github.com/zaidshery/Lokswami-version-3/blob/7f5109248d85ee4d72b0b3cb3968eb8de1fd2556/docs/b3/PHASE3_18C_CMS_ACCEPTANCE_INCREMENT_02.md).

The current-foundation recheck began at 2026-10-12T04:46:39Z using the verified fresh #48 artifact, whose tree exactly equals foundation 0396d15. Actual password sign-ins and session-role assertions passed for all four canonical QA roles against a new empty isolated MongoDB. Seven fixture API operations passed, including submission, assignment and scheduling. Across Hindi/English and India/US browser timezones, all 80 queue cases and 16 dashboard cases completed; all timestamp comparisons, 28 denied-route feedback comparisons and four displayed deadline comparisons passed.

The acceptance gate **failed** with six globally captured HTML hydration errors, including five target documents: Copy Editor Hindi/US dashboard, Super Admin Hindi/US Content Queue, Admin Hindi/US Review Queue, Reporter Hindi/US Work Queue and Super Admin English/US Review Queue. The sixth error occurred on the Super Admin Hindi/India sign-in arrival dashboard. The global listener remained active throughout the 16 matrix sign-ins; the initial four bootstrap sign-ins verified roles but did not have that fatal-error listener. This result does not certify publication/media workflows or the remaining CMS routes. Raw reports and exact runner sources are retained in the CMS03 evidence packet; passwords and secrets remain excluded.

## Remaining launch gates

The [current checklist](PHASE3_18C_FINAL_CHECKLIST.md) retains five unchecked launch items: complete CMS/publication acceptance, reader/device/accessibility/provider/performance acceptance, migration/restore/rollback rehearsal, isolated staging readiness/soak, and production cutover. Remote infrastructure and a complete migration/backup dataset have not been verified. Full authorization does not establish their availability.

No real passwords, auth secrets, password hashes, cookies or screenshots are published. Retained local runner sources generate QA secrets in memory or read a private configuration file; they contain no secret values.
