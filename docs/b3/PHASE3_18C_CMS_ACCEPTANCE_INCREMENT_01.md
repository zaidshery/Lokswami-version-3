# Phase 3.18C — CMS acceptance increment 01

## Result and scope

The byline ownership override found during real isolated CMS acceptance is corrected in [PR #45](https://github.com/zaidshery/Lokswami-version-3/pull/45). Runtime source head: **ee8faf6dfcaea259437a794fb9f37856c32600d2**; tree: **056118420d876a45d24c0e0732b81bf05f493ce5**. The patch contains only `lib/auth/permissions.ts` and `tests/content-owner-boundary.test.ts`.

An Admin-created draft with a complete foreign workflow creator was readable by a Reporter when its display byline matched the Reporter's email local part. The shared ownership helper now uses a nonblank explicit creator ID as authoritative. Legacy byline matching remains only for creator-less records. Independent assignment checks remain intact. Read, edit, comment, submit and story download callers use this boundary.

This closes the reproduced complete-creator ownership issue. It does not certify full CMS, media/publication or reader acceptance. Workflow normalizers' treatment of malformed partial creator objects is unchanged and remains a separate compatibility limitation.

## Ordered verification

| Check | Result |
| --- | --- |
| Regression trigger on unchanged foundation 5c269925 | Six ownership cases failed; seven compatibility controls passed (13 cases) |
| Focused candidate coverage | 124 tests / eight files passed |
| Typecheck | Passed |
| Lint | Zero errors; 329 existing warnings |
| Full test:ci under UTC, with verified Chromium | 407 files / 3,401 tests, seven auth guards and synthetic credential checks passed |
| Fresh isolated production build | Passed, 175 generated pages |
| GitHub CI | Run 38180786569, job 114592699513, success; all steps including two production smoke cases passed |
| Independent exact-head review | Comment 6114646560: no major issues on ee8faf6dfc; zero unresolved threads |

The owner-credential environment check is skipped when configured credentials are absent; its synthetic cases are not real owner authentication. Separately, all four canonical QA users completed actual password sign-in and real Auth.js sessions against the owned loopback database. No auth response mocks or fabricated session cookies were used.

## Actual ownership and workflow proof

Both normalized email-local-part and exact-email byline collisions returned **403** for Reporter detail GET and PATCH on foreign-owned drafts. Creator-less legacy GET and PATCH returned **200**. Reporter-owned edits, stale-write rejection (409), changes requested/comment retention, resubmission, Copy Editor handoff, Admin approval/future scheduling/publication, Super Admin archive and public visibility checks passed. Three actual public article GETs preserved views and updatedAt.

The first captured broader run recorded **122 checks**, including 40 direct-route assertions, before stopping on Admin page errors. An image-only story submission is an observed API behavior included in this count, not certification of full package requirements. Publication creation/detail/metadata/workflow/delete/page/OCR/conversion denial checks were performed for the three non-Super-Admin roles. Positive publication upload, media processing and release flows remain open.

Fresh run began **2026-10-11T22:31:20.152Z** and stopped with the Admin error at **22:35:23.103Z**. Build provenance is retained in the browser report. Its overall `ok: false` is intentional: the wider acceptance run failed, even though the ownership regression and lifecycle cases passed. The editorial report is partial, with no invented completion marker.

A second diagnostic reused that exact hashed fresh artifact, signed in as all four roles again, navigated **80 route cases**, and captured **28 React #418 hydration errors**. It completed **2026-10-11T22:38:59.622Z**. This is a failed diagnostic, not a fresh-build/full-acceptance pass. Affected observed paths include Work/My Work/Review Queue and Videos. Error stacks, roles and paths are retained below; the root cause is not claimed yet.

## Remaining CMS acceptance findings

1. Investigate and correct the concrete hydration mismatches separately; retest all affected roles/routes.
2. Reconcile image/video package submission criteria with legacy API compatibility. The SOP/current Story form require an image and MP4; the actual API accepted an image-only draft and submission. This is recorded as needs_review rather than silently changing the API or calling complete-package acceptance passed.
3. Complete upload-backed story packages, ownership/assignment variants, media validation/recovery and the full positive E-Paper/E-Magazine lifecycle, including metadata/pages, OCR/hotspots, publication and archive.
4. Finish manual UI coverage and the remaining reader/device/accessibility/provider/performance acceptance.
5. Migration/rollback, isolated remote staging and production cutover remain subsequent gates. No deployment or production data mutation occurred in this increment.

## Isolation and reproduction

The runner creates its own clean detached checkout from queried Git HEAD, installs fresh lockfile dependencies with `npm ci --offline --no-audit --no-fund`, checks tracked and untracked/ignored build inputs before setup and before/after an empty-output build, and records source/install/artifact hashes. Node 20.20.2, Next 15.5.22, Playwright 1.62.1 and Chromium 151.0.7922.34 were used. MongoDB 7.0.16 runs only on owned loopback storage. These are recorded test versions, not production upgrade recommendations.

Canonical accounts were provisioned into an initially empty random QA database using the existing guarded provisioner. All content is explicitly labelled synthetic QA content; representative live-media acceptance is not inferred from these records. A creator-less legacy QA record was inserted solely to exercise compatibility. Provider credentials were absent, social delivery manual, external OCR/automation disabled, and Node/browser traffic restricted to loopback/the exact local origin. Cleanup stopped owned processes.

Commands from the captured workspace:

```sh
CMS_EXTRA_UAT=1 qa-runtime/node_modules/node/bin/node cms-orchestrate.cjs
qa-runtime/node_modules/node/bin/node cms-debug-routes.cjs
TZ=UTC npm run test:ci
npm run lint
npm run typecheck
```

The retained source text contains historical workspace/binary paths requiring adjustment elsewhere. The diagnostic additionally requires the private temporary configuration and original QA data/build produced by the first runner. Actual passwords, auth secrets, password hashes, cookies and screenshots are excluded. Retained files were checked against the generated private values before publication.

Workspace maintenance removed the earlier local-only candidate/runtime. The patch was reconstructed and its entire tree matched the independently reviewed candidate exactly before saving this remote head and rerunning verification. Earlier interrupted runs and corrupt/incomplete browser installation attempts are excluded from pass claims.

## Retained evidence

- [First browser/isolation/build report](evidence/CMS01_BROWSER_REPORT.json)
- [Partial editorial and route assertions](evidence/CMS01_EDITORIAL_REPORT.json)
- [Failed 80-route hydration diagnostic](evidence/CMS01_ROUTE_DIAGNOSTIC.json)
- [Exact capture runner](evidence/CMS01_CAPTURE_RUNNER.txt)
- [Exact editorial helper](evidence/CMS01_EDITORIAL_CHECKS.txt)
- [Exact diagnostic runner](evidence/CMS01_ROUTE_DIAGNOSTIC_RUNNER.txt)
- [Validation summary](evidence/CMS01_VALIDATION_SUMMARY.json)

Fix Finding workflow supplied one independent read-only boundary investigation and one independent read-only candidate review. Its storage companion resource was unavailable through the plugin; retained source/evidence follows this project's Git-backed artifact rule. No repository-wide security scan or complete original audit certification is claimed.
