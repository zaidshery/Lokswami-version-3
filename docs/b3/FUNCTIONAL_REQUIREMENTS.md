# LokSwami B3 — Functional Requirements Specification

This document provides the measurable functional requirements for each product domain of LokSwami B3.

---

## 1. Reader Domain

### 1.1 Homepage & Landing Experience
- `CURRENT FACT`: Homepage (`/main`) renders hero headlines, category tabs, breaking news banner, trending list, and video rails via `HomePageClient.tsx`.
- `TARGET REQUIREMENT`:
  - Initial HTML response must include fully rendered above-the-fold content; zero reliance on client-side fetch waterfalls for initial view.
  - Image assets above the fold must use `priority` loading with responsive `sizes` attribute and modern formats (WebP/AVIF).
  - Editorial rails (*Live Updates* for Breaking, *Popular News* for Trending) must auto-backfill from recent published articles if explicit editorial flags are sparse.
  - Secondary rails (polls, newsletter forms, social widgets) must mount non-blockingly and fail silently without impeding core page interactivity.
- `FUTURE OPTION`: Personalized homepage feed based on reader's selected city and category preferences.

### 1.2 Article Experience
- `CURRENT FACT`: Articles render headline, summary, body (HTML), featured image, author, date, category, and related articles.
- `TARGET REQUIREMENT`:
  - Support full editorial metadata: Primary Headline, Short Headline, Summary/Deck, Body, Featured Image (with alt, caption, and photographer credit), Author attribution, Category, Publishing/Updated timestamps, and Canonical URL.
  - Reader actions: font resizing (small/medium/large), reading mode toggle, inline audio listening player, social share triggers, and one-click bookmarking.
  - Strictly enforce publication visibility: Drafts, in-review articles, scheduled articles not yet due, and archived items must never appear in public feeds or search indexing.

### 1.3 Breaking News
- `CURRENT FACT`: Breaking news model and API (`/api/breaking`) exist with active polling intervals.
- `TARGET REQUIREMENT`:
  - Instant display banner on homepage and article headers with marquee/ticker animation.
  - Short cache TTL (30–60 seconds) with instant cache tag invalidation on new breaking news publication.
  - Opt-in browser push notification trigger when marked as "High Priority Flash".

### 1.4 Article Sharing & Social Previews
- `CURRENT FACT`: Social sharing buttons exist for WhatsApp, Facebook, X, and native navigator share. Dynamic OG image generator exists at `/api/og`.
- `TARGET REQUIREMENT`:
  - Every published article must have a stable, canonical public URL.
  - Server-rendered Open Graph tags (`og:title`, `og:description`, `og:image`, `og:url`, `og:site_name`, `og:type`) and Twitter Cards (`summary_large_image`).
  - Branded preview image: dynamic generation of 1200x630px social cards featuring article image, LokSwami logo watermark, headline, and category badge.

### 1.5 WhatsApp Sharing Previews
- `TARGET REQUIREMENT`:
  - WhatsApp preview crawlers must receive immediate 200 responses with correctly populated Open Graph metadata.
  - Thumbnail images must be pre-optimized (< 300KB, 1.91:1 aspect ratio) so WhatsApp renders the rich card immediately.
  - Direct share CTA text must format concise, compelling teaser copy: `[Headline] - पूरा समाचार पढ़ने के लिए क्लिक करें: [URL]`.

---

## 2. Multimedia & Interactive Formats

### 2.1 E-Paper Editions
- `CURRENT FACT`: Daily edition selector by city and date; PDF upload and Google Drive import support.
- `TARGET REQUIREMENT`:
  - Hierarchy: `Edition (City + Date) → Pages (1..N) → Page Assets (JPEG/WebP) → Story Hotspots (Bounding Boxes) → Clipped Stories`.
  - Fast page thumbnail strip for instantaneous navigation across multi-page broadsheet editions.
  - Immutable published release: once released, an edition's public snapshot is fixed; editor revisions create draft snapshots until re-released.

### 2.2 E-Paper Pages & Assets
- `CURRENT FACT`: Background processing job converts PDF pages to high-res JPEGs via `@napi-rs/canvas`.
- `TARGET REQUIREMENT`:
  - Multi-resolution assets: low-res blur-up thumbnail (< 50KB) for grid views, standard resolution (< 500KB) for viewport display, high-res tile zoom on touch pinch.
  - Asset delivery completely offloaded to DigitalOcean Spaces CDN; Next.js server does not stream raw image binaries.

### 2.3 E-Paper Story Hotspots & Clippings
- `CURRENT FACT`: Hotspot editor allows drawing bounding boxes on pages and associating headlines/stories.
- `TARGET REQUIREMENT`:
  - Readers can tap any hotspot on a page to open a modal view with the isolated article crop, readable Hindi text, and direct share buttons.
  - Hotspot stories must have their own stable shareable URL (`/main/epaper?edition=...&page=...&story=...`).

### 2.4 Video Experience
- `CURRENT FACT`: Video catalog with YouTube embed support and direct video asset URLs.
- `TARGET REQUIREMENT`:
  - Video player with responsive 16:9 aspect ratio, custom controls, poster placeholder, and resume-playback memory.
  - Separate video metadata from video byte delivery; all media hosted on CDN or YouTube.
  - Video XML sitemap support (`/video-sitemap.xml`) for Google Video Search indexing.

