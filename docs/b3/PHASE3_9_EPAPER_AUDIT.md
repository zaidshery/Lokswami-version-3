# LOKSWAMI B3 — PHASE 3.9 AUDIT
## E-Paper CMS + Ingestion + Processing Foundation

- **Status:** COMPLETED
- **Branch:** `b3/phase3.9-epaper`
- **Starting HEAD:** `b591440`
- **Integration Base:** `b3/foundation` (`b591440`)
- **Scope:** E-Paper Admin CMS, Ingestion, Background PDF Processing, Page Generation, Edition Lifecycle, OCR, Publication Invariants, Storage Boundaries, and Observability.
- **Explicit Boundary:** Public Reader UX, Zoom/Pan Canvas, Public Bookmarks/Clippings, and E-Magazine UI are strictly deferred to **Phase 3.15**.

---

## 1. Executive Summary

Phase 3.9 establishes the canonical administrative, ingestion, processing, and publication foundation for Lokswami's daily E-Paper product.

Lokswami has already implemented a rich Workflow V3 architecture for E-Paper comprising:
1. **Direct DigitalOcean Spaces Uploads:** Large PDF and page image uploads bypass Next.js API server memory buffers using signed pre-authorization.
2. **Worker-Isolated PDF Rendering:** Page rasterization executes in dedicated Node.js `worker_threads` backed by `pdfjs-dist` and `@napi-rs/canvas` with a single-canvas mutex, memory guards, and hard termination recovery on hangs.
3. **Durable Asynchronous Job Processing:** Background conversion runs via `EPaperProcessingJob` claims managed under distributed locks and HTTP cron triggers (`/api/admin/epapers/jobs/run-due`).
4. **Local Hindi/English OCR Engine:** Background OCR processing runs using an isolated child process worker (`tesseract.js`) producing structured suggestions (`EPaperOcrSuggestion`) without sending data to external APIs.
5. **Revisions & Quality Readiness:** Multi-revision tracking (`familyId`, `revisionNumber`, `isCurrentRevision`), automated quality signals, and publishing blockers preventing premature releases.

### Key Audit Findings & Vulnerabilities
- **P0 Finding (Draft Immutability Disabled):** `assertEpaperDraftEditable` in `lib/server/epaperWorkflowPolicy.ts` was deliberately disabled (`return;`) in earlier development, permitting direct modifications to published edition pages and assets without creating an immutable draft revision.
- **P0 Finding (Upload Finalize Scope Bypassing Status Check):** `epaperUploadService.finalize` does not verify that the target edition is in `draft` status or `draft_upload` production status, creating a risk that a finalized upload re-rasterizes and overwrites a published edition.
- **P1 Finding (Lack of Unique Index on Draft Editions):** The compound unique index on `{ publicationType, citySlug, publishDate, isCurrentRevision }` has a partial filter restricting uniqueness only to `{ status: 'published', isCurrentRevision: true }`. Simultaneous upload initialization requests can create duplicate draft edition documents in Mongo.
- **P1 Finding (Quality Summary Blockers Decoupled):** `buildEpaperEditionQualitySummary` initializes `publishBlockers: []` without populating critical editorial issues, leaving blocker enforcement solely to `buildEpaperReadiness`.
- **P1 Finding (Strict Super Admin Role Restriction):** The entire E-Paper management surface is restricted to `super_admin`. Regular `admin` and `copy_editor` roles have zero access, preventing editorial delegation.

---

## 2. Current Architecture

