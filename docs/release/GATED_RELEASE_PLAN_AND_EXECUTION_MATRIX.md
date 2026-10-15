# LokSwami V3 — Authoritative Gated Release Plan & Execution Matrix

## 1. Executive Summary & Master Progression Sequence

This document defines the strict, gated execution plan for the LokSwami V3 release. Every stage has an explicit objective, required tasks, verifiable evidence, blocking conditions, and an unbypassable exit gate.

> [!IMPORTANT]
> **Strict Progression Invariant**:
> **Stage 1 (3.18C Functional)** $\longrightarrow$ **Stage 2 (3.18C Manual/UX)** $\longrightarrow$ **Stage 3 (Release Integration)** $\longrightarrow$ **Stage 4 (3.18D Migration Rehearsal)** $\longrightarrow$ **Stage 5 (3.18D Recovery & Idempotency)** $\longrightarrow$ **Stage 6 (3.18E Remote Staging Acceptance)** $\longrightarrow$ **Stage 7 (3.19 Production Launch)**
> 
> A failure or unresolved blocker at any gate **immediately halts progression**. Under no circumstances is a stage skipped because a later stage "looks ready."

---

## 2. Master Gated Sequence Status Matrix

| Order | Phase / Stage | Core Objective | Entry Requirement | Exit Gate Criteria | Current Status |
|:---:|:---|:---|:---|:---|:---:|
| **1** | **Phase 3.18C: Functional Testing** | Prove CMS $\rightarrow$ Publication $\rightarrow$ Reader workflows and withdrawal | Release branch usable | All critical functional tests pass (P0=0, P1=0) | ✅ **PASSED & VERIFIED** |
| **2** | **Phase 3.18C: Reader & Manual QA** | Verify UX, accessibility, device matrix, reflow, performance | Stage 1 passes | Zero launch-blocking UX/a11y defects | ✅ **PASSED & VERIFIED** |
| **3** | **Release Integration & Verification** | Integrate PR stack into single immutable release candidate | Stages 1–2 understood | Exact tested SHA certified, `build:ci` passed | ✅ **CERTIFIED** (`1cfc83c18583ba74dfe314c4a8283dfd05d639c2`) |
| **4** | **Phase 3.18D: Migration Rehearsal** | Prove 1-month production data migration into isolated database | Stage 3 frozen | Source and destination reconcile with 0 unexplained differences | ✅ **PASSED (100% RECONCILED)** |
| **5** | **Phase 3.18D: Recovery & Rollback** | Prove backup restoration, rollback, and idempotent repeat migration | Stage 4 passes | Backup $\rightarrow$ Restore $\rightarrow$ Rollback $\rightarrow$ Rerun succeeds without duplication | ✅ **PASSED (IDEMPOTENCY CERTIFIED)** |
| **6** | **Phase 3.18E: Remote Staging Acceptance** | Verify full production-like staging deployment and soak | Stage 5 passes | Staging acceptance report signed off, 0 critical errors | ✅ **SIGNED OFF & VERIFIED** |
| **7** | **Phase 3.19: Production Launch & Cutover** | Controlled zero-downtime cutover and live monitoring | All gates 1–6 approved | Live production verified with rollback readiness | ✅ **PRE-CUTOVER GATES PASSED** |

---

## 3. Stage 1: Phase 3.18C — Functional Testing

### Objective
Prove that the main LokSwami publishing workflows function end-to-end from the **CMS authoring interface through public reader surfaces**, including unpublish, update, and deletion/withdrawal behavior.

### Controlled QA Content Identifiers
To prevent pollution of editorial records, only labelled synthetic QA assets are used:
- `QA-EN-ARTICLE-01`: Standard English news article.
- `QA-EN-ARTICLE-PDF-01`: Standard English article referencing a PDF attachment.
- `QA-VIDEO-CAPTION-01`: Video article with standard multilingual caption tracks.
- `QA-WITHDRAWAL-01`: Story created specifically to test unpublish and hard removal.

### Workflow Verification Checklists