### 2.5 Swipe / Shorts Short-Video Feed
- `CURRENT FACT`: Vertical shorts page (`/main/shorts`) with swipe controls and cursor pagination.
- `TARGET REQUIREMENT`:
  - Continuous vertical swipe interface with inertia and touch gesture tracking (`react-swipeable`).
  - Strict cursor-based feed loading: `[prev, CURRENT, next, next+1]`. Only the current video plays audio/video; the next video is preloaded; discarded videos are freed from DOM memory.
  - Video telemetry: track start, 25%, 50%, 75%, 100% completion, and swipe-away rates asynchronously without frame drops.

### 2.6 Text-to-Speech (TTS) & Audio
- `CURRENT FACT`: Manual audio uploads supported via DigitalOcean Spaces; Gemini TTS engine decommissioned.
- `TARGET REQUIREMENT`:
  - Separate audio generation from audio streaming.
  - Sticky/floating reader audio player supporting play, pause, progress scrub, and 1x/1.25x/1.5x speed.
  - Audio playback must never block article page loading; player mounts client-side after initial paint.
- `FUTURE OPTION`: Cloud TTS synthesis worker (Google Cloud Text-to-Speech or ElevenLabs) running as an async background job.

---

## 3. Discovery & Audience Engagement

### 3.1 Search & Taxonomy
- `CURRENT FACT`: Search page with category and keyword query support.
- `TARGET REQUIREMENT`:
  - Full-text search over Hindi article headlines, summaries, and body copy.
  - Instant auto-suggest dropdown with recent searches and trending keywords.
  - Filterable by Category, City, Date Range, and Content Type (Article vs. E-Paper vs. Video).

### 3.2 Reader Registration & Identity
- `CURRENT FACT`: NextAuth credential signup and Google OAuth login.
- `TARGET REQUIREMENT`:
  - Frictionless reader registration via Google One-Tap or Mobile Number / WhatsApp OTP.
  - Unified reader profile storing: Name, Mobile, Email, Preferred City, Category Interests, and Saved Articles.
  - Strict privacy and data minimization: only store data directly supporting retention and news delivery.

### 3.3 Audience Preferences & Consent
- `TARGET REQUIREMENT`:
  - Granular communication toggles: Daily Morning E-Paper WhatsApp alert (Yes/No), Breaking News Push Notifications (Yes/No), Weekly Newsletter (Yes/No).
  - Explicit, auditable consent timestamp and opt-out support with 1-click unsubscribe links in all outgoing alerts.

### 3.4 Daily E-Paper Distribution
- `TARGET REQUIREMENT`:
  - Upon editor release of the daily E-Paper, an asynchronous distribution job triggers audience filtering by city.
  - Batching and rate-limiting to prevent provider API throttling.
  - Failures in message delivery must never invalidate or roll back the published E-Paper edition.
- `UNKNOWN / NEEDS DECISION`: Selected WhatsApp Business API provider credentials and message template approvals.

### 3.5 Progressive Web App (PWA) & Push Alerts
- `CURRENT FACT`: PWA web manifest (`app/manifest.ts`) and mobile icon assets configured.
- `TARGET REQUIREMENT`:
  - Service worker caching for offline reading of the last 10 visited articles and saved bookmarks.
  - Web Push API integration for instant desktop and mobile browser notifications with deep-links to articles.

---

## 4. Newsroom CMS & Editorial Governance

### 4.1 Four-Role Newsroom Workflow
- `CURRENT FACT`: 4-role newsroom RBAC defined in `lib/auth/roles.ts`.
- `TARGET REQUIREMENT`:
  - **Reporter**: Create drafts, upload story media, write summary/body, run SEO audit, and submit to Copy Desk. Cannot publish directly.
  - **Copy Editor**: Review submitted drafts, refine language, edit headlines, improve SEO score, request revisions from reporter, or approve for publication.
  - **Admin**: Final publication authority, schedule publication, unpublish, manage categories, assign reporter beats, and trigger breaking news alerts.
  - **Super Admin**: Manage user accounts, role promotions, security settings, audit logs, and operational health diagnostics.

### 4.2 Editorial Concurrency & Locks
- `CURRENT FACT`: `ArticleLock.ts` model and lock checking APIs exist.
- `TARGET REQUIREMENT`:
  - Heartbeat-based optimistic and pessimistic locking preventing two editors from overwriting the same draft.
  - Conflict detection alerting editors if a draft has been modified by another user during authoring.

---

## 5. AI Newsroom Integration

### 5.1 Multi-Agent Editorial Pipeline
- `TARGET REQUIREMENT`:
  - AI operates as an asynchronous helper, not an autonomous publisher.
  - Pipeline modules:
    1. **Intake & Research**: Ingest raw wire copy, press releases, or reporter notes; search verified sources.
    2. **Evidence Extraction**: Form structured evidence records (claim, source, reference URL, extraction time).
    3. **Verification**: Cross-reference claims against authoritative sources; flag contradictions or unverified rumors.
    4. **Draft Synthesis**: Produce balanced, journalistically sound Hindi drafts adhering to LokSwami editorial style.
    5. **Headline & Hook**: Generate 5 headline variations (factual, high-CTR, SEO-optimized, social, short).
    6. **SEO & Metadata**: Generate meta titles, meta descriptions, focus keywords, and structured tags.
    7. **Distribution Copy**: Draft tailored snippets for WhatsApp broadcast, Facebook, and X.
- `TARGET REQUIREMENT`:
  - Every AI workflow run produces a traceable `runId`, token usage telemetry, and an **Evidence Package** presented in the CMS.
  - **Human Gate**: An editor must explicitly review and click "Accept Draft" or "Publish". Auto-publish is strictly prohibited.
