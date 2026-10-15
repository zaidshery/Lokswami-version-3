# LokSwami B3 Architecture Freeze v1

## 1. Freeze Baseline
- **Baseline Commit SHA**: `09533328e5499c48e311ad38227377c2619a18cb`
- **Target Branch**: `b3/foundation`
- **Freeze Status**: FROZEN (Phase 2 Integrated Architecture Baseline)
- **Applicability**: Authoritative architectural contract for all future development (Phase 3 through Phase 8).

---

## 2. System Style: Modular Monolith

LokSwami B3 is implemented as a **disciplined modular monolith** hosted inside a single Next.js App Router codebase. 

The modular monolith architecture provides:
- Single deployment artifact with zero distributed network overhead or RPC failures.
- Strict internal domain boundaries enforced at compile-time and runtime.
- High testability with comprehensive unit, integration, and contract test suites.
- Elimination of microservice sprawl, distributed transaction complexity, and premature multi-repo orchestration.

---

## 3. Domain Map

The platform is partitioned into nine primary cohesive domains:
1. **Content Domain (`lib/server/content/`)**: Articles, newsroom workflow, revisions, locks, categories, and public taxonomy.
2. **Video & Swipe Domain (`lib/server/video/`)**: Horizontal videos, vertical Swipe shorts, feed cursors, and video sitemaps.
3. **E-Paper & E-Magazine Domain (`lib/server/epaper/`)**: Physical paper editions, page review, OCR processing, released snapshots, and magazine editions.
4. **Reader & Identity Domain (`lib/server/reader/`)**: Reader registration, authentication, user profiles, preferences, and saved bookmarks.
5. **Audience Domain (`lib/server/audience/`)**: Public audience capture (newsletter subscriptions, marketing leads, contact messages, advertising inquiries, career applications) and election results/graphics management.
6. **Distribution Domain (`lib/server/distribution/`)**: SocialPost persistence, draft distribution state, approved dispatch, and provider orchestration.
7. **Analytics Domain (`lib/server/analytics/`)**: Telemetry event ingestion, Web Vitals beacons, live snapshot/stream reporting, and privacy sanitization.
8. **Media Domain (`lib/server/media/`)**: Media catalog, image transformation (WebP/AVIF focal crops), and DigitalOcean Spaces adapter.
9. **Audio / Manual TTS Domain (`lib/server/audio/`)**: Audio asset cataloging, storage verification, retention cleanup, and manual upload binding.

---

## 4. Dependency Direction

All system layers follow a strict unidirectional downward dependency hierarchy:

```
[ HTTP Route Handlers / API Controllers ]  (app/api/**)
                    │
                    ▼
       [ Domain Application Services ]     (lib/server/<domain>/*Service.ts)
                    │
                    ▼
     [ Domain Repositories & Adapters ]    (lib/server/<domain>/*Repository.ts, adapters)
                    │
                    ▼
  [ Persistence & External Infrastructure ] (MongoDB, JSON Storage, S3/Spaces, Workers)
```

### Governing Rules
1. **Controllers are Thin**: Route handlers only perform HTTP serialization, session extraction, role checks, and error response formatting. Controllers must never execute direct database queries or raw Mongoose calls.
2. **Services Encapsulate Business Logic**: Domain services coordinate transactions, validation, CAS version checks, and activity logging.
3. **Repositories Own Persistence**: Repositories abstract MongoDB queries, file fallback logic, and storage selection.
4. **No Reverse or Circular Dependencies**: Infrastructure layers never depend on services or controllers. Domains must never import private models or internal repositories of other domains.

---

## 5. Domain Ownership Matrix