```
[ CMS Admin / Browser ]
        │
        ├─ 1. Init Upload ──────────► [ POST /api/admin/epapers/uploads ]
        │                                      │
        │                             Returns Signed Target
        │                                      │
        ├─ 2. Direct PUT ───────────► [ DigitalOcean Spaces (Raw S3) ]
        │                             lokswami/epapers/{city}/{date}/pdf/...
        │                                      │
        ├─ 3. Finalize Upload ──────► [ POST /api/admin/epapers/[id]/uploads/finalize ]
        │                                      │
        │                             Validates Receipt & Page Count
        │                             Enqueues Processing Job
        │                                      ▼
[ Cron / Background Runner ] ◄── [ EPaperProcessingJob (MongoDB) ]
(POST /api/admin/epapers/jobs/run-due)         │
        │                                      │ (Distributed Lock & Lease)
        ▼                                      ▼
[ Worker Adapter ] ─────────────► [ pdfWorker.ts (worker_threads) ]
        │                             - Mutex: 1 Canvas Render at a time
        │                             - Timeout: 45s per page
        │                             - Heap Guard: Memory Pressure Check
        │                             - Engine: pdfjs-dist + @napi-rs/canvas
        ▼                                      │
[ Spaces Page Upload ] ◄───────────────────────┘
lokswami/epapers/{city}/{date}/revision-{rev}-{id}/pages/{p}-rendered.jpg
        │
        ├─ Auto-Thumbnail (Page 1)
        ├─ Auto-Queue Local OCR (tesseract.js)
        └─ Update Edition Pages -> 'pages_ready'
```

---

## 3. Admin Surfaces

| Surface Route / Endpoint | Method | Role Required | Purpose | Status |
| :--- | :---: | :---: | :--- | :--- |
| `/admin/epapers` | UI | `super_admin` | Edition desk listing, filtering by city, status, date, production status | Verified |
| `/admin/epapers/new` | UI | `super_admin` | Direct upload and creation form for new edition | Verified |
| `/admin/epapers/[id]` | UI | `super_admin` | Edition production workspace, page grid, workflow status, publish desk | Verified |
| `/admin/epapers/[id]/edit` | UI | `super_admin` | Edition metadata editing (title, date, city, pageCount) | Verified |
| `/admin/epapers/[id]/page/[p]` | UI | `super_admin` | Page hotspot editor, local OCR runner, story clipping | Verified |
| `/api/admin/epapers` | `GET` | `super_admin` | Paginated listing with city/date/status filters | Verified |
| `/api/admin/epapers` | `POST` | `super_admin` | Create edition with pre-verified asset receipts | Verified |
| `/api/admin/epapers/[id]` | `GET` | `super_admin` | Full edition details with readiness and article stats | Verified |
| `/api/admin/epapers/[id]` | `PUT` | `super_admin` | Update metadata (title, city, publishDate, pageCount) | Verified |
| `/api/admin/epapers/[id]` | `PATCH`| `super_admin` | Update production workflow, assignees, notes, publish | Verified |
| `/api/admin/epapers/[id]` | `DELETE`| `super_admin` | Cascade delete edition, articles, jobs, Spaces assets | Verified |
| `/api/admin/epapers/[id]/activity`| `GET` | `super_admin` | Audit and activity timeline | Verified |
| `/api/admin/epapers/[id]/processing` | `GET` | `super_admin` | Monitor background conversion progress and stuck warnings | Verified |
| `/api/admin/epapers/[id]/processing/retry` | `POST` | `super_admin` | Retry failed or missing page conversions | Verified |
| `/api/admin/epapers/[id]/revisions` | `POST` | `super_admin` | Clone published edition into a new draft revision | Verified |
| `/api/admin/epapers/[id]/pages` | `PUT` | `super_admin` | Update page images, review statuses, and classifications | Verified |
| `/api/admin/epapers/[id]/uploads/finalize` | `POST` | `super_admin` | Verify uploaded PDF, probe page count, enqueue job | Verified |
| `/api/admin/epapers/uploads` | `POST` | `super_admin` | Initialize direct upload target for PDF | Verified |
| `/api/admin/uploads/epaper-asset/init` | `POST` | `super_admin` | Generic presigned target for PDF, thumbnail, audio | Verified |
| `/api/admin/uploads/epaper-asset/complete` | `POST` | `super_admin` | Verify asset upload in Spaces | Verified |
| `/api/admin/epapers/jobs/run-due` | `POST` | Cron Secret | Executes due background conversion and OCR jobs | Verified |
| `/api/admin/epapers/[id]/generate-page-images` | `POST` | `super_admin` | Deprecated synchronous endpoint (HTTP 410 Gone) | Verified |
| `/api/admin/epapers/upload` | `POST` | `super_admin` | Deprecated multipart upload endpoint (HTTP 400) | Verified |