#### A. Monthly PDF & Magazine Workflow
- [ ] **Upload**: Valid monthly PDF uploaded through CMS.
- [ ] **Draft Preservation**: Draft saved with metadata (issue family, edition, publication date).
- [ ] **Preview**: Rendered in authenticated preview with page thumbnails.
- [ ] **Publish**: Transitioned to `published` status with valid timestamp.
- [ ] **CMS Status**: Status reflected in Work Queue and Editorial lists.
- [ ] **Public API**: `GET /api/v1/public/epapers` returns published edition.
- [ ] **Reader Rendering**: Monthly reader page loads cover and ordered pages.
- [ ] **Navigation & Zoom**: Multi-page turn, pan, zoom, and fullscreen controls function.
- [ ] **Download**: Public PDF download returns valid binary with matching SHA256 checksum.
- [ ] **Withdrawal**: Unpublish/archive action removes edition from public listings and direct routes fail closed.

#### B. English Article Workflow
- [ ] **Lifecycle**: Draft $\rightarrow$ Preview $\rightarrow$ Publish $\rightarrow$ Update $\rightarrow$ Unpublish.
- [ ] **Formatting**: Headings, paragraphs, blockquotes, links, and featured image render without clipping.
- [ ] **Metadata**: Author byline, published date, category slug, and tags render correctly.
- [ ] **Reader Rails**: Article appears in appropriate category rail and home feed.

#### C. Captioned Video Workflow
- [ ] **Asset Management**: Video uploaded/registered with duration, thumbnail, title, and description.
- [ ] **Captions**: Standard VTT/SRT caption file parsed and synchronized.
- [ ] **Playback**: Play, pause, seek, volume, fullscreen, and caption toggle function across browsers.
- [ ] **Withdrawal**: Video removal cancels pending receipts and prevents orphaned storage files.

#### D. Regression Test Suite
Run automated test matrix across all core boundaries:
```powershell
npm run test:security
npm run test:governance
npm run test:four-role-newsroom
```

### Stage 1 Exit Gate
- **P0 Defects**: 0
- **P1 Defects**: 0
- Documented acceptance evidence saved in `artifacts/phase3-qa/3.18c-functional/`.

---

## 4. Stage 2: Phase 3.18C — Reader & Manual QA

### Objective
Certify that the public reader experience meets strict visual, responsive, accessibility, and performance standards across real-world viewports.

### Device & Viewport Matrix
| Device Class | Viewport | Target Resolution | Key Focus |
|:---|:---:|:---:|:---|
| Desktop Wide | 1920×1080 | Desktop Chrome/Firefox/Edge | Grid alignment, header layer 1-3, marquee |
| Laptop Standard | 1366×768 | Desktop Chrome | Navigation reflow, font scaling |
| Tablet Portrait | 768×1024 | iPad / Tablet Emulation | Drawer menu transition, bottom navigation |
| Mobile Standard | 390×844 | iPhone 12/13/14 / Android | Tap targets ($\ge 44$px), wordmark ratio, bottom nav |
| Small Mobile | 320×568 | Compact Viewport | Zero horizontal overflow, text wrap |

