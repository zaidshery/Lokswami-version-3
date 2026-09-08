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

| Gap ID | Original Review Severity | B3 Hardening Priority | Nature | Subsystem / Area | Finding Summary | Status | Blocks Hardening? | Target Phase |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **GAP-001** | `P2` | `P2` | **VERIFIED** | Testing / Environment | Vitest parallel cold-start timeout in `admin-team-routes.test.ts` | OPEN | **NO** | Phase 1 |
| **GAP-002** | `P2` | `P2` | **VERIFIED** | Toolchain / Runtime | Node.js engine discrepancy (`v24.19.0` local vs. `20.x` CI & `package.json`) | OPEN | **NO** | Phase 1 |
| **GAP-003** | `P2` | `P2` | **VERIFIED** | Code Quality / Lint | 154 ESLint warnings (123 unused vars, 14 any, 10 raw img, 6 hooks, 1 a11y) | OPEN | **NO** | Phase 4 |
| **GAP-004** | `P2` | `P2` | **INFERRED** | Background Jobs | Lack of persistent external queue broker for heavy PDF/OCR tasks | OPEN | **NO** | Phase 6 & 7 |
| **GAP-005** | `P3` | `P3` | **FUTURE REQ** | AI Newsroom | Absence of provider-neutral multi-agent research & evidence package pipeline | OPEN | **NO** | Phase 8 |
| **GAP-006** | `P2` | `P2` | **VERIFIED** | Observability | Request correlation IDs (`x-request-id`) and timing metrics not uniform across API v1 | OPEN | **NO** | Phase 3 |
| **GAP-007** | `P2` | `P2` | **VERIFIED** | Audience / Sharing | WhatsApp preview card generation lacks unified multi-format abstraction | OPEN | **NO** | Phase 5 |
| **GAP-008** | `P1` | `P1` | **VERIFIED** | E-Paper / Editorial | Draft article edit prematurely mutates and publishes `epaperPage.releasedSnapshot` | **CLOSED** | Resolved | Phase 1 |
| **GAP-009** | `P1` | `P1` | **VERIFIED** | PDF Processing | Mutex lock released on `Promise.race` timeout while native canvas render continues | **CLOSED** | Resolved | Phase 1 |
| **GAP-010** | `P2` | `P2` | **VERIFIED** | User Profile / Resilience | Reader password change calls `connectDB()` unconditionally, failing during DB outage | **CLOSED** | Resolved | Phase 1 |
| **GAP-011** | `P2` | `P1` *(Promoted)* | **VERIFIED** | SEO / Video Sitemap | Regular landscape news videos generate vertical `/main/shorts/...` URLs in sitemap | **CLOSED** | Resolved | Phase 1 |
| **GAP-012** | `P2` | `P1` *(Promoted)* | **VERIFIED** | SEO / Video Sitemap | Video sitemap clamped to 50 videos max due to unpaginated cursor limit clamp | **CLOSED** | Resolved | Phase 1 |
| **GAP-013** | N/A *(New)* | `P2` | **FUTURE REQ** | Toolchain / Runtime | Supported Node Runtime Migration (Inherited Node 20.x $\to$ Target Node 24 LTS) | OPEN | **NO** | Post-Hardening |

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