---

## 4. Data Model

### `EPaper` (`lib/models/EPaper.ts`)
- **Core Identity:** `_id`, `publicationType` (`'epaper' | 'emagazine'`), `citySlug` (e.g. `'indore'`), `cityName` (`'Indore'`), `title`, `publishDate` (UTC midnight Date).
- **Source Assets:** `pdfPath` (Spaces public URL), `pdfPublicId` (Spaces object key), `pdfFormat` (`'pdf'`), `thumbnailPath` (cover image URL).
- **Page Array:** `pageCount` (integer 1-1000), `pages` (`IEPaperPage[]`):
  - `pageNumber` (1-based index)
  - `imagePath` (rendered JPEG URL in Spaces)
  - `width`, `height` (pixels)
  - `pageType` (`'editorial' | 'advertisement' | 'classified' | 'photo' | 'blank'`)
  - `classificationNote`
  - `processingStatus` (`'pending' | 'processing' | 'ready' | 'failed'`)
  - `processingError`
  - `processedAt`
  - `reviewStatus` (`'pending' | 'needs_attention' | 'ready'`)
  - `reviewNote`, `reviewedAt`, `reviewedBy` (`WorkflowActorRef`)
- **Editorial State:**
  - `status`: `'draft' | 'published'`
  - `familyId`: UUID string grouping all revisions of this edition
  - `revisionNumber`: Sequential integer starting at 1
  - `isCurrentRevision`: Boolean
  - `supersedesId`: ObjectId pointing to previous revision
  - `publishedAt`: Date
- **Workflow State:**
  - `productionStatus`: `'draft_upload' | 'pages_ready' | 'ocr_review' | 'hotspot_mapping' | 'ready_to_publish' | 'published' | 'archived'`
  - `productionAssignee`: `WorkflowActorRef`
  - `productionNotes`: `WorkflowComment[]`
  - `qaCompletedAt`: Date
- **Ingestion Provenance:**
  - `sourceType`: `'manual-upload' | 'drive-import' | 'remote-import' | 'legacy' | 'unknown'`
  - `sourceLabel`, `sourceUrl`

### `EPaperProcessingJob` (`lib/models/EPaperProcessingJob.ts`)
- `epaperId`: ObjectId reference to `EPaper`
- `kind`: `'pdf_pages' | 'ocr'`
- `sourceKey`: Unique SHA256 string for deduplication
- `status`: `'queued' | 'processing' | 'completed' | 'completed_with_errors' | 'failed' | 'cancelled'`
- `pageNumbers`: Integer array of pages assigned to this job
- `totalItems`, `processedItems`, `failedItems`, `failedPageNumbers`
- `attemptCount`, `maxAttempts` (4)
- `nextAttemptAt`, `leaseOwner`, `leaseExpiresAt` (10m TTL), `lastError`
- `startedAt`, `completedAt`

### `EPaperArticle` (`lib/models/EPaperArticle.ts`)
- `epaperId`: ObjectId reference
- `pageNumber`: Target page
- `title`, `slug`, `excerpt`, `contentHtml`, `coverImagePath`, `videoUrl`
- `hotspot`: `{ x, y, w, h }` (normalized floating values 0.0 to 1.0)
- `workflow`: Workflow metadata
- `releasedSnapshot`: Snapshot metadata when published as standalone newsroom story

