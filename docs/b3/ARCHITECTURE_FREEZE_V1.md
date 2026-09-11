# LokSwami B3 Architecture Freeze v1

## 1. Freeze Baseline
- **Baseline Commit SHA**: `09533328e5499c48e311ad38227377c2619a18cb`
- **Target Branch**: `b3/foundation`
- **Freeze Status**: FROZEN (Phase 2 Integrated Architecture Baseline)
- **Applicability**: Authoritative architectural contract for all future development (Phase 3 through Phase 11).

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

The platform is partitioned into eight primary cohesive domains:
1. **Content Domain (`lib/server/content/`)**: Articles, newsroom workflow, revisions, locks, categories, and public taxonomy.
2. **Video & Swipe Domain (`lib/server/video/`)**: Horizontal videos, vertical Swipe shorts, feed cursors, and video sitemaps.
3. **E-Paper & E-Magazine Domain (`lib/server/epaper/`)**: Physical paper editions, page review, OCR processing, released snapshots, and magazine editions.
4. **Reader & Identity Domain (`lib/server/reader/`)**: Reader registration, authentication, user profiles, preferences, and saved bookmarks.
5. **Audience & Distribution Domain (`lib/server/distribution/`)**: Audience capture (contact, leads), election data, polls, social post drafts, and automated distribution webhooks.
6. **Analytics Domain (`lib/server/analytics/`)**: Telemetry event ingestion, Web Vitals beacons, live snapshot/stream reporting, and privacy sanitization.
7. **Media Domain (`lib/server/media/`)**: Media catalog, image transformation (WebP/AVIF focal crops), and DigitalOcean Spaces adapter.
8. **Audio / Manual TTS Domain (`lib/server/audio/`)**: Audio asset cataloging, storage verification, retention cleanup, and manual upload binding.

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

| Domain | Owned Models / Storage | Owned Services | Allowed Cross-Domain Reads | Forbidden Operations | Persistence Authority | Fallback Policy |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Content** | `Article`, `Category`, `ArticleRevision`, `ArticleLock`, `data/articles.json` | `publicArticleService`, `editorialService`, `editorialRevisionService`, `publicHomeFeedService`, `publicTaxonomyService`, `adminTaxonomyService` | Media URLs, Audio TTS references | Direct mutation of Video or EPaper documents | MongoDB | Mongo-first with JSON file read fallback. Write store pinned on mutation start. |
| **Video & Swipe** | `Video`, `data/videos.json`, `data/video-activity.json` | `publicVideos`, `videoEditorialService`, `videoRepository` | Public article detail via public content service | Direct query or mutation of raw `Article` model | MongoDB | Mongo-first with JSON file read fallback. Write store pinned on mutation start. |
| **EPaper & Magazine** | `EPaper`, `EPaperArticle`, `EPaperActivity`, `data/epapers.json` | `epaperService`, `epaperArticleService`, `epaperRevisionService`, `epaperRepository`, `epaperTtsService`, `epaperOcrService` | Audio TTS references, PDF native worker, OCR worker | Mutation of Article or Video records | MongoDB | Mongo-first with JSON file fallback (newspapers only; no fake magazines). |
| **Reader & Identity** | `User` (role: 'reader'), `data/users.json` (sanitized) | `readerIdentityService`, `readerService`, `readerRepository` | Public articles (for saved bookmarks) | Staff authentication; reading/writing password hashes from/to file store | MongoDB (Sole credential authority) | FAIL CLOSED for credentials/auth/passwords. Non-secret profile read fallback only. |
| **Audience & Distribution** | `AudienceMessage`, `ElectionResult`, `Poll`, `PollVote`, `SocialPost`, `data/social-posts.json` | `socialDistributionService`, `socialPostRepository`, audience inbox services | Content seed queries via `socialDistributionContentQueryService` | Autonomous publishing of newsroom articles or auto-dispatch of unapproved drafts | MongoDB | Mongo-first with JSON file fallback. Write store pinned on start. |
| **Analytics** | `AnalyticsEvent`, `data/analytics-events.json` | `analyticsService`, `analyticsReportService`, `analyticsRepository` | Ingests telemetry only | Becoming source of truth for editorial entities | MongoDB | Mongo-first with file fallback. Write store pinned on start. |
| **Media** | `Media`, `data/media.json`, DO Spaces bucket | `mediaService`, `mediaImageService`, `mediaRepository`, `spacesAdapter` | None | Mutating business records of other domains | MongoDB & S3/Spaces | Mongo-first with file fallback for metadata; S3 for binary blobs. |
| **Audio / TTS** | `TtsAsset`, `TtsAuditLog`, `data/tts-assets.json` | `ttsService`, `ttsRepository` | Content/EPaper references | Owning editorial workflows; automated speech synthesis | MongoDB & S3/Local fs | Mongo-first with file fallback. |

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

## 13. Manual TTS Model