### GAP-008: E-Paper Draft Edit Mutates Public `releasedSnapshot`
- **Nature**: **VERIFIED**
- **Original Review Severity**: `P1`
- **B3 Hardening Priority**: `P1`
- **Status**: **CLOSED** (Resolved in B3 Phase 1)
- **Area**: E-Paper Editorial Workflow
- **Implementation Files**: [app/api/admin/articles/[id]/route.ts](file:///c:/Users/Lenovo/OneDrive/Desktop/Lokswami_V3/Zaid-lokswami/app/api/admin/articles/[id]/route.ts#L900-L925)
- **Regression Tests**: [tests/epaper-release-snapshot-safety.test.ts](file:///c:/Users/Lenovo/OneDrive/Desktop/Lokswami_V3/Zaid-lokswami/tests/epaper-release-snapshot-safety.test.ts)
- **Verification Evidence**:
  - Regression test proved failure on inherited code (draft title leaked into `releasedSnapshot` during article update) and passes post-fix across all steps A–F.
  - Full CI test suite passes (205 test files, 936 tests).
- **Correction Applied**: Removed premature assignment of `epaperPage.releasedSnapshot` from the article draft save handler. The explicit release endpoint `app/api/admin/epapers/[id]/articles/[articleId]/release/route.ts` remains the single authoritative path updating `releasedSnapshot`.
- **Blocks Production Hardening?**: **RESOLVED**.

---

### GAP-009: PDF Render Mutex Released on `Promise.race` Timeout While Render Continues & Permanent Wedge Vulnerability (P1-A)
- **Nature**: **VERIFIED**
- **Original Review Severity**: `P1`
- **B3 Hardening Priority**: `P1`
- **Status**: **CLOSED** (Resolved & Hardened against P1-A in B3 Phase 1)
- **Area**: PDF Rendering & Server Stability
- **Implementation Files**: [lib/server/pdf/pdfWorker.ts](file:///c:/Users/Lenovo/OneDrive/Desktop/Lokswami_V3/Zaid-lokswami/lib/server/pdf/pdfWorker.ts#L30-L280)
- **Regression Tests**: [tests/pdf-render-mutex-safety.test.ts](file:///c:/Users/Lenovo/OneDrive/Desktop/Lokswami_V3/Zaid-lokswami/tests/pdf-render-mutex-safety.test.ts) and [tests/pdf-worker-isolation.test.ts](file:///c:/Users/Lenovo/OneDrive/Desktop/Lokswami_V3/Zaid-lokswami/tests/pdf-worker-isolation.test.ts)
- **Verification Evidence**:
  - Proved that when timeout fires, mutex is retained until underlying render settles, preventing concurrent canvas executions and unhandled promise rejections.
  - Proved anti-wedge behavior (P1-A): if an underlying render hangs indefinitely, queued callers have bounded timeouts (rejecting with `PdfWorkerTimeoutError` after their configured wait limit rather than hanging forever), callers never overlap, `recoverPdfWorkerLock()` safely clears the hung lock state, subsequent renders succeed normally, and no unhandled rejections occur.
  - Underlying native PDF.js render tasks are actively cancelled via `renderTask.cancel()` on timeout.
  - All 7 tests in `pdf-render-mutex-safety` and `pdf-worker-isolation` pass.
- **Correction Applied**:
  - Replaced promise-chaining mutex with an anti-wedge request queue with per-caller wait timeouts.
  - Added cancellation hook for PDF.js native render tasks via `renderTask.cancel()`.
  - Added safe recovery API (`recoverPdfWorkerLock()`) and diagnostic state helper (`isPdfWorkerLocked()`).
  - Mutex release is safely deferred via `.finally()` with `.catch(() => undefined)` to prevent unhandled late rejections.
- **Blocks Production Hardening?**: **RESOLVED**.

---

### GAP-010: Reader Credential Consistency & Fail-Closed Password Mutation Policy
- **Nature**: **VERIFIED**
- **Original Review Severity**: `P2`
- **B3 Hardening Priority**: `P1` *(Elevated to P1 blocker due to dual-store credential split-brain risk)*
- **Status**: **CLOSED** (Hardened with Fail-Closed Mutation & Mongo-Only Credential Authority in B3 Phase 1.3)
- **Area**: Authentication & Dual Persistence
- **Implementation Files**: [app/api/user/profile/route.ts](file:///c:/Users/Lenovo/OneDrive/Desktop/Lokswami_V3/Zaid-lokswami/app/api/user/profile/route.ts#L155-L310) and [lib/auth/readerCredentials.ts](file:///c:/Users/Lenovo/OneDrive/Desktop/Lokswami_V3/Zaid-lokswami/lib/auth/readerCredentials.ts#L1-L85)
- **Regression Tests**: [tests/user-profile-password-fallback.test.ts](file:///c:/Users/Lenovo/OneDrive/Desktop/Lokswami_V3/Zaid-lokswami/tests/user-profile-password-fallback.test.ts) and [tests/reader-credentials-auth.test.ts](file:///c:/Users/Lenovo/OneDrive/Desktop/Lokswami_V3/Zaid-lokswami/tests/reader-credentials-auth.test.ts)
- **Verification Evidence**:
  - Proved forward split-brain hazard: if password mutations were allowed during a MongoDB outage via file-store fallback, upon Mongo recovery both the old Mongo password and the new file-store password remained valid.
  - Proved reverse split-brain hazard: if MongoDB user password was updated, but file-store sync was delayed, failed, or diverged, previous authentication logic fell through to file storage upon MongoDB password mismatch or Mongo outage, allowing an old/stale password to authenticate.
  - Enforced strict Phase 1 fail-closed security policy:
    - **MongoDB is authoritative for reader credentials**: MongoDB is the sole credential authority; file-store passwords are never used to authorize logins.
    - **Password changes fail closed during Mongo outage**: Password mutations require MongoDB to be reachable and authoritatively verified and updated in the same request flow. If MongoDB is unavailable during verification or update, the endpoint immediately returns HTTP 503 (`Password changes are temporarily unavailable. Please try again shortly.`), writing nothing to either Mongo or file store.
    - **New password authentication fails closed during Mongo outage**: If MongoDB is unavailable, login attempts fail closed immediately (`return null`), preventing any fallback to stale file-store passwords.
    - **File-store fallback remains for non-credential profile resilience**: Non-password profile edits (name, WhatsApp number, language, reading preferences) retain complete file-store fallback resilience during MongoDB outages without altering credentials (`passwordHash` and `passwordSetAt` remain immutable).
    - **Any future offline credential resilience requires a properly designed credential-replication mechanism**: Standalone dual credential authorities are strictly disallowed.
  - All 12 regression tests across `tests/user-profile-password-fallback.test.ts` (6 tests) and `tests/reader-credentials-auth.test.ts` (6 tests) pass cleanly.
- **Correction Applied**:
  - Replaced fallback-authorized password updates with strict fail-closed handling returning HTTP 503 when MongoDB is unavailable.
  - In `authorizeReaderCredentials`, eliminated file-store password authentication entirely. Replaced fall-through and outage fallback with strict fail-closed behavior returning `null`.
  - Preserved dual-store resilience exclusively for non-password profile updates.
  - Policy documented: non-password profile updates retain fallback resilience; credential mutation and authentication fail closed when Mongo is unavailable; future offline credential resilience requires a properly designed credential-replication mechanism.
- **Blocks Production Hardening?**: **RESOLVED**.


---

### GAP-011: Video Sitemap Routes Normal Videos to Vertical Shorts URLs
- **Nature**: **VERIFIED**
- **Original Review Severity**: `P2`
- **B3 Hardening Priority**: `P1` *(Promoted to hardening blocker due to SEO indexation impact)*
- **Status**: **CLOSED** (Resolved in B3 Phase 1)
- **Area**: SEO & Video Distribution
- **Implementation Files**: [app/video-sitemap.xml/route.ts](file:///c:/Users/Lenovo/OneDrive/Desktop/Lokswami_V3/Zaid-lokswami/app/video-sitemap.xml/route.ts#L65-L75)
- **Regression Tests**: [tests/video-sitemap-route.test.ts](file:///c:/Users/Lenovo/OneDrive/Desktop/Lokswami_V3/Zaid-lokswami/tests/video-sitemap-route.test.ts)
- **Verification Evidence**:
  - Proved assertion failure on inherited code (landscape video with slug wrongly produced `/main/shorts/...`). Passes post-fix with canonical `/main/videos?video=<id>` for regular videos and `/main/shorts/<slug>` for shorts.
  - XML escaping and runtime HTTP route verification verified at 200 OK.
- **Correction Applied**: In `app/video-sitemap.xml/route.ts`, passed `video.isShort ? video.slug : undefined` to `buildVideoReaderPath` so regular landscape videos retain canonical `/main/videos?video=<id>` regardless of slug presence.
- **Blocks Production Hardening?**: **RESOLVED**.

---

### GAP-012: Video Sitemap Truncated to First 50 Videos (Missing Pagination)
- **Nature**: **VERIFIED**
- **Original Review Severity**: `P2`
- **B3 Hardening Priority**: `P1` *(Promoted to hardening blocker due to SEO catalog coverage)*
- **Status**: **CLOSED** (Resolved in B3 Phase 1)
- **Area**: SEO & Search Indexing
- **Implementation Files**: [app/video-sitemap.xml/route.ts](file:///c:/Users/Lenovo/OneDrive/Desktop/Lokswami_V3/Zaid-lokswami/app/video-sitemap.xml/route.ts#L30-L65)
- **Regression Tests**: [tests/video-sitemap-route.test.ts](file:///c:/Users/Lenovo/OneDrive/Desktop/Lokswami_V3/Zaid-lokswami/tests/video-sitemap-route.test.ts)
- **Verification Evidence**:
  - Proved single-page 50-item limit failure on inherited code. Passes multi-page traversal (65 items across 2 cursor pages), cycle detection, URL deduplication, and max ceiling limits.
- **Correction Applied**: Implemented bounded cursor pagination iterating through `getPublicVideoFeedPage({ limit: 50, cursorPublishedAt, cursorId })` with cycle detection (`seenCursors`), URL deduplication (`seenUrls`), and max ceiling caps (`MAX_SITEMAP_VIDEOS = 10000`, `MAX_SITEMAP_PAGES = 250`).
- **Blocks Production Hardening?**: **RESOLVED**.

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