### `EPaperOcrSuggestion` (`lib/models/EPaperOcrSuggestion.ts`)
- `epaperId`, `pageNumber`, `fingerprint`, `sourceKey`, `runId`
- `title`, `excerpt`, `contentHtml`, `hotspot`, `confidence`
- `status`: `'pending' | 'accepted' | 'rejected' | 'suppressed'`

---

## 5. Edition Identity & Uniqueness

- **Logical Uniqueness:** Defined by the tuple `(publicationType, citySlug, publishDate)`.
- **Database Enforcement:**
  - Index `{ publicationType: 1, citySlug: 1, publishDate: 1, isCurrentRevision: 1 }` with partial filter `{ status: 'published', isCurrentRevision: true }`.
  - Index `{ familyId: 1, revisionNumber: 1 }` unique for all family IDs.
- **Identified Risk:**
  - Because the uniqueness index uses a partial filter for published records, MongoDB does NOT enforce uniqueness across draft editions. Simultaneous creation calls can create duplicate draft editions for the same date and city.

---

## 6. PDF Upload Flow

```
Admin Form -> POST /api/admin/epapers/uploads
  ├─ Validates citySlug, publishDate, title, fileSize (<= 25MB), fileType ('application/pdf')
  ├─ Generates unique Spaces key: lokswami/epapers/{city}/{date}/pdf/{ts}-{stem}.pdf
  ├─ Creates draft EPaper record (productionStatus: 'draft_upload')
  └─ Returns presigned browser upload target

Browser -> Direct PUT to DigitalOcean Spaces S3 endpoint
  └─ Direct streaming from browser to Spaces (no server buffer)

Admin Client -> POST /api/admin/epapers/[id]/uploads/finalize
  ├─ Calls verifyEpaperAssetUpload() -> checks object existence & size in Spaces
  ├─ Downloads PDF from Spaces -> validates Buffer.from('%PDF-') signature
  ├─ Probes pageCount via getPdfPageCountFromBuffer()
  ├─ Updates EPaper record: pdfPath, pdfPublicId, pageCount, and page shells
  ├─ Deletes previous replaced PDF if different key
  ├─ Enqueues EPaperProcessingJob for all pages
  └─ Logs activity: pdf_processing_queued
```

---

## 7. PDF Security

- **Size Limits:** Enforced at initialization and verification: 25MB (`EPAPER_PDF_MAX_BYTES`).
- **Signature Validation:** Verified with `Buffer.from('%PDF-')` at byte 0.
- **Decompression Bomb Protection:**
  - Rasterization runs in isolated Node.js worker threads (`worker_threads`).
  - Runtime heap pressure checked before acquiring canvas locks (`checkMemoryPressure`, threshold 512MB/1GB).
- **Execution Timeout:** 45 seconds per page render timeout.
- **Hang Recovery:** If the worker thread does not settle within the timeout, `boundary.terminate()` forcibly kills the thread and reclaims memory.
- **Single Canvas Mutex:** `acquireCanvasLock()` ensures only ONE canvas rasterization runs at any given instant across the process.

---

## 8. Storage Architecture

All assets reside in DigitalOcean Spaces under structured, non-forgeable pathing:
- **PDF Assets:** `lokswami/epapers/{citySlug}/{YYYY-MM-DD}/pdf/{timestamp}-{stem}.pdf`
- **Thumbnail Assets:** `lokswami/epapers/{citySlug}/{YYYY-MM-DD}/thumbnail/{timestamp}-{stem}.jpg`
- **Rendered Pages:** `lokswami/epapers/{citySlug}/{YYYY-MM-DD}/revision-{rev}-{id}/pages/{pageNumber:03d}-rendered.jpg`
- **Story Audio:** `lokswami/tts/epaperArticle/{articleId}/manual/{timestamp}-{stem}.mp3`
- **Verification Rule:** `assertValidEpaperAssetKey` matches exact regular expression patterns, preventing arbitrary key injection.

---

## 9. Page Conversion Pipeline

