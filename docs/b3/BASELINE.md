# LokSwami B3 — Baseline Plan & Certified Verification Results

## 1. System & Git Environment

- **Branch**: `b3/foundation`
- **Base Commit SHA**: `24e56910026744a33fb81c0b36015322840549e3`
- **Local Node.js Runtime**: `v24.19.0` (npm `11.17.0`)
  - *Engine Policy*: `package.json` specifies `"engines": { "node": "20.x" }`.
  - *CI Parity*: GitHub Actions CI (`.github/workflows/ci.yml` and `deploy-hostinger.yml`) runs on `node-version: 20`.
  - *Parity Status*: Workspace runs with an `EBADENGINE` warning. Host Node alignment to Node 20 LTS is documented in GAP-002.
- **Repository / Integrity Baseline**:
  - Captured via `npm run capture:baseline` into `.hostinger/improvement-baselines/`.
  - Content: 1,093 files, 252 route checksums, and package manifests.
  - *Terminology Clarification*: This snapshot is strictly a **Repository / Integrity Baseline** confirming file tree, route mapping, and dependency consistency. It is **NOT** a runtime performance benchmark.
- **Runtime Performance Status**:
  - Staging/Production Capacity: **UNMEASURED** (deferred to controlled testing phases; live public domains are never load-tested during baseline certification).
  - Local Build Baseline: Measured at Level E below.

---

## 2. Baseline Certification Levels (A through G)

LokSwami B3 adopts an explicit 7-tier certification model. A blanket statement that "the repository is certified healthy" is prohibited without qualifying the exact certification level.

| Level | Certification Tier | Status | Verification Mechanism | Key Results & Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Level A** | **Static Quality** | **CERTIFIED** | `verify:dependency-security`, `typecheck`, `lint` | TypeScript clean (0 errors), 0 dependency vulnerabilities, ESLint clean (0 errors, 154 non-blocking warnings audited in GAP-003). |
| **Level B** | **Automated Tests** | **CERTIFIED** | `test:ci`, `test:governance`, `test:four-role-newsroom` | **202 test files passed, 927 tests passed, 0 failures**. Auth guards 7/7 passed. Admin credentials passed. Cold-start timeout in `test:security` noted as GAP-001. |
| **Level C** | **Production Build** | **CERTIFIED** | `build:ci` (Next.js 15.5.22) | Compiled cleanly in ~3m 54s. All 252 static, dynamic, and API routes bundled without syntax or bundling errors. |
| **Level D** | **Local Runtime Smoke** | **CERTIFIED (HTTP)** / **ENV-DEPENDENT (Browser)** | Standalone Next.js server on port 3100 | HTTP reader and security endpoints verified live. Unauthenticated `/admin` rejected with 302 redirect. Playwright headless shell depends on host browser binaries. |
| **Level E** | **Local Performance** | **CERTIFIED LOCAL BASELINE** | `load:test:public` (concurrency 2, 5s) | **340 requests, 67.93 RPS, Avg 29ms, P50 18ms, P95 90ms, P99 107ms**. Clearly classified as Local Development / Local Build Baseline (NOT production capacity). |
| **Level F** | **Staging Performance** | **PENDING** | Staged VUs (25 → 50 → 100 → 200) | To be executed against staging environment during Phase 4 & Phase 11. |
| **Level G** | **Production Readiness** | **PENDING** | Release hardening verification | Blocked pending resolution of inherited release defects GAP-008, GAP-009, GAP-011, and GAP-012. |

---

## 3. Detailed Verification Matrix (Phase 0 Control Group)