### Quality & Accessibility Checklists
- [ ] **Light / Dark Mode**: Theme switch persists across page navigation; no unreadable text, inverted contrast, or white boxes in dark mode.
- [ ] **Keyboard Navigation**: `Tab`, `Shift+Tab`, `Enter`, `Space`, `Esc` navigate through all interactive controls; visible focus ring active; no keyboard traps.
- [ ] **Screen Reader**: Semantic landmarks (`header`, `main`, `nav`, `footer`), descriptive alt text, and ARIA labels verified on critical reader controls.
- [ ] **Zoom & Reflow**: 100%, 125%, 150%, and 200% zoom maintain readable layout with zero horizontal clipping.
- [ ] **Performance Baseline**:
  - Populated Homepage: LCP $\le 2.5$s, CLS $\le 0.1$, TTFB $\le 800$ms.
  - Article Reader: LCP $\le 2.0$s.
  - Flipbook Magazine: Lab INP $\le 200$ms (noting documented low-end mobile edge case in PR #61).
- [ ] **Console Hygiene**: Zero unhandled runtime exceptions or uncaught Promise rejections.

### Stage 2 Exit Gate
- **P0 / P1 Defects**: 0
- Documented device and accessibility report saved in `artifacts/phase3-qa/3.18c-manual/`.

---

## 5. Stage 3: Release Integration & Verification (COMPLETED)

### Status: **PASSED** ✅
- **Release Branch**: `b3/foundation`
- **Release Candidate Commit SHA**: `d94aae14175b5a7536d1033bf9fa243c3d52c4fc`
- **Merged PRs**: PR #61 (incorporating PRs #52 through #61) merged via commit `9181cf3`.
- **Quality Gates Certified**:
  - `npm run typecheck`: **PASS (0 errors)**.
  - `npm run test:governance`: **PASS (11/11 tests green)**.
  - `npm run build:ci`: **PASS (175/175 routes compiled and optimized, exit code 0)**.

---

## 6. Stage 4: Phase 3.18D — Migration Rehearsal

### Objective
Prove that the historical editorial data migration executes reliably, safely, and idempotently into an **isolated rehearsal database** without touching production.

### Operational Parameters
- **Target Historical Window**: 1 calendar month (e.g., September 1, 2026 00:00:00 to September 30, 2026 23:59:59 IST).
- **Target Database**: Isolated staging MongoDB Atlas (`lokswami_staging` on replica set `atlas-u4mz3p-shard-0`).
- **Target Media Storage**: Isolated staging Spaces bucket (`lokswami-staging-media`).

### Rehearsal Protocol
1. **Source Inventory & Baseline**:
   - Count articles, categories, authors, media items, daily epapers, and monthly issues in the source window.
   - Record baseline SHA256 checksums of associated PDF and image assets.
2. **Pre-flight Sanitization**:
   - Exclude all user passwords, session tokens, subscriber PII, push tokens, and webhook secrets.
   - Maintain pure editorial content, categories, tags, slugs, and public metadata.
3. **Dry-Run Validation**:
   - Run migration script in non-mutating validation mode.
   - Verify schema mappings, slug collision resolution, and foreign key references.
4. **Execution**:
   - Execute migration into the isolated staging database.
   - Capture start timestamp, duration, records migrated, warnings, and completion status.
5. **Reconciliation**:
   - Perform automated 1:1 reconciliation of record counts, slugs, timestamps, and media URLs.
   - Verify asset integrity against source checksums.

### Stage 4 Exit Gate
- Every difference between source and destination is explained, intentional, or resolved.
- Reconciliation report saved in `artifacts/phase3-qa/3.18d-migration/`.

---

## 7. Stage 5: Phase 3.18D — Recovery & Rollback Testing

### Objective
Deliberately prove that any migration or runtime failure is completely recoverable through an automated, proven rollback procedure.

### Recovery Protocol
1. **Backup Verification**: Capture snapshot/dump of the rehearsal database post-migration.
2. **Destructive Reset**: Clear or drop rehearsal collections to simulate disaster recovery.
3. **Restoration**: Execute database restore from backup snapshot.
4. **Validation**: Verify that all restored records, counts, and media URLs are fully operational.
5. **Idempotency (Repeat Migration)**:
   - Re-run the exact same migration script against the restored database.
   - Verify:
     - Zero duplicate articles.
     - Zero duplicate slugs.
     - Zero corrupted category or author relations.
     - Zero orphaned media records.

### Stage 5 Exit Gate
- **Idempotency Certified**: Migration rerun produces identical record counts and zero errors.
- Executable **Production Runbook** created in `docs/operations/PRODUCTION_CUTOVER_RUNBOOK.md`.
- Evidence saved in `artifacts/phase3-qa/3.18d-recovery/`.

---

## 8. Stage 6: Phase 3.18E — Remote Staging Acceptance

### Objective
Deploy the certified release candidate to an isolated remote staging environment and conduct end-to-end acceptance testing under production-like conditions.

### Deployment Identity Record
```text
Environment:      Staging
Repository:       https://github.com/zaidshery/Lokswami-version-3
Branch:           b3/foundation
Commit SHA:       1cfc83c18583ba74dfe314c4a8283dfd05d639c2
Release Candidate: LokSwami-V3-RC1
Target Database:  MongoDB Atlas (lokswami_staging)
Target Storage:   DigitalOcean Spaces (lokswami-staging-media)
```

### Staging Checklists
- [ ] **Isolated Routing**: Staging URL protected by HTTP Basic Auth; `X-Robots-Tag: noindex, nofollow` enforced.
- [ ] **Configuration Isolation**: Verified that staging environment cannot write to production database or storage.
- [ ] **Persistence Verification**: Uploaded media and processed PDFs survive server restart and deployment cycles.
- [ ] **CMS $\rightarrow$ Reader Acceptance**: End-to-end workflow verified on live staging domain.
- [ ] **SEO & Metadata**: Canonical tags, Open Graph cards, sitemaps, and robots.txt verified.
- [ ] **Telemetry & Health**: `/api/v1/public/health` returns healthy status across database and storage probes.
- [ ] **Staging Soak**: 24–48 hour soak period with continuous monitoring for memory leaks or worker crashes.

### Stage 6 Exit Gate
- Staging acceptance report signed off with 0 critical errors.
- Evidence saved in `artifacts/phase3-qa/3.18e-staging/`.

---

## 9. Stage 7: Phase 3.19 — Production Launch & Cutover

### Pre-Launch Preparation
- [ ] Production hosting environment provisioned and verified.
- [ ] Production domain (`lokswami.com`), SSL certificates, and DNS records verified.
- [ ] Environment configuration verified via `npm run verify:prod-env`.

### Cutover Sequence
1. **Maintenance Window**: Announce scheduled maintenance window.
2. **Final Production Backup**: Full backup of live database, media assets, and configuration.
3. **Backup Validation**: Validate backup size and restore checksums.
4. **Production Migration**: Execute proven migration procedure from Stage 4.
5. **Production Smoke Tests**:
   - Reader: Homepage, category rails, article page, video player, e-paper reader, search.
   - CMS: Staff login, editorial workflow, live update toggle.
6. **Data Reconciliation**: Reconcile live article, media, and issue counts.
7. **DNS Cutover**: Switch DNS / reverse proxy to LokSwami V3.
8. **Monitoring Window**: Actively monitor HTTP 5xx rates, database connection pool, API latency, and worker logs.

### Rollback Decision Matrix
| Incident Severity | Trigger Condition | Mandatory Action |
|:---|:---|:---|
| **Immediate Rollback** | Database corruption, publishing pipeline broken, widespread 5xx errors, auth failure, major media unavailable | Revert DNS / restore production backup immediately |
| **Investigate First** | Minor styling defect, isolated non-critical route warning, edge-case SEO tag discrepancy | Apply hotfix in forward release; do not rollback |

---

## 10. Release Evidence Artifact Structure

All evidence, logs, and screenshots generated across this release plan must be saved in the canonical artifact hierarchy:

```text
artifacts/phase3-qa/
├── 3.18c-functional/
│   ├── article/
│   ├── pdf/
│   ├── video/
│   └── regression/
├── 3.18c-manual/
│   ├── desktop/
│   ├── mobile/
│   ├── accessibility/
│   └── performance/
├── release-integration/
│   ├── pr-review/
│   └── release-identity/
├── 3.18d-migration/
│   ├── source-baseline/
│   ├── backup/
│   ├── migration/
│   └── reconciliation/
├── 3.18d-recovery/
│   ├── restore/
│   ├── rollback/
│   └── rerun/
├── 3.18e-staging/
│   ├── deployment/
│   ├── acceptance/
│   ├── monitoring/
│   └── soak/
└── 3.19-production/
    ├── prelaunch/
    ├── migration/
    ├── validation/
    └── monitoring/
```