- **Status:** FULLY IMPLEMENTED (Native `pdfjs-dist` + `@napi-rs/canvas` in worker threads).
- **Tooling:** Free open-source stack; no external binary dependencies like Poppler or ImageMagick are required on the host system.
- **Quality Tokens:** Target width is 3000px, JPEG quality is 90 (`lib/server/epaperPdfRenderer.ts`).
- **Page Ordering:** Pages are strictly 1-indexed and sorted sequentially `1..pageCount`. Zero-padded keys (`001-rendered.jpg`) guarantee alphabetical sorting matches numerical sorting.

---

## 10. Processing State Machine

```
[ queued ] ──(Claim via Distributed Lock)──► [ processing ]
                                                    │
                 ┌──────────────────────────────────┴──────────────────────────────────┐
                 ▼                                                                     ▼
           [ All Succeeded ]                                                     [ Failures ]
                 │                                                                     │
                 ▼                                                                     ├─ Attempt < 4 ──► [ queued (retry) ]
           [ completed ]                                                               │                   (Delay: 1m, 5m, 15m)
                 │                                                                     ▼
                 │                                                               [ Max Attempts ]
                 │                                                                     │
                 ├─ All pages ready ──► productionStatus = 'pages_ready'               ├─ Partial ──────► [ completed_with_errors ]
                 └─ Trigger OCR Queue                                                  └─ Zero Pages ───► [ failed ]
```

---

## 11. Idempotency & Concurrency

- **Distributed Mutex:** Worker executions wrapped in Redis distributed lock `withDistributedLock('lock:epaper-job-worker')` with 120s TTL.
- **Atomic Lease:** MongoDB `findOneAndUpdate` with `leaseOwner` and 10-minute `leaseExpiresAt`.
- **Per-Page State Persistence:** Successful pages are saved to MongoDB immediately after upload. If a worker crashes on page 5, pages 1–4 remain intact; only page 5 is retried.
- **Revision Isolation:** Each revision renders into `revision-{revisionNumber}-{epaperId}`, ensuring simultaneous or subsequent conversions never overwrite assets from other revisions.

---

## 12. Page Model & Ordering

- Stored in `EPaper.pages` array.
- Invariants:
  - Page numbers start at 1 and increment continuously to `pageCount`.
  - Non-editorial pages (`advertisement`, `classified`, `photo`, `blank`) are tracked explicitly.
  - Blank pages require an explicit `classificationNote` before the edition can be marked ready to publish.

---

## 13. Cover & Thumbnail

- **Page 1 Priority:** `buildEpaperImageAutomationUpdates` detects when page 1 is rendered and automatically updates `thumbnailPath` to the page 1 rendered image.
- **Explicit Thumbnail Fallback:** If an explicit thumbnail is uploaded during initial creation, it is preserved until page 1 renders or explicitly replaced.
- **Format:** High-resolution JPEG/WEBP.

---

## 14. OCR Architecture

- **Status:** IMPLEMENTED (Local Tesseract Child Process Worker).
- **Engine:** `scripts/epaper-local-ocr-worker.cjs` spawned via `fork()` with `--max-old-space-size=512`.
- **Language Support:** Hindi and English (`hin+eng`).
- **Deduplication:** Uses SHA256 `sourceKey` and hotspot fingerprinting (`epaperOcrSourceKey`).
- **Safety Boundary:** Completely non-blocking and local. OCR failures never block edition publication; OCR suggestions require human editorial review in the CMS hotspot editor.

---

## 15. Publication Lifecycle & Invariants

### Lifecycle Stages
1. `draft_upload`: PDF uploaded, conversion pending.
2. `pages_ready`: All page images successfully rendered.
3. `ocr_review`: OCR suggestions reviewed.
4. `hotspot_mapping`: Interactive article hotspots mapped to pages.
5. `ready_to_publish`: All blockers resolved, QA approved.
6. `published`: Edition live on public reader (`status: 'published'`).
7. `archived`: Edition retired from active view.

