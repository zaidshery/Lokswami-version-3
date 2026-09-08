# LokSwami B3 — Baseline Gap Report & Release Risk Inventory

## Executive Summary

This report documents the architectural, performance, and release-hardening gaps discovered and verified during the Phase 0 and Phase 0.5 Baseline Certification.

In accordance with Phase 0 protocols: **Zero application code was modified to resolve these gaps during this audit.**
Every finding is explicitly classified as **VERIFIED**, **INFERRED**, or **FUTURE REQUIREMENT**.
Inherited release defects from the base commit (`24e56910026744a33fb81c0b36015322840549e3`) have been audited against running code.

Historical context: To preserve continuity with prior project reviews while enforcing strict B3 release hardening criteria, this matrix explicitly distinguishes **Original Review Severity** from **B3 Hardening Priority**. B3 independently promotes high-impact search/reader integrity defects (such as video sitemap path and pagination errors) as release-hardening blockers.

---

## Gap Severity Classification Standard

- **P0**: Active security vulnerability, irreversible data loss, or major production incident risk.
- **P1**: Major correctness, release reliability, SEO integrity, or data-exposure defect.
- **P2**: Important maintainability, performance, resilience, or operational debt.
- **P3**: Ergonomic enhancement, non-blocking optimization, or future capability.

---

## Prioritized Findings Matrix

| Gap ID | Original Review Severity | B3 Hardening Priority | Nature | Subsystem / Area | Finding Summary | Blocks Hardening? | Target Phase |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **GAP-001** | `P2` | `P2` | **VERIFIED** | Testing / Environment | Vitest parallel cold-start timeout in `admin-team-routes.test.ts` | **NO** | Phase 1 |
| **GAP-002** | `P2` | `P2` | **VERIFIED** | Toolchain / Runtime | Node.js engine discrepancy (`v24.19.0` local vs. `20.x` CI & `package.json`) | **NO** | Phase 1 |
| **GAP-003** | `P2` | `P2` | **VERIFIED** | Code Quality / Lint | 154 ESLint warnings (123 unused vars, 14 any, 10 raw img, 6 hooks, 1 a11y) | **NO** | Phase 4 |
| **GAP-004** | `P2` | `P2` | **INFERRED** | Background Jobs | Lack of persistent external queue broker for heavy PDF/OCR tasks | **NO** | Phase 6 & 7 |
| **GAP-005** | `P3` | `P3` | **FUTURE REQ** | AI Newsroom | Absence of provider-neutral multi-agent research & evidence package pipeline | **NO** | Phase 8 |
| **GAP-006** | `P2` | `P2` | **VERIFIED** | Observability | Request correlation IDs (`x-request-id`) and timing metrics not uniform across API v1 | **NO** | Phase 3 |
| **GAP-007** | `P2` | `P2` | **VERIFIED** | Audience / Sharing | WhatsApp preview card generation lacks unified multi-format abstraction | **NO** | Phase 5 |
| **GAP-008** | `P1` | `P1` | **VERIFIED** | E-Paper / Editorial | Draft article edit prematurely mutates and publishes `epaperPage.releasedSnapshot` | **YES** | Phase 1 |
| **GAP-009** | `P1` | `P1` | **VERIFIED** | PDF Processing | Mutex lock released on `Promise.race` timeout while native canvas render continues | **YES** | Phase 1 |
| **GAP-010** | `P2` | `P2` | **VERIFIED** | User Profile / Resilience | Reader password change calls `connectDB()` unconditionally, failing during DB outage | **NO** | Phase 1 |
| **GAP-011** | `P2` | `P1` *(Promoted)* | **VERIFIED** | SEO / Video Sitemap | Regular landscape news videos generate vertical `/main/shorts/...` URLs in sitemap | **YES** | Phase 1 |
| **GAP-012** | `P2` | `P1` *(Promoted)* | **VERIFIED** | SEO / Video Sitemap | Video sitemap clamped to 50 videos max due to unpaginated cursor limit clamp | **YES** | Phase 1 |
| **GAP-013** | N/A *(New)* | `P2` | **FUTURE REQ** | Toolchain / Runtime | Supported Node Runtime Migration (Inherited Node 20.x $\to$ Target Node 24 LTS) | **NO** | Post-Hardening |