| Domain / Capability | Owned Models / Storage | Owned Services | Allowed Cross-Domain Reads | Forbidden Operations | Persistence Authority | Fallback Policy |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Content** | `Article`, `Category`, `ArticleRevision`, `ArticleLock`, `data/articles.json` | `publicArticleService`, `editorialService`, `editorialRevisionService`, `publicHomeFeedService`, `publicTaxonomyService`, `adminTaxonomyService` | Media URLs, Audio TTS references | Direct mutation of Video or EPaper documents | MongoDB | Mongo-first with JSON file read fallback. Write store pinned on mutation start (`resolveNewsroomArticleStore`). |
| **Video & Swipe** | `Video`, `data/videos.json`, `data/video-activity.json` | `publicVideos`, `videoEditorialService`, `videoRepository` | Public article detail via public content service | Direct query or mutation of raw `Article` model | MongoDB | Mongo-first with JSON file read fallback. Write store pinned on mutation start (`resolveStore`). |
| **EPaper & Magazine** | `EPaper`, `EPaperArticle`, `EPaperActivity`, `data/epapers.json` | `epaperService`, `epaperArticleService`, `epaperRevisionService`, `epaperRepository`, `epaperTtsService`, `epaperOcrService` | Audio TTS references, PDF native worker, OCR worker | Mutation of Article or Video records | MongoDB | Mongo-first with JSON file fallback (newspapers only; no fake magazines). |
| **Reader & Identity** | `User` (role: 'reader'), `data/users.json` (sanitized) | `readerIdentityService`, `readerService`, `readerRepository` | Public articles (for saved bookmarks) | Staff authentication; reading/writing password hashes from/to file store | MongoDB (Sole credential authority) | FAIL CLOSED for credentials/auth/passwords. Non-secret profile read fallback only. |
| **Audience: Subscriptions** | `Subscriber` | `audienceCaptureService`, `audienceRepository` | None | Storing/authenticating reader passwords | MongoDB sole authority | Mongo-only. NO JSON fallback. Returns HTTP 503 if MONGODB_URI missing; uncaught DB exceptions return HTTP 500 in route catch block. |
| **Audience: Marketing Leads** | `MarketingLead`, `data/marketing-leads.json` | `audienceCaptureService`, `audienceRepository` | None | Mutating editorial or staff records | MongoDB primary | Mongo-first with JSON fallback (`data/marketing-leads.json`) after Mongo error in catch block. |
| **Audience: Commercial Inquiries** | `AdvertiseInquiry`, `data/advertise-inquiries.json` | `audienceCaptureService`, `audienceRepository` | None | Mutating editorial or staff records | MongoDB primary | Mongo-first with JSON fallback (`data/advertise-inquiries.json`) after Mongo error in catch block. |
| **Audience: Career Applications** | `CareerApplication`, `data/career-applications.json` | `audienceCaptureService`, `audienceRepository` | None | Mutating editorial or staff records | MongoDB primary | Mongo-first with JSON fallback (`data/career-applications.json`) after Mongo error in catch block. |
| **Audience: Contact Messages & Workflow** | `ContactMessage`, `data/contact-messages.json` | `contactService`, `contactRepository` | None | Mutating staff accounts or publishing content | MongoDB primary | Mongo-first with JSON fallback (`data/contact-messages.json`) after Mongo error in catch block for create, update, detail, and list queries. |
| **Audience: Elections** | `data/election-results.json`, `public/elections/*.jpg` | `electionAudienceService`, `electionAssetRepository` | None | Mutating editorial stories | Local filesystem & JSON file | File-based authority (`data/election-results.json` and `public/elections/*.jpg`). No MongoDB collection. |
| **Social Distribution** | `SocialPost`, `data/social-posts.json` | `socialDistributionService`, `socialPostRepository`, `socialAutomation.ts` | Content seed queries via `socialDistributionContentQueryService` | Autonomous publishing of newsroom articles; auto-dispatch of unapproved drafts | MongoDB primary | Mongo-first with JSON file fallback (`data/social-posts.json`). Write store pinned on mutation start (`resolveStore`). |
| **Analytics** | `AnalyticsEvent`, `data/analytics-events.json` | `analyticsService`, `analyticsReportService`, `analyticsRepository` | Ingests telemetry only | Becoming source of truth for editorial entities | MongoDB primary | Mongo-first with file fallback (`data/analytics-events.json`) on write error. Non-blocking telemetry append. |
| **Media** | `Media`, `data/media.json`, DO Spaces bucket | `mediaService`, `mediaImageService`, `mediaRepository`, `spacesAdapter` | None | Mutating business records of other domains | MongoDB & S3/Spaces | Mongo-first with file fallback for metadata; S3 for binary blobs. |
| **Audio / Manual TTS** | **Metadata**: `TtsAsset`, `TtsAuditEvent`, `TtsConfig`<br/>**Audio Blobs**: DO Spaces bucket / Local fs (`public/uploads/tts`, `storage/uploads/tts`) | `ttsService`, `ttsRepository`, `ttsStorage.ts` | Content/EPaper references | Owning editorial workflows; automated speech synthesis | **Metadata**: MongoDB<br/>**Audio Blobs**: DO Spaces / Local fs | **Metadata**: Mongo only (NO JSON fallback). Fail closed/error on DB outage.<br/>**Audio Blobs**: Spaces with local fs fallback. |