### Publication Invariants
- `canPublishEpaper(role)` must be true (`super_admin`).
- `readiness.blockers` must be zero:
  - `thumbnailPath` must exist.
  - `pdfPath` must exist.
  - `pagesMissingImage` must equal 0.
  - All blank pages must have classification notes.
- Upon publication:
  - `status` set to `'published'`.
  - `isCurrentRevision` set to `true`.
  - `publishedAt` timestamp recorded.
  - Prior published editions in the same family have `isCurrentRevision` set to `false`.

---

## 16. RBAC Enforcement

- **Current State:**
  - `canViewPage(role, 'epapers')`: `['super_admin']`
  - `canCreateEpaper(role)`: `['super_admin']`
  - `canEditEpaper(role)`: `['super_admin']`
  - `canPublishEpaper(role)`: `['super_admin']`
  - `canDeleteEpaper(role)`: `['super_admin']`
- **Assessment:**
  - Strict lockdown to `super_admin`.
  - In Phase 3.9, we must evaluate whether `admin` and `copy_editor` roles should be granted operational access (e.g. mapping hotspots, reviewing pages) while keeping final publication and deletion restricted to `super_admin`.

---

## 17. Concurrency & Lost Updates

- **Database Leases:** Job leases prevent parallel worker collision.
- **Workflow State Transitions:** `canTransitionEpaperProduction` validates allowed transitions.
- **Gaps Identified:**
  - Metadata updates (`PUT /api/admin/epapers/[id]`) do not use a version field or optimistic concurrency check. If two editors edit metadata simultaneously, the last write wins.

---

## 18. PDF Replacement & Revisions

- **Official Revision Flow:**
  - `POST /api/admin/epapers/[id]/revisions`: Creates a new draft revision incrementing `revisionNumber`, copying existing pages, hotspots, and manual TTS audio assets.
- **Direct Replacement Gap (P0):**
  - `POST /api/admin/epapers/[id]/uploads/finalize` does NOT check whether the edition is already published. An administrator can finalize a new PDF on a live published edition, overwriting the live PDF and resetting pages without creating a revision.

---

## 19. Deletion & Cleanup

- **Cascading Deletion:**
  - `DELETE /api/admin/epapers/[id]` deletes `EPaper`, child `EPaperArticle`s, `EPaperProcessingJob`s, and `EPaperOcrSuggestion`s.
  - Cleans up Spaces objects for the PDF, thumbnail, and rendered page images.
- **Abandoned Upload Sweeper:**
  - `cleanupAbandonedEpaperUploads` cleans up drafts older than 24h that never finalized their PDF upload, purging orphaned Spaces files.

---

## 20. Failure & Recovery

- **Transient Render Failures:** Handled by job retry schedule (1 min, 5 min, 15 min delays).
- **Fatal Process Crashes:** Expired leases allow other workers to pick up stalled jobs after 10 minutes.
- **Missing/Corrupted Pages:** Admins can manually trigger targeted page re-renders via `POST /api/admin/epapers/[id]/processing/retry`.

---

## 21. Observability

- **Activity Timeline:** `lib/server/epaperActivity.ts` records human and machine workflow actions:
  - `pdf_processing_queued`, `pdf_processing_completed`, `pdf_processing_failed`, `metadata_update`, `published`, `archived`, `revision_created`.
- **Structured Metrics:** `logEpaperMetric` outputs structured JSON logs for log ingestion systems:
  - `conversion_completed`, `conversion_failed`, `publishing_blocked`, `publishing_completed`.

---

## 22. Admin UX

- The E-Paper CMS features an advanced workspace:
  - Edition summary header with publication status badges and quality indicators.
  - Real-time processing progress bar showing page conversion count.
  - Page grid with visual status icons (editorial, classified, ad, photo, blank).
  - Page inspection and hotspot drawing canvas.
  - Inline error banners for failed conversions with one-click "Retry" actions.