- **Strictly Manual Uploads**: Automated text-to-speech synthesis (including Gemini TTS, LLM-generated speech, and background synthesis) is completely decommissioned.
- **API Contracts**:
  - TTS Settings PUT returns HTTP 405 Method Not Allowed.
  - TTS Retry returns HTTP 405 Method Not Allowed.
  - TTS Prewarm returns HTTP 410 Gone.
- **Cleanup & Retention**:
  - Retention-based cleanup endpoint (`/api/admin/tts/cleanup`) returns direct counts (`deletedAssets`, `deletedFiles`, `missingFiles`) and logs an audit record.
  - Unexpected errors return exact historical message: `"Failed to clean up TTS assets."`.

---

## 14. Analytics Privacy Model

- **Swipe Privacy Safeguard**: When `source === 'lokswami_swipe'`:
  - `ipAddress` is not persisted (empty string).
  - `userAgent` is not persisted (empty string).
  - Client session identifiers are discarded; a fresh unlinked session ID is generated.
  - Metadata is filtered against a strict allowlist of layout and video identifiers.
- **Web Vitals Privacy Safeguard**:
  - Web Vitals beacon tracking persists zero IP addresses and zero User-Agent strings.

---

## 15. Fallback Rules

1. **Read Operations**:
   - Public non-secret content reads (Articles, Videos, EPapers, Taxonomies) query MongoDB first with a timeout bound (8s).
   - If MongoDB fails or times out, they fall back gracefully to local JSON stores (`data/*.json`).
   - Empty feeds return empty collections; they never fabricate mock articles or synthetic magazines.
2. **Write Operations**:
   - Write paths evaluate store availability at request start.
   - Once a store is selected (MongoDB or file), the operation is **pinned** to that store. Mutations never flip stores mid-request.
   - Credential-bearing mutations fail closed; they never fall back to disk.

---

## 16. Concurrency & CAS Rules

1. **Article Optimistic Locking**:
   - Updates must pass `expectedVersion`.
   - CAS filter: `{ _id, version: expectedVersion }`.
   - Mismatch throws `ArticleVersionConflictError` (HTTP 409).
2. **EPaper Release Optimistic Locking**:
   - Release calls must pass `expectedUpdatedAt`.
   - CAS filter: `{ _id, epaperId, updatedAt: expectedUpdatedAt }`.
   - Stale release attempts throw `EpaperConflictError` (HTTP 409). Idempotent repeated releases return the current version.
3. **Editorial Locks**:
   - Active locks expire after 120 seconds.
   - Breaking a lock requires explicit override or wait.

---

## 17. External Provider Boundaries

- **Upstash Redis**: Used for distributed rate limiting with automatic in-memory fallback if Redis is unreachable.
- **DigitalOcean Spaces**: Object storage for images, PDFs, and audio. Wrapped in `SpacesAdapter`.
- **Google Gemini API**: Restricted to editorial translation assistance (`/api/admin/articles/assist/translate`). No autonomous publishing or TTS generation.
- **Social Automation (n8n / generic webhooks)**: Receives approved social posts only after explicit manual dispatch.

---

## 18. Cache & Revalidation Responsibilities

- **Public Cache Headers**: Public endpoints return standard cache headers (`public, s-maxage=..., stale-while-revalidate=...`).
- **On-Demand Revalidation**: Editorial mutations call Next.js `revalidatePath()` for affected public routes (`/main`, `/main/article/[slug]`, `/main/epaper`, etc.).
- **Live Admin Endpoints**: Live analytics endpoints use `no-store` or short polling headers.

---

## 19. Worker Responsibilities

- **PDF Native Worker (`pdfWorker.ts`)**:
  - Mutex-isolated canvas rendering.
  - Strict 45s timeout per page render.
  - Force-termination of hung processes and canvas resource disposal.
- **OCR Processing**:
  - Local Tesseract processing in isolated worker contexts with Hindi/English language packs.
- **Future Queue Worker Boundary**:
  - Dedicated background queue runner for long-running jobs is deferred to Phase 6.

---

## 20. Architecture Rules for Phase 3+

Any future development (Phase 3 through Phase 11) must abide by these non-negotiable rules:
1. **Extend, Do Not Bypass**: All new routes must use domain services. Direct database calls in controllers remain strictly prohibited.
2. **Preserve Invariants**: Reader credential fail-closed behavior, released snapshot isolation, and manual-only TTS must never be compromised.
3. **Human Gate Intact**: No autonomous publishing feature may be introduced.
4. **No Premature Microservices**: Future phases must continue to develop within the modular monolith architecture unless explicit load-testing metrics justify extraction (Phase 11).
5. **Quality Gates Mandatory**: All future PRs must pass `npm run typecheck`, `npm run lint:strict`, `npm run test:security`, `npm run test:governance`, `npm run test:four-role-newsroom`, `npm run verify:dependency-security`, `npm run test:ci`, and `npm run build:ci`.