| Step | Command | Status | Duration | Scope & Result Summary |
| :--- | :--- | :--- | :--- | :--- |
| **1** | `npm run verify:dependency-security` | **PASS** | ~15s | Checked against known advisory ranges. Zero vulnerabilities in tracked dependencies. |
| **2** | `npm run lint` | **PASS** | ~30s | ESLint passed with **0 errors**, 154 non-blocking warnings (123 unused vars, 14 any, 10 raw img, 6 hook deps, 1 alt text). |
| **3** | `npm run typecheck` | **PASS** | ~17s | TypeScript `tsc --noEmit` passed cleanly with **0 errors**. |
| **4** | `npm run test:security` | **WARNING** | ~48s | 7 of 8 test files passed (62 tests passed, 1 cold-start timeout in `admin-team-routes.test.ts`; passes in < 800ms when warm). |
| **5** | `npm run test:governance` | **PASS** | ~3.9s | 4 test files, **16 passed tests** (permissions governance, review, deployment safeguards). |
| **6** | `npm run test:four-role-newsroom` | **PASS** | ~4.4s | 6 test files, **25 passed tests** (setup link routes, staff setup, newsroom metadata, workflow transitions). |
| **7** | `npm run test:ci` | **PASS** | ~137s | **202 test files passed, 927 tests passed, 0 failed**. Auth guards (7/7 passed), admin credentials regression (passed). |
| **8** | `npm run build:ci` | **PASS** | ~3m 54s | Next.js 15.5.22 production build succeeded. All 252 static, dynamic, and API routes bundled cleanly. |
| **9** | `npm run verify:prod-env` | **ENVIRONMENT-DEPENDENT** | ~2s | Reports missing production secrets (`MONGODB_URI`, `NEXTAUTH_SECRET`, Spaces keys). Expected for local non-production environment. |
| **10** | `npm run capture:baseline` | **PASS** | ~19s | Offline integrity snapshot captured: 1,093 files, 252 routes mapped into `.hostinger/improvement-baselines/`. |
| **11** | Local Runtime Smoke (HTTP) | **PASS** | ~5s | Standalone server verified on `localhost:3100`: `/` (307 redirect), `/main` (200 OK), `/main/latest` (200), `/main/epaper` (200), `/main/videos` (200), `/main/search` (200), `/admin` (302 auth redirect), `/signin` (200). |
| **12** | Local Runtime Smoke (Playwright) | **ENVIRONMENT-DEPENDENT** | — | `scripts/browser-smoke-local.js` failed on missing host Playwright Chromium binary in `%LOCALAPPDATA%\ms-playwright`. |
| **13** | Local Performance Baseline | **PASS** | ~5s | Low-concurrency local baseline captured via `load:test:public`. 340 requests, 67.93 RPS, Avg 29ms, P50 18ms, P95 90ms, P99 107ms. |

---

## 4. Local Development / Local Build Baseline (Level E Results)

> [!IMPORTANT]
> **LOCAL DEVELOPMENT / LOCAL BUILD BASELINE ONLY**: These measurements reflect local machine execution with Next.js standalone on `localhost:3100` and do **not** represent production capacity or remote network conditions.

- **Target**: `http://localhost:3100`
- **Concurrency**: 2 Virtual Users
- **Duration**: 5.0 seconds
- **Evaluated Routes**: 9 routes (`/`, `/main`, `/main/latest`, `/main/epaper`, `/api/v1/public/home-feed`, `/api/v1/public/articles?limit=10`, `/api/v1/public/epapers?limit=10`, `/api/videos/latest?limit=6`, `/api/v1/public/search?q=indore&limit=10`)

### Summary Metrics
- **Total Requests**: 340
- **Successful Requests (OK)**: 323
- **Errors**: 17 (5.0% error rate; all 17 were HTTP 429 Rate Limit responses on the public search API route, demonstrating active security rate limiting)
- **Throughput**: 67.93 Requests/sec
- **Latency**:
  - **Average**: 29 ms
  - **P50 (Median)**: 18 ms
  - **P95**: 90 ms
  - **P99**: 107 ms

### Route Breakdown
| Route Path | Type | Total Requests | Errors | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `/` | HTML Redirect | 38 | 0 | Returns 307 redirect to `/main` |
| `/main` | HTML SSR | 38 | 0 | 200 OK, full reader shell |
| `/main/latest` | HTML SSR | 38 | 0 | 200 OK |
| `/main/epaper` | HTML SSR | 38 | 0 | 200 OK |
| `/api/v1/public/home-feed` | JSON API | 38 | 0 | 200 OK |
| `/api/v1/public/articles?limit=10` | JSON API | 38 | 0 | 200 OK |
| `/api/v1/public/epapers?limit=10` | JSON API | 38 | 0 | 200 OK |
| `/api/videos/latest?limit=6` | JSON API | 37 | 0 | 200 OK |
| `/api/v1/public/search?q=indore&limit=10` | JSON API | 37 | 17 | 17 requests rate-limited (HTTP 429) |

---

## 5. Staged Performance Benchmarking Protocol (Phases 4 & 11)

High-concurrency load testing against public infrastructure was intentionally excluded from Phase 0 and Phase 0.5. 
When staging performance benchmarking begins in Phase 4 (Reader Performance) and Phase 11 (Load Testing & Extraction), the staged concurrency progression will be:

```
Tier 1: 25 Concurrent Virtual Users (Warmup & Baseline)
   ↓
Tier 2: 50 Concurrent Virtual Users (Moderate Traffic Peak)
   ↓
Tier 3: 100 Concurrent Virtual Users (High Breaking News Surge)
   ↓
Tier 4: 200 Concurrent Virtual Users (Extreme Election Day Surge)
```

### Staging Target Thresholds
- **Requests Per Second (RPS)**: Measured across `/main`, `/main/article/[id]`, `/api/v1/public/home-feed`.
- **Latency Percentiles**: P50 $\le 200$ms, P95 $\le 800$ms, P99 $\le 1500$ms.
- **Error Rate**: $\le 0.05\%$ under peak load (excluding intentional security rate limits).
- **Degradation**: Graceful fallback to file-store/cache when MongoDB is saturated.