---

## 23. Preview

- **CMS Operational Preview:** Admins can view full-resolution rendered page images, zoom into text columns, and preview drawn hotspot boundaries directly in the admin console.
- **Public Reader Decoupling:** Operational preview uses internal admin components and does not depend on the public reader bundle.

---

## 24. Reader Boundary / Phase 3.15 Contract

- **Reader Consumption Surfaces:**
  - `GET /api/v1/public/epapers`: Returns published editions filtered by city and issue date.
  - `GET /api/v1/public/epapers/latest`: Returns the latest published edition for a given city.
  - `GET /api/public/epapers/[id]/pdf`: Redirects to the verified Spaces PDF URL.
- **Data Invariant for Reader:**
  - Only editions with `status === 'published'` and `isCurrentRevision === true` are returned by public endpoints. Drafts, processing jobs, and superseded revisions are strictly hidden from public feeds.
- **Phase 3.15 Scope:** Public pan/zoom viewport, article clipping modal, SVG hotspot overlays, reader sharing, and offline reading.

---

## 25. Accessibility Metadata

- **Current State:** Pages store `pageNumber`, `pageType`, and `classificationNote`.
- **Gaps:** Rendered page images currently lack localized alt-text generators (e.g. "Lokswami Indore Edition, 25 September 2026, Page 1"). Searchable text is only available if hotspots are mapped.

---

## 26. Resource & Rate Limits

- PDF upload capped at 25MB.
- Page rendering worker constrained to 1 concurrent canvas render and 512MB/1GB heap.
- Cron runner processes at most 1 edition job per invocation, rendering pages sequentially.
- Local OCR restricted to 3-minute execution limit per page.

---

## 27. Testing Inventory

The repository maintains an extensive test suite for E-Paper:
- `tests/epaper-workflow-v3.test.ts`: Complete lifecycle transitions and invariants.
- `tests/pdf-worker-isolation.test.ts`: Memory checks, worker thread isolation, and timeouts.
- `tests/pdf-render-mutex-safety.test.ts`: Canvas lock concurrency and queue behavior.
- `tests/epaper-pdf-renderer.test.ts`: PDF signature verification and rendering contracts.
- `tests/api/admin-epaper-direct-upload-routes.test.ts`: Presigned upload target generation.
- `tests/api/admin-epaper-domain-contracts.test.ts`: Admin REST API contracts.
- `tests/api/admin-epaper-role-guard.test.ts`: RBAC permission checks on admin routes.
- `tests/epaper-local-ocr.test.ts`: Local Tesseract OCR worker isolation and parsing.
- `tests/epaper-revision-tts-clone.test.ts`: Revision creation and asset cloning.
- `tests/epaper-release-snapshot-safety.test.ts`: Article release snapshot immutability.
- `tests/api/public-epaper-pdf-contract.test.ts`: Public PDF redirect and Spaces asset validation.

---

## 28. Prioritized Vulnerabilities & Improvements

### P0 (Must fix in Phase 3.9)
1. **Re-enable Draft Immutability (`assertEpaperDraftEditable`):** Restore strict enforcement so that published editions cannot have their pages modified or PDF replaced directly without creating a draft revision.
2. **Add Draft Status Check to `epaperUploadService.finalize`:** Ensure `finalize` rejects any attempt to upload/finalize a PDF on an edition that is not in `status: 'draft'` and `productionStatus: 'draft_upload'`.
3. **Verify Asset Receipt Uploader Authorization:** Ensure direct upload receipts cannot be claimed across disparate editions.

### P1 (Should fix in Phase 3.9)
1. **Draft Unique Compound Constraint:** Prevent concurrent creation of duplicate draft editions for the same city and date.
2. **Populate Quality Summary Publish Blockers:** Align `buildEpaperEditionQualitySummary` blockers with `buildEpaperReadiness` blockers.
3. **Expand RBAC to Support Newsroom Roles:** Allow `admin` and `copy_editor` roles to edit hotspots, review pages, and add production notes, while keeping publication and deletion restricted to `super_admin`.

