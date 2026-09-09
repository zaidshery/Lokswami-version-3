# LokSwami B3 — Phase 2 Implementation Plan
## Phased Modular Monolith Refactoring & Domain Decoupling

> **Parent Audit**: [PHASE2_DOMAIN_BOUNDARY_AUDIT.md](file:///c:/Users/Lenovo/OneDrive/Desktop/Lokswami_V3/Zaid-lokswami/docs/b3/PHASE2_DOMAIN_BOUNDARY_AUDIT.md)
> **Status**: APPROVED EXECUTION ROADMAP
> **Author**: Principal B3 Software Architect

---

## 1. Overview & Architecture Strategy

This implementation plan converts the Phase 2.0 Master Architecture Audit into a sequence of **7 backward-compatible refactoring slices** (Phase 2.1 through Phase 2.7).

At each step, the existing production application remains fully functional, all Phase 1 safety invariants are preserved, reader and CMS UIs are unchanged, and changes are validated by automated test suites before progression.

### Layer Separation Rule
```
HTTP / UI
    ↓
API Route / Controller (app/api/**)
    ↓
Domain Service / Application Service (lib/<domain>/*Service.ts)
    ↓
Repository / Infrastructure Adapter (lib/<domain>/*Repository.ts)
    ↓
MongoDB (Primary) / File Fallback / Upstash Redis / DO Spaces / Workers
```

---

## 2. Master Migration Sequence

```mermaid
graph TD
    P21["Phase 2.1: Content Public Reads<br/>(Articles, Home Feed, Categories, Search)"] --> P22["Phase 2.2: Content Newsroom Writes<br/>(Drafts, Reviews, CAS Locks, Revisions)"]
    P22 --> P23["Phase 2.3: Video & Swipe Domain<br/>(Videos, Shorts, Feed Cursor, Sitemaps)"]
    P23 --> P24["Phase 2.4: E-Paper & Magazine Domain<br/>(Editions, Pages, Worker Isolation, Snapshots)"]
    P24 --> P25["Phase 2.5: Reader & Identity Domain<br/>(Registration, Profiles, Bookmarks, Security)"]
    P25 --> P26["Phase 2.6: Audience & Distribution<br/>(Social Posts, Sitemaps, Polls, Leads)"]
    P26 --> P27["Phase 2.7: Analytics, Media & TTS<br/>(Vitals, Reports, Spaces Uploads, Audio Assets)"]
```

---

## 3. Detailed Phase Slices

---

### Phase 2.1: Content Public Reads Decoupling (Recommended First Slice)

#### 1. Goal
Decouple all public read endpoints for articles, home feed, categories, cities, and search from direct database queries, establishing pure domain service and repository layers in `lib/content/`.

#### 2. Scope & Target Routes
- `app/api/v1/public/articles/route.ts`
- `app/api/v1/public/articles/[slug]/route.ts`
- `app/api/v1/public/articles/latest/route.ts`
- `app/api/v1/public/home-feed/route.ts`
- `app/api/v1/public/breaking/route.ts`
- `app/api/v1/public/categories/route.ts`
- `app/api/v1/public/cities/route.ts`
- `app/api/v1/public/search/route.ts`
- `app/api/articles/latest/route.ts` (Legacy compatibility alias)
- `app/api/articles/[id]/route.ts` (Legacy compatibility alias)
- `app/api/breaking/route.ts` (Legacy compatibility alias)

#### 3. Files to Create & Modify
- **NEW**: `lib/content/articleTypes.ts` (Public article DTOs, query filters, home feed contracts).
- **NEW**: `lib/content/articleRepository.ts` (Encapsulates Mongoose `Article.find()`, `isMongoAvailable()`, and `articlesFile.ts` fallback).
- **NEW**: `lib/content/categoryRepository.ts` (Encapsulates `Category.find()` and taxonomy caching).
- **NEW**: `lib/content/articleService.ts` (Public domain service coordinating queries, home feed assembly, search ranking).
- **MODIFY**: The 11 target route handlers to delegate directly to `articleService`.

#### 4. Tests & Characterization Strategy
- **Status**: `EXISTING COVERAGE SUFFICIENT`.
- **Target Suites**:
  - `tests/api/v1-public-articles.test.ts`
  - `tests/api/home-feed.test.ts`
  - `tests/api/v1-public-breaking.test.ts`
  - `tests/api/v1-public-search.test.ts`
  - `tests/api/v1-public-categories.test.ts`
- **Verification**: Ensure exact response shapes, pagination meta envelopes, and HTTP 200/404 behaviors are preserved.

#### 5. Definition of Done
- Zero raw Mongoose imports or `connectDB()` calls in public article routes.
- Dual-persistence fallback (`isMongoAvailable`) completely encapsulated in repository layer.
- All 35 content test suites pass cleanly (`npx vitest run tests/api/v1-public-*.test.ts`).
- `npm run typecheck` passes with 0 errors.

#### 6. Expected Architectural Improvement
Establishes the clean three-layer pattern (`Route -> Service -> Repository`) with zero regression risk on public reader traffic.

---

### Phase 2.2: Content Newsroom Writes & Editorial State Machine Decoupling

#### 1. Goal
Decouple administrative article mutations, optimistic concurrency versioning (CAS locks), revision history, audio resolution, and editorial state transitions from monolithic route handlers into a dedicated `EditorialService`.

#### 2. Scope & Target Routes
- `app/api/admin/articles/route.ts` (GET list, POST create)
- `app/api/admin/articles/[id]/route.ts` (GET detail, PUT full update, PATCH partial update, DELETE archive)
- `app/api/admin/articles/[id]/lock/route.ts` (GET, POST acquire, DELETE release)
- `app/api/admin/articles/[id]/revisions/route.ts` (GET history)
- `app/api/admin/articles/[id]/revisions/[revisionId]/restore/route.ts` (POST restore)
- `app/api/admin/articles/[id]/activity/route.ts` (GET, POST activity log)
- `app/api/admin/categories/route.ts` (GET, POST)
- `app/api/admin/categories/[id]/route.ts` (PUT, DELETE)

#### 3. Files to Create & Modify
- **NEW**: `lib/content/editorialService.ts` (State machine transitions, validation, CAS locks, revisions).
- **NEW**: `lib/content/articleLockRepository.ts` (Encapsulates `ArticleLock` model and file fallback).
- **MODIFY**: `app/api/admin/articles/[id]/route.ts` (Refactor 2,289 lines down to clean controller delegating to `editorialService`).
- **MODIFY**: `app/api/admin/articles/route.ts` and sub-routes.

#### 4. Tests & Characterization Strategy
- **Status**: `CHARACTERIZATION TEST REQUIRED FIRST`.
- **Pre-Migration Test Additions**: Write focused characterization tests for CAS lock version mismatch HTTP responses (`409 Conflict`) and draft revision snapshot restore before refactoring.
- **Regression Suites**: `tests/api/admin-articles-routes.test.ts`, `tests/api/admin-article-workflow.test.ts`, `tests/article-locks.test.ts`.

#### 5. Definition of Done
- `app/api/admin/articles/[id]/route.ts` reduced from 2,289 lines to < 200 lines.
- Editorial state machine transitions (`Draft → Review → Copy Desk → Admin → Published`) fully encapsulated in `EditorialService`.
- All admin article and workflow test suites pass.

#### 6. Expected Architectural Improvement
Eliminates the largest single source of technical debt in the repository.

---

### Phase 2.3: Video & Swipe / Shorts Domain Decoupling

#### 1. Goal
Decouple video catalog management, vertical short-video feed pagination, aspect ratio classification, and video sitemaps into a dedicated `VideoService` and `VideoRepository`.

#### 2. Scope & Target Routes
- `app/api/admin/videos/route.ts`
- `app/api/admin/videos/[id]/route.ts`
- `app/api/admin/videos/[id]/activity/route.ts`
- `app/api/v1/public/videos/route.ts`
- `app/api/v1/public/videos/latest/route.ts`
- `app/api/v1/public/shorts/route.ts`
- `app/api/v1/public/shorts/latest/route.ts`
- `app/api/v1/public/shorts/[slug]/route.ts`
- `app/api/shorts/latest/route.ts` (Legacy alias)
- `app/api/videos/latest/route.ts` (Legacy alias)
- `app/video-sitemap.xml/route.ts`

#### 3. Files to Create & Modify
- **NEW**: `lib/video/videoTypes.ts` (Video DTOs, shorts cursor types, playback metadata).
- **NEW**: `lib/video/videoRepository.ts` (Encapsulates `Video` Mongoose queries and `videosFile.ts` fallback).
- **NEW**: `lib/video/videoService.ts` (Public swipe feed cursor pagination, CMS video curation, sitemap feeder).
- **MODIFY**: Target video routes and `app/video-sitemap.xml/route.ts`.

#### 4. Tests & Characterization Strategy
- **Status**: `EXISTING COVERAGE SUFFICIENT`.
- **Target Suites**:
  - `tests/video-sitemap-route.test.ts` (Asserts Phase 1 invariants: landscape `/main/videos?video=<id>`, shorts `/main/shorts/<slug>`, pagination >50 items).
  - `tests/api/v1-public-shorts.test.ts`
  - `tests/api/v1-public-videos.test.ts`

#### 5. Definition of Done
- Video routes delegate cleanly to `videoService`.
- Sitemaps consume `videoService.getPublicVideoFeedPage(...)`.
- Phase 1 video sitemap URL and pagination invariants remain 100% green.

---

### Phase 2.4: E-Paper & E-Magazine Domain Decoupling

#### 1. Goal
Decouple edition lifecycles, page coordinate hotspots, Hindi OCR suggestion review, story clipping links, background worker dispatch, and immutable `releasedSnapshot` isolation into `EpaperService` and `EpaperRepository`.

#### 2. Scope & Target Routes
- `app/api/admin/epapers/route.ts`
- `app/api/admin/epapers/[id]/route.ts`
- `app/api/admin/epapers/[id]/pages/route.ts`
- `app/api/admin/epapers/[id]/articles/route.ts`
- `app/api/admin/epapers/[id]/articles/[articleId]/release/route.ts`
- `app/api/admin/epapers/[id]/crop-hotspot/route.ts`
- `app/api/admin/epapers/[id]/ocr/route.ts`
- `app/api/admin/epapers/[id]/processing/route.ts`
- `app/api/admin/stories/*`
- `app/api/v1/public/epapers/*`
- `app/api/public/epapers/[id]/pdf/route.ts`

#### 3. Files to Create & Modify
- **NEW**: `lib/epaper/epaperTypes.ts` (Edition, Page, Hotspot, and Clipping DTOs).
- **NEW**: `lib/epaper/epaperRepository.ts` (Encapsulates `EPaper`, `EPaperArticle`, `Story` models & `epapersFile.ts`).
- **NEW**: `lib/epaper/epaperService.ts` (Edition release workflow, hotspot mapping, worker job dispatch).
- **NEW**: `lib/epaper/epaperWorkerAdapter.ts` (Communicates with isolated native PDF and OCR workers).
- **MODIFY**: Target administrative and public E-Paper route handlers.

#### 4. Tests & Characterization Strategy
- **Status**: `EXISTING COVERAGE SUFFICIENT`.
- **Target Suites**:
  - `tests/epaper-release-snapshot-safety.test.ts` (Verifies unreleased draft edits NEVER mutate `releasedSnapshot`).
  - `tests/pdf-render-mutex-safety.test.ts` (Verifies isolated PDF worker anti-wedge and thread recycle).
  - `tests/pdf-worker-isolation.test.ts`
  - `tests/api/admin-epaper-routes.test.ts`

#### 5. Definition of Done
- `app/api/admin/epapers/[id]/route.ts` reduced from 1,012 lines to < 200 lines.
- Immutable `releasedSnapshot` invariant strictly enforced inside `EpaperService`.
- All 24 E-Paper test suites pass cleanly.

---

### Phase 2.5: Reader & Identity Domain Decoupling

#### 1. Goal
Decouple reader registration, session handling, reading preferences, saved bookmarks, and read tracking into `ReaderService` and `ReaderRepository`, preserving the MongoDB-only credential authority invariant.

#### 2. Scope & Target Routes
- `app/api/auth/register/route.ts`
- `app/api/auth/[...nextauth]/route.ts`
- `app/api/user/profile/route.ts`
- `app/api/user/save/route.ts`
- `app/api/user/track/route.ts`

#### 3. Files to Create & Modify
- **NEW**: `lib/reader/readerTypes.ts` (Reader profile, preferences, bookmarks DTOs).
- **NEW**: `lib/reader/readerRepository.ts` (MongoDB credential operations + sanitized non-credential file storage).
- **NEW**: `lib/reader/readerService.ts` (Registration workflow, password mutation, bookmark toggling).
- **MODIFY**: `app/api/auth/register/route.ts`, `app/api/user/profile/route.ts`.

#### 4. Tests & Characterization Strategy
- **Status**: `EXISTING COVERAGE SUFFICIENT`.
- **Target Suites**:
  - `tests/api/auth-registration.test.ts` (Verifies fail-closed Mongo registration).
  - `tests/user-profile-password-fallback.test.ts` (Verifies password mutations fail closed on Mongo outage).
  - `tests/reader-credentials-auth.test.ts`
  - `tests/storage-reader-credential-scrub.test.ts` (Verifies serialized file scrub and zero passwords in fallback).

#### 5. Definition of Done
- Registration and profile routes delegate to `readerService`.
- Zero password hashes or credential fields ever touch file persistence.
- All 9 reader authentication and profile test suites pass.

---

### Phase 2.6: Audience & Distribution Domain Decoupling

#### 1. Goal
Decouple social sharing post generation, XML sitemaps, reader polls, elections results, newsletter subscribers, contact messages, and commercial inquiries into a unified `DistributionService`.

#### 2. Scope & Target Routes
- `app/api/admin/social-posts/*`
- `app/api/admin/polls/*`
- `app/api/admin/contact-messages/*`
- `app/api/admin/elections/*`
- `app/api/subscribe/route.ts`
- `app/api/marketing/lead/route.ts`
- `app/api/advertise/inquiry/route.ts`
- `app/api/careers/apply/route.ts`
- `app/api/contact/route.ts`
- `app/api/poll/*`
- `app/news-sitemap.xml/route.ts`
- `app/sitemap.ts`

#### 3. Files to Create & Modify
- **NEW**: `lib/audience/audienceTypes.ts` (Social post drafts, poll votes, inquiry types).
- **NEW**: `lib/audience/audienceRepository.ts` (Social, subscriber, inquiry models & file fallbacks).
- **NEW**: `lib/audience/distributionService.ts` (Social dispatch, poll voting, sitemap aggregation).
- **MODIFY**: Target administrative and public distribution routes.

#### 4. Tests & Characterization Strategy
- **Status**: `EXISTING COVERAGE SUFFICIENT`.
- **Target Suites**: `tests/api/social-posts-routes.test.ts`, `tests/api/poll-routes.test.ts`, `tests/api/contact-routes.test.ts`.

#### 5. Definition of Done
- Distribution and engagement routes cleanly decoupled from raw storage.
- Sitemaps generate deterministic, validated XML feeds via service layer.
- All 25 audience test suites pass.

---

### Phase 2.7: Analytics, Media Storage & Audio Decoupling

#### 1. Goal
Decouple Core Web Vitals beacon tracking, leadership reporting schedules, DigitalOcean Spaces S3 pre-signed upload generation, and manual TTS audio asset cataloging into dedicated services.

#### 2. Scope & Target Routes
- `app/api/analytics/track/route.ts`
- `app/api/v1/public/analytics/vitals/route.ts`
- `app/api/admin/analytics/*`
- `app/api/admin/settings/leadership-reports/route.ts`
- `app/api/admin/media/*`
- `app/api/admin/upload/route.ts`
- `app/api/admin/uploads/*`
- `app/api/admin/tts/*`

#### 3. Files to Create & Modify
- **NEW**: `lib/analytics/analyticsService.ts` & `lib/analytics/analyticsRepository.ts`.
- **NEW**: `lib/media/mediaService.ts` & `lib/media/spacesAdapter.ts`.
- **NEW**: `lib/audio/ttsService.ts` & `lib/audio/ttsRepository.ts`.
- **MODIFY**: Target analytics, media, and TTS route handlers.

#### 4. Tests & Characterization Strategy
- **Status**: `EXISTING COVERAGE SUFFICIENT`.
- **Target Suites**: `tests/api/analytics-routes.test.ts`, `tests/api/media-upload-routes.test.ts`, `tests/api/tts-routes.test.ts`.

#### 5. Definition of Done
- Real-time analytics SSE streams, report schedulers, and S3 pre-signing completely isolated in domain modules.
- Zero direct AWS SDK or Spaces client instantiation inside HTTP route files.
- Full CI test suite passes (207 test files, >930 tests).

---

## 4. Rollback & Verification Protocol

For each migration slice:
1. **Pre-flight**: Ensure working tree is clean on the phase-specific branch.
2. **Implementation**: Build domain types, repository, and service before modifying route handlers.
3. **Focused Verification**: Run targeted domain tests (`npx vitest run tests/<domain>-*.test.ts`).
4. **Static Analysis**: Run `npm run typecheck` and `npm run lint`.
5. **Full Suite Gate**: Run `npm run test:ci` across all 207 test files.
6. **Production Build Gate**: Run `npm run build:ci` to guarantee zero bundling or SSR breakage.
7. **Rollback Trigger**: If a regression occurs that cannot be resolved within the slice boundary, `git checkout` the slice branch back to the pre-slice commit SHA.

---

## 5. Phase 2 Exit Criteria

Phase 2 is considered complete **only** when:
1. All 154 HTTP route handlers delegate business rules and persistence to pure domain services.
2. Zero Mongoose model queries or `connectDB()` calls remain directly inside `app/api/**` route files.
3. All Phase 1 safety invariants remain 100% green in CI.
4. `npm run test:ci` passes all 207 test suites.
5. `npm run build:ci` succeeds with 0 errors.
6. Documentation is updated to reflect active domain interfaces.
