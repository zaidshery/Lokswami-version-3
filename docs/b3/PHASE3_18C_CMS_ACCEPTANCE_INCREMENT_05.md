# CMS acceptance increment 05

Checkpoint: 12 October 2026. Foundation: **4d15bf741f85603272f0f3f6c1f9fa4906f63aff**. Hydration closure and local editorial acceptance passed. **Full CMS acceptance remains incomplete.** No production deployment, domain transition, migration or production data write occurred.

## Reviewed corrections merged

| PR | Result | Reviewed head | Merge |
| --- | --- | --- | --- |
| [#50](https://github.com/zaidshery/Lokswami-version-3/pull/50) | Isolate streamed page content in its own Suspense boundary and defer the shell mount update | fd93d8245096cd4c6aa99d5f681ed33a3582f9e6 | 4d15bf741f85603272f0f3f6c1f9fa4906f63aff |
| [#49](https://github.com/zaidshery/Lokswami-version-3/pull/49) | Align Story media SOP with existing optional-MP4 behavior | f315c2713a3b3884305cb21abafd412a41e778e4 | 24274c13fcfe434502ea0ed6f8af743aca6fc1ff |

Both exact heads received independent review, green CI, scope checks and zero unresolved review threads before guarded merge. Review summaries: 6121538476 (#50) and 6121241366 (#49). The final comparison from tested #50 head to merged foundation changes only the three SOP documents; runtime source matches the validated candidate.

Exactly five changed files across the two corrections: app/(admin)/admin/AdminShell.tsx; tests/admin-shell-redirect-hydration.test.tsx; docs/LOKSWAMI_CMS_ROLE_SOP.md; docs/LOKSWAMI_CMS_ROLE_SOP.html; docs/LOKSWAMI_CMS_ROLE_SOP.pdf. No auth/workflow policy or dependency changed.

## Hydration diagnosis and verification

Production diagnostics repeatedly placed the attempted shell content-container hydration at streamed Suspense markers. A finer trace recorded that container as the hydration parent after its earlier DOM claim. This supports isolating page suspension from the host container; it is not an upstream React vulnerability classification. Simple bundled-React probes and minimal Next fixtures did not reproduce the production failure, and no patch was made from those negative probes. A transition-only experiment from earlier work was insufficient. The final correction combines a content boundary using the existing bilingual newsroom loader with a transition for the shell's mount-time hydration update.

The new pending-page SSR regression fails on unchanged foundation: one failure and four existing passes. The final candidate passes 29 focused/adjacent cases and typecheck. Existing redirect feedback assertions remain strict. The first boundary-only trial exposed early-update recovery in React 18; the final transition prevents that interruption. No recoverable errors, reload behavior or assertions were suppressed.

CI **38229512354**, job **114745232407**, completed successfully on fd93d82: 410 files / **3,419 tests**, auth guards, synthetic credential regressions, lint (zero errors / 329 existing warnings), typecheck, dependency floor, production build (175 generated pages) and **five browser cases**. [Durable CI logs](https://github.com/zaidshery/Lokswami-version-3/actions/runs/38229512354). #49 CI 38228607127 is also green. No real owner credentials are certified by the synthetic credential checks.

Local verification used Node 20.20.2, Next 15.5.22, Playwright 1.62.1, Chromium 151.0.7922.34 and MongoDB 7.0.16. Dependencies were reused from the previously verified fresh npm ci; a fresh dependency installation is not claimed for the final candidate checkout. The initial local full-suite browser-runner failures followed the removed Playwright cache. Restoring the exact matching browser made the two affected suites pass 22 cases and the repeated full test:ci pass 3,419. A build/output cleanup failure occurred while validation jobs overlapped; the successful exact-head build was performed sequentially after the suite finished.

Successful build ID: **hVUv5-Y1r5DBzzxePSJqr**. BUILD_ID SHA-256: de1ad9d4399b1692a1a85a23aff200d7d3bb4681d7cb22a87db2532b7d0b913f. Manifest SHA-256: 331f0deadcdc05a221ee52c801afddef362a9f3b2806fd9c5b3b6d93ea76fdf6. The five committed browser cases also passed locally.

The Mongo-backed matrix explicitly reused that verified artifact and created a new empty isolated QA database. Actual password sign-in/session-role assertions passed for all four reserved synthetic QA identities. Four bootstrap sign-in arrival pages had fatal listeners and zero errors. Sixteen additional role/language/timezone sign-ins completed 80 queue cases plus 16 dashboards: **96 target cases, zero global/document hydration or runtime errors**, all timestamps correct, 28 denied-route feedback checks passed, and four displayed deadline comparisons passed. Hindi/English and India/US browser timezones were tested. The earlier unchanged-foundation 96-case run had six global errors; a 64-route timing diagnostic had three normal and three delayed-JavaScript errors. The final comparison is a separately built candidate, not a relabelled baseline run.

## Local editorial acceptance

A separate exact-candidate run used another new empty isolated database and actual password sessions. It passed **97 local API assertions** across four sections:

- Article ownership, submission, assignment, review, changes requested, Reporter revision, stale-version rejection, revision-history permissions, approval, scheduling, release and archive. Draft/scheduled/archived Article detail returns 404 to the public route; published detail returns 200. Confidential reporting context was absent from the public DTO.
- Story image-only submission, unassigned Copy Editor claim, editable-stage restrictions, foreign ownership, a PNG/MP4 package using locally hosted real bytes as legacy URL references, return/revision, revision history, stale-version rejection, ready-for-approval, approval, scheduling, publication and archive.
- E-Paper/E-Magazine role gates for listing, creation and mutation; missing verified publication assets rejected. Media listing permitted by role and forged media creation rejected. These negative controls do not certify a real publication release or uploaded-media ownership lifecycle.
- Actual local MP4 playback: 160 x 90, duration 1 second, readyState 4, currentTime 0.155127, no media error. Story-video initialization without QA Spaces configuration returned 500, confirming that remote upload acceptance is blocked in this runtime.

The original 65-case run on unchanged runtime also passed before the expanded 97-case candidate run. All newsroom content was explicitly synthetic local QA material. The MP4/PNG were real local files, but **no verified Spaces receipt, remote upload, provider playback or representative newsroom-package acceptance is claimed**. Revision history and returned-item revision were exercised; revision restoration is not certified by these counts.

## Media requirement discrepancy resolved

The current Story form and create/update APIs already allow image-only Stories; publish readiness requires media, rather than a mandatory MP4. The SOP's compulsory image-plus-video instruction and fixed file-count caps were outdated. #49 updates Markdown, HTML and the generated eight-page A4 PDF without changing runtime policy. Title and cover/thumbnail remain required, MP4 is optional, actual per-file size limits remain, and uploaded videos still need verified receipts. The HTML distinguishes quick direct Articles from linked Articles created from a Story. Changed PDF pages were rendered and visually checked; an initial page overflow was corrected before publication. PDF blob: 12cbae207b26abf7f0674302dd3c86849207a8dd.

## Evidence availability and remaining gates

The temporary execution environment disconnected after the passing local runs and cleanup, before the new raw CMS05 reports/runner files could be published. Their continued availability is unverified. This checkpoint preserves measured summaries from the execution record and PR metadata, plus independently durable GitHub CI logs. It does **not** invent/recreate the missing per-case JSON reports or claim they were retained remotely. Earlier raw CMS01-CMS04 evidence remains in its existing Git checkpoints.

Full CMS acceptance stays open for:

1. Verified real QA-storage upload, receipt completion, attachment/replacement/removal/download and ownership/reference-cleanup checks for images, MP4 and publication assets.
2. Representative newsroom Story packages and complete editor UI handoff, including Story-to-linked-Article creation and remaining media/publication interactions.
3. Real daily E-Paper and monthly E-Magazine preparation, conversion/readiness, scheduling/release/archive/immutable-revision controls with verified assets and public-reader checks.

A usable QA Spaces configuration was not located in the available project checkout or targeted supplied-file searches. This does not prove that none exists on the owner's infrastructure. The isolated runtime has no such credentials configured. Restored execution access, isolated storage configuration and representative publication inputs are required to finish these gates; authorization is already present and is not requested again.

The broader launch checklist still has five unchecked items: full CMS acceptance, reader acceptance, migration/rollback, staging readiness/soak and production cutover. No next launch phase was started.