---

## Detailed Gap Analysis

### GAP-001: Vitest Parallel Cold-Start Test Timeout
- **Nature**: **VERIFIED**
- **Original Review Severity**: `P2`
- **B3 Hardening Priority**: `P2`
- **Area**: Testing & CI
- **Finding**: Running `npm run test:security` in a cold parallel environment occasionally triggers Vitest's default 5000ms test timeout on `tests/api/admin-team-routes.test.ts` (took ~13.4s on cold start), while the same test passes in 797ms when warmed up or run in isolation.
- **Evidence**: Vitest log output in `test:security`.
- **Impact**: Non-deterministic CI failure during parallel test execution on slower execution runners.
- **Recommended Correction**: Configure explicit `testTimeout: 15000` on the bcrypt/mongoose-heavy setup hooks in `vitest.config.ts`.
- **Test Required**: Run `npm run test:security` across 3 consecutive cold invocations.
- **Blocks Production Hardening?**: **NO** (`npm run test:ci` passes all 927 tests cleanly).

---

### GAP-002: Node.js Runtime Engine Discrepancy
- **Nature**: **VERIFIED**
- **Original Review Severity**: `P2`
- **B3 Hardening Priority**: `P2`
- **Area**: Toolchain & CI/CD
- **Finding**: Host development environment runs Node `v24.19.0`, while `package.json` specifies `"engines": { "node": "20.x" }` and GitHub Actions (`ci.yml`, `deploy-hostinger.yml`) runs on `node-version: 20`.
- **Evidence**: `node -v` returns `v24.19.0`; `npm ci` prints `npm warn EBADENGINE Unsupported engine`.
- **Impact**: While JavaScript logic behaves identically, native binary bindings (`sharp`, `@napi-rs/canvas`) may exhibit slight behavioral divergence between local Node 24 and Hostinger production Node 20.
- **Recommended Correction**: Install Node 20 LTS via `nvm-windows` or official installer for workspace parity during Phase 1. Long-term runtime migration to Node 24 LTS is tracked in GAP-013.
- **Test Required**: Re-run `node -v` and `npm run test:ci` under Node 20 LTS.
- **Blocks Production Hardening?**: **NO**.

---

### GAP-003: ESLint Warnings Granular Breakdown
- **Nature**: **VERIFIED**
- **Original Review Severity**: `P2`
- **B3 Hardening Priority**: `P2`
- **Area**: Code Quality & LCP Optimization
- **Finding**: `npm run lint` yields exactly 154 warnings (0 errors). An earlier draft mistakenly attributed all 154 warnings to raw `<img>` tags. Current verification proves the exact breakdown is:
  - `@typescript-eslint/no-unused-vars`: **123 warnings**
  - `@typescript-eslint/no-explicit-any`: **14 warnings**
  - `@next/next/no-img-element`: **10 warnings**
  - `react-hooks/exhaustive-deps`: **6 warnings**
  - `jsx-a11y/alt-text`: **1 warning**
- **Evidence**: Exact rule frequency aggregation from `npm run lint`.
- **Impact**: 10 raw `<img>` elements bypass Next.js automatic WebP/AVIF generation, contributing minor bandwidth overhead on specific components (`ArticleStoryModal.tsx`).
- **Recommended Correction**: Clean up unused variables (123) in bulk; convert the 10 raw `<img>` tags to `next/image` in Phase 4 (Reader Performance).
- **Test Required**: `npm run lint:strict` target for zero-warning core directories.
- **Blocks Production Hardening?**: **NO**.

---

### GAP-004: Lack of Persistent External Queue Broker
- **Nature**: **INFERRED**
- **Original Review Severity**: `P2`
- **B3 Hardening Priority**: `P2`
- **Area**: Background Workloads
- **Finding**: PDF generation and OCR operations run in-process or via ad-hoc spawned worker scripts relying on file-system/database locks.
- **Evidence**: Inspection of `lib/server/epaperProcessingJobs.ts` and `scripts/epaper-local-ocr-worker.cjs`.
- **Impact**: Simultaneous batch uploads of multi-page newspaper editions compete for CPU/memory with HTTP reader traffic.
- **Recommended Correction**: Introduce persistent Redis/BullMQ queue abstraction in Phase 6, extracting workers in Phase 7.
- **Test Required**: Concurrency test with 5 simultaneous edition PDF ingestion tasks.
- **Blocks Production Hardening?**: **NO**.

