# LOKSWAMI B3 — PHASE 3.9 IMPLEMENTATION PLAN
## E-Paper CMS + Ingestion + Processing Foundation

- **Status:** APPROVED & LOCKED
- **Branch:** `b3/phase3.9-epaper`
- **Starting HEAD:** `b591440`
- **Integration Base:** `b3/foundation` (`b591440`)
- **Authoritative Audit:** [`docs/b3/PHASE3_9_EPAPER_AUDIT.md`](file:///c:/Dev/Lokswami-version-3/docs/b3/PHASE3_9_EPAPER_AUDIT.md)
- **Primary Objective:** Build a bulletproof, secure administrative foundation for daily E-Paper publication, closing all identified P0 vulnerabilities (draft immutability, upload finalization guards, actor-bound receipts), hardening background PDF processing, and enforcing publication integrity.
- **Strict Boundary:** Public reader experience, interactive zoom/pan canvas, public article clipping modal, reader bookmarks, and E-Magazine UI are strictly deferred to **Phase 3.15**.

---

## 1. Phase Objective

Phase 3.9 delivers the complete, secure backend and administrative lifecycle for Lokswami's daily city-based E-Paper editions. This phase governs:
1. **Secure Ingestion & Asset Receipts:** Actor-bound pre-signed direct DigitalOcean Spaces uploads, strict PDF validation, and cryptographic upload receipt verification.
2. **Draft Immutability & Revisions:** Enforced immutability for published and archived editions, guaranteeing live content cannot be modified in place.
3. **Background PDF Rasterization:** Worker-isolated page rendering via `worker_threads`, `@napi-rs/canvas`, and `pdfjs-dist` with single-canvas mutex, memory guards, hang termination recovery, and idempotent retries.
4. **Local Hindi/English OCR Engine:** Non-blocking child-process OCR suggestions via local `tesseract.js` with human editorial review.
5. **Publication Invariants & Quality Readiness:** Authoritative publication gates preventing incomplete, corrupt, or unreviewed editions from going live.
6. **Strict RBAC Enforcement:** Preserving exclusive `super_admin` control over E-Paper CMS operations.

---

## 2. Baseline

- **Repository:** `C:\Dev\Lokswami-version-3`
- **GitHub:** `zaidshery/Lokswami-version-3`
- **Integration Base:** `b3/foundation` (`b591440`)
- **Current Feature Branch:** `b3/phase3.9-epaper` (`b591440`)
- **Baseline CI Suite:** 291 test files, 1,859 tests passing cleanly.
- **Pre-existing QA Artifact:** Staging edition `6ab0da70c6aab6a2a6cab44e` (`Lokswami 21 september 2026.pdf`, 8 pages, `2099-12-31`, `draft`/`draft_upload`). Must remain 100% untouched throughout all implementation and testing.

---

## 3. Audit Summary

The Phase 3.9 audit confirmed that Lokswami already has a mature Workflow V3 foundation for E-Paper (`lib/models/EPaper.ts`, `lib/models/EPaperProcessingJob.ts`, `lib/server/pdf/pdfWorker.ts`, `lib/storage/epaperAssetUpload.ts`, `lib/server/epaperOcrJobs.ts`). Rather than greenfield development, Phase 3.9 focuses on hardening security boundaries, locking down draft immutability, eliminating upload spoofing, and ensuring publication integrity.

---

## 4. P0 Merge Blockers

All three P0 findings from the audit must be fully closed and verified by automated tests before Phase 3.9 can merge:

### **P0-1: Published Edition Immutability (`assertEpaperDraftEditable`)**
- **Vulnerability:** `assertEpaperDraftEditable` was previously disabled with a no-op `return;` statement in `lib/server/epaperWorkflowPolicy.ts`, permitting direct modifications to published edition pages, hotspots, metadata, and assets without creating a draft revision.
- **Remediation:** Restore a centralized, strict `assertEpaperDraftEditable` check across all mutation routes. Published and archived editions are strictly immutable. Any modification to live published content requires creating a new revision (`POST /api/admin/epapers/[id]/revisions`).

### **P0-2: Upload Finalization on Published Editions**
- **Vulnerability:** `epaperUploadService.finalize` (`POST /api/admin/epapers/[id]/uploads/finalize`) accepted an `id` parameter without verifying that the edition is in `draft` status and `draft_upload` production status. An administrator could inadvertently or maliciously finalize a new PDF against an existing published edition, wiping pages and triggering re-rasterization on live content.
- **Remediation:** Enforce that `finalize` verifies `status === 'draft'` and `productionStatus === 'draft_upload'`. Reject replacement attempts against published editions with HTTP 409 Conflict.

### **P0-3: Upload Receipt / Actor Binding**
- **Vulnerability:** Current asset verification in `verifyEpaperAssetUpload` inspects object existence in Spaces, file size, and MIME type, but does not bind the upload intent to the initiating administrator's session ID or the specific target edition/revision ID. A client could potentially finalize an asset initialized by another admin or for a different edition.
- **Remediation:** Establish a durable, signed upload receipt contract in `epaperAssetUpload.ts` binding `uploadId`, `epaperId`, `revisionNumber`, `actorId`, `objectKey`, `fileSize`, `contentType`, and `expiresAt`. Finalization must verify all bounds before consuming the receipt.

---

## 5. P1 Mapping

| Audit Finding | Subphase | Planned Resolution |
| :--- | :---: | :--- |
| **Draft Logical Uniqueness Race** | **3.9A** | Implement logical uniqueness validation and an atomic claim/mutex in `epaperUploadService.initialize` and `epaperEditorialService.create` to prevent concurrent duplicate draft creation for the same `(publicationType, citySlug, publishDate)`. |
| **`publishBlockers` Incomplete in Quality Summary** | **3.9C** | Update `buildEpaperEditionQualitySummary` to populate `publishBlockers` directly from authoritative readiness checks, ensuring editorial QA summaries match publication gates. |
| **RBAC Delegation to `admin`/`copy_editor`** | **DEFERRED** | **Classified as DEFERRED / POLICY DECISION REQUIRED.** In strict alignment with canonical Lokswami policy, E-Paper CMS remains strictly locked to `super_admin`. No role widening will be implemented in Phase 3.9. |

---

## 6. P2 / Deferred Items

- **P2-1: Localized Page-Image Alt Text Generator:** Provide automated localized alt text (e.g., "Lokswami Indore Edition, 25 September 2026, Page 1") in `buildEpaperPageQualitySignal`. Scheduled for **3.9E** if trivial, otherwise deferred to Phase 3.15.
- **P2-2: Optimistic Concurrency Control on Edition Metadata:** Add document versioning (`__v` or `casVersion`) for metadata edits. Scheduled for **3.9C**.
- **Role Widening:** Deferred pending product leadership SOP approval.
- **Public Reader UX (Phase 3.15):** Zoom/pan canvas, clipping modal, filmstrip, client-side bookmarks, and reader offline caching.

---

## 7. Architecture Principles

1. **Direct Storage Streaming:** PDFs and page images stream directly between browser and DigitalOcean Spaces; Next.js server memory is never used as a file buffer.
2. **Worker Isolation & Mutex Concurrency:** Heavy PDF canvas rasterization runs in dedicated Node.js `worker_threads` with a global single-canvas mutex (`acquireCanvasLock`) and memory pressure checks (`checkMemoryPressure`).
3. **Atomic Revision Switching:** Multiple revisions of an edition share a single `familyId`. Only one revision may have `isCurrentRevision: true` and `status: 'published'` at any time. Switching current revisions is atomic.
4. **Reference-Safe Cleanup:** Asset deletion uses Phase 3.8A reference-safe deletion patterns. Live published assets are never deleted when a draft revision is created or deleted.
5. **No Cloud OCR:** Background text extraction runs exclusively through local child-process workers (`tesseract.js`) with bounded memory and timeouts.

---

## 8. Canonical E-Paper Lifecycle

```
[ 1. Ingestion ]
    │  - POST /api/admin/epapers/uploads (Direct Spaces pre-signed target)
    │  - Client direct streaming to Spaces
    │  - POST /api/admin/epapers/[id]/uploads/finalize (Receipt + PDF verification)
    ▼
[ 2. draft_upload ]
    │  - EPaperProcessingJob queued
    │  - Leased by Background Worker (Hostinger Cron / run-due)
    ▼
[ 3. Background Processing ]
    │  - Worker isolation (worker_threads + @napi-rs/canvas)
    │  - Mutex: at most 1 canvas render at a time
    │  - Page-by-page rendering -> upload to Spaces
    │  - Automatic Page 1 thumbnail selection
    ▼
[ 4. pages_ready ]
    │  - All pages rendered successfully
    │  - Optional local OCR proposed (EPaperOcrSuggestion)
    ▼
[ 5. ocr_review / hotspot_mapping ]
    │  - Admin reviews page classifications (editorial, ad, classified, photo, blank)
    │  - Interactive article hotspots mapped and saved (EPaperArticle)
    ▼
[ 6. ready_to_publish ]
    │  - Authoritative readiness blockers = 0
    │  - Thumbnail present, PDF verified, all pages ready, blank pages classified
    ▼
[ 7. published ]
    │  - Super Admin executes publication (PATCH /api/admin/epapers/[id])
    │  - isCurrentRevision set to true, prior revisions set to false
    │  - Immediately live on /api/v1/public/epapers
    ▼
[ 8. Revision / Archive ]
    ├─► New PDF needed? -> POST /api/admin/epapers/[id]/revisions -> Returns to [ 2 ]
    └─► Edition retired? -> productionStatus: 'archived'
```

---

## 9. Edition, Family, and Revision Identity

- **Logical Edition Identity:** Defined by `(publicationType, citySlug, publishDate)`.
  - `publicationType`: `'epaper'` (daily) or `'emagazine'` (monthly).
  - `citySlug`: e.g. `'indore'`, `'bhopal'`, or `'global'`.
  - `publishDate`: UTC midnight Date (`YYYY-MM-DDT00:00:00.000Z`).
- **Family Identity (`familyId`):** UUID string grouping all revisions of a specific logical edition.
- **Revision Number (`revisionNumber`):** Sequential integer starting at `1` and incrementing on each revision creation.
- **Current Revision (`isCurrentRevision`):** Boolean. Only one revision per logical edition family may have `isCurrentRevision: true` and `status: 'published'`.

---

## 10. Subphase Detailed Plans

### **Phase 3.9A — Ingestion Security, Draft Immutability & Asset Receipts**
- **Objective:** Close P0-1, P0-2, and P0-3; secure upload receipts; enforce draft immutability.
- **Deliverables:**
  1. Restore `assertEpaperDraftEditable` in `lib/server/epaperWorkflowPolicy.ts`:
     - Throw `EpaperConflictError('Published editions are immutable. Create a new revision to make changes.')` if `status === 'published'`.
     - Throw `EpaperConflictError('Archived editions are immutable.')` if `productionStatus === 'archived'`.
  2. Protect `epaperUploadService.finalize`:
     - Verify `paper.status === 'draft'` and `paper.productionStatus === 'draft_upload'`.
     - Prevent PDF replacement against published editions.
  3. Implement Signed Upload Receipts (`lib/storage/epaperAssetUpload.ts`):
     - Issue HMAC-signed upload receipts during `POST /api/admin/epapers/uploads` and `init`.
     - Validate receipt signature, actor ID, edition ID, and expiry in `finalize` and `complete`.
  4. Concurrent Draft Creation Guard:
     - Implement atomic check-and-create in `epaperUploadService.initialize` to prevent duplicate draft documents for the same logical edition.
- **Files Modified:**
  - `lib/server/epaperWorkflowPolicy.ts`
  - `lib/server/epaper/epaperUploadService.ts`
  - `lib/storage/epaperAssetUpload.ts`
  - `lib/server/epaper/epaperPageService.ts`
  - `lib/server/epaper/epaperEditorialService.ts`
- **Tests Added/Updated:**
  - `tests/epaper-draft-immutability.test.ts`
  - `tests/epaper-upload-receipt-security.test.ts`
  - `tests/epaper-draft-concurrency.test.ts`

### **Phase 3.9B — Processing Lifecycle & Page Generation Hardening**
- **Objective:** Strengthen the asynchronous worker pipeline, claim leases, crash recovery, and error resilience without altering the underlying `worker_threads` + `@napi-rs/canvas` architecture.
- **Deliverables:**
  1. Transition Validation: Enforce strict state machine transitions on `EPaperProcessingJob`.
  2. Crash & Timeout Recovery:
     - Verify expired leases (`leaseExpiresAt < now`) are safely reclaimed by the next cron runner.
     - Validate that hung worker threads are terminated cleanly via `boundary.terminate()` without leaking memory or leaving canvas locks unreleased.
  3. Failed Page Retry Isolation:
     - Ensure `POST /api/admin/epapers/[id]/processing/retry` queues retries only for missing or failed pages (`resolveRetryableEpaperPageNumbers`).
     - Confirm successful page outputs are never overwritten or deleted during retries.
  4. Resource Ceiling Enforcement: Verify canvas dimensions, max pages (1000), and PDF byte boundaries (25MB).
- **Files Modified:**
  - `lib/server/epaperProcessingJobs.ts`
  - `lib/server/pdf/pdfWorker.ts`
  - `lib/server/pdf/pdfRenderWorker.ts`
  - `lib/server/epaperPdfRenderer.ts`
- **Tests Added/Updated:**
  - `tests/epaper-processing-resilience.test.ts`
  - `tests/pdf-render-mutex-safety.test.ts`
  - `tests/pdf-worker-isolation.test.ts`

### **Phase 3.9C — Edition Workflow, Quality Signals & Publication Integrity**
- **Objective:** Ensure publication is impossible unless all quality blockers are resolved; guarantee atomic revision publishing.
- **Deliverables:**
  1. Authoritative Blocker Alignment:
     - Update `buildEpaperEditionQualitySummary` in `lib/utils/epaperQualitySignals.ts` to populate `publishBlockers` directly from `buildEpaperReadiness` blockers.
     - Enforce blockers in `epaperEditorialService.updateWorkflow` before allowing transition to `ready_to_publish` or `published`.
  2. Atomic Current Revision Switch:
     - Ensure `epaperRepository.publishEdition` updates `status: 'published'`, `isCurrentRevision: true`, and `publishedAt: new Date()` on the target revision, while setting `isCurrentRevision: false` on all other revisions of the family in a single atomic transaction/operation.
  3. Revision Asset Cloning:
     - Verify `epaperRevisionService.create` copies existing page metadata, article hotspots, and manual TTS assets without referencing mutable drafts.
  4. Optimistic Concurrency Control:
     - Add revision checks on metadata updates (`PUT /api/admin/epapers/[id]`).
- **Files Modified:**
  - `lib/utils/epaperQualitySignals.ts`
  - `lib/utils/epaperAdminReadiness.ts`
  - `lib/server/epaper/epaperEditorialService.ts`
  - `lib/server/epaper/epaperRepository.ts`
  - `lib/server/epaper/epaperRevisionService.ts`
- **Tests Added/Updated:**
  - `tests/epaper-publication-invariants.test.ts`
  - `tests/epaper-revision-atomicity.test.ts`

### **Phase 3.9D — OCR Coordination, Recovery, Cleanup & Observability**
- **Objective:** Harden local OCR suggestion processing, reference-safe asset cleanup, abandoned draft sweeper, and structured audit logging.
- **Deliverables:**
  1. Local OCR Coordination:
     - Validate `queueEpaperOcr` and `processQueuedEpaperOcrJobs`. Ensure OCR suggestions are idempotently fingerprinted (`sourceKey` + `title` + `hotspot`) and deduplicated.
     - Guarantee OCR runs strictly in local child processes without external cloud network requests.
  2. Reference-Safe Deletion & Cleanup:
     - In `epaperEditorialService.delete`, verify assets are deleted only if no other revision or edition references them.
     - Review `cleanupAbandonedEpaperUploads` to purge drafts older than 24h that never finalized uploads, without touching active or published revisions.
  3. Structured Observability:
     - Verify `logEpaperMetric` outputs standardized JSON events (`epaper_upload_initiated`, `epaper_upload_finalized`, `epaper_processing_queued`, `epaper_processing_completed`, `epaper_processing_failed`, `epaper_published`, `epaper_archived`).
     - Ensure zero secrets, signed URLs, or session tokens are logged.
  4. RBAC Audit: Verify all routes deny non-`super_admin` actors.
- **Files Modified:**
  - `lib/server/epaperOcrJobs.ts`
  - `lib/server/epaperLocalOcr.ts`
  - `lib/server/epaperActivity.ts`
  - `lib/server/epaperObservability.ts`
  - `lib/server/epaperProcessingJobs.ts`
- **Tests Added/Updated:**
  - `tests/epaper-ocr-lifecycle.test.ts`
  - `tests/epaper-cleanup-safety.test.ts`
  - `tests/epaper-observability-audit.test.ts`

### **Phase 3.9E — Final QA, Newsroom RBAC Regression & Phase 3.15 Reader Contract**
- **Objective:** Comprehensive testing, responsive/accessibility validation of admin desk, four-role RBAC verification, and freezing the public reader API contract.
- **Deliverables:**
  1. Admin UX & Responsiveness:
     - Audit `/admin/epapers`, `/admin/epapers/new`, `/admin/epapers/[id]`, and `/admin/epapers/[id]/page/[pageNumber]` across 1440x900, 768x1024, and 390x844 viewports.
     - Verify accessible labels, focus rings, progress indicators, and confirmation dialogs.
  2. Four-Role RBAC Regression:
     - Run `tests/api/admin-epaper-role-guard.test.ts` proving `super_admin` is allowed and `admin`, `copy_editor`, `reporter` are strictly denied.
  3. Phase 3.15 Public Reader Contract:
     - Validate `GET /api/v1/public/epapers`, `GET /api/v1/public/epapers/latest`, and `GET /api/public/epapers/[id]/pdf`.
     - Guarantee public APIs return only `status === 'published'` and `isCurrentRevision === true` records with sequentially ordered pages.
  4. Full CI Validation: Pass `npm run test:ci` and `npm run build:ci`.
- **Files Modified:**
  - `app/(admin)/admin/epapers/page.tsx`
  - `app/(admin)/admin/epapers/[id]/page.tsx`
  - `tests/phase39-four-role-acceptance.test.ts`
  - `tests/phase39-reader-contract.test.ts`

---

## 11. Dependency Graph

```
[ Phase 3.9A: Ingestion Security & Draft Immutability ]
                 │
                 ▼
[ Phase 3.9B: Processing Lifecycle & Worker Hardening ]
                 │
                 ▼
[ Phase 3.9C: Edition Workflow & Publication Integrity ]
                 │
                 ▼
[ Phase 3.9D: OCR, Cleanup, Recovery & Observability ]
                 │
                 ▼
[ Phase 3.9E: Final QA, RBAC Regression & Reader Contract ]
```

---

## 12. Expected Files and Systems

### Core Domain & Ingestion
- `lib/server/epaperWorkflowPolicy.ts` — Central immutability guards (`assertEpaperDraftEditable`, `invalidateEpaperQa`).
- `lib/storage/epaperAssetUpload.ts` — Direct upload targets, asset validation, signed receipt verification.
- `lib/server/epaper/epaperUploadService.ts` — Upload initialization, PDF verification, page count probing, job enqueueing.
- `lib/server/epaper/epaperEditorialService.ts` — Metadata CRUD, workflow state machine, publication execution.
- `lib/server/epaper/epaperPageService.ts` — Page image assignment, classification, review statuses.
- `lib/server/epaper/epaperRevisionService.ts` — Revision cloning and asset duplication.

### Processing & Worker Threads
- `lib/server/epaperProcessingJobs.ts` — Job queueing, atomic claims, leases, retry delays, sweeper.
- `lib/server/pdf/pdfWorker.ts` — Worker mutex queue (`acquireCanvasLock`), hang recovery, lifecycle.
- `lib/server/pdf/pdfRenderWorker.ts` — Isolated Node.js worker execution boundary.
- `lib/server/epaperPdfRenderer.ts` — Buffer download, PDF signature validation, JPEG rasterization.
- `lib/server/epaperImageAutomation.ts` — Thumbnail automation and page completion triggers.

### OCR & Quality Readiness
- `lib/server/epaperOcrJobs.ts` — Background OCR queue and MongoDB lease coordinator.
- `lib/server/epaperLocalOcr.ts` — Isolated Tesseract child process runner.
- `lib/utils/epaperAdminReadiness.ts` — Asset readiness and blocker calculations.
- `lib/utils/epaperQualitySignals.ts` — Per-page health signals and publication blockers.

### Admin Surfaces
- `app/(admin)/admin/epapers/page.tsx` — Edition desk list.
- `app/(admin)/admin/epapers/new/page.tsx` — Creation form.
- `app/(admin)/admin/epapers/[id]/page.tsx` — Production workspace.
- `app/(admin)/admin/epapers/[id]/page/[pageNumber]/page.tsx` — Hotspot mapping canvas.

---

## 13. Data, Schema, and Index Implications

1. **`EPaper` Collection:**
   - Index `{ publicationType: 1, citySlug: 1, publishDate: 1, isCurrentRevision: 1 }` (unique, partial for `status: 'published'`) remains canonical.
   - Index `{ familyId: 1, revisionNumber: 1 }` (unique) ensures no duplicate revision numbers within a family.
   - Compound index `{ publicationType: 1, citySlug: 1, publishDate: 1, status: 1 }` to support draft uniqueness lookups.
2. **`EPaperProcessingJob` Collection:**
   - Index `{ status: 1, nextAttemptAt: 1, createdAt: 1 }` ensures fast, prioritized worker claims.
   - Index `{ epaperId: 1, createdAt: -1 }` for admin monitoring.
   - Index `{ sourceKey: 1 }` (unique, partial for `kind: 'ocr'`) guarantees zero duplicate OCR runs for the same page version.

---

## 14. Storage Trust Model

- **Direct Browser Uploads:** Browser PUT directly to DigitalOcean Spaces via signed pre-authorized URLs. No PDF bytes touch the Node.js API server during upload.
- **Verification Gate:** `verifyEpaperAssetUpload` verifies object presence, size, and content-type before any database record is finalized.
- **Restricted Key Hierarchy:**
  - PDFs: `lokswami/epapers/{citySlug}/{YYYY-MM-DD}/pdf/...`
  - Thumbnails: `lokswami/epapers/{citySlug}/{YYYY-MM-DD}/thumbnail/...`
  - Rendered Pages: `lokswami/epapers/{citySlug}/{YYYY-MM-DD}/revision-{rev}-{id}/pages/...`
- **Key Injection Prevention:** Regex validation in `assertValidEpaperAssetKey` rejects any attempt to traverse directories or reference arbitrary S3 paths.

---

## 15. Processing Claim & Lease Model

- **Distributed Lock:** Cron invocations acquire `lock:epaper-job-worker` with 120s TTL to prevent concurrent runner collisions.
- **Worker Claims:** Atomic `findOneAndUpdate` sets `status: 'processing'`, generates unique `leaseOwner`, and sets `leaseExpiresAt: now + 10m`.
- **Worker Isolation:** Each page renders inside a dedicated thread with heap checks. Mutex ensures strictly 1 canvas render at a time.
- **Hang Recovery:** Workers failing to settle within 45 seconds are killed forcibly via `worker.terminate()`, releasing mutex locks and recycling worker state.

---

## 16. OCR Model

- **Local Engine Only:** `scripts/epaper-local-ocr-worker.cjs` spawned via `child_process.fork()` with `--max-old-space-size=512`.
- **Timeout:** 3-minute hard deadline per page.
- **Advisory Output:** Creates suggestions in `EPaperOcrSuggestion`. Suggestions do NOT alter live content or block publication; they require editor acceptance in the hotspot editor.

---

## 17. Publication Integrity Model

- **Gatekeeper:** `epaperEditorialService.updateWorkflow` evaluates `buildEpaperReadiness` and `buildEpaperEditionQualitySummary`.
- **Mandatory Invariants:**
  1. `thumbnailPath` present and non-empty.
  2. `pdfPath` present and verified in Spaces.
  3. `pagesMissingImage === 0` (100% of pages rendered).
  4. All blank pages have explicit classification notes.
  5. Actor role is strictly `super_admin`.
- **Atomicity:** When revision N is published, revision N-1 has `isCurrentRevision` set to `false` in the same operation.

---

## 18. RBAC Policy

- **Canonical Enforcement:**
  - `super_admin`: Full authority across all E-Paper routes, uploads, edits, publishing, and deletions.
  - `admin`: DENIED (HTTP 403 / redirect to login).
  - `copy_editor`: DENIED (HTTP 403 / redirect to login).
  - `reporter`: DENIED (HTTP 403 / redirect to login).
- **Policy Stance:** Any role widening is classified as DEFERRED pending future product leadership decisions.

---

## 19. Cleanup & Recovery Strategy

- **Abandoned Uploads:** Background cleaner deletes draft editions stuck in `draft_upload` for >24 hours with empty `pdfPath`, cleaning associated Spaces objects.
- **Cascading Deletions:** Deleting an edition cleans all child articles, jobs, OCR suggestions, and associated Spaces assets.
- **Reference Safety:** Assets belonging to published revisions are never deleted when a draft revision is created or cancelled.

---

## 20. Observability

- **Activity Timeline:** `lib/server/epaperActivity.ts` records human and automated events with actor metadata.
- **Structured Metrics:** `logEpaperMetric` emits structured JSON to stdout:
  - `epaper_upload_initiated`
  - `epaper_upload_finalized`
  - `epaper_processing_queued`
  - `epaper_conversion_completed`
  - `epaper_conversion_failed`
  - `epaper_publishing_completed`
  - `epaper_publishing_blocked`
- **Security Rule:** No presigned URLs, S3 credentials, or user secrets are ever included in activity logs or metrics.

---

## 21. Testing Strategy

### Unit Tests
- `assertEpaperDraftEditable` immutability enforcement.
- Upload receipt signature generation and validation.
- Blocker resolution in `buildEpaperReadiness` and `buildEpaperEditionQualitySummary`.
- State machine transition validity.

### API & Integration Tests
- Direct upload flow (`init` -> client mock -> `finalize`).
- Background worker execution (`run-due`).
- Retry endpoint (`processing/retry`).
- Publication gate validation.
- Revisions cloning and current revision switching.

### Security Tests
- Rejection of foreign actor upload receipts.
- Rejection of forged Spaces object keys.
- Rejection of metadata edits on published editions.
- Rejection of PDF replacement on published editions.
- Verification that public APIs never leak draft or superseded revisions.

### Concurrency Tests
- Simultaneous draft creation race.
- Parallel worker claim race (distributed lock verification).
- Simultaneous publication race.

### Responsive & Accessibility Tests
- Admin edition list, workspace, and hotspot canvas tested at 1440x900, 768x1024, and 390x844 viewports.
- Keyboard navigation, focus outlines, ARIA progress bars, and accessible alert dialogs.

---

## 22. Staging Acceptance Strategy

- Routine tests run entirely against local mocks, fixtures, and synthetic objects.
- **Known QA Artifact Protection:**
  - Edition ID: `6ab0da70c6aab6a2a6cab44e` (`Lokswami 21 september 2026.pdf`, 8 pages, `2099-12-31`).
  - Zero tests or automated scripts may read, mutate, or trigger processing against this ID without explicit user authorization during a dedicated staging acceptance phase.

---

## 23. Rollback Strategy

- **Phase 3.9A:** Restoring draft immutability fails closed. If a regression occurs, do NOT disable immutability; fix the offending call site to use the revision flow.
- **Phase 3.9B:** Worker job schema enhancements remain backward-compatible with existing queued jobs.
- **Phase 3.9C:** Revision publications preserve prior revisions; if a published revision has issues, previous revisions remain available in the database.
- **Phase 3.9D:** OCR and background processing can be disabled via environment flags (`EPAPER_LOCAL_OCR_ENABLED=0`, `EPAPER_BACKGROUND_PROCESSING_ENABLED=0`) without corrupting stored edition data.
- **Phase 3.9E:** UX improvements do not alter database models.

---

## 24. Phase 3.15 Public Reader Contract

Phase 3.9 guarantees the following public API contracts for future Phase 3.15 reader implementation:
1. `GET /api/v1/public/epapers?citySlug={city}&date={YYYY-MM-DD}`:
   - Returns ONLY editions where `status === 'published'` and `isCurrentRevision === true`.
   - Includes ordered `pages` array with full-resolution `imagePath` URLs, `width`, `height`, and `pageNumber`.
   - Excludes internal editorial notes, OCR confidence scores, and draft flags.
2. `GET /api/v1/public/epapers/latest?citySlug={city}`:
   - Returns the latest published edition for the requested city.
3. `GET /api/public/epapers/[id]/pdf`:
   - Returns an HTTP 302 redirect with `Cache-Control: no-store` pointing directly to the verified Spaces PDF asset.

---

## 25. Final Phase 3.9 Completion Gates

Phase 3.9 cannot be considered complete until all 49 gates pass:

1. Published editions are strictly immutable.
2. Archived editions are strictly immutable.
3. Direct PDF upload finalization against published editions is rejected with HTTP 409.
4. Multi-revision cloning and replacement flow is fully functional.
5. Upload receipts are bound to authenticated actor IDs.
6. Foreign actor upload receipts are rejected.
7. Upload receipts for mismatched editions or revisions are rejected.
8. Forged or unapproved Spaces keys are rejected.
9. PDF upload size ceiling (25MB) and `%PDF-` signature checks are intact.
10. Concurrent draft creation race is controlled.
11. Processing job claims use distributed locks and atomic leases.
12. Stale worker completions are rejected.
13. Worker crash and hang recovery cleanly releases mutexes and reclaims leases.
14. Corrupted page rendering fails gracefully without crashing the worker process.
15. Rendered pages are strictly 1-indexed and sorted sequentially.
16. Rendered page keys are revision-scoped, preventing cross-revision overwrites.
17. Partial page rendering failures can be retried independently without regenerating valid pages.
18. Local OCR runs strictly in isolated child processes without external cloud network calls.
19. OCR suggestions are deduplicated and fingerprinted.
20. `publishBlockers` in quality summaries matches authoritative readiness blockers.
21. Publication gate strictly prohibits publishing editions with active blockers.
22. Publication is restricted to `super_admin`.
23. Switching current revisions is atomic.
24. Prior revisions are preserved in database history.
25. Cascade deletion uses reference-safe asset removal.
26. 24-hour abandoned draft cleaner safely purges unfinalized files.
27. Observability logs emit structured JSON with zero secrets or signed URLs.
28. Admin UX has zero dead ends or unresponsive action buttons.
29. Admin surfaces pass responsive checks at 1440x900.
30. Admin surfaces pass responsive checks at 768x1024.
31. Admin surfaces pass responsive checks at 390x844.
32. Admin surfaces pass accessibility and focus checks.
33. Public API serves only published editions.
34. Public API serves only current revisions.
35. Public API leaks zero drafts or internal workflow metadata.
36. Four-role RBAC regression verifies `super_admin` allowed and `admin`/`copy_editor`/`reporter` denied.
37. Security test suite passes.
38. Auth guard regression suite passes.
39. Phase 3 scope check passes.
40. `npm run typecheck` passes with zero errors.
41. `npm run lint:strict` passes with zero warnings.
42. `npm run build:ci` produces optimized production build.
43. `npm run test:ci` passes with 100% test success.
44. Zero unexpected or untracked generated files.
45. Unresolved P0 count equals 0.
46. Known staging QA edition `6ab0da70c6aab6a2a6cab44e` remains 100% untouched.
47. Zero production mutations.
48. Feature branch `b3/phase3.9-epaper` clean and synchronized with remote.
49. Controlled merge to `b3/foundation` performed only after all preceding gates are satisfied.

---

## 26. Risks and Open Questions

1. **Hostinger Cron Reliability:** Background processing relies on Hostinger cron hitting `/api/admin/epapers/jobs/run-due` once every minute. If Hostinger cron drops requests, processing latency increases. *Mitigation:* Admin CMS includes manual retry triggers and stuck warnings (>6 hours).
2. **Memory Footprint of Heavy PDF Rasterization:** Rendering high-resolution 3000px pages consumes significant heap. *Mitigation:* Single-canvas mutex (`acquireCanvasLock`) and memory pressure checks (`checkMemoryPressure`) ensure Node.js never exhausts system RAM.
3. **Role Delegation Timing:** Editorial staff may request ability for `admin` or `copy_editor` to map hotspots. *Mitigation:* Architecture separates mapping from publishing; when authorized by product leadership, RBAC can be expanded safely without altering domain logic.

---

## 27. Phase 3.9A Implementation Completion Record

- **Subphase:** Phase 3.9A — Ingestion Security, Draft Immutability & Asset Receipts
- **Status:** COMPLETE
- **P0 Findings Closed:**
  - **P0-1:** Restored centralized `assertEpaperDraftEditable` in `lib/server/epaperWorkflowPolicy.ts` and enforced across all mutation surfaces (`updateMetadata`, `updateWorkflow`, `updatePages`, `createArticle`, `cropHotspot`, `ocrProcessPage`, `retryProcessing`). Published and archived editions are strictly immutable with deterministic HTTP 409 Conflict.
  - **P0-2:** Enforced published PDF finalization guard in `epaperUploadService.finalize`. Reject non-draft or non-upload states with HTTP 409 Conflict before touching external storage or workers.
  - **P0-3:** Implemented HMAC-SHA256 actor-bound signed upload receipts in `lib/storage/epaperUploadReceipt.ts` binding actor ID, target edition ID, revision number, canonical object key, max bytes, and expiry with timing-safe verification.
- **P1 Finding Closed:**
  - **Draft Logical Uniqueness Race:** Protected `epaperUploadService.initialize` and `epaperEditorialService.create` with `withDistributedLock` using logical edition identity keys `(publicationType, citySlug, issueDate)` to prevent concurrent races from creating duplicate edition families.
- **Automated Tests Added:**
  - `tests/epaper-draft-immutability.test.ts` (14 tests)
  - `tests/epaper-upload-receipt-security.test.ts` (11 tests)
  - `tests/epaper-draft-concurrency.test.ts` (3 tests)
- **CI Regression Verification:**
  - Total test files: 294 (up from 291 baseline)
  - Total tests: 1,887 (up from 1,859 baseline, +28 new tests)
  - Full suite status: 100% passing across Vitest, auth guards, admin credentials, strict linting, typecheck, and production Next.js build.
- **QA Artifact:** `6ab0da70c6aab6a2a6cab44e` untouched.

---

## 28. Phase 3.9B Implementation Completion Record

- **Subphase:** Phase 3.9B — E-Paper Processing Lifecycle & Page Generation Hardening
- **Status:** COMPLETE
- **Deliverables Completed:**
  - **Processing Generation & Stale Worker Protection:** Added `processingGeneration` to `EPaper` and `generation` + `revisionNumber` to `EPaperProcessingJob`. Workers re-verify generation, revision, source PDF key, and active claim before committing intermediate pages and final status. Stale attempts cannot overwrite newer editions or retries.
  - **Atomic Processing Claim & Lease Semantics:** Strengthened `claimJob` using atomic MongoDB `findOneAndUpdate` predicates preventing concurrent dual-processing of the same job. Expired leases (`leaseExpiresAt <= now`) can be safely reclaimed.
  - **Server-Derived Asset Keys & Page Number Authority:** Page numbers are strictly server-derived sequence `1..pageCount`. Derived asset keys are strictly server-owned (`lokswami/.../revision-R-ID/pages/NNN-rendered.jpg`) with validation rejecting path traversal (`..`), backslashes, and cross-revision collisions.
  - **Page Order, Count Integrity & Partial Failure Isolation:** Enforced numeric ordering (`1..N`) past page 9, unique page numbers, and exact page count match. Incomplete page sets or middle-page failures leave the edition in retryable `draft_upload` state and never transition to `pages_ready`.
  - **Retry Semantics & Immutability:** Bounded retries generate a new unique generation attempt. Retry against published or archived editions strictly returns HTTP 409 `EpaperConflictError`. Non-`super_admin` retry attempts are denied with HTTP 403 `EpaperForbiddenError`.
  - **Deterministic Error Hierarchy:** Defined typed error codes (`EPAPER_PROCESSING_STALE`, `EPAPER_PAGE_SEQUENCE_INVALID`, `EPAPER_PAGE_COUNT_INVALID`, `EPAPER_EDITION_IMMUTABLE`, etc.) via `lib/server/epaperProcessingErrors.ts`.
- **Automated Tests Added:**
  - `tests/epaper-processing-resilience.test.ts` (29 tests)
- **CI Regression Verification:**
  - Total test files: 295 (up from 294)
  - Total tests: 1,916 (up from 1,887 baseline, +29 new tests)
  - Full suite status: 100% passing across Vitest, auth guards, admin credentials, strict linting, typecheck, scope check, and production Next.js build (`build:ci`).
- **QA Artifact:** `6ab0da70c6aab6a2a6cab44e` untouched.