---

## 6. Identity & RBAC Model

LokSwami strictly isolates the **Newsroom Staff Identity System** from the **Reader Identity System**.

### Four-Role Newsroom Hierarchy
1. `super_admin`: Full system control, user provisioning, security log inspection, emergency overrides.
2. `admin`: Publishing authority for Articles, Videos, and E-Papers; media management; social automation dispatch; workflow assignment.
3. `copy_editor`: Content review, editing, staging, transitioning stories to `under_review` or `ready_for_publish`. Prohibited from publishing directly or altering publication desk ownership.
4. `reporter`: Story drafting, self-editing, media uploads. Restricted to own or explicitly assigned stories.

### Reader Role
- `reader`: Public reader account. Managed exclusively through `/api/auth/*` and `/api/user/*`.
- Completely partitioned from `/admin/*`. Reader credentials cannot grant staff access; staff accounts cannot authenticate via reader endpoints.

---

## 7. Credential Authority: Mongo Sole Authority & Fail-Closed

- **MongoDB Sole Authority**: MongoDB is the single source of truth for all reader credentials.
- **Fail-Closed Rule**: If MongoDB is unreachable:
  - Account registration fails closed with HTTP 503 (`ReaderStoreUnavailableError`). No file-only reader credentials may ever be generated.
  - Reader authentication fails closed (returns `null` session). Stale file password hashes are ignored and will never authenticate.
  - Password mutations fail closed. Password changes must update MongoDB first; failure aborts before any secondary sync.
- **Disk Sanitization Invariant**: File fallback storage (`data/users.json`) must NEVER contain `passwordHash`, `passwordSetAt`, or any credential verifiers for readers. Sanitization is enforced recursively upon read and write.

---

## 8. Publication Authority: Human Newsroom Invariant

- **Human Authority**: LokSwami is an editorial platform controlled by human journalists.
- **Zero Autonomous Publication**: AI or automated distribution bots are strictly prohibited from publishing content directly to the public website, mobile apps, or social channels.
- **AI Boundaries**: AI is restricted to assisted roles (translation, summarization suggestions). Any AI-generated copy or social draft must be explicitly reviewed and approved by an authorized editor before publishing or dispatch.

---

## 9. Content Publication Workflow (Articles)

- **Workflow States**: `draft` → `under_review` → `ready_for_publish` → `published` (or `scheduled`, `archived`).
- **Publishing Gate**: Only `admin` or `super_admin` can transition content to `published`.
- **Pre-publish Validation**: Headline, slug, primary category, and content length must satisfy readiness checks. Breaking news requires valid breaking audio before publishing.
- **Optimistic Concurrency**: Edits verify `version` via atomic Compare-And-Swap (`findOneAndUpdate({ _id, version: expectedVersion })`). Conflicting concurrent edits return HTTP 409.

