# CMS acceptance increment 02: timestamp and shell hydration

Checkpoint: 12 October 2026. This is an evidence branch, not a production deployment or a claim that full CMS acceptance is complete.

The preceding ownership correction, [PR #45](https://github.com/zaidshery/Lokswami-version-3/pull/45), is merged into foundation at **ab2e3aaf4bce9815283eecf4b1206bd99211154b**. Its evidence remains in increment 01 at documentation commit **bc36ce9b43ebb5e9603a69f1ca309e6b6fe77e0e**.

## Timestamp correction: PR #46 remains open

Exact implementation head: **5cd4f984e0b9426a1a453bf3a247719b52b112f4**. Tree: **c43d4ba4f796265e6772ef45e02bc1fc998ac0eb**. Base: the foundation merge above.

Changed files are limited to `components/admin/WorkQueueWorkbench.tsx`, `components/admin/ActionFirstDashboard.tsx`, and `tests/cms-timestamp-hydration.test.tsx`. Both confirmed formatters now explicitly use `Asia/Kolkata`, preserving each existing presentation style. Actual development diagnostics identified the dashboard ActionRow deadline as another host-timezone mismatch; it was not added speculatively.

| Verification | Exact result |
| --- | --- |
| Negative control on unchanged foundation | Eight valid SSR/hydration cases fail |
| Candidate focused/adjacent tests | Seven files / 53 cases pass |
| Typecheck | Pass |
| Lint | Zero errors / 329 existing warnings |
| Exact-head [CI run 38184644986](https://github.com/zaidshery/Lokswami-version-3/actions/runs/38184644986) | Completed / success; job 114604257211 |
| Full Vitest in that CI | 408 files / 3,409 tests pass |
| Auth and synthetic credential regressions | Seven auth guards and eight synthetic credential cases pass; configured-owner check remains separate |
| Production build and Chromium CI smoke | Build passes; two browser smoke tests pass |
| Exact-head independent review | No major issues; review comment 6115179027; no unresolved threads at the checkpoint |

Eight SSR/hydration regressions exercise native Intl with controlled host timezone defaults, both actual components, Hindi/English and India/US browser timezones. An earlier invalid dashboard fixture was corrected to a renderable assigned item and the supported `open` action before final pass claims. Earlier intermediate-head CI totals are not substituted for final-head results.

## Production browser failure remains visible

The sequential fresh run started **2026-10-11T23:36:35.864Z** and built exact head 5cd4f98 in a new detached checkout with a fresh lockfile installation, empty build directory, empty isolated loopback Mongo database and four canonical QA accounts. Its production build passed, but the browser stage stopped after a Reporter sign-in with an HTML hydration recovery error. It is a failed browser run, not an acceptance pass.

Build ID: **B-U5LxXsePkXyzeqbkXlF**. BUILD_ID SHA-256: **58fad5ff044c182597bafeed73ab6a49fa3bfb93016bec56a27ccf122b9da1e7**. Build-manifest SHA-256: **0c92893418920ae871d7225d40abb2fd789c6dba0cd3f8bd633fb145420da176**. Lockfile SHA-256: **8c66dd8d1d731a4a6beb17724b349d5f830b3e04dc014ac74c06fa3478e5fee2**.

A sequential supplemental run reused that hashed fresh artifact and created a new empty QA database, new secrets/passwords and four actual password sessions. All **80** Work Queue route cases completed across four roles, both languages and both browser timezones. All 80 displayed-timestamp comparisons passed. The run still failed: it recorded **three global page errors**, with **one target document containing an HTML hydration error** (Admin, Hindi, India timezone, Content Queue). This is explicitly reused-artifact verification, not another fresh-build claim.

A development diagnostic completed **36 Reporter route visits** without reproducing the error. Passing development attempts do not invalidate the production failure.

An additional production diagnostic completed **72 route visits** in 24 actual Admin/Reporter credential sessions. It recorded **eight mismatch traces** and **five delivered page errors**. The browser served an instrumented React asset to capture the expected element and actual DOM node while leaving recovery behavior intact. This is diagnostic evidence only: it is not an unchanged-candidate acceptance run. The original/instrumented asset hashes are retained in its report.

Four traces identify the access-denied banner expecting a `div` while encountering its warning SVG after redirecting to `/admin/work?access=denied`. Other traces identify the shell content container expecting a `div` while encountering a comment node, on Content Queue and Videos routes. The trace locates these mismatches; it does not establish a single root cause for every captured failure.

## Separate banner candidate: PR #47

[PR #47](https://github.com/zaidshery/Lokswami-version-3/pull/47) is a draft stacked on PR #46, preserving separate review scopes. Candidate head: **2d6fb63e3b3b631eff429709dd8f9c71299ee2ce**. Tree: **0f87464ae6cde9ef857c3e7cf16a6c67d86c324b**.

Its only files are `app/(admin)/admin/AdminShell.tsx` and `tests/admin-shell-redirect-hydration.test.tsx`. URL-driven access feedback is deferred until the shell's existing hydration guard completes. The actual denial message still appears; dismissal preserves unrelated query parameters; permitted content remains visible. Server authorization and redirects are unchanged.

All four Hindi/English changed-query SSR/hydration cases fail on unchanged foundation ab2e3aa. The candidate passes **28 focused cases / three files**, typecheck, and lint with zero errors / 329 warnings. Full CI and a fresh uninstrumented production browser run are pending at this checkpoint. The candidate is not certified as fixing the other content-container traces.

## Evidence and exclusions

Evidence files are under `docs/b3/evidence/`, prefixed `CMS02_`. JSON reports preserve their original run fields; names such as `hqs-browser-report.json` inside a supplemental report refer to the corresponding retained fresh-build report. Exact runner/helper bytes and a source-hash inventory are retained. Private configuration files supply random QA credentials at runtime and are intentionally absent. No actual passwords, password hashes, cookies, auth secret values or screenshots are published.

Two overlapping intermediate executions are excluded from final pass claims. A subsequent broad instrumented helper execution ended without a complete final report and is also excluded. Earlier dashboard tests with a non-renderable draft fixture are not negative-control evidence. Neither a passing smoke test nor an instrumented diagnostic is relabelled as full CMS acceptance.

## Remaining work, in order

1. Verify the banner candidate with exact-head CI, independent review and uninstrumented production checks; investigate any remaining shell/content-container mismatches before CMS closure.
2. Complete CMS story/media/publication workflows and manual UI acceptance. Image-only API story submission remains an observed discrepancy with the role SOP/form's image-plus-MP4 package requirement; it is not a passed complete-package scenario.
3. Complete reader/device/accessibility/provider/performance acceptance.
4. Rehearse migration integrity, backup restoration, rollback and idempotence using a complete isolated dataset.
5. Verify actual remote staging configuration, integrated acceptance and soak monitoring; close launch blockers.
6. Complete production configuration, migration and cutover only after preceding launch gates are verified.

Full production backup/media data, remote staging/storage configuration and established production hosting/domain resources have not been verified. Full authorization does not establish their availability. Phase 4 and later AI/monetization/mobile milestones remain separate. No production deployment, domain transition, migration or production data write occurred in this increment.
