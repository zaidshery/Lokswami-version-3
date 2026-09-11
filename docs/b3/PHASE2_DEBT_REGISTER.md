# LokSwami B3 — Phase 2 Debt Register & Deferred Backlog

## 1. Overview

This document serves as the authoritative debt register following the completion of Phase 2 (Modular Monolith Domain Decoupling). 

In accordance with Phase-2 audit principles:
- **P0 / P1 issues**: Blockers that must be fixed prior to architecture freeze. **Total P0 = 0, Total P1 = 0.**
- **P2 production debt**: High-value production hardening, infrastructure scaling, and operational maturity tasks that are explicitly out-of-scope for Phase 2 domain decoupling and are assigned to future roadmap phases.
- **P3 documentation & polish**: Non-critical cosmetic cleanup.

---

## 2. Blockers vs. Deferred Debt Summary

| Severity | Count | Status | Notes |
| :--- | :--- | :--- | :--- |
| **P0 — Critical Blocker** | 0 | None | Zero credential leaks, data corruption, or unauthorized publication issues. |
| **P1 — Freeze Blocker** | 0 | None | All 7 domain slices internally consistent, invariants verified, contracts preserved. |
| **P2 — Production Hardening Debt** | 9 | Cataloged & Assigned | Scoped to Phase 3 through Phase 11. |
| **P3 — Minor Polish** | 0 | None | Documentation is up to date and synchronized with runtime reality. |

---

## 3. P2 Production Debt Register

| ID | Severity | Area | Description | Why Deferred | Target Phase | Risk | Suggested Resolution |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **DEBT-001** | P2 | Observability | End-to-end distributed tracing, request correlation IDs (`x-request-id`), and structured JSON logging across all API routes. | Phase 2 focused on domain encapsulation and contract safety. Adding tracing wrappers across all controllers belongs to dedicated observability phase. | Phase 3 (Observability Foundation) | Low: Debugging multi-hop requests currently relies on standard console error logs. | Implement standard middleware injecting `x-request-id`, structured logger adapter (Pino/Winston), and OpenTelemetry integration. |
| **DEBT-002** | P2 | Background Jobs | Durable distributed asynchronous task queue (BullMQ / Redis / SQS) with retries and dead-letter queues. | Introducing external message brokers in Phase 2 violates the modular monolith constraints. In-process promises and Next.js background execution currently suffice. | Phase 6 (Asynchronous Job Foundation) | Medium: If web worker crashes during PDF/OCR processing, job must be retried manually by admin. | Introduce Redis-backed BullMQ job queue for PDF slicing, OCR processing, and batch email/push dispatches. |
| **DEBT-003** | P2 | Real-time Streaming | Distributed Pub/Sub for live newsroom analytics streaming. | Current admin live analytics uses local in-memory event polling (`/api/admin/analytics/live`) and basic SSE. External pub/sub infrastructure was forbidden in Phase 2. | Phase 3 / Phase 6 | Low: Multi-instance horizontal scaling would partition live viewer counters across pods without Redis pub/sub. | Implement Redis Pub/Sub adapter for live analytics events when deploying multi-pod clusters. |
| **DEBT-004** | P2 | Media Processing | Offloading CPU-heavy Sharp image processing and focal crop generation to dedicated background worker containers. | Sharp runs in-process inside Node runtime. Sufficient for current CMS load; dedicated media workers require independent microservices or serverless functions. | Phase 7 / Phase 11 | Low-to-Medium: High concurrent image uploads could momentarily increase Web process CPU usage. | Extract image optimization into an asynchronous worker or Cloudflare Image resizing / S3 trigger worker. |
| **DEBT-005** | P2 | Edge Caching | Automated edge CDN cache purge integration (Cloudflare / Fastly API hooks) beyond Next.js App Router on-demand `revalidatePath`. | Current caching relies on HTTP `Cache-Control` response headers and Next.js internal Data Cache. | Phase 4 (Reader Performance & Caching) | Low: Edge CDN TTLs expire gracefully, but instant global purge requires external CDN API tokens. | Add edge CDN invalidation webhooks in `editorialService` and `epaperService` upon publication. |
| **DEBT-006** | P2 | Runtime Modernization | Vite / Vitest CommonJS configuration warning (`configLoader: 'native'`) and Node 20.x runtime modernization. | Build and test tools are fully operational and stable. Migrating build config module formats mid-audit risks build regression. | Phase 3 (Tooling Polish) | Negligible: Generates benign warning in Vitest terminal output without impacting runtime. | Migrate `vitest.config.ts` to `.mts` or configure `"type": "module"` in package configuration. |
| **DEBT-007** | P2 | Code Quality | Remediation of 197 legacy ESLint warnings in UI components and test mocks (`@typescript-eslint/no-explicit-any`, `@next/next/no-img-element`). | Strict lint (`npm run lint:strict`) for all server, model, security, and API code passes with 0 warnings. Mass-editing legacy UI components was forbidden to prevent regressions. | Phase 4 / Phase 11 | Negligible: Warnings are confined to legacy React JSX markup and test mocks. Zero runtime errors. | Incrementally replace `any` with strict schema types and replace raw `<img>` with Next.js `<Image>` in UI components. |
| **DEBT-008** | P2 | Infrastructure | Automated multi-region database backup, snapshot verification, and point-in-time recovery (PITR) orchestration. | Managed at cloud provider infrastructure layer (MongoDB Atlas / Hostinger VPS), outside application domain boundaries. | Phase 11 (Deployment & Recovery Maturity) | Medium (Operational): Disaster recovery relies on hosting provider automated daily snapshots. | Codify backup verification scripts and automated staging restore drills in CI/CD pipeline. |
| **DEBT-009** | P2 | Performance Telemetry | Real-user Core Web Vitals (CWV) telemetry aggregation and automated p75 performance regression alerting. | Beacon endpoint (`/api/v1/public/analytics/vitals`) is implemented and privacy-hardened. Field analytics dashboards belong to reader performance phase. | Phase 4 (Reader Performance & Caching) | Low: Performance targets (LCP $\le 2.5$s, INP $\le 200$ms, CLS $\le 0.1$) must be continuously monitored against production traffic. | Build automated leadership alerting and daily CWV aggregation rollups from ingested beacon telemetry. |

---

## 4. Architecture Rules for Debt Resolution

When resolving debt items in future phases:
1. **Never Compromise Safety Invariants**: Resolving background queue debt (DEBT-002) must preserve reader credential fail-closed rules and released snapshot isolation.
2. **Never Add Unnecessary Microservices**: Implement distributed queues (DEBT-002) or pub/sub (DEBT-003) as infrastructure adapters within the modular monolith before considering physical service extraction.
3. **Strict Verification Required**: Every debt resolution must be accompanied by automated regression tests and must pass all standard quality gates.