---

## 10. E-Paper Release Model: Released Snapshot Isolation

- **Release V1 → Edit Draft → Reader Receives V1 → Release V2 Invariant**:
  - Editorial saves to e-paper stories mutate draft fields only (`title`, `contentHtml`, `hotspot`, `pageNumber`).
  - Editorial saves **MUST NOT** mutate `releasedSnapshot`.
  - The public reader resolves stories solely from `releasedSnapshot`. Draft edits remain private until explicit release.
- **Explicit Release Requirements**:
  - Initiator must hold `admin` or `super_admin` role.
  - Validates `expectedUpdatedAt` CAS timestamp against the story's current database state.
  - Updates page review status to `ready`.
  - Increments `releasedSnapshot.version` and sets `releasedSnapshot.releasedAt`.
  - Revalidates public cache tags (`/main/epaper`, `/main/e-magazine`).
- **TTS Cloning Invariant**: When an edition creates a new draft revision, existing manual TTS assets for e-paper stories are deep-cloned with all metadata preserved, remapping only `sourceId` and `sourceParentId`.

---

## 11. Video & Swipe Model

- **Video Encapsulation**: Handled via `VideoRepository` and `VideoEditorialService`.
- **Swipe Publication Rule**: Publishing a Swipe short (`intent === 'publish' && isShort`) requires a linked, publicly published article (`validatePublishedSwipeArticle()`).
- **Draft Exemption**: Private Swipe drafts (`intent === 'draft'`) can be saved without published article linkage.
- **Exact Slug Resolution**: Public Swipe detail views resolve directly by persisted slug without scanning historical feed pages.
- **Video Sitemaps**: Video sitemap generation uses bounded pagination (max 250 pages / 10,000 items) with deduplication and loop detection.

---

## 12. Media & Storage Model

- **DigitalOcean Spaces Adapter (`SpacesAdapter`)**: Encapsulates S3-compatible storage operations (signed URLs, uploads, deletions, public URL generation).
- **Credentials Protection**: `DIGITALOCEAN_SPACES_SECRET_KEY` is strictly confined to server-side adapters; it is never returned in API payloads or error messages.
- **Image Pipeline**: In-process Sharp processing generates modern formats (WebP, AVIF) and responsive crops (`landscape16x9`, `standard4x3`, `square1x1`).

---

## 13. Manual TTS Architecture

The Audio / Manual TTS architecture strictly distinguishes between **Business Metadata Persistence** and **Physical Audio File Storage**:

```
[ TTS Business Metadata ]
TtsService ──► TtsRepository ──► MongoDB Models:
                                  ├── TtsAsset
                                  ├── TtsAuditEvent
                                  └── TtsConfig (where used)
                                  (NO file fallback; MongoDB is sole authority)

[ Physical Audio Storage ]
TtsService / Media Adapters ──► lib/utils/ttsStorage.ts
                                  ├── DigitalOcean Spaces (primary when configured)
                                  └── Local Filesystem (public/uploads/tts, storage/uploads/tts)
```

- **Strictly Manual Uploads**: Automated speech synthesis (including Gemini TTS, LLM speech, and background TTS workers) is completely decommissioned.
- **No JSON Metadata Fallback**: There is no `data/tts-assets.json` store. If MongoDB is offline, TTS asset queries fail cleanly rather than serving synthetic or stale file records.
- **Model Identity**: Audit events are recorded in the `TtsAuditEvent` collection (not `TtsAuditLog`).
- **Decommissioned Endpoints**:
  - TTS Settings PUT returns HTTP 405 Method Not Allowed.
  - TTS Retry returns HTTP 405 Method Not Allowed.
  - TTS Prewarm returns HTTP 410 Gone.
- **Cleanup & Retention**:
  - Retention-based cleanup endpoint (`/api/admin/tts/cleanup`) returns direct counts (`deletedAssets`, `deletedFiles`, `missingFiles`) and logs an audit record via `TtsAuditEvent`.
  - Unexpected errors return exact historical message: `"Failed to clean up TTS assets."`.