---

### GAP-005: AI Newsroom Multi-Agent Infrastructure
- **Nature**: **FUTURE REQUIREMENT**
- **Original Review Severity**: `P3`
- **B3 Hardening Priority**: `P3`
- **Area**: Editorial Automation
- **Finding**: The codebase currently features simple AI assistant routes (headline suggestions, translation assistance). The full provider-neutral 10-role newsroom orchestrator and Evidence Package schema do not yet exist.
- **Evidence**: Inspection of `lib/ai/` and `app/api/admin/articles/assist/`.
- **Impact**: Newsroom staff lack automated multi-source research, citation verification, and structured editorial workbenches.
- **Recommended Correction**: Implement provider-neutral AI newsroom in Phase 8 per [docs/b3/AI_NEWSROOM.md](file:///c:/Users/Lenovo/OneDrive/Desktop/Lokswami_V3/Zaid-lokswami/docs/b3/AI_NEWSROOM.md).
- **Test Required**: Newsroom pipeline integration tests with mock LLM adapters.
- **Blocks Production Hardening?**: **NO**.

---

### GAP-006: Incomplete Request Correlation & Latency Metrics
- **Nature**: **VERIFIED**
- **Original Review Severity**: `P2`
- **B3 Hardening Priority**: `P2`
- **Area**: Observability & Diagnostics
- **Finding**: Public API endpoints (`/api/v1/public/*`) lack uniform `x-request-id` propagation and database execution duration telemetry.
- **Evidence**: Inspection of `app/api/v1/public/articles/route.ts`.
- **Impact**: Difficult to diagnose whether latency spikes stem from MongoDB, cache misses, or server render overhead.
- **Recommended Correction**: Add request correlation middleware and structured telemetry logging in Phase 3.
- **Test Required**: Verify `x-request-id` presence in all public API responses.
- **Blocks Production Hardening?**: **NO**.

---

### GAP-007: Inconsistent Preview Cards for Social Sharing
- **Nature**: **VERIFIED**
- **Original Review Severity**: `P2`
- **B3 Hardening Priority**: `P2`
- **Area**: Distribution & Reader Growth
- **Finding**: While `/api/og` exists for articles, vertical shorts and E-Paper clippings lack dedicated server-rendered Open Graph image generation.
- **Evidence**: Inspection of `lib/server/socialPreviewImage.ts`.
- **Impact**: Sub-optimal rich preview cards when users share content to WhatsApp, Telegram, or LinkedIn.
- **Recommended Correction**: Create unified multi-format preview card generator in Phase 5.
- **Test Required**: Automated OG image generation tests for articles, E-Paper pages, and swipe videos.
- **Blocks Production Hardening?**: **NO**.

---

### GAP-008: E-Paper Story Edit Prematurely Mutates `releasedSnapshot`
- **Nature**: **VERIFIED**
- **Original Review Severity**: `P1`
- **B3 Hardening Priority**: `P1`
- **Area**: E-Paper Editorial Workflow
- **File / Path**: [app/api/admin/articles/[id]/route.ts](file:///c:/Users/Lenovo/OneDrive/Desktop/Lokswami_V3/Zaid-lokswami/app/api/admin/articles/[id]/route.ts#L909-L922)
- **Current-Code Verification**:
  In `app/api/admin/articles/[id]/route.ts`, when saving changes to an article that has an `epaperPageId`, the code executes:
  ```typescript
  epaperPage.releasedSnapshot = epaperPage.stories.map((s: any) => ({ ... }));
  await epaperPage.save();
  ```
  This immediately overwrites the public reader snapshot with unreleased draft stories, violating the principle that draft editorial edits must remain private until explicit release.
- **Impact**: Readers see in-progress, unreviewed, or corrected stories before the editor-in-chief explicitly publishes the edition release.
- **Recommended Correction**: Remove `epaperPage.releasedSnapshot` mutation from the article update handler. Restrict snapshot updates exclusively to the explicit release action in `/api/admin/epapers/[id]/release`.
- **Test Required**: Integration test proving draft story edits do NOT alter `releasedSnapshot`, and explicit release DOES update it.
- **Blocks Production Hardening?**: **YES**.

---

### GAP-009: PDF Render Mutex Released on `Promise.race` Timeout While Render Continues
- **Nature**: **VERIFIED**
- **Original Review Severity**: `P1`
- **B3 Hardening Priority**: `P1`
- **Area**: PDF Rendering & Server Stability
- **File / Path**: [lib/server/pdf/pdfWorker.ts](file:///c:/Users/Lenovo/OneDrive/Desktop/Lokswami_V3/Zaid-lokswami/lib/server/pdf/pdfWorker.ts#L220-L239)
- **Current-Code Verification**:
  In `lib/server/pdf/pdfWorker.ts`:
  ```typescript
  try {
    return await Promise.race([renderPromise, timeoutPromise]);
  } finally {
    await releaseLock();
  }
  ```
  When `timeoutPromise` rejects, the `finally` block executes immediately, calling `await releaseLock()`. However, the underlying canvas render operation (`renderPromise`) cannot be cancelled and continues consuming CPU/RAM in the background. A subsequent render request will immediately acquire the lock, running concurrently with the timed-out render.
- **Impact**: In memory-constrained production environments (Hostinger VPS / container instances), concurrent heavy PDF canvas renders trigger Node.js heap exhaustion (OOM), crashing the web process.
- **Recommended Correction**: Retain the mutex until the underlying render promise settles (success or rejection), or provide reliable cancellation.
- **Test Required**: Unit test simulating a timed-out PDF render, verifying that a second protected render cannot overlap the still-running first render and lock releases only when work settles.
- **Blocks Production Hardening?**: **YES**.

---

### GAP-010: Reader Password Change Bypasses File-Store Fallback During DB Outage
- **Nature**: **VERIFIED**
- **Original Review Severity**: `P2`
- **B3 Hardening Priority**: `P2`
- **Area**: Authentication & Dual Persistence
- **File / Path**: [app/api/user/profile/route.ts](file:///c:/Users/Lenovo/OneDrive/Desktop/Lokswami_V3/Zaid-lokswami/app/api/user/profile/route.ts#L163-L182)
- **Current-Code Verification**:
  In `app/api/user/profile/route.ts`, inside `if (newPassword)`, the route calls `await connectDB()` unconditionally:
  ```typescript
  await connectDB();
  const existingUser = await User.findById(session.user.id).select('+passwordHash');
  ```
  If MongoDB is unreachable, this throws an unhandled error and returns HTTP 500, even though the rest of the application falls back to file-store user records.
- **Impact**: Readers are unable to update passwords during database degradation periods.
- **Recommended Correction**: Implement dual-persistence password check and update supporting both MongoDB and file-store fallback without weakening authentication security.
- **Test Required**: Automated test covering MongoDB available, MongoDB unavailable (file-store fallback), wrong old password, valid password update, and preserved hash security.
- **Blocks Production Hardening?**: **NO** (Addressed in Phase 1 for dual-persistence resilience).

---

### GAP-011: Video Sitemap Routes Normal Videos to Vertical Shorts URLs
- **Nature**: **VERIFIED**
- **Original Review Severity**: `P2`
- **B3 Hardening Priority**: `P1` *(Promoted to hardening blocker due to SEO indexation impact)*
- **Area**: SEO & Video Distribution
- **Files / Paths**: [app/video-sitemap.xml/route.ts](file:///c:/Users/Lenovo/OneDrive/Desktop/Lokswami_V3/Zaid-lokswami/app/video-sitemap.xml/route.ts#L27) and [lib/utils/readerContentPaths.ts](file:///c:/Users/Lenovo/OneDrive/Desktop/Lokswami_V3/Zaid-lokswami/lib/utils/readerContentPaths.ts#L8-L15)
- **Current-Code Verification**:
  In `app/video-sitemap.xml/route.ts`:
  ```typescript
  const pagePath = buildVideoReaderPath(video._id, video.slug);
  ```
  In `lib/utils/readerContentPaths.ts`:
  ```typescript
  export function buildVideoReaderPath(videoId?: string, swipeSlug?: string) {
    const normalizedSlug = String(swipeSlug || '').trim();
    if (normalizedSlug) return buildSwipeReaderPath(normalizedSlug);
    ...
  }
  ```
  Any video that has a slug (including normal landscape 16:9 newsroom videos) is routed by `buildVideoReaderPath` to `/main/shorts/${slug}`.
- **Impact**: Google Video Search indexes regular landscape videos under vertical shorts URLs. When users click Google search results, they are directed to the vertical swipe reader for horizontal content.
- **Recommended Correction**: Distinguish video type using `video.isShort` or verified domain distinction. Short videos route to `/main/shorts/<slug>`; regular videos route to `/main/videos?video=<id>`.
- **Test Required**: Test in `tests/video-sitemap-route.test.ts` verifying regular video, short video, slug presence on both, canonical URL output, and XML escaping.
- **Blocks Production Hardening?**: **YES**.

---

### GAP-012: Video Sitemap Truncated to First 50 Videos (Missing Pagination)
- **Nature**: **VERIFIED**
- **Original Review Severity**: `P2`
- **B3 Hardening Priority**: `P1` *(Promoted to hardening blocker due to SEO catalog coverage)*
- **Area**: SEO & Search Indexing
- **Files / Paths**: [app/video-sitemap.xml/route.ts](file:///c:/Users/Lenovo/OneDrive/Desktop/Lokswami_V3/Zaid-lokswami/app/video-sitemap.xml/route.ts#L23), [lib/server/publicVideos.ts](file:///c:/Users/Lenovo/OneDrive/Desktop/Lokswami_V3/Zaid-lokswami/lib/server/publicVideos.ts#L129-L147), and [lib/utils/cursorPage.ts](file:///c:/Users/Lenovo/OneDrive/Desktop/Lokswami_V3/Zaid-lokswami/lib/utils/cursorPage.ts#L61-L63)
- **Current-Code Verification**:
  In `app/video-sitemap.xml/route.ts`:
  ```typescript
  const { items: videos } = await getPublicVideoFeedPage({ limit: 1000 });
  ```
  `getPublicVideoFeedPage` delegates to `cursorPage` without setting `maxLimit`. In `cursorPage.ts`, `DEFAULT_MAX_LIMIT` is 50. `resolveCursorLimit(1000)` clamps the limit to **50**.
  Moreover, `video-sitemap.xml` makes only a single call without cursor pagination.
- **Impact**: Only the first 50 published videos are ever published to Google's video sitemap. All remaining videos in the catalog are excluded from XML sitemap indexing.
- **Recommended Correction**: Implement bounded sitemap-specific pagination using the existing cursor contract (continue while `hasMore`, consume `nextCursor`, prevent infinite loops, deduplicate URLs) without raising global public feed caps.
- **Test Required**: Regression test with a dataset larger than 50 videos proving multi-page cursor traversal and deterministic URL output.
- **Blocks Production Hardening?**: **YES**.

---

### GAP-013: Supported Node Runtime Migration
- **Nature**: **FUTURE REQUIREMENT**
- **Original Review Severity**: N/A *(New B3 Architecture Finding)*
- **B3 Hardening Priority**: `P2`
- **Area**: Toolchain & Platform Lifecycle
- **Context**: 
  - Inherited project configuration: `package.json` specifies `"engines": { "node": "20.x" }` and GitHub Actions uses `node-version: 20`.
  - Upstream status: Node.js 20 reached End-of-Life (EOL) in March 2026. Node.js 24 is the active LTS release.
  - Architecture Strategy: B3 will **NOT** mix runtime migration with Phase 1 application release defect fixes.
  - Phase 1 strictly preserves inherited Node 20.x compatibility behavior.
  - A dedicated post-hardening migration phase will execute the formal migration path:
    ```
    CURRENT COMPATIBILITY: Node 20.x (verify inherited application behavior)
          ↓
    B3 TARGET: Node 24 LTS (dedicated migration + dependency compatibility tests)
          ↓
    Update package.json engines
          ↓
    Update GitHub CI workflows
          ↓
    Update Hostinger production deployment scripts
    ```
- **Blocks Production Hardening?**: **NO** (Dedicated roadmap phase post-hardening).