### P2 (Nice to have / Deferrable)
1. **Automated Alt-Text Generation:** Add localized page image alt text for accessibility.
2. **Optimistic Locking:** Introduce version numbers on `EPaper` documents to prevent conflicting simultaneous metadata updates.

### Out of Scope (Phase 3.15)
- Public pan/zoom reader canvas.
- Reader article clipping modal and mobile touch swipe controls.
- E-Magazine reader layout.

---

## 29. Critical Staging QA Artifact Preservation

The following QA edition exists on staging and MUST NOT be processed, mutated, or deleted:
- **Title:** `[QA] Lokswami E-Paper Test Edition`
- **ID:** `6ab0da70c6aab6a2a6cab44e`
- **Source:** `Lokswami 21 september 2026.pdf` (8 pages)
- **QA Date:** `2099-12-31`
- **Status:** `draft` / `draft_upload` (unpublished)
- **Safety Directive:** Completely preserved and untouched during all Phase 3.9 operations.

---

## 30. Proposed Phase 3.9 Subphases

### **Phase 3.9A — Ingestion Security, Asset Receipts & Draft Immutability**
- **Objective:** Secure the PDF upload boundary, enforce strict draft immutability, prevent published edition overwrites, and eliminate duplicate draft creation races.
- **Scope:**
  - Restore `assertEpaperDraftEditable` in `epaperWorkflowPolicy.ts`.
  - Add state validation in `epaperUploadService.finalize` (`status === 'draft'` & `productionStatus === 'draft_upload'`).
  - Strengthen MongoDB draft uniqueness constraints.
- **Tests:** Targeted unit and API tests for upload validation and immutability guards.

### **Phase 3.9B — Processing Lifecycle, Idempotency & Page Generation Hardening**
- **Objective:** Harden worker-isolated page conversion, distributed locking, retry backoff, and error recovery.
- **Scope:**
  - Verify zero memory leaks during batch page rasterization.
  - Ensure failed page retries never duplicate or corrupt existing valid page keys.
  - Reconcile automated cover thumbnail assignment on page 1 completion.
- **Tests:** Worker mutex tests, retry schedule tests, timeout recovery tests.

### **Phase 3.9C — Edition Workflow, Quality Signals & Publication Integrity**
- **Objective:** Formalize editorial state machine transitions, blocker enforcement, and multi-revision publication semantics.
- **Scope:**
  - Link quality summary blockers directly to publication eligibility.
  - Verify revision cloning preserves article hotspots and audio assets without cross-revision pollution.
  - Validate publication unsets `isCurrentRevision` on prior revisions atomically.
- **Tests:** Publication invariants test suite, revision cloning tests, workflow transition guards.

### **Phase 3.9D — OCR Coordination, Recovery, Cleanup & Role Delegation**
- **Objective:** Streamline local OCR suggestion pipelines, abandoned asset cleanup, and editorial RBAC.
- **Scope:**
  - Ensure abandoned draft upload sweeper purges unlinked Spaces objects safely.
  - Refine role permissions to allow `admin` and `copy_editor` to map hotspots while preserving `super_admin` publication authority.
  - Audit logging of all administrative and machine actions.
- **Tests:** Cleanup worker tests, RBAC route tests, activity logging tests.

### **Phase 3.9E — Final QA, End-to-End Regression & Phase 3.15 Public Reader Contract**
- **Objective:** Full verification of all Phase 3.9 capabilities across the 4 newsroom roles, end-to-end CI validation, and establishing immutable public data contracts for Phase 3.15.
- **Scope:**
  - Verify public API feeds strictly exclude non-published and superseded revisions.
  - Run full CI (`npm run test:ci`, `npm run build:ci`).
- **Tests:** 100% test pass rate across the full test suite.