---

## 14. Audience & Distribution Architecture

The system maintains an explicit architectural separation between the **Audience Domain** and the **Distribution Domain**:

### A. Audience Domain (`lib/server/audience/`)
Owns and coordinates public audience capture, citizen engagement, and election results:
- **Newsletter Subscriptions**: `POST /api/subscribe` → `audienceCaptureService` → `Subscriber` model.
  - *Persistence*: **MongoDB only**. There is NO JSON/file fallback.
  - *Failure Semantics*:
    - **Missing Configuration (`MONGODB_URI` missing)**: `audienceCaptureService.subscribe()` returns HTTP 503 (`{ success: false, error: 'Subscription service is not configured yet' }`).
    - **Database Exception (unreachable/operation failure)**: When `MONGODB_URI` is configured but `connectDB()` or `Subscriber` operation throws, `audienceCaptureService` does not convert the exception to 503; the unhandled error reaches `app/api/subscribe/route.ts` whose catch block returns HTTP 500 (`{ success: false, error: 'Failed to subscribe. Please try again.' }`).
    - In both failure cases, no file-based subscriber record is created.
- **Marketing Leads**: `POST /api/marketing/lead` → `audienceCaptureService` → `audienceRepository.saveMarketingLead`.
  - *Persistence*: **Mongo-first with catch-block JSON fallback**. Attempts MongoDB `MarketingLead.findOneAndUpdate()`; if Mongo is unconfigured or throws, catches error and persists to `data/marketing-leads.json`. Also synchronizes subscriber list if `wantsDailyAlerts` is set.
- **Commercial Advertising Inquiries**: `POST /api/advertise/inquiry` → `audienceCaptureService` → `audienceRepository.createAdvertiseInquiry`.
  - *Persistence*: **Mongo-first with catch-block JSON fallback**. Attempts MongoDB `AdvertiseInquiry.create()`; if Mongo fails, catches error and persists to `data/advertise-inquiries.json`.
- **Career Applications**: `POST /api/careers/apply` → `audienceCaptureService` → `audienceRepository.createCareerApplication`.
  - *Persistence*: **Mongo-first with catch-block JSON fallback**. Attempts MongoDB `CareerApplication.create()`; if Mongo fails, catches error and persists to `data/career-applications.json`.
- **Contact Messages & Workflow Inbox**: `POST /api/contact`, `app/api/admin/contact-messages/*` → `contactService` & `contactRepository`.
  - *Persistence*: **Mongo-first with catch-block JSON fallback**. Tries MongoDB `ContactMessage` first; on error, falls back to `data/contact-messages.json` for submission creation (`create`), status/assignee/note updates (`update`), detail retrieval (`getById`), and inbox pagination/filtering (`list`).
- **Elections Management**: `GET /api/elections/results`, `app/api/admin/elections/*` (`results`, `upload`, `delete`) → `electionAudienceService` & `electionAssetRepository`.
  - *Persistence*: **Dedicated local file and graphic asset storage**. Results are stored and normalized in `data/election-results.json` via `lib/elections/storage.ts`. State visual graphics are written to and deleted from `public/elections/${stateId}.jpg`. No MongoDB collection is used.

