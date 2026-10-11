# Lokswami final checklist

Checkpoint: 11 October 2026. Repository: https://github.com/zaidshery/Lokswami-version-3. Target: b3/foundation. Merged foundation: **5c269925de318324abe371f8ab93d9767b2ec0e9**.

The user authorized completing this work and merging reviewed, green PRs. No production deployment, domain change, migration or production data write occurred. This checklist distinguishes code closure from live acceptance and launch readiness.

## Finding status

| Finding | Actual result | Status |
| --- | --- | --- |
| R02 | Removed fabricated Trending/Recent Searches; corrected the exact stale Search assertions in the existing regression suite. Three-file scope. | #33 merged |
| R03 | Search redaction alone was insufficient for the recovered privacy concern. Final logger drops all query/hash values, blanks IP/UA and email, enforces minimization at serialization and restricts new log permissions. Actor IDs/roles remain identifiable; retention/access of historical logs requires an operator policy. | #34 and corrective #42 merged |
| R04 | Auth exceptions fail closed on protected admin/API/account routes with generic private/no-store 503; public reads remain available. | #35 merged |
| R05 | Recovered guidance/runtime mismatch reproduced. Runtime publication CMS policy stays Super Admin-only; in-app guidance, Markdown, HTML, PDF and manual QA matrix now agree. Daily city/edition E-Paper and monthly E-Magazine distinctions preserved. | #38 verification and corrective #43 merged |
| R06 | Recovered reference: no verified isolated database, dependencies or usable role credentials. Disposable loopback MongoDB and canonical four-role QA provisioning now work; 8 real articles and 3 publications imported. Four real credential sign-ins, publication read-access and 18 article API assertions passed. | #44 reviewed, green and merged |
| R07 | Production Chromium CI smoke, isolated auth configuration, no reused server, visible staff controls and fatal-page-error assertions. | #36 merged |
| R08 | Read-only real-content snapshot and asset verification; reproduced native PDF child crashes recover once with PDFium under the existing deadline/mutex. Six real first/last PDF pages pass. | #41 merged; provider/video acceptance still pending |
| R09 | Established public GET/telemetry contracts checked: public reads remain read-only; engagement writes use explicit endpoints. | #39 verification merged |
| R10 | Hindi/English reader loading/error boundaries with safe retry and native home navigation. Negative-control regression confirmed. | #37 merged |
| CI baseline repair | Existing Ftaftaf observer assertion now waits for its asynchronous effect without weakening the expected count. | #40 merged separately |

The recovered R03/R05/R06 references came from earlier audit discussion, not a verbatim complete original R03–R10 register. The earlier 318-01–318-10 register is different and was not relabelled. R06 is no longer unidentified. The first reconstructed R03/R05 reports did not fully address the subsequently recovered concerns; #42/#43 correct that.

## R02 failed CI diagnosis

The stale regression failure was R02-related: the Search-copy tests still asserted that deleted Trending/Recent headings and fabricated suggestion buttons existed. In tests/phase316b-search-category-latest.test.tsx, `4. SearchClient renders clean English copy in English mode` contained `expect(screen.getByRole('heading', { level: 2, name: /Trending Searches/ })).toBeInTheDocument()`. Its Hindi counterpart expected the corresponding removed headings/pills. The mobile case, `13, 14 & 15. Touch targets and responsive bounds comply with mobile contracts without altering content authority`, inspected the removed suggestion row. The fix asserts the real bilingual published-news prompt, rejects removed terms and checks the genuine category/sort row while keeping touch-target assertions. Focused Search validation: **17 passed**; final R02 CI run **38124669735**, **403 files / 3,362 cases**, plus auth checks, lint/typecheck/build. Three-file scope only; no unrelated foundation fix in #33.

## Exact commits

