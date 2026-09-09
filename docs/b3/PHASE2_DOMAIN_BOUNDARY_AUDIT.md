# LokSwami B3 — Phase 2.0 Master Architecture Audit
## Domain Boundaries & Modular Monolith Planning

> **Audit Baseline Commit**: `94a8b0e2b579abf76b89fc9352dacfcc629f5d10`
> **Branch**: `b3/phase2-domain-boundaries`
> **Status**: APPROVED ARCHITECTURE SPECIFICATION
> **Author**: Principal B3 Software Architect

---

## 1. Executive Summary

This document establishes the exhaustive architectural audit of the LokSwami B3 newsroom repository. In Phase 1, release-hardening safety invariants were established (isolated PDF worker threads, fail-closed reader credentials in MongoDB, immutable E-Paper `releasedSnapshot` protection, and video sitemap pagination).

Phase 2 initiates the structured evolution of LokSwami from **route-handlers-that-directly-own-persistence** toward a clean, maintainable, and observable **modular monolith**.

### Key Audit Findings
1. **Repository Scope**: 154 HTTP/API route files, 32 Mongoose models, 22 atomic file-store persistence modules, 264 internal domain/helper files, and 207 Vitest test suites.
2. **Direct Persistence Coupling**: **102 out of 154 routes (66.2%)** directly import Mongoose models, execute raw database queries, connect to MongoDB, or directly manipulate the atomic file-store fallback in their HTTP request/response handlers.
3. **Monolithic Route Handlers**: Several key administrative route files act as monolithic application tiers. Most notably, `app/api/admin/articles/[id]/route.ts` spans **2,289 lines** encompassing optimistic concurrency locking (CAS), revision snapshots, editorial state machine validation, audio synthesis resolution, SEO normalization, dual-persistence file sync, and cross-domain E-Paper article mutations.
4. **Target Direction**:
   ```
   HTTP Request / UI
          ↓
   API Route / Controller (app/api/**)
          ↓
   Domain Service / Application Service (lib/<domain>/*Service.ts)
          ↓
   Repository / Infrastructure Adapter (lib/<domain>/*Repository.ts)
          ↓
   MongoDB (Primary) / File Fallback / Upstash Redis / DO Spaces / Workers
   ```
5. **Architectural Guardrails**:
   - **No microservices**: All domain and service interactions remain in-process with zero network serialization latency.
   - **Zero UI changes**: Reader and CMS UI layouts, design tokens, and components are strictly preserved.
   - **Phase 1 Invariants Intact**: Credential authority remains solely in MongoDB; native PDF renders remain isolated in terminable worker threads; unreleased E-Paper drafts never mutate `releasedSnapshot`; AI never receives autonomous publishing authority.

---

## 2. Current Architecture & Coupling Map

