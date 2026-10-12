# Lokswami completion checklist

Checkpoint: 12 October 2026. Foundation: **4d15bf741f85603272f0f3f6c1f9fa4906f63aff**. Full CMS and launch acceptance remain **incomplete**.

## Verified corrections and local acceptance

- [x] Earlier scoped R02-R10 corrections/verification are merged; the original audit register was not recovered verbatim.
- [x] #45 creator ownership correction remains merged.
- [x] #46 India-time timestamps, #47 redirect feedback and #48 asset recovery remain merged.
- [x] #50 streamed-page hydration correction merged after exact-head independent review, green CI and zero unresolved threads.
- [x] Four-role Hindi/English India/US matrix: 96 target cases and four bootstrap sign-in arrival checks, zero global/document runtime/hydration errors; 28 denial assertions and four displayed deadlines pass.
- [x] 97 local API assertions cover Article/Story ownership, submission, assignment/claim, return/revision, stale-version rejection, history permissions, approval, scheduling, publication/archive, confidential-source omission from the public Article DTO and publication/media role gates.
- [x] Image-only Story submission and a locally hosted real PNG/MP4 legacy-reference package pass; local MP4 decodes/plays without errors. These are not verified external uploads.
- [x] #49 SOP discrepancy resolved and merged: MP4 is optional, title/cover remain required, actual per-file limits and verified-upload requirements retained; Markdown/HTML/eight-page PDF updated.
- [x] Exact-head CI: 410 files / 3,419 tests, auth/synthetic credential regressions, lint (zero errors / 329 warnings), typecheck, dependency floor, build and five browser checks.
- [x] Both latest PRs reviewed, scoped and guarded-merged. No production deployment, domain transition, migration or production data write.

## CMS acceptance gates still open

- [ ] Verified QA-storage upload/receipt completion, attachment/replacement/removal/download, ownership and reference cleanup for images/MP4/publication assets.
- [ ] Representative newsroom packages and complete editor UI handoff, including Story-to-linked-Article creation and remaining media controls. Local synthetic API scenarios do not certify this.
- [ ] Actual daily E-Paper and monthly E-Magazine preparation, conversion/readiness, scheduling/release/archive/immutable-revision controls with verified assets and reader checks.
- [ ] Any remaining acceptance failures found by those end-to-end runs. Revision restoration is not certified by the history/returned-item revision checks.

QA storage configuration was not located in the available checkout or targeted supplied-file searches, and is not configured in the isolated runtime. This does not establish that it is absent from the owner's infrastructure. The temporary execution environment disconnected after the passing local runs and cleanup, blocking further local verification. Authorization is already present; no renewed approval is required to resume once the prerequisites are available.

## Five launch items remain

| Order | Phase / item | Remaining work |
| --- | --- | --- |
| 1 | 3.18C - Full CMS acceptance | Finish the external media, representative-package/editor UI and publication gates above. Hydration is corrected; complete CMS certification is still open. |
| 2 | 3.18C - Reader acceptance | Representative article/PDF/image paths, actual video/provider playback/captions, Hindi/English/light/dark, real devices/browsers, keyboard/screen readers/zoom/reflow and representative performance/field metrics. |
| 3 | 3.18D - Migration and rollback | Complete source backup; isolated DB/media destination; mappings/counts/hashes/slugs/links/publication metadata; restore/rollback/idempotence and runbook. |
| 4 | 3.18E - Staging readiness and soak | Verify isolated remote staging/storage; integrated manual/device/SEO acceptance, realistic load, monitoring and soak; close blockers. |
| 5 | 3.19 - Production cutover | Complete preceding gates; verify hosting/domain/release resources; final config/backup/migration checks, deployment/domain transition, monitoring and rollback readiness. |

Phase 4 hardening follows launch. AI newsroom tools, distribution automation, monetization and native mobile apps are separate later milestones.

[Increment 05](PHASE3_18C_CMS_ACCEPTANCE_INCREMENT_05.md) records exact heads/merges, scopes, positive/negative controls, evidence availability and limits. [CI 38229512354](https://github.com/zaidshery/Lokswami-version-3/actions/runs/38229512354). The new raw local CMS05 reports were not published before the environment disconnected; the checkpoint uses measured execution summaries and durable CI/PR evidence, not reconstructed per-case reports.