| PR | Independently reviewed implementation head | Merge commit |
| --- | --- | --- |
| #33 | 6e93dce05a5de778dc7fdfb53afc16755c2772d2 | 99236fad317b953d9a9c922d7ba6960546dfe20f |
| #34 | 727e382eb296740863f2de52d7c928091ed4daf2 | 912ba6d0a6dad5172230450ce5b7c8c6ffdd189a |
| #35 | a552c13852c05a2ccecec028efe00eba948decc5 | 894571eb1630862aff999989fd299953351b29e4 |
| #36 | db9a4f0490a7962c52205a61f555ed8734db0806 | b3fc19e6c2c67fe14b1b8ca29f45da2af693dc5e |
| #37 | 52a02de8a8be6d79b7a5daeecd3fa03a9ec747af | f297e371934fe8770dc888dbebc3aaae85189817 |
| #38 | f8bc1066058f61efedfb87e161ae042dfee97d5f | dd67bfd27c34055296fc770b6ecde67e8bf315fb |
| #39 | 329a528ac3c2e3ffa2f3b0ea8a4a6b6801bff659 | 0c539f7ecc2de366c4abdd5fabf5c678e1673833 |
| #40 | 74f5a7e6d145d211315408ed972f38d971023cb6 | bee9645c758035b32f5c272840d0ed0993287fbe |
| #41 | 6fb9fa460c906ad113f4b75139383340f0d2134f | 66ee258c5c083565903b56724e4a38619a983465 |
| #42 | 3209bced3177a2acbe889a7797d3436b178962dd | fcf8828ecd025ce122204f54776cbb0a37ed03f8 |
| #43 | 0a417ad8bc3b5bfd3dc7d0009c85a8fe4d1c5443 | 5237e5760ac8fe3e7c91254c692149f14b129e75 |
| #44 | 62e998efeb6c31e009d94e5b930d23ea14a6c989 | 5c269925de318324abe371f8ab93d9767b2ec0e9 |

## Final integrated validation

Exact #44 head **62e998efeb6c31e009d94e5b930d23ea14a6c989** was independently reviewed with no major issues ([review](https://github.com/zaidshery/Lokswami-version-3/pull/44#issuecomment-6111769265)); all six addressed review threads are resolved. [CI run **38160098117**](https://github.com/zaidshery/Lokswami-version-3/actions/runs/38160098117), job **114531009080**, is completed/success. Its tree matches the merged foundation. PR #44 adds five documentation/evidence files; the actual isolated runtime candidate is the integrated product code after #43.

| Gate | Result |
| --- | --- |
| Full Vitest | **406 files / 3,388 tests passed** |
| Auth guards | **7 passed** |
| Synthetic credential cases | **8 passed** |
| Lint | **0 errors / 329 existing warnings** |
| Typecheck | Passed |
| Tracked dependency security floor | Passed |
| Production build | Passed; **175 pages** generated |
| Production Chromium browser smoke | **2 passed** |
| Publication guidance/guard focused checks | **5 suites / 43 cases passed** |
| PDF role SOP | Eight pages regenerated from corrected HTML and visually inspected |
| Full local test:ci before workspace maintenance | Passed on the same integrated tree; browser installed |

Configured-owner credentials were not available in the generic CI check; that configured-account check skipped. The eight synthetic cases are separate. R06's canonical Mongo-backed QA accounts and real browser checks must be recorded separately rather than calling synthetic tests live CMS acceptance.

Historical local browser failures were caused by the unavailable CDN download. Installing the official Chromium binary allowed the full local suite to pass. Workspace maintenance later removed the temporary runtime/logs; durable CI results and the evidence packet were recovered. The current QA runtime has been restored.

Earlier CI totals: #33 403/3362; #34 403/3366; #35 404/3375; #37 404/3369; #38/#39/#40 403/3366; #36 405/3379; #41 406/3386; #42 406/3387; #43 406/3388. Every merged PR passed its full applicable CI gates. R04's first run hit the unchanged Ftaftaf async assertion; rerun passed, and #40 separately repaired it.