### 2.1 Current System Topology

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CLIENT / TRANSPORT TIER                         │
│                                                                        │
│   Reader Web / PWA               Newsroom CMS               Public API │
│  (app/(reader)/**)             (app/(admin)/**)          (/api/v1/public)│
└──────────────┬─────────────────────────┬───────────────────────┬───────┘
               │                         │                       │
               ▼                         ▼                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   NEXT.JS 15 HTTP ROUTE HANDLERS                       │
│                        (154 API Route Files)                           │
│                                                                        │
│  • Request parsing & HTTP validation                                   │
│  • Ad-hoc inline RBAC role checks (`session?.user?.role !== 'admin'`)  │
│  • Inline business logic, editorial workflows & state transitions      │
│  • Direct Mongoose queries (`Article.find()`, `EPaper.create()`)       │
│  • Direct file-store fallback orchestration (`shouldUseFileStore()`)   │
│  • Direct Upstash Redis cache manipulation & circuit breakers          │
│  • Direct DigitalOcean Spaces S3 client instantiation & pre-signing    │
│  • Direct in-process worker thread coordination & native PDF renders   │
│  • Direct cache revalidation (`revalidatePath`, `revalidateTag`)       │
└──────┬────────────┬─────────────┬─────────────┬─────────────┬──────────┘
       │            │             │             │             │
       ▼            ▼             ▼             ▼             ▼
 ┌──────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌─────────────┐
 │ MongoDB  │ │Atomic File│ │  Upstash  │ │ DO Spaces │ │ Node Worker │
 │ Mongoose │ │ Fallback  │ │   Redis   │ │ S3 + CDN  │ │   Threads   │
 │(Primary) │ │(Storage)  │ │  (Cache)  │ │ (Media)   │ │  (PDF/OCR)  │
 └──────────┘ └───────────┘ └───────────┘ └───────────┘ └─────────────┘
```

### 2.2 Critical Coupling Points
1. **Dual-Persistence Bleed**: HTTP route handlers directly check database availability via `isMongoAvailable()` and conditionally switch between Mongoose queries and `lib/storage/*File.ts` operations, duplicating query filtering, sorting, and pagination logic across both storage mediums.
2. **Cross-Domain Bleed**: Editorial article routes (`app/api/admin/articles/[id]/route.ts`) import and mutate E-Paper models (`EPaper.ts`, `EPaperArticle.ts`). Similarly, E-Paper routes import and mutate Article models.
3. **Model as DTO Leakage**: Raw Mongoose document objects are frequently serialized directly via `JSON.parse(JSON.stringify(doc))` and returned over HTTP, leaking internal database fields (`__v`, internal indexes, draft flags) to clients.
4. **UI Persistence Leaks**: Server components such as `app/(reader)/main/author/[id]/page.tsx` import and execute database queries directly rather than going through shared domain query services.

---

## 3. Evidence-Based Domain Inventory

Based on repository-wide inspection of routes, models, storage abstractions, and business workflows, the codebase comprises **11 distinct business domains**:

| Domain | Core Responsibilities | Primary Models (`lib/models/`) | Storage Fallback (`lib/storage/`) | Route Count |
| :--- | :--- | :--- | :--- | :---: |
| **1. Content & Articles** | Article authoring, editing, publishing, reading, categories, tags, search, related content, home feed rails, breaking/trending news, CAS locks, revisions. | `Article`, `Category`, `Tag`, `Author`, `ArticleLock`, `ContentActivity` | `articlesFile.ts`, `articleLocksFile.ts` | 22 |
| **2. E-Paper & E-Magazine** | Daily editions, monthly magazine issues, PDF ingestion, page image generation, coordinate hotspots, Hindi OCR, story clipping, released snapshots. | `EPaper`, `EPaperArticle`, `EPaperOcrSuggestion`, `EPaperProcessingJob`, `Story` | `epapersFile.ts`, `storiesFile.ts`, `epaperAssetUpload.ts` | 32 |
| **3. Video & Shorts / Swipe** | Regular landscape news videos, vertical short-video feed, cursor pagination, aspect ratio classification, video sitemaps. | `Video` | `videosFile.ts`, `storyVideoUpload.ts` | 15 |
| **4. Newsroom & Editorial Desk** | 4-role newsroom RBAC (`reporter`, `copy_editor`, `admin`, `super_admin`), desk workflow states (`Draft → Review → Copy Desk → Admin → Published`), work queue assignments, audit logging. | `User`, `AuditLog`, `WorkflowNotification`, `ContentActivity` | `usersFile.ts`, `workflowNotifications.ts` | 13 |
| **5. Reader & Identity** | Reader registration (fail-closed, Mongo-only), login, NextAuth JWT sessions, profiles, reading preferences, bookmarks/saved articles, read tracking. | `User` | `usersFile.ts` (sanitized non-credential profile resilience) | 6 |
| **6. TTS & Audio** | Manual article TTS audio, breaking news audio, E-Paper clipping audio, asset cataloging, prewarm, revalidation, cleanup. | `TtsAsset`, `TtsAuditEvent`, `TtsConfig` | `articleTtsUpload.ts`, `breakingTtsUpload.ts` | 9 |
| **7. Audience & Distribution** | Social post dispatch, dynamic Open Graph cards, XML news/video sitemaps, RSS feeds, subscribers, marketing leads, advertise inquiries, career applications, contact messages, reader polls, elections. | `SocialPost`, `Subscriber`, `MarketingLead`, `AdvertiseInquiry`, `CareerApplication`, `ContactMessage`, `Poll`, `PollVote` | `socialPostsFile.ts`, `marketingLeadsFile.ts`, `advertiseInquiriesFile.ts`, `careerApplicationsFile.ts`, `contactMessagesFile.ts` | 22 |
| **8. Media & Storage** | DigitalOcean Spaces CDN S3 adapter, pre-signed upload URL generation, server-side buffer uploads, local storage fallback, media catalog. | `Media` | `atomicStorage.ts`, DigitalOcean Spaces bucket | 9 |
| **9. Analytics & Leadership Reports** | Core Web Vitals beacon ingestion, pageview tracking, real-time analytics SSE stream, leadership briefing schedules/runs, alert notifications, value scoring, CSV export. | `AnalyticsEvent`, `LeadershipReportSchedule`, `LeadershipReportRun`, `LeadershipReportAlertNotification`, `LeadershipReportAlertState` | `analyticsEventsFile.ts`, `leadershipReportSchedulesFile.ts`, `leadershipReportRunHistoryFile.ts`, `leadershipReportAlertNotificationHistoryFile.ts`, `leadershipReportCriticalAlertStateFile.ts` | 17 |
| **10. Platform & Security** | Connection pools, Mongo availability probes, Redis circuit breakers, sliding-window rate limiting, distributed locking, CSP reports, OpenAPI specs, health checks. | N/A (Infrastructure) | N/A | 5 |
| **11. AI Newsroom (Inventory Only)** | Gemini API translation assistant (`gemini-2.5-flash`), extractive heuristic summarizer (`summarizer.ts`), headline/SEO suggestions. | N/A (Phase 8 Roadmap) | N/A | 4 |

---

## 4. Complete Route Dependency Matrix

The following matrix documents all **154 HTTP/API routes and sitemap entry points** across the repository, evaluating persistence dependencies, external infrastructure, side effects, risk level, and target architectural layer:

| Route / Entry Point | Domain | Method(s) | Auth / Roles | Primary Models / Storage | Direct DB? | File Store? | Redis / Spaces / Worker | Side Effects | Risk | Target Layer |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `app/api/admin/analytics/alert-notifications/mute/route.ts` | **ANALYTICS** | `POST` | Staff (Authenticated) | `leadershipReportCriticalAlertStateFile.ts` | No | YES | None | None | `LOW` | `AnalyticsService` |
| `app/api/admin/analytics/alert-notifications/[id]/acknowledge/route.ts` | **ANALYTICS** | `POST` | Staff (Authenticated) | `leadershipReportAlertNotificationHistoryFile.ts` | No | YES | None | None | `LOW` | `AnalyticsService` |
| `app/api/admin/analytics/alert-notifications/[id]/resolve/route.ts` | **ANALYTICS** | `POST` | Staff (Authenticated) | `leadershipReportAlertNotificationHistoryFile.ts` | No | YES | None | None | `LOW` | `AnalyticsService` |
| `app/api/admin/analytics/briefing/route.ts` | **ANALYTICS** | `GET` | Staff (Authenticated) | `None` | No | No | None | None | `LOW` | `AnalyticsService` |
| `app/api/admin/analytics/briefing-schedules/route.ts` | **ANALYTICS** | `GET, POST` | Staff (Authenticated) | `LeadershipReportSchedule`, `leadershipReportSchedulesFile.ts` | YES | YES | None | None | `HIGH` | `AnalyticsService` |
| `app/api/admin/analytics/briefing-schedules/preview/route.ts` | **ANALYTICS** | `POST` | Staff (Authenticated) | `None` | No | No | None | None | `LOW` | `AnalyticsService` |
| `app/api/admin/analytics/briefing-schedules/retry-failed/route.ts` | **ANALYTICS** | `POST` | Staff (Authenticated) | `leadershipReportRunHistoryFile.ts` | No | YES | None | None | `LOW` | `AnalyticsService` |
| `app/api/admin/analytics/briefing-schedules/run-due/route.ts` | **ANALYTICS** | `POST` | Staff (Authenticated) | `leadershipReportSchedulesFile.ts` | No | YES | None | None | `LOW` | `AnalyticsService` |
| `app/api/admin/analytics/briefing-schedules/[id]/run/route.ts` | **ANALYTICS** | `POST` | Staff (Authenticated) | `leadershipReportSchedulesFile.ts` | No | YES | None | None | `LOW` | `AnalyticsService` |
| `app/api/admin/analytics/export/route.ts` | **ANALYTICS** | `GET` | Staff (Authenticated) | `None` | No | No | None | None | `LOW` | `AnalyticsService` |
| `app/api/admin/analytics/live/route.ts` | **ANALYTICS** | `GET` | Staff (Authenticated) | `AnalyticsEvent`, `analyticsEventsFile.ts` | YES | YES | None | None | `HIGH` | `AnalyticsService` |
| `app/api/admin/analytics/live/stream/route.ts` | **ANALYTICS** | `GET` | Staff (Authenticated) | `None` | No | No | None | None | `LOW` | `AnalyticsService` |
| `app/api/admin/analytics/top-lead-pages/route.ts` | **ANALYTICS** | `GET` | Staff (Authenticated) | `None` | No | No | None | None | `LOW` | `AnalyticsService` |
| `app/api/admin/analytics/value-scoring/route.ts` | **ANALYTICS** | `GET, POST` | Staff (Authenticated) | `None` | No | No | None | None | `LOW` | `AnalyticsService` |
| `app/api/admin/articles/route.ts` | **CONTENT & ARTICLES** | `GET, POST` | reporter, copy_editor, admin, super_admin | `Article`, `articlesFile.ts` | YES | YES | None | `audit-log` | `HIGH` | `ContentService` |
| `app/api/admin/articles/assist/route.ts` | **AI** | `POST` | Staff (Authenticated) | `None` | No | No | None | None | `LOW` | `AiService` |
| `app/api/admin/articles/assist/translate/route.ts` | **AI** | `POST` | Staff (Authenticated) | `None` | No | No | Gemini AI | None | `MEDIUM` | `AiService` |
| `app/api/admin/articles/trending-signal/route.ts` | **CONTENT & ARTICLES** | `POST` | Staff (Authenticated) | `None` | No | No | None | None | `LOW` | `ContentService` |
| `app/api/admin/articles/[id]/route.ts` | **CONTENT & ARTICLES** | `GET, PUT, PATCH, DELETE` | reporter, copy_editor, admin, super_admin | `Article`, `EPaperArticle`, `EPaper`, `articlesFile.ts`, `epapersFile.ts` | YES | YES | None | `cache-revalidation, audit-log` | `HIGH` | `ContentService` |
| `app/api/admin/articles/[id]/activity/route.ts` | **CONTENT & ARTICLES** | `GET, POST` | Staff (Authenticated) | `ContentActivity` | YES | No | None | None | `MEDIUM` | `ContentService` |
| `app/api/admin/articles/[id]/breaking-tts/route.ts` | **TTS & AUDIO** | `POST` | Staff (Authenticated) | `None` | No | No | None | None | `LOW` | `TtsService` |
| `app/api/admin/articles/[id]/lock/route.ts` | **CONTENT & ARTICLES** | `GET, POST, DELETE` | Staff (Authenticated) | `ArticleLock`, `articleLocksFile.ts` | YES | YES | None | None | `HIGH` | `ContentService` |
| `app/api/admin/articles/[id]/revisions/route.ts` | **CONTENT & ARTICLES** | `GET` | Staff (Authenticated) | `Article`, `articlesFile.ts` | YES | YES | None | None | `HIGH` | `ContentService` |
| `app/api/admin/articles/[id]/revisions/[revisionId]/restore/route.ts` | **CONTENT & ARTICLES** | `POST` | admin, super_admin | `Article`, `articlesFile.ts` | YES | YES | None | `audit-log` | `HIGH` | `ContentService` |
| `app/api/admin/articles/[id]/tts/route.ts` | **TTS & AUDIO** | `POST` | Staff (Authenticated) | `None` | No | No | None | None | `LOW` | `TtsService` |
| `app/api/admin/categories/route.ts` | **CONTENT & ARTICLES** | `GET, POST` | admin, super_admin | `Category` | YES | No | None | `cache-revalidation` | `MEDIUM` | `ContentService` |
| `app/api/admin/categories/[id]/route.ts` | **CONTENT & ARTICLES** | `PUT, DELETE` | admin, super_admin | `Category` | YES | No | None | `cache-revalidation` | `MEDIUM` | `ContentService` |
| `app/api/admin/contact-messages/route.ts` | **AUDIENCE & DISTRIBUTION** | `GET` | Staff (Authenticated) | `ContactMessage`, `contactMessagesFile.ts` | YES | YES | None | None | `HIGH` | `AudienceService` |
| `app/api/admin/contact-messages/[id]/route.ts` | **AUDIENCE & DISTRIBUTION** | `PATCH, DELETE` | Staff (Authenticated) | `ContactMessage`, `contactMessagesFile.ts` | YES | YES | None | None | `HIGH` | `AudienceService` |
| `app/api/admin/elections/delete/route.ts` | **AUDIENCE & DISTRIBUTION** | `POST` | admin, super_admin | `None` | No | No | None | None | `LOW` | `AudienceService` |
| `app/api/admin/elections/results/route.ts` | **AUDIENCE & DISTRIBUTION** | `GET, POST` | admin, super_admin | `None` | No | No | None | None | `LOW` | `AudienceService` |
| `app/api/admin/elections/upload/route.ts` | **AUDIENCE & DISTRIBUTION** | `POST` | admin, super_admin | `None` | No | No | None | None | `LOW` | `AudienceService` |
| `app/api/admin/epapers/route.ts` | **E-PAPER** | `GET, POST` | reporter, copy_editor, admin, super_admin | `EPaper`, `epapersFile.ts` | YES | YES | None | `audit-log` | `HIGH` | `EpaperService` |
| `app/api/admin/epapers/assist/route.ts` | **AI** | `POST` | Staff (Authenticated) | `None` | No | No | None | None | `LOW` | `AiService` |
| `app/api/admin/epapers/import/route.ts` | **E-PAPER** | `POST` | Staff (Authenticated) | `None` | No | No | None | None | `LOW` | `EpaperService` |
| `app/api/admin/epapers/jobs/run-due/route.ts` | **E-PAPER** | `POST` | Staff (Authenticated) | `None` | No | No | None | None | `LOW` | `EpaperService` |
| `app/api/admin/epapers/upload/route.ts` | **E-PAPER** | `POST` | Staff (Authenticated) | `None` | No | No | None | None | `LOW` | `EpaperService` |
| `app/api/admin/epapers/uploads/route.ts` | **E-PAPER** | `POST` | Staff (Authenticated) | `None` | No | No | None | None | `LOW` | `EpaperService` |
| `app/api/admin/epapers/[id]/route.ts` | **E-PAPER** | `GET, PUT, PATCH, DELETE` | reporter, copy_editor, admin, super_admin | `EPaper`, `EPaperArticle`, `epapersFile.ts` | YES | YES | None | `cache-revalidation, audit-log` | `HIGH` | `EpaperService` |
| `app/api/admin/epapers/[id]/activity/route.ts` | **E-PAPER** | `GET, POST` | Staff (Authenticated) | `ContentActivity` | YES | No | None | None | `MEDIUM` | `EpaperService` |
| `app/api/admin/epapers/[id]/articles/route.ts` | **E-PAPER** | `GET, POST` | Staff (Authenticated) | `EPaperArticle`, `EPaper`, `Article`, `epapersFile.ts`, `articlesFile.ts` | YES | YES | None | `audit-log` | `HIGH` | `EpaperService` |
| `app/api/admin/epapers/[id]/articles/[articleId]/release/route.ts` | **E-PAPER** | `POST` | admin, super_admin | `EPaperArticle`, `EPaper` | YES | No | None | `cache-revalidation, audit-log` | `MEDIUM` | `EpaperService` |
| `app/api/admin/epapers/[id]/articles/[articleId]/tts/route.ts` | **TTS & AUDIO** | `POST` | Staff (Authenticated) | `None` | No | No | None | None | `LOW` | `TtsService` |
| `app/api/admin/epapers/[id]/crop-hotspot/route.ts` | **E-PAPER** | `POST` | Staff (Authenticated) | `None` | No | No | Worker | None | `MEDIUM` | `EpaperService` |
| `app/api/admin/epapers/[id]/generate-page-images/route.ts` | **E-PAPER** | `POST` | Staff (Authenticated) | `EPaper` | YES | No | Worker | None | `MEDIUM` | `EpaperService` |
| `app/api/admin/epapers/[id]/ocr/route.ts` | **E-PAPER** | `POST` | Staff (Authenticated) | `EPaperOcrSuggestion` | YES | No | Worker | None | `MEDIUM` | `EpaperService` |
| `app/api/admin/epapers/[id]/ocr/[suggestionId]/route.ts` | **E-PAPER** | `PATCH, DELETE` | Staff (Authenticated) | `EPaperOcrSuggestion` | YES | No | None | None | `MEDIUM` | `EpaperService` |
| `app/api/admin/epapers/[id]/pages/route.ts` | **E-PAPER** | `GET, POST` | Staff (Authenticated) | `EPaper` | YES | No | None | None | `MEDIUM` | `EpaperService` |
| `app/api/admin/epapers/[id]/processing/route.ts` | **E-PAPER** | `GET` | Staff (Authenticated) | `EPaperProcessingJob` | YES | No | None | None | `MEDIUM` | `EpaperService` |
| `app/api/admin/epapers/[id]/processing/retry/route.ts` | **E-PAPER** | `POST` | Staff (Authenticated) | `EPaperProcessingJob` | YES | No | Worker | None | `MEDIUM` | `EpaperService` |
| `app/api/admin/epapers/[id]/revisions/route.ts` | **E-PAPER** | `GET` | Staff (Authenticated) | `EPaper` | YES | No | None | None | `MEDIUM` | `EpaperService` |
| `app/api/admin/epapers/[id]/tts/route.ts` | **TTS & AUDIO** | `POST` | Staff (Authenticated) | `None` | No | No | None | None | `LOW` | `TtsService` |
| `app/api/admin/epapers/[id]/uploads/finalize/route.ts` | **E-PAPER** | `POST` | Staff (Authenticated) | `EPaper` | YES | No | Spaces | None | `MEDIUM` | `EpaperService` |
| `app/api/admin/media/route.ts` | **MEDIA & STORAGE** | `GET, POST` | Staff (Authenticated) | `Media` | YES | No | Spaces | None | `MEDIUM` | `MediaService` |
| `app/api/admin/media/[id]/route.ts` | **MEDIA & STORAGE** | `DELETE` | admin, super_admin | `Media` | YES | No | Spaces | None | `MEDIUM` | `MediaService` |
| `app/api/admin/notifications/route.ts` | **NEWSROOM & EDITORIAL** | `GET, POST` | Staff (Authenticated) | `WorkflowNotification`, `workflowNotifications.ts` | YES | YES | None | `notification` | `HIGH` | `NewsroomService` |
| `app/api/admin/polls/route.ts` | **AUDIENCE & DISTRIBUTION** | `GET, POST` | admin, super_admin | `Poll` | YES | No | None | None | `MEDIUM` | `AudienceService` |
| `app/api/admin/polls/[id]/route.ts` | **AUDIENCE & DISTRIBUTION** | `PUT, DELETE` | admin, super_admin | `Poll`, `PollVote` | YES | No | None | None | `MEDIUM` | `AudienceService` |
| `app/api/admin/settings/leadership-reports/route.ts` | **ANALYTICS** | `GET, PUT` | super_admin | `leadershipReportSchedulesFile.ts` | No | YES | None | None | `LOW` | `AnalyticsService` |
| `app/api/admin/social-posts/route.ts` | **AUDIENCE & DISTRIBUTION** | `GET, POST` | Staff (Authenticated) | `SocialPost`, `socialPostsFile.ts` | YES | YES | None | None | `HIGH` | `AudienceService` |
| `app/api/admin/social-posts/generate/route.ts` | **AUDIENCE & DISTRIBUTION** | `POST` | Staff (Authenticated) | `None` | No | No | None | None | `LOW` | `AudienceService` |
| `app/api/admin/social-posts/[id]/route.ts` | **AUDIENCE & DISTRIBUTION** | `GET, PUT, DELETE` | Staff (Authenticated) | `SocialPost`, `socialPostsFile.ts` | YES | YES | None | None | `HIGH` | `AudienceService` |
| `app/api/admin/social-posts/[id]/dispatch/route.ts` | **AUDIENCE & DISTRIBUTION** | `POST` | admin, super_admin | `SocialPost`, `socialPostsFile.ts` | YES | YES | None | None | `HIGH` | `AudienceService` |
| `app/api/admin/stories/route.ts` | **E-PAPER** | `GET, POST` | Staff (Authenticated) | `Story`, `storiesFile.ts` | YES | YES | None | `audit-log` | `HIGH` | `EpaperService` |
| `app/api/admin/stories/[id]/route.ts` | **E-PAPER** | `GET, PUT, DELETE` | Staff (Authenticated) | `Story`, `storiesFile.ts` | YES | YES | None | `audit-log` | `HIGH` | `EpaperService` |
| `app/api/admin/stories/[id]/activity/route.ts` | **E-PAPER** | `GET, POST` | Staff (Authenticated) | `ContentActivity` | YES | No | None | None | `MEDIUM` | `EpaperService` |
| `app/api/admin/stories/[id]/download/route.ts` | **E-PAPER** | `GET` | Staff (Authenticated) | `Story`, `EPaper` | YES | No | None | None | `MEDIUM` | `EpaperService` |
| `app/api/admin/stories/[id]/video-production/route.ts` | **VIDEO** | `GET, POST` | Staff (Authenticated) | `Story`, `Video` | YES | No | None | None | `MEDIUM` | `VideoService` |
| `app/api/admin/team/route.ts` | **NEWSROOM & EDITORIAL** | `GET, POST` | admin, super_admin | `User`, `usersFile.ts` | YES | YES | None | `audit-log` | `HIGH` | `NewsroomService` |
| `app/api/admin/team/options/route.ts` | **NEWSROOM & EDITORIAL** | `GET` | Staff (Authenticated) | `User`, `usersFile.ts` | YES | YES | None | None | `HIGH` | `NewsroomService` |
| `app/api/admin/team/[id]/route.ts` | **NEWSROOM & EDITORIAL** | `GET, PUT, DELETE` | admin, super_admin | `User`, `usersFile.ts` | YES | YES | None | `audit-log` | `HIGH` | `NewsroomService` |
| `app/api/admin/team/[id]/setup-link/route.ts` | **NEWSROOM & EDITORIAL** | `POST` | admin, super_admin | `User` | YES | No | None | None | `MEDIUM` | `NewsroomService` |
| `app/api/admin/tts/assets/route.ts` | **TTS & AUDIO** | `GET, DELETE` | Staff (Authenticated) | `TtsAsset` | YES | No | Spaces | None | `MEDIUM` | `TtsService` |
| `app/api/admin/tts/cleanup/route.ts` | **TTS & AUDIO** | `POST` | admin, super_admin | `TtsAsset` | YES | No | Spaces | None | `MEDIUM` | `TtsService` |
| `app/api/admin/tts/jobs/run-due/route.ts` | **TTS & AUDIO** | `POST` | Staff (Authenticated) | `None` | No | No | None | None | `LOW` | `TtsService` |
| `app/api/admin/tts/prewarm/route.ts` | **TTS & AUDIO** | `POST` | Staff (Authenticated) | `TtsAsset` | YES | No | None | None | `MEDIUM` | `TtsService` |
| `app/api/admin/tts/retry/route.ts` | **TTS & AUDIO** | `POST` | Staff (Authenticated) | `TtsAsset` | YES | No | None | None | `MEDIUM` | `TtsService` |
| `app/api/admin/tts/revalidate/route.ts` | **TTS & AUDIO** | `POST` | Staff (Authenticated) | `TtsAsset` | YES | No | None | None | `MEDIUM` | `TtsService` |
| `app/api/admin/tts/settings/route.ts` | **TTS & AUDIO** | `GET, PUT` | super_admin | `TtsConfig` | YES | No | None | None | `MEDIUM` | `TtsService` |
| `app/api/admin/upload/route.ts` | **MEDIA & STORAGE** | `POST` | Staff (Authenticated) | `None` | No | No | Spaces | None | `MEDIUM` | `MediaService` |
| `app/api/admin/uploads/article-tts/complete/route.ts` | **MEDIA & STORAGE** | `POST` | Staff (Authenticated) | `articleTtsUpload.ts` | No | YES | Spaces | None | `LOW` | `MediaService` |
| `app/api/admin/uploads/article-tts/init/route.ts` | **MEDIA & STORAGE** | `POST` | Staff (Authenticated) | `articleTtsUpload.ts` | No | YES | Spaces | None | `LOW` | `MediaService` |
| `app/api/admin/uploads/breaking-tts/complete/route.ts` | **MEDIA & STORAGE** | `POST` | Staff (Authenticated) | `breakingTtsUpload.ts` | No | YES | Spaces | None | `LOW` | `MediaService` |
| `app/api/admin/uploads/breaking-tts/init/route.ts` | **MEDIA & STORAGE** | `POST` | Staff (Authenticated) | `breakingTtsUpload.ts` | No | YES | Spaces | None | `LOW` | `MediaService` |
| `app/api/admin/uploads/epaper-asset/complete/route.ts` | **MEDIA & STORAGE** | `POST` | Staff (Authenticated) | `epaperAssetUpload.ts` | No | YES | Spaces | None | `LOW` | `MediaService` |
| `app/api/admin/uploads/epaper-asset/init/route.ts` | **MEDIA & STORAGE** | `POST` | Staff (Authenticated) | `epaperAssetUpload.ts` | No | YES | Spaces | None | `LOW` | `MediaService` |
| `app/api/admin/uploads/story-video/complete/route.ts` | **MEDIA & STORAGE** | `POST` | Staff (Authenticated) | `storyVideoUpload.ts` | No | YES | Spaces | None | `LOW` | `MediaService` |
| `app/api/admin/uploads/story-video/init/route.ts` | **MEDIA & STORAGE** | `POST` | Staff (Authenticated) | `storyVideoUpload.ts` | No | YES | Spaces | None | `LOW` | `MediaService` |
| `app/api/admin/users/route.ts` | **NEWSROOM & EDITORIAL** | `GET, POST` | super_admin | `User`, `usersFile.ts` | YES | YES | None | `audit-log` | `HIGH` | `NewsroomService` |
| `app/api/admin/videos/route.ts` | **VIDEO** | `GET, POST` | reporter, copy_editor, admin, super_admin | `Video`, `videosFile.ts` | YES | YES | None | `audit-log` | `HIGH` | `VideoService` |
| `app/api/admin/videos/[id]/route.ts` | **VIDEO** | `GET, PUT, PATCH, DELETE` | reporter, copy_editor, admin, super_admin | `Video`, `videosFile.ts` | YES | YES | None | `cache-revalidation, audit-log` | `HIGH` | `VideoService` |
| `app/api/admin/videos/[id]/activity/route.ts` | **VIDEO** | `GET, POST` | Staff (Authenticated) | `ContentActivity` | YES | No | None | None | `MEDIUM` | `VideoService` |
| `app/api/admin/work-queue/route.ts` | **NEWSROOM & EDITORIAL** | `GET` | Staff (Authenticated) | `Article`, `EPaper`, `Story`, `Video` | YES | No | None | None | `MEDIUM` | `NewsroomService` |
| `app/api/admin/work-queue/actions/route.ts` | **NEWSROOM & EDITORIAL** | `POST` | Staff (Authenticated) | `Article`, `EPaper`, `Story`, `Video` | YES | No | None | `notification, audit-log` | `MEDIUM` | `NewsroomService` |
| `app/api/admin/work-queue/assignee-suggestions/route.ts` | **NEWSROOM & EDITORIAL** | `GET` | Staff (Authenticated) | `User` | YES | No | None | None | `MEDIUM` | `NewsroomService` |
| `app/api/admin/work-queue/bulk/route.ts` | **NEWSROOM & EDITORIAL** | `POST` | admin, super_admin | `Article`, `EPaper`, `Story`, `Video` | YES | No | None | `notification, audit-log` | `MEDIUM` | `NewsroomService` |
| `app/api/admin/workflow-notifications/jobs/run-due/route.ts` | **NEWSROOM & EDITORIAL** | `POST` | Staff (Authenticated) | `WorkflowNotification` | YES | No | None | None | `MEDIUM` | `NewsroomService` |
| `app/api/advertise/inquiry/route.ts` | **AUDIENCE & DISTRIBUTION** | `POST` | All / Public | `AdvertiseInquiry`, `advertiseInquiriesFile.ts` | YES | YES | None | None | `HIGH` | `AudienceService` |
| `app/api/ai/summary/route.ts` | **AI** | `POST` | All / Public | `None` | No | No | None | None | `LOW` | `AiService` |
| `app/api/ai/tts/route.ts` | **TTS & AUDIO** | `POST` | All / Public | `None` | No | No | None | None | `LOW` | `TtsService` |
| `app/api/analytics/track/route.ts` | **ANALYTICS** | `POST` | All / Public | `AnalyticsEvent`, `analyticsEventsFile.ts` | YES | YES | None | None | `HIGH` | `AnalyticsService` |
| `app/api/articles/latest/route.ts` | **CONTENT & ARTICLES** | `GET` | All / Public | `Article`, `articlesFile.ts` | YES | YES | None | None | `HIGH` | `ContentService` |
| `app/api/articles/[id]/route.ts` | **CONTENT & ARTICLES** | `GET` | All / Public | `Article`, `articlesFile.ts` | YES | YES | None | None | `HIGH` | `ContentService` |
| `app/api/articles/[id]/tts/route.ts` | **TTS & AUDIO** | `GET` | All / Public | `None` | No | No | None | None | `LOW` | `TtsService` |
| `app/api/auth/register/route.ts` | **READER & IDENTITY** | `POST` | All / Public | `User`, `usersFile.ts` | YES | YES | None | `audit-log` | `HIGH` | `ReaderService` |
| `app/api/auth/staff-setup/route.ts` | **NEWSROOM & EDITORIAL** | `POST` | Invited Staff | `User` | YES | No | None | `audit-log` | `MEDIUM` | `NewsroomService` |
| `app/api/auth/[...nextauth]/route.ts` | **READER & IDENTITY** | `GET, POST` | All / Public | `User` | YES | No | None | None | `MEDIUM` | `ReaderService` |
| `app/api/breaking/route.ts` | **CONTENT & ARTICLES** | `GET` | All / Public | `Article`, `articlesFile.ts` | YES | YES | None | None | `HIGH` | `ContentService` |
| `app/api/careers/apply/route.ts` | **AUDIENCE & DISTRIBUTION** | `POST` | All / Public | `CareerApplication`, `careerApplicationsFile.ts` | YES | YES | None | None | `HIGH` | `AudienceService` |
| `app/api/contact/route.ts` | **AUDIENCE & DISTRIBUTION** | `POST` | All / Public | `ContactMessage`, `contactMessagesFile.ts` | YES | YES | None | None | `HIGH` | `AudienceService` |
| `app/api/docs/openapi.json/route.ts` | **PLATFORM & INFRASTRUCTURE** | `GET` | All / Public | `None` | No | No | None | None | `LOW` | `PlatformService` |
| `app/api/elections/results/route.ts` | **AUDIENCE & DISTRIBUTION** | `GET` | All / Public | `None` | No | No | None | None | `LOW` | `AudienceService` |
| `app/api/epapers/route.ts` | **E-PAPER** | `GET` | All / Public | `EPaper`, `epapersFile.ts` | YES | YES | None | None | `HIGH` | `EpaperService` |
| `app/api/epapers/latest/route.ts` | **E-PAPER** | `GET` | All / Public | `EPaper`, `epapersFile.ts` | YES | YES | None | None | `HIGH` | `EpaperService` |
| `app/api/epapers/[id]/route.ts` | **E-PAPER** | `GET` | All / Public | `EPaper`, `epapersFile.ts` | YES | YES | None | None | `HIGH` | `EpaperService` |
| `app/api/epapers/[id]/articles/[articleId]/share-image/route.ts` | **E-PAPER** | `GET` | All / Public | `EPaperArticle`, `EPaper` | YES | No | None | None | `MEDIUM` | `EpaperService` |
| `app/api/epapers/[id]/articles/[articleId]/tts/route.ts` | **TTS & AUDIO** | `GET` | All / Public | `None` | No | No | None | None | `LOW` | `TtsService` |
| `app/api/health/route.ts` | **PLATFORM & INFRASTRUCTURE** | `GET` | All / Public | `None` | No | No | None | None | `LOW` | `PlatformService` |
| `app/api/marketing/lead/route.ts` | **AUDIENCE & DISTRIBUTION** | `POST` | All / Public | `MarketingLead`, `marketingLeadsFile.ts` | YES | YES | None | None | `HIGH` | `AudienceService` |
| `app/api/og/article/[id]/route.tsx` | **AUDIENCE & DISTRIBUTION** | `GET` | All / Public | `Article` | YES | No | None | None | `MEDIUM` | `AudienceService` |
| `app/api/og/epaper/route.tsx` | **AUDIENCE & DISTRIBUTION** | `GET` | All / Public | `EPaper` | YES | No | None | None | `MEDIUM` | `AudienceService` |
| `app/api/og/video/route.tsx` | **AUDIENCE & DISTRIBUTION** | `GET` | All / Public | `Video` | YES | No | None | None | `MEDIUM` | `AudienceService` |
| `app/api/poll/current/route.ts` | **AUDIENCE & DISTRIBUTION** | `GET` | All / Public | `Poll` | YES | No | None | None | `MEDIUM` | `AudienceService` |
| `app/api/poll/status/route.ts` | **AUDIENCE & DISTRIBUTION** | `GET` | All / Public | `Poll` | YES | No | None | None | `MEDIUM` | `AudienceService` |
| `app/api/poll/vote/route.ts` | **AUDIENCE & DISTRIBUTION** | `POST` | All / Public | `Poll`, `PollVote` | YES | No | None | None | `MEDIUM` | `AudienceService` |
| `app/api/public/epapers/[id]/pdf/route.ts` | **E-PAPER** | `GET` | All / Public | `EPaper` | YES | No | None | None | `MEDIUM` | `EpaperService` |
| `app/api/public/uploads/[...path]/route.ts` | **MEDIA & STORAGE** | `GET` | All / Public | `None` | No | No | None | None | `LOW` | `MediaService` |
| `app/api/security/csp-report/route.ts` | **PLATFORM & INFRASTRUCTURE** | `POST` | All / Public | `None` | No | No | None | None | `LOW` | `PlatformService` |
| `app/api/shorts/latest/route.ts` | **VIDEO** | `GET` | All / Public | `Video`, `videosFile.ts` | YES | YES | None | None | `HIGH` | `VideoService` |
| `app/api/subscribe/route.ts` | **AUDIENCE & DISTRIBUTION** | `POST` | All / Public | `Subscriber` | YES | No | None | None | `MEDIUM` | `AudienceService` |
| `app/api/user/profile/route.ts` | **READER & IDENTITY** | `GET, PUT` | reader, staff | `User`, `usersFile.ts` | YES | YES | None | `audit-log` | `HIGH` | `ReaderService` |
| `app/api/user/save/route.ts` | **READER & IDENTITY** | `GET, POST, DELETE` | reader, staff | `User` | YES | No | None | None | `MEDIUM` | `ReaderService` |
| `app/api/user/track/route.ts` | **READER & IDENTITY** | `POST` | reader, staff | `None` | No | No | None | None | `LOW` | `ReaderService` |
| `app/api/v1/public/analytics/vitals/route.ts` | **ANALYTICS** | `POST` | All / Public | `None` | No | No | None | None | `LOW` | `AnalyticsService` |
| `app/api/v1/public/articles/route.ts` | **CONTENT & ARTICLES** | `GET` | All / Public | `Article`, `articlesFile.ts` | YES | YES | None | None | `HIGH` | `ContentService` |
| `app/api/v1/public/articles/latest/route.ts` | **CONTENT & ARTICLES** | `GET` | All / Public | `Article`, `articlesFile.ts` | YES | YES | None | None | `HIGH` | `ContentService` |
| `app/api/v1/public/articles/[slug]/route.ts` | **CONTENT & ARTICLES** | `GET` | All / Public | `Article`, `articlesFile.ts` | YES | YES | None | None | `HIGH` | `ContentService` |
| `app/api/v1/public/breaking/route.ts` | **CONTENT & ARTICLES** | `GET` | All / Public | `Article`, `articlesFile.ts` | YES | YES | None | None | `HIGH` | `ContentService` |
| `app/api/v1/public/categories/route.ts` | **CONTENT & ARTICLES** | `GET` | All / Public | `Category` | YES | No | None | None | `MEDIUM` | `ContentService` |
| `app/api/v1/public/cities/route.ts` | **CONTENT & ARTICLES** | `GET` | All / Public | `None` | No | No | None | None | `LOW` | `ContentService` |
| `app/api/v1/public/epapers/route.ts` | **E-PAPER** | `GET` | All / Public | `EPaper`, `epapersFile.ts` | YES | YES | None | None | `HIGH` | `EpaperService` |
| `app/api/v1/public/epapers/latest/route.ts` | **E-PAPER** | `GET` | All / Public | `EPaper`, `epapersFile.ts` | YES | YES | None | None | `HIGH` | `EpaperService` |
| `app/api/v1/public/health/route.ts` | **PLATFORM & INFRASTRUCTURE** | `GET` | All / Public | `None` | No | No | None | None | `LOW` | `PlatformService` |
| `app/api/v1/public/home-feed/route.ts` | **CONTENT & ARTICLES** | `GET` | All / Public | `Article`, `articlesFile.ts` | YES | YES | None | None | `HIGH` | `ContentService` |
| `app/api/v1/public/search/route.ts` | **CONTENT & ARTICLES** | `GET` | All / Public | `Article`, `articlesFile.ts` | YES | YES | None | None | `HIGH` | `ContentService` |
| `app/api/v1/public/shorts/route.ts` | **VIDEO** | `GET` | All / Public | `Video`, `videosFile.ts` | YES | YES | None | None | `HIGH` | `VideoService` |
| `app/api/v1/public/shorts/latest/route.ts` | **VIDEO** | `GET` | All / Public | `Video`, `videosFile.ts` | YES | YES | None | None | `HIGH` | `VideoService` |
| `app/api/v1/public/shorts/[slug]/route.ts` | **VIDEO** | `GET` | All / Public | `Video`, `videosFile.ts` | YES | YES | None | None | `HIGH` | `VideoService` |
| `app/api/v1/public/videos/route.ts` | **VIDEO** | `GET` | All / Public | `Video`, `videosFile.ts` | YES | YES | None | None | `HIGH` | `VideoService` |
| `app/api/v1/public/videos/latest/route.ts` | **VIDEO** | `GET` | All / Public | `Video`, `videosFile.ts` | YES | YES | None | None | `HIGH` | `VideoService` |
| `app/api/videos/latest/route.ts` | **VIDEO** | `GET` | All / Public | `Video`, `videosFile.ts` | YES | YES | None | None | `HIGH` | `VideoService` |
| `app/news-sitemap.xml/route.ts` | **AUDIENCE & DISTRIBUTION** | `GET` | All / Public | `Article`, `articlesFile.ts` | YES | YES | None | None | `HIGH` | `AudienceService` |
| `app/video-sitemap.xml/route.ts` | **AUDIENCE & DISTRIBUTION** | `GET` | All / Public | `Video`, `videosFile.ts` | YES | YES | None | None | `HIGH` | `AudienceService` |
| `app/sitemap.ts` | **AUDIENCE & DISTRIBUTION** | `GET` | All / Public | `Article`, `Category`, `EPaper` | YES | No | None | None | `MEDIUM` | `AudienceService` |

---

## 5. Architectural Smells & Coupling Analysis

The audit identified concrete architectural smells across the codebase, categorized by severity:

### 5.1 Critical Architecture Smells (P1 — Correctness, Reliability & Security)

#### SMELL-01: Monolithic Multi-Domain Route Handlers with Direct Persistence
- **Files**: `app/api/admin/articles/[id]/route.ts` (2,289 lines), `app/api/admin/epapers/[id]/route.ts` (1,012 lines).
- **Issue**: Handlers contain complete lifecycle orchestration, optimistic locking (CAS), revision snapshots, validation rules, raw Mongoose CRUD queries, atomic file-store fallback logic, and cross-domain entity mutations.
- **Why It Matters**: Makes automated unit testing without a live MongoDB instance impossible; creates high regression risk when modifying editorial workflows; obscures business invariant enforcement.
- **Severity**: `P1`

#### SMELL-02: Dual-Persistence Logic Duplicated Across HTTP Handlers
- **Files**: `app/api/v1/public/articles/route.ts`, `app/api/articles/latest/route.ts`, `app/api/breaking/route.ts`, `app/api/admin/articles/route.ts`, `app/api/admin/epapers/route.ts`, `app/api/admin/videos/route.ts`.
- **Issue**: Each route independently implements `if (await shouldUseFileStore()) { ... read file ... } else { ... query mongo ... }` with subtle variations in pagination offsets, sort orders, and field filtering.
- **Why It Matters**: High risk of data divergence between MongoDB and JSON file storage during database degradation; violates the single responsibility principle.
- **Severity**: `P1`

#### SMELL-03: Cross-Domain Tight Coupling via Direct Entity Mutation
- **Files**: `app/api/admin/articles/[id]/route.ts` (mutating `EPaperArticle` and `EPaper` pages), `app/api/admin/epapers/[id]/articles/route.ts` (mutating `Article` documents).
- **Issue**: The Articles domain directly reaches into the E-Paper domain's internal Mongoose collections and vice versa.
- **Why It Matters**: Prevents isolating domain invariants; changes to E-Paper page structures can silently break article saving.
- **Severity**: `P1`

---

### 5.2 Important Architectural Smells (P2 — Maintainability, Resilience & Scalability)

#### SMELL-04: Repeated Raw Mongoose Queries & Serialization Logic
- **Files**: `app/api/admin/categories/route.ts`, `app/api/v1/public/categories/route.ts`, `lib/server/publicTaxonomy.ts`.
- **Issue**: Identical queries (`Category.find({ isActive: true }).sort({ order: 1 })`) and document-to-JSON mapping logic are implemented in multiple separate files.
- **Severity**: `P2`

#### SMELL-05: Inconsistent Cache Revalidation Policies
- **Files**: `app/api/admin/articles/[id]/route.ts` (`revalidatePath('/')`), `app/api/admin/categories/[id]/route.ts` (`revalidateTag('categories')`), `app/api/admin/videos/[id]/route.ts` (no revalidation).
- **Issue**: Mutation handlers trigger cache revalidation ad-hoc rather than domain services emitting structured cache invalidation events.
- **Severity**: `P2`

#### SMELL-06: Database Models Treated Directly as Public API DTOs
- **Files**: `app/api/admin/epapers/route.ts`, `app/api/admin/stories/route.ts`, `app/api/admin/polls/route.ts`.
- **Issue**: Routes return raw Mongoose documents via `JSON.parse(JSON.stringify(doc))` leaking database-specific fields (`__v`, internal indexes, draft properties).
- **Severity**: `P2`

#### SMELL-07: Ad-Hoc Inline Role Checks
- **Files**: `app/api/admin/articles/[id]/route.ts`, `app/api/admin/team/route.ts`, `app/api/admin/media/[id]/route.ts`.
- **Issue**: Inline string checks (`if (role !== 'admin' && role !== 'super_admin')`) duplicated across dozens of endpoints rather than declarative policy guards.
- **Severity**: `P2`

#### SMELL-08: UI Server Components Querying Database Directly
- **Files**: `app/(reader)/main/author/[id]/page.tsx`.
- **Issue**: Server Component imports Mongoose models and queries MongoDB directly rather than invoking a shared read service.
- **Severity**: `P2`

---

### 5.3 Minor Architectural Debt (P3 — Ergonomics & Future Capabilities)

#### SMELL-09: Duplicate Helper Modules
- **Files**: `lib/content/publicArticles.ts` vs. `lib/server/publicArticles.ts`.
- **Issue**: Parallel domain helper files with overlapping responsibilities.
- **Severity**: `P3`

#### SMELL-10: Generic File Storage Paths
- **Files**: `lib/storage/` modules directly referenced by UI components (`NotificationsPageClient.tsx`).
- **Severity**: `P3`

---

## 6. Protection of Phase 1 Invariants

Phase 2 architectural refactoring **must strictly preserve** all Phase 1 safety and release-hardening invariants:

```
┌────────────────────────────────────────────────────────────────────────┐
│                     PHASE 1 INVARIANTS SAFEGUARD                       │
├──────────────────────────┬─────────────────────────────────────────────┤
│ 1. Reader Credentials    │ • MongoDB remains SOLE credential authority │
│    Authority             │ • Registration, login, password fail closed │
│                          │ • File store NEVER stores password hashes   │
├──────────────────────────┼─────────────────────────────────────────────┤
│ 2. Isolated Native PDF   │ • Native renders run in terminable workers  │
│    Worker Boundary       │ • Hung jobs forcefully recycled (anti-wedge)│
│                          │ • No overlapping live native renders        │
├──────────────────────────┼─────────────────────────────────────────────┤
│ 3. E-Paper Snapshot      │ • Unreleased edits NEVER mutate public      │
│    Isolation             │   `releasedSnapshot`                        │
│                          │ • Only explicit release action updates it   │
├──────────────────────────┼─────────────────────────────────────────────┤
│ 4. Video Sitemap Routes  │ • Regular videos: /main/videos?video=<id>   │
│    & Pagination          │ • Vertical shorts: /main/shorts/<slug>      │
│                          │ • Traverses all pages (>50 items)           │
├──────────────────────────┼─────────────────────────────────────────────┤
│ 5. Newsroom RBAC & AI    │ • Reporter → Copy Editor → Admin workflow   │
│    Authority             │ • AI NEVER auto-publishes journalism        │
└──────────────────────────┴─────────────────────────────────────────────┘
```

---

## 7. Target Modular Monolith Architecture

The target architecture organizes the application into **pure, decoupled domain modules** under `lib/<domain>/`.

### 7.1 Target Layer Stack

```
┌────────────────────────────────────────────────────────────────────────┐
│                           HTTP / API TIER                              │
│                    (app/api/**, app/(reader)/**)                       │
│                                                                        │
│  Responsibilities:                                                     │
│  • Parse HTTP request (query params, body, headers)                   │
│  • Validate schema / types (zod / validation helpers)                  │
│  • Authenticate session (NextAuth token extraction)                    │
│  • Call Domain / Application Service                                   │
│  • Map Domain Result → HTTP Response (JSON / Status Code)              │
│  • Handle and map Domain Errors → RFC 7807 Error Envelopes             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      DOMAIN / APPLICATION SERVICE                      │
│                       (lib/<domain>/*Service.ts)                       │
│                                                                        │
│  Responsibilities:                                                     │
│  • Execute business workflows & state transitions                      │
│  • Enforce domain business invariants & authorization rules            │
│  • Orchestrate repository calls (queries, mutations)                   │
│  • Handle optimistic concurrency (CAS locks, version checks)           │
│  • Emit cache invalidation intents & audit log events                  │
│  • Coordinate background worker dispatch & side effects                │
│  • Pure TypeScript logic testable without live database                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   REPOSITORY / INFRASTRUCTURE ADAPTER                  │
│                     (lib/<domain>/*Repository.ts)                      │
│                                                                        │
│  Responsibilities:                                                     │
│  • Encapsulate all raw Mongoose queries & database operations          │
│  • Encapsulate atomic file-store fallback logic (`shouldUseFileStore`) │
│  • Provide consistent query interface (find, create, update, delete)   │
│  • Map database records → Domain Entities / DTOs                       │
│  • Manage connection pooling & database timeout guards                 │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     INFRASTRUCTURE & PERSISTENCE                       │
│                                                                        │
│   MongoDB Cluster      Atomic JSON Storage      Upstash Redis (REST)   │
│  (Primary Storage)     (Resilient Fallback)      (Cache & Locks)       │
│                                                                        │
│  DigitalOcean Spaces       Worker Threads        External AI / APIs    │
│   (Object Storage)           (PDF / OCR)         (Gemini Adapter)      │
└────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Target Directory Organization

```
lib/
├── content/                    # Content & Editorial Domain
│   ├── articleService.ts       # Application workflow & business invariants
│   ├── articleRepository.ts    # MongoDB + File fallback persistence adapter
│   ├── categoryRepository.ts   # Category queries & caching
│   └── articleTypes.ts         # Pure domain interfaces & DTOs
│
├── epaper/                     # E-Paper & Magazine Domain
│   ├── epaperService.ts        # Edition lifecycle, page releases, story links
│   ├── epaperRepository.ts     # EPaper & EPaperArticle persistence adapter
│   ├── epaperWorkerAdapter.ts  # Isolated PDF & OCR worker dispatcher
│   └── epaperTypes.ts          # Edition, page, hotspot domain models
│
├── video/                      # Video & Swipe Domain
│   ├── videoService.ts         # Video curation, swipe feed cursor pagination
│   ├── videoRepository.ts      # Video Mongoose + File persistence adapter
│   └── videoTypes.ts           # Video metadata & swipe feed DTOs
│
├── newsroom/                   # Newsroom & Staff Domain
│   ├── newsroomService.ts      # Desk workflow, review queue, assignments
│   ├── teamRepository.ts       # Staff credentials & permissions
│   └── auditService.ts         # Security & editorial event logging
│
├── reader/                     # Reader & Identity Domain
│   ├── readerService.ts        # Registration, preferences, bookmarks
│   └── readerRepository.ts     # MongoDB credential & profile persistence
│
├── media/                      # Media & Uploads Domain
│   ├── mediaService.ts         # Pre-signed URLs, asset management
│   └── spacesAdapter.ts        # DigitalOcean Spaces S3 client adapter
│
├── audience/                   # Audience & Distribution Domain
│   ├── distributionService.ts  # Social posts, sitemaps, polls, leads
│   └── distributionRepo.ts     # Social, subscriber, and inquiry storage
│
├── analytics/                  # Analytics Domain
│   ├── analyticsService.ts     # Vitals ingestion, leadership reports
│   └── analyticsRepo.ts        # Event buffer & report schedules persistence
│
├── server/                     # Core Server Infrastructure
│   ├── pdf/                    # Isolated PDF worker thread boundary
│   └── db/                     # Mongoose connection & availability probe
│
└── security/                   # Security & Resilience Infrastructure
    ├── redisClient.ts          # Upstash Redis client with circuit breaker
    ├── rateLimiter.ts          # Sliding-window rate limiter
    └── distributedLock.ts      # Distributed lock implementation
```

---

## 8. Layer Responsibilities & Design Rules

### 8.1 API Route / Controller (`app/api/**`)
- **Allowed**:
  - Extract request body, query parameters, route context, and headers.
  - Validate schema shapes using lightweight validators.
  - Obtain session context via `auth()` or route guards.
  - Call domain service methods (`articleService.getPublicArticles(...)`).
  - Return `NextResponse.json({ success: true, data: result })` or HTTP error envelopes.
- **Forbidden**:
  - Direct `mongoose.model()` or `connectDB()` calls.
  - Direct `Model.find()`, `Model.create()`, or `Model.updateOne()` queries.
  - Direct `lib/storage/*File.ts` reads or writes.
  - Direct `revalidatePath` or `revalidateTag` calls (handled via domain service intent).
  - Inline multi-step business workflow branching.

### 8.2 Domain Service (`lib/<domain>/*Service.ts`)
- **Allowed**:
  - Enforce business invariants (e.g. "Only admins can publish articles", "Released snapshot cannot be mutated by drafts").
  - Manage state transitions and version increments (CAS locks).
  - Orchestrate repository operations.
  - Trigger cache invalidation intents and audit logging.
  - Format domain output into clean DTOs.
- **Forbidden**:
  - Direct HTTP `NextRequest` or `NextResponse` dependencies.
  - Direct knowledge of raw database connection strings or low-level file write details.

### 8.3 Repository (`lib/<domain>/*Repository.ts`)
- **Allowed**:
  - Execute Mongoose model queries with query timeout guards.
  - Coordinate transparent file-store fallback when MongoDB is offline.
  - Map raw database documents and stored JSON into domain entities.
- **Forbidden**:
  - Business workflow rule decisions (e.g., editorial approval checks).
  - HTTP request/response concepts.

### 8.4 DTOs & Mappers (`lib/<domain>/*Types.ts`)
- Prevent database schema internals (`__v`, `_id` vs `id`, password hashes, draft timestamps) from leaking into public API memory.
- Standardize on `toPublicArticleItem()`, `toPublicEpaperItem()`, and `toPublicVideoItem()` projections.

---

## 9. Test & Characterization Strategy

To guarantee that refactoring **never changes observable production behavior**, all candidate migration slices must be categorized before moving code:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      TEST CLASSIFICATION PROTOCOL                      │
├────────────────────────────────┬───────────────────────────────────────┤
│ EXISTING COVERAGE SUFFICIENT   │ Test suite already asserts:           │
│                                │ • HTTP status codes & JSON shapes     │
│                                │ • Pagination offsets & cursor limits  │
│                                │ • Dual-persistence fallback behavior  │
│                                │ • RBAC permission rejections          │
├────────────────────────────────┼───────────────────────────────────────┤
│ CHARACTERIZATION TEST REQUIRED │ Before moving code, write tests for:  │
│ FIRST                          │ • Undocumented edge-case responses    │
│                                │ • Exact sorting / filtering filters   │
│                                │ • CAS lock conflict error formats     │
│                                │ • Cache revalidation trigger points   │
└────────────────────────────────┴───────────────────────────────────────┘
```

### Domain Test Status Audit
- **Content Public Reads**: `EXISTING COVERAGE SUFFICIENT` (35 test files covering public feeds, breaking rails, filters, and sitemaps).
- **Content Admin Writes**: `CHARACTERIZATION TEST REQUIRED FIRST` for CAS lock version conflict responses and tag array normalizations.
- **Video & Shorts**: `EXISTING COVERAGE SUFFICIENT` (13 test files covering cursor pagination and sitemap routes).
- **E-Paper**: `EXISTING COVERAGE SUFFICIENT` (24 test files covering released snapshot safety, OCR jobs, and hotspot cropping).
- **Reader Profile & Auth**: `EXISTING COVERAGE SUFFICIENT` (9 test files covering fail-closed Mongo credentials and storage scrub).

---

## 10. Recommended Phased Migration Sequence

The refactoring sequence is structured into **7 controlled, backward-compatible slices** ordered by risk, caller volume, and architectural dependency:

```
┌────────────────────────────────────────────────────────────────────────┐
│                       PHASE 2 MIGRATION ROADMAP                        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
    ┌───────────────────────────────┴───────────────────────────────┐
    ▼                                                               ▼
[Phase 2.1: Content Public Reads]               [Phase 2.2: Content CMS Writes]
 • Public articles, home feed, categories        • Drafts, reviews, CAS locks, revisions
 • Risk: LOW (Read-only)                         • Risk: MEDIUM (Editorial state machine)
    │                                                               │
    └───────────────────────────────┬───────────────────────────────┘
                                    ▼
                        [Phase 2.3: Video & Shorts]
                         • Landscape videos, vertical shorts, sitemaps
                         • Risk: LOW
                                    ▼
                        [Phase 2.4: E-Paper & Magazine]
                         • Editions, pages, hotspots, worker integration
                         • Risk: MEDIUM (Worker thread & snapshot safety)
                                    ▼
                        [Phase 2.5: Reader & Identity]
                         • Registration, session, profile, bookmarks
                         • Risk: MEDIUM (Credential security invariant)
                                    ▼
                        [Phase 2.6: Audience & Distribution]
                         • Social posts, sitemaps, polls, leads, contact
                         • Risk: LOW
                                    ▼
                        [Phase 2.7: Analytics, Media & TTS]
                         • Vitals, reports, DO Spaces uploads, audio assets
                         • Risk: LOW
```

---

## 11. Phase 2.1 First Slice Specification: Content Public Reads

### 11.1 Goal & Scope
Migrate the public content read tier to the target modular monolith pattern. This establishes the gold-standard reference implementation for all subsequent phases.

- **Target Routes**:
  1. `app/api/v1/public/articles/route.ts`
  2. `app/api/v1/public/articles/[slug]/route.ts`
  3. `app/api/v1/public/articles/latest/route.ts`
  4. `app/api/v1/public/home-feed/route.ts`
  5. `app/api/v1/public/breaking/route.ts`
  6. `app/api/v1/public/categories/route.ts`
  7. `app/api/v1/public/cities/route.ts`
  8. `app/api/v1/public/search/route.ts`
  9. `app/api/articles/latest/route.ts` (Legacy compatibility alias)
  10. `app/api/articles/[id]/route.ts` (Legacy compatibility alias)
  11. `app/api/breaking/route.ts` (Legacy compatibility alias)

### 11.2 Target Modules to Introduce / Refactor
- `lib/content/articleTypes.ts`: Public article DTOs, query filters, pagination options.
- `lib/content/articleRepository.ts`: Mongoose + atomic file-store fallback adapter for articles and taxonomies.
- `lib/content/articleService.ts`: Public article queries, homepage rail assembly, search ranking, and category caching.

### 11.3 Architectural Contracts
```typescript
// lib/content/articleTypes.ts
export interface PublicArticleQueryOptions {
  category?: string;
  tag?: string;
  city?: string;
  limit?: number;
  page?: number;
  search?: string;
  isBreaking?: boolean;
  isTrending?: boolean;
}

export interface PublicHomeFeedResult {
  hero: PublicArticleDTO[];
  breaking: PublicArticleDTO[];
  trending: PublicArticleDTO[];
  categories: Record<string, PublicArticleDTO[]>;
}

// lib/content/articleService.ts
export class ArticleService {
  constructor(private readonly articleRepo: ArticleRepository) {}

  async getPublicArticles(options: PublicArticleQueryOptions): Promise<{ articles: PublicArticleDTO[]; total: number }>;
  async getPublicArticleBySlugOrId(slugOrId: string): Promise<PublicArticleDTO | null>;
  async getPublicHomeFeed(): Promise<PublicHomeFeedResult>;
  async getBreakingArticles(limit?: number): Promise<PublicArticleDTO[]>;
  async searchArticles(query: string, limit?: number): Promise<PublicArticleDTO[]>;
}
```

### 11.4 Acceptance Criteria for Phase 2.1
1. **Zero Raw Mongoose Queries in Public Routes**: Public content routes only interact with `articleService`.
2. **Dual-Persistence Encapsulation**: `isMongoAvailable()` and `articlesFile.ts` access is completely encapsulated inside `ArticleRepository`.
3. **Public Contract Invariance**: All public API response JSON shapes, pagination headers, and HTTP status codes match baseline tests exactly.
4. **All 35 Content Test Suites Pass**: `npx vitest run tests/api/v1-public-articles.test.ts`, `tests/api/home-feed.test.ts`, etc.
5. **Zero Production Regressions**: `npm run build:ci` and `npm run typecheck` pass with 0 errors.

---

## 12. Performance, Scale & Security Verification

### 12.1 Performance & Scale Check
- **Zero Microservice Latency**: Domain services execute in-process via pure TypeScript functions.
- **Cache-First Compatibility**: Domain queries return deterministic DTOs suitable for Edge CDN caching with `s-maxage` headers.
- **Pluggable Cache Tier**: The modular service layer allows introducing Upstash Redis caching or read replicas in future phases without touching API route handlers.

### 12.2 Security & RBAC Check
- **Server-Side Enforcement**: Role guards are executed at the route entry point and re-verified at domain service boundaries for sensitive operations.
- **Credential Separation**: Reader credentials remain strictly isolated within MongoDB (`lib/auth/readerCredentials.ts`), never touched by content or audience services.
- **Zero Secret Exposure**: Public DTO projections prevent database internals or administrative properties from leaking over the wire.

---

## 13. Explicit Out-of-Scope Items for Phase 2

The following items are **explicitly out of scope** for Phase 2:
1. **No Microservices**: Microservice extraction is prohibited; all refactoring targets the modular monolith.
2. **No UI Redesigns**: Reader and CMS UI layouts, CSS, and components must not be redesigned.
3. **No AI Newsroom Implementation**: Multi-agent AI newsroom implementation is reserved for Phase 8.
4. **No Route Renaming**: Public URLs and API paths (`/api/v1/public/*`) remain stable.
5. **No Schema Breaking Changes**: Database schemas remain backward-compatible with Phase 1 data.

---

## 14. Phase 2.0 Audit Conclusion

The LokSwami repository architecture has been comprehensively mapped. The decoupling path from route-level persistence to a clean modular monolith is clearly defined, with all Phase 1 safety invariants protected and an actionable first slice (Phase 2.1) ready for execution.

**PHASE 2.0 AUDIT STATUS: READY FOR PHASE 2.1**