### B. Distribution Domain (`lib/server/distribution/`)
Owns and coordinates external content distribution and social dispatch:
- **Social Posts Management**: `app/api/admin/social-posts/*` (`GET`, `PATCH [id]`, `POST [id]/dispatch`, `POST generate`) → `socialDistributionService` & `socialPostRepository` (`SocialPost` model in MongoDB with `data/social-posts.json` fallback).
- **Write Store Pinning**: Multi-step social mutations evaluate `resolveStore()` once at the start of the operation and pass the selected store (`mongo` or `file`) through subsequent repository calls, ensuring operations do not flip stores mid-request.
- **Content Query Facade**: Queries article and story context via `socialDistributionContentQueryService` in `lib/server/content/`.
- **Social Dispatch State Machine & Human Gates**:
  - `approved` = **Dispatchable**. Explicitly approved by an authorized editor (`admin` or `super_admin`).
  - `scheduled` = **Dispatchable**. Scheduled for automated distribution.
  - `failed` = **Retry / Re-dispatchable**. If webhook dispatch fails, post transitions to `failed` with recorded error. Re-dispatching a failed post simply retries automation for an item previously vetted and approved by a human editor.
  - `draft` / unapproved = **NOT Dispatchable**. The dispatch endpoint strictly rejects unapproved drafts with HTTP 400 (`Approve or schedule the social post before sending it to automation.`).
  - **Approval Integrity Invariant**: Failed retry does NOT bypass original human approval. An unapproved draft can never transition directly to dispatch.
- **Provider Credential Redaction**: Webhook payloads are sanitized by `redactProviderSecrets` before external dispatch.

---

## 15. Analytics Privacy Model

- **Swipe Privacy Safeguard**: When `source === 'lokswami_swipe'`:
  - `ipAddress` is not persisted (empty string).
  - `userAgent` is not persisted (empty string).
  - Client session identifiers are discarded; a fresh unlinked session ID is generated.
  - Metadata is filtered against a strict allowlist of layout and video identifiers.
- **Web Vitals Privacy Safeguard**:
  - Web Vitals beacon tracking (`/api/v1/public/analytics/vitals`) persists zero IP addresses and zero User-Agent strings.

---

## 16. Persistence & Fallback Rules

1. **Read Operations**:
   - Public non-secret content reads (Articles, Videos, EPapers, Taxonomies) query MongoDB first with a timeout bound.
   - If MongoDB fails or times out, they fall back gracefully to local JSON stores (`data/*.json`).
   - Empty feeds return empty collections; they never fabricate mock articles or synthetic magazines.
2. **Write Operations & Fallback Semantics**:
   The platform does **not** employ a single uniform write fallback policy. Rather, fallback semantics reflect the concrete requirements and runtime implementations of each domain:
   - **Store Pinned at Start (Multi-Step Editorial Workflows)**:
     - In **Content Newsroom Writes** (`resolveNewsroomArticleStore`), **Video & Swipe** (`VideoRepository.resolveStore`), and **Social Distribution** (`SocialPostRepository.resolveStore`), the write target (`mongo` or `file`) is evaluated once at mutation start and threaded through all steps. A failure mid-flight returns an error and never flips stores mid-request.
   - **Inline Try/Catch Fallback (Public Capture Pipelines)**:
     - In **Audience Capture** (`MarketingLead`, `AdvertiseInquiry`, `CareerApplication`, `ContactMessage`), mutations attempt MongoDB first. If MongoDB throws or is unreachable, the error is caught and the record is written to secondary JSON files (`data/*.json`).
     - In **Analytics Telemetry** (`AnalyticsRepository.saveEvent`), telemetry ingestion attempts MongoDB first and appends to `data/analytics-events.json` upon caught failure.
   - **Mongo Sole Authority / Fail-Closed (Zero Fallback)**:
     - **Reader Credentials & Auth**: MongoDB is the sole authority. Registration, login, and password mutations fail closed (HTTP 503 / null session); file fallback contains strictly non-secret profile data and never persists credentials.
     - **Newsletter Subscriptions**: `Subscriber` is MongoDB-only with zero file fallback. If `MONGODB_URI` is missing, `audienceCaptureService.subscribe()` returns HTTP 503. If MongoDB is configured but connection/database operations throw, the exception bubbles uncaught to `app/api/subscribe/route.ts` which catches and returns HTTP 500. In neither case is any file-based subscriber record created.
     - **Audio / TTS Business Metadata**: `TtsAsset`, `TtsAuditEvent`, and `TtsConfig` reside solely in MongoDB. Operations fail closed on DB errors; no JSON metadata fallback exists.
   - **Direct Local File Authority**:
     - **Elections**: Election results and graphics are stored natively on the filesystem (`data/election-results.json` and `public/elections/*.jpg`).
     - **Media & Audio Blobs**: Physical binaries reside in DigitalOcean Spaces when configured, with fallback to local filesystem storage (`public/uploads/`, `storage/uploads/`).