## Changed files by PR

- #33: app/(reader)/main/search/SearchClient.tsx; tests/phase316b-search-category-latest.test.tsx; tests/search-live-content-authority.test.tsx.
- #34 and #42: lib/security/requestLogger.ts; tests/security-request-logger.test.ts; docs/b3/PHASE3_18C_R03_REQUEST_LOGGING.md.
- #35: middleware.ts; lib/auth/routeGuards.ts; tests/middleware-auth-failure.test.ts; docs/b3/PHASE3_18C_R04_AUTH_FAILURE.md.
- #36: .github/workflows/ci.yml; playwright.config.mjs; tests/e2e/admin-critical-flows.spec.js; tests/playwright-ci-contract.test.ts; docs/b3/PHASE3_18C_R07_BROWSER_CI.md.
- #37: app/(reader)/main/loading.tsx; app/(reader)/main/error.tsx; tests/reader-route-boundaries.test.tsx; docs/b3/PHASE3_18C_R10_READER_BOUNDARIES.md.
- #38: docs/b3/PHASE3_18C_R05_ROLE_RUNTIME_VERIFICATION.md.
- #39: docs/b3/PHASE3_18C_R09_GET_TELEMETRY_VERIFICATION.md.
- #40: tests/ftaftaf-live-content-authority.test.tsx.
- #41: lib/server/pdf/pdfRenderWorker.ts; lib/server/pdf/pdfWorker.ts; tests/pdf-worker-isolation.test.ts; docs/b3/PHASE3_18C_R08_REAL_CONTENT_VALIDATION.md.
- #44: docs/b3/PHASE3_18C_R06_ISOLATED_QA_VERIFICATION.md; docs/b3/evidence/R06_BROWSER_REPORT.json; docs/b3/evidence/R06_EDITORIAL_REPORT.json; docs/b3/evidence/R06_CAPTURE_RUNNER.txt; docs/b3/evidence/R06_EDITORIAL_CHECKS.txt.
- #43: lib/admin/roleWorkflowGuide.ts; tests/role-workflow-guide.test.ts; docs/LOKSWAMI_CMS_ROLE_SOP.md; docs/LOKSWAMI_CMS_ROLE_SOP.html; docs/LOKSWAMI_CMS_ROLE_SOP.pdf; docs/b3/PHASE3_18C_R05_ROLE_RUNTIME_VERIFICATION.md; docs/b3/CMS_LOCAL_QA_ACCESS_MATRIX.md.

## R08 evidence packet

Capture: 2026-10-11T11:10:44.791Z. Initial verification: 11:28:37.454Z. Source: https://lokswami.com; public reads only. Eight full articles across six categories, three breaking items, three videos, three shorts, two daily E-Papers and one monthly E-Magazine. Seventeen downloaded assets pass size/SHA-256 checks. Three YouTube thumbnails returned text/html in this environment and remain unavailable.

| Source PDF | Pages | Bytes |
| --- | ---: | ---: |
| Indore, 6aca0495308430529c579b17 | 12 | 7,285,234 |
| Mumbai, 6ac9f09f308430529c57939d | 8 | 14,451,800 |
| September magazine, 6ab67a054962ca75c38e8294 | 32 | 10,279,913 |

All PDFs are valid and unencrypted with matching page counts. Default PDF.js crashed on actual pages (SIGABRT/SIGSEGV); #41 contains one fresh PDFium retry after confirmed native child exit. The outer deadline/mutex remain active; a failed fallback is rejected. Six first/last pages render at width 1200 with a healthy idle parent and empty queue afterward. This does not validate all 52 pages or production performance.

The recovered archive was truncated and lacked its central directory. Complete entries were recovered only after CRC verification. All 17 source assets matched their original SHA-256. Four missing sample images were rerendered with the merged worker and match their original hashes; two intact images matched directly. The rebuilt archive is closed and passes every ZIP entry CRC. It includes the original manifest/verification, all source assets, six sample images and an explicit restoration report.

