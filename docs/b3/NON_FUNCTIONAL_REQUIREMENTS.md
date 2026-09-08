# LokSwami B3 — Non-Functional Requirements Specification

This document defines the architectural quality attributes, constraints, performance budgets, and operational benchmarks for LokSwami B3.

---

## 1. Performance & Core Web Vitals

- `TARGET REQUIREMENT`:
  - **Largest Contentful Paint (LCP)**: $\le 2.5$ seconds at the 75th percentile for real reader visits across mobile and desktop.
  - **Interaction to Next Paint (INP)**: $\le 200$ milliseconds at the 75th percentile.
  - **Cumulative Layout Shift (CLS)**: $\le 0.1$ at the 75th percentile.
  - **First Contentful Paint (FCP)**: $\le 1.8$ seconds.
  - **Time to First Byte (TTFB)**: $\le 800$ milliseconds on edge CDN.
- `TARGET REQUIREMENT`:
  - Image payloads must use responsive sizing (`next/image`), modern formats (AVIF/WebP), and explicit `width`/`height` attributes to eliminate layout shifts.
  - Above-the-fold JavaScript execution must be strictly minimized; defer non-critical analytics, trackers, and widgets.
- `CURRENT FACT`: Instrumentation and web vitals tracking hooks exist in `tests/web-vitals-instrumentation.test.ts`.

---

## 2. Scalability & Traffic Spike Resilience

- `TARGET REQUIREMENT`:
  - The public reading tier must be stateless and horizontally scalable behind a CDN / reverse proxy.
  - Spike protection: public read traffic must hit edge caches or memory caches first, shielding the primary MongoDB cluster during breaking news surges.
  - Database queries must execute against compound indexes; full collection scans on public feeds are strictly prohibited.
  - Benchmark and stress test using `scripts/load-test-public.js` before certifying production capacity. Never claim concurrent-user numbers from raw server RAM/CPU specs alone.

---

## 3. Availability & Graceful Degradation

- `TARGET REQUIREMENT`:
  - Core article reading must achieve 99.9% uptime.
  - **Graceful Degradation Hierarchy**:
    1. If **MongoDB** is slow or unreachable, public read paths seamlessly fall back to reading local atomic JSON file stores (`isMongoAvailable()` probe).
    2. If **Upstash Redis** is unavailable or exceeds 150ms timeout, the circuit breaker trips for 60 seconds, falling back to in-memory rate limiting and locks.
    3. If **AI services** fail, the newsroom CMS remains fully functional for manual writing and publishing.
    4. If **TTS audio** fails, article text rendering is completely unaffected.
    5. If **Distribution** (WhatsApp/push) fails, publication state remains intact.

---

## 4. Caching & Edge Delivery

- `TARGET REQUIREMENT`:
  - Multi-tier caching policy:
    | Content Type | Cache Strategy | TTL | Invalidation Trigger |
    | :--- | :--- | :--- | :--- |
    | **Breaking News** | Edge Cache + SWR | 30–60 seconds | On new breaking item publish |
    | **Published Articles** | Edge Cache + CDN | 5–15 minutes | On article edit/republish |
    | **Homepage Feed** | Edge Cache + SWR | 60–120 seconds | On homepage placement change |
    | **E-Paper Page Images** | CDN Immutable | 1 year | URL is content-hashed |
    | **CMS / Admin Pages** | Private `no-store` | 0 seconds | Never cached |
    | **Reader Profile** | Private `no-store` | 0 seconds | Never cached |

---

## 5. Security & RBAC Governance

- `CURRENT FACT`: Server-side RBAC enforced across 4 roles (`super_admin`, `admin`, `copy_editor`, `reporter`). Rate limiting and CSP logging implemented in `lib/security/`.
- `TARGET REQUIREMENT`:
  - **Defense in Depth**: Every administrative API endpoint and Server Action must validate authentication session, role permission, and CSRF token server-side. Client-side button disabling is strictly an ergonomic feature, never a security boundary.
  - **Input Sanitization**: All user/CMS inputs (HTML from Tiptap, query params, search terms) must pass strict schema validation (`lib/security/validation.ts`) to prevent XSS, prototype pollution, and NoSQL injection.
  - **Zero Secrets**: Secrets, tokens, or credentials must never be committed to git, written to public docs, or leaked into client bundles.

---

## 6. Privacy, Consent & Reader Data

- `TARGET REQUIREMENT`:
  - Data minimization: collect only reader information required for authentication, localized edition delivery, and explicit notification opt-ins.
  - GDPR/DPDP alignment: explicit consent checkboxes for WhatsApp and Push notifications with timestamped records.
  - 1-click opt-out mechanisms for all distributed alerts.

---

## 7. Data Integrity, Concurrency & Idempotency

- `TARGET REQUIREMENT`:
  - **Non-Destructive Evolution**: Database schema updates must be additive and backward-compatible.
  - **Concurrency Control**: Heartbeat locks (`ArticleLock.ts`) with compare-and-swap (CAS) semantics to prevent simultaneous editing overwrites.
  - **Idempotent Background Jobs**: E-Paper page processing, OCR generation, and distribution jobs must be idempotent; retrying a failed attempt must not create duplicate records or corrupt assets.

---

## 8. Observability, Logging & Auditability

- `CURRENT FACT`: Structured security audit logger (`lib/security/auditLogger.ts`) logs login attempts, role promotions, and critical changes.
- `TARGET REQUIREMENT`:
  - End-to-end request correlation IDs (`x-request-id`) passed across middleware, route handlers, and service calls.
  - Telemetry: capture route execution duration, status codes, external service latency (MongoDB, Redis, DO Spaces), and error classifications.
  - Background worker telemetry: record job IDs, queue latency, execution time, retry counts, and worker memory usage.
  - Operational health diagnostics page in CMS (`/admin/operations-diagnostics`) reporting live subsystem statuses.

---

## 9. Testability, Deployment Safety & Rollback

- `CURRENT FACT`: 158 Vitest tests, CI workflow (`ci.yml`), Hostinger versioned releases with `rollback:hostinger`.
- `TARGET REQUIREMENT`:
  - Fast feedback loop: focused unit/integration tests run under 10 seconds.
  - CI gatekeeper: `npm run lint`, `npm run typecheck`, `npm run test:ci`, and `npm run build:ci` must pass before any branch can merge to `main`.
  - Zero-downtime Hostinger deployments: maintain overlapping `/_next/static/` chunks across releases to prevent `ChunkLoadError` crashes for active readers.
  - Rapid rollback capability: ability to revert to the previous release within 30 seconds via `npm run rollback:hostinger`.

---

## 10. AI Traceability, Cost Awareness & Human Oversight

- `TARGET REQUIREMENT`:
  - **Traceability**: Every AI run must store input prompt hash, model version, system prompt version, retrieved evidence citations, and token consumption.
  - **Cost Bounding**: Token limits and rate limiting per newsroom user to prevent accidental runaway API spend.
  - **Human-in-the-Loop**: An AI output is always treated as an unverified draft until an authenticated human editor explicitly approves it.