---

## 17. Concurrency & CAS Rules

1. **Article Optimistic Locking**:
   - Updates must pass `expectedVersion`.
   - CAS filter: `{ _id, version: expectedVersion }`.
   - Mismatch throws `ArticleVersionConflictError` (HTTP 409).
2. **EPaper Release Optimistic Locking**:
   - Release calls must pass `expectedUpdatedAt`.
   - CAS filter: `{ _id, epaperId, updatedAt: expectedUpdatedAt }`.
   - Stale release attempts throw `EpaperConflictError` (HTTP 409). Idempotent repeated releases return current version.
3. **Editorial Locks**:
   - Active locks expire after 120 seconds.
   - Breaking a lock requires explicit override or wait.

---

## 18. External Provider Boundaries

- **Upstash Redis**: Used for distributed rate limiting with automatic in-memory fallback if Redis is unreachable.
- **DigitalOcean Spaces**: Object storage for images, PDFs, and audio. Wrapped in `SpacesAdapter` and `ttsStorage.ts`.
- **Google Gemini API**: Restricted to editorial translation assistance (`/api/admin/articles/assist/translate`). No autonomous publishing or TTS generation.
- **Social Automation (n8n / generic webhooks)**: Receives approved social posts only after explicit manual dispatch.

---

## 19. Cache & Revalidation Responsibilities

- **Public Cache Headers**: Public endpoints return standard cache headers (`public, s-maxage=..., stale-while-revalidate=...`).
- **On-Demand Revalidation**: Editorial mutations call Next.js `revalidatePath()` for affected public routes (`/main`, `/main/article/[slug]`, `/main/epaper`, etc.).
- **Live Admin Endpoints**: Live analytics endpoints use `no-store` or short polling headers.

---

## 20. Worker Responsibilities

- **PDF Native Worker (`pdfWorker.ts`)**:
  - Mutex-isolated canvas rendering.
  - Strict 45s timeout per page render.
  - Force-termination of hung processes and canvas resource disposal.
- **OCR Processing**:
  - Local Tesseract processing in isolated worker contexts with Hindi/English language packs.
- **Future Queue Worker Boundary**:
  - Dedicated background queue runner (BullMQ / Redis) is planned for Phase 4 (Production & Scale).

---

## 21. Architecture Rules for Phase 3+

Any future development (Phase 3 through Phase 8) must abide by these non-negotiable rules:
1. **Extend, Do Not Bypass**: All new routes must use domain services. Direct database calls in controllers remain strictly prohibited.
2. **Preserve Invariants**: Reader credential fail-closed behavior, released snapshot isolation, and manual-only TTS must never be compromised.
3. **Human Gate Intact**: No autonomous publishing feature may be introduced.
4. **No Premature Microservices**: Future phases must continue to develop within the modular monolith architecture unless explicit load-testing metrics justify extraction (Phase 8).
5. **Quality Gates Mandatory**: All future PRs must pass `npm run typecheck`, `npm run lint:strict`, `npm run test:security`, `npm run test:governance`, `npm run test:four-role-newsroom`, `npm run verify:dependency-security`, `npm run test:ci`, and `npm run build:ci`.
6. **Dependency Security Governance**: LokSwami's tracked dependency security floor passes for all explicitly governed advisory ranges. `npm ci` currently reports 35 dependency findings (31 moderate, 3 high, 1 critical), which are cataloged as P2 production/security debt (DEBT-010) for controlled triage and remediation in Phase 4. No broad dependency upgrades were performed during the architecture freeze.