Mongo QA import of the full snapshot stopped on unavailable required video thumbnails. Article and publication scenarios import successfully; videos/shorts and actual provider playback remain acceptance gaps.

## R06 environment verification

Final successful run: **2026-10-11T17:28:21.348Z–2026-10-11T17:32:01.054Z**. The runner creates a fresh detached temporary checkout from actual committed source, performs **npm ci --offline --no-audit --no-fund** in a fresh dependency directory before loading application/browser packages, and records actual versions: Node **v20.20.2**, Next.js **15.5.22**, Playwright **1.62.1**. Installation and build lockfile hashes agree.

Actual runtime candidate: **5237e5760ac8fe3e7c91254c692149f14b129e75**; tracked tree: **fdb5e2151398f385a52ae4a6b53d256a67db811c**. Tracked staged/unstaged changes are compared against HEAD, and untracked/ignored build inputs checked before setup and before/after build with explicit exclusions recorded. Negative controls reject staged/unstaged changes, an untracked page and ignored .env.local; approved QA media is allowed. The fresh empty-output build passes **175 pages** with zero tracing-copy warnings.

Build ID: **JRsC-wxasffrhFCcmLJI4**. BUILD_ID SHA-256: **528f95e785e25b13c0bf445f561895979b7a278fbaafe07753acd2366a0d3695**. Build manifest SHA-256: **79bfe1a2549afbc410e251962817e822254ee4a9d4746d7abb4bebf7e3ca4d65**. Lockfile SHA-256: **8c66dd8d1d731a4a6beb17724b349d5f830b3e04dc014ac74c06fa3478e5fee2**. Runner SHA-256: **833731ff16fef22e846775b44580190f3f1196014c135b938c70bf64743fcc57**; editorial helper SHA-256: **e0d261d86d77f31a3fea6080ca7fb39fc0c42296047c85a23d63cc29f35ae993**. Both captured source hashes match the retained text. The helper is compiled from those exact hashed bytes; its hash appears in both reports.

Disposable loopback MongoDB has a fresh random initially empty QA database and four canonical accounts provisioned through the existing guarded cms:qa:provision command. Eight real source articles and three publications were seeded; one additional explicitly disposable article exercises the editorial lifecycle. External provider credentials are unset; social delivery is manual, publication automation/remote OCR disabled, Node outbound probe blocked before socket, and browser requests restricted to the exact loopback origin.

Four actual password sign-ins passed: Super Admin, Admin, Copy Editor and Reporter. Session roles match; publication API statuses are **200/403/403/403**, fatal page errors are empty, and **4 lastLoginAt writes** exist. All **18 actual API assertions** passed:

| Check group | Verified result |
| --- | --- |
| Public GET | Three reads preserve views and updatedAt |
| Reporter | Direct publication denied; owned draft creation/submission succeed; approval denied |
| Copy Editor | Admin assignment, assigned review, copy-edit and approval handoff succeed; Copy Editor approval denied |
| Admin | Approval/future schedule succeed; future article excluded; explicit publication makes it visible |
| Super Admin | Archive succeeds and excludes article from reader |

Draft visibility is denied as well. This covers one article API lifecycle, not full story/media/publication/manual UAT. Earlier overlapping retry results and the workspace ENOTEMPTY build failure are excluded. The captured runner/helper and sanitized reports are [versioned in merged #44](https://github.com/zaidshery/Lokswami-version-3/blob/5c269925de318324abe371f8ab93d9767b2ec0e9/docs/b3/PHASE3_18C_R06_ISOLATED_QA_VERIFICATION.md). Exact commands/prerequisites and remaining limitations are retained there. No actual passwords, auth secret values, password hashes, cookies or screenshots are published; artifact/source hashes are intentionally retained. Owned app/Mongo/browser processes were stopped. No production writes or deployment occurred.

## Remaining phases and gates

| Order | Phase | Remaining work |
| --- | --- | --- |
| 1 | 3.18C R06 / CMS acceptance | Expand the verified article API sample to ownership/assignment variants, story packages, changes requested, all editorial/media/publication controls and manual UI flows. Record actual failures and scoped fixes. |
| 2 | 3.18C reader acceptance | Mongo-backed reader/device checks, all relevant PDF/image paths, actual provider playback/captions, Hindi/English and light/dark; real iOS Safari/Android Chrome/desktop browser checks, NVDA/VoiceOver, zoom/reflow. |
| 3 | 3.18D migration / rollback | Full source backup, clearly isolated DB/media target; dry-run mappings, counts/hashes/slugs/links/publication metadata, backup restoration, rollback and idempotence rehearsal with operator runbook. |
| 4 | 3.18E staging soak | Configured isolated staging deployment, integrated manual/device acceptance, SEO/OG/sitemap, realistic load and performance/error monitoring; close launch blockers. |
| 5 | 3.19 production cutover | Preceding gates, final migration/configuration/packaging verification, actual hosting/domain access, approved release pipeline, monitoring and rollback readiness. |
| 6 | Phase 4 hardening | Production-evidence-driven resilience, capacity, caching, dependencies/security debt and performance. Numbered sub-phases are not defined. |
| 7 | Later product milestones | Separately define audience/distribution automation, assistive newsroom AI, monetization and native mobile apps. |

Observed launch blockers remain: no verified remote isolated staging project/storage configuration, full production backup/restore dataset or established production hosting/domain cutover resources. Local QA now resolves part of the former infrastructure gap; it does not establish remote staging readiness. Current verify:staging -- --env-only and verify:prod-env both fail on absent database/auth/site/storage configuration, with production also missing a cron secret. These identify missing local configuration, not a claim that the live site is misconfigured.

Roadmap targets: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1. LCP, INP and CLS field measurements, screen-reader checks and provider playback remain unmeasured. Historical log retention/access needs an operator-approved policy before deployment. Outdated roadmap status labels are not instructions to rebuild implemented phases.

## Completion checklist

- [x] R02 diagnosed, kept scoped, reviewed and merged after authorization.
- [x] Identified R03/R04/R05/R07/R08/R09/R10 technical scopes investigated; corrections or verification reviewed and merged green.
- [x] Recovered broader R03/R05 concerns corrected separately in #42/#43.
- [x] Final integrated CI green with 3,388 tests, build and two production browser smoke cases.
- [x] Corrected role SOP PDF generated and visually checked.
- [x] R06 identified; isolated DB, dependencies, fixtures and canonical accounts provisioned.
- [x] R08 source/media integrity verified and complete evidence archive rebuilt.
- [x] Four-role real password sign-in/session/publication read-access proof complete.
- [x] Eighteen actual authenticated article API/lifecycle/visibility assertions passed.
- [x] #44 final evidence reviewed on exact head, CI green, zero unresolved threads, five-file scope and guarded merge verified.
- [ ] Full CMS lifecycle and publication acceptance complete.
- [ ] Full reader/device/accessibility/provider/performance acceptance complete.
- [ ] Migration and rollback rehearsal complete.
- [ ] Staging soak and launch blockers closed.
- [ ] Production cutover complete.

The code corrections are merged and reviewable. This checkpoint does not claim all original audit acceptance criteria, subsequent phases or production readiness are complete.

## Report publication

This checklist is a documentation-branch snapshot of verified foundation 5c269925de318324abe371f8ab93d9767b2ec0e9. After the successful local QA run and evidence commit, the local execution service disconnected; local final synchronization and standalone checklist writeback could not be completed. The authoritative checklist is retained in Git, alongside the merged evidence reports. This does not alter the verified foundation or authorize a production deployment.
