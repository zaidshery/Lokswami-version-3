# Phase 3.14 — Video Hub 2.0 + Shorts / Swipe 2.0 Acceptance Criteria

Baseline: `1833939f86858bed4a8b518e750fdeea270fc823` (HOME, `b3/foundation`).
This document establishes the architecture audit and acceptance requirements for Phase 3.14, with immediate implementation limited to **Phase 3.14A (Video Hub 2.0)**. Subsequent phases (3.14B, 3.14C, 3.14D) are scheduled for future slices.

---

## 1. Phase Structure Overview

```text
3.14A — Video Architecture + Video Hub 2.0 (CURRENT TASK)
3.14B — Shorts / Swipe 2.0 (Mobile Fullscreen, Gestures, Snapping)
3.14C — Playback / Analytics / Performance / Resilience
3.14D — Final Hardening / Security Audit / PR Preparation
```

---

## 2. Public Route & Canonical Authority Contract

The Phase 3.13 public authority contracts are non-negotiable and strictly preserved:

| Content Type | Canonical Authority Route | Legacy / Compatible Path | Selection Query | Authority Source |
|---|---|---|---|---|
| **Standard Video** | `/main/videos?video=<id>` | `/main/videos` (defaults to latest eligible) | `?video=<id>` | `readerContentPaths.buildVideoReaderPath` |
| **Short / Swipe** | `/main/shorts/<canonical-slug>` | `/main/videos?video=<id>` (hub playback compat) | N/A (path slug authority) | `readerContentPaths.buildSwipeReaderPath` |
| **Video Hub** | `/main/videos` | `/main/videos` | Optional `?video=<id>` | `app/(reader)/main/videos/page.tsx` |

**Rules:**
- Do NOT create competing URL authorities (e.g. no `/video/<slug>`, `/v/<id>`, `/watch`, `/media/videos`).
- A Short displayed in the standard Video Hub queue retains its canonical Short slug for sharing and direct deep-linking (`/main/shorts/<slug>`), while allowing inline playback in the hub player.
- Never substitute video title as slug, and never drop or alter a canonical slug.

---

## 3. Current Architecture Audit & Matrix

### Architecture Matrix

| Concern | Current Authority | Mongo Implementation | File Store Implementation | Client / Server Responsibility | Problem & Remediation in 3.14A |
|---|---|---|---|---|---|
| **Video Identity** | `_id` (ObjectId or string) | `Video._id` (indexed, primary key) | `StoredVideo._id` (unique string) | Server maps `_id` to public item; client uses `id` | Standardize identity mapping across client models without losing `_id` equivalence. |
| **Short Identity** | `slug` (unique, lowercase, hyphenated) | `Video.slug` (sparse unique index) | `StoredVideo.slug` (`data/videos.json`) | Server resolves slug; client builds canonical links | Slugs must never be fabricated from titles on client; `buildVideoSlug(title, id)` is server-only fallback. |
| **Public Eligibility** | `isPubliclyPublishedVideo` in `videoPublication.ts` | Filter on `isPublished: true`, workflow status `published`, `scheduledFor <= now`, `publishedAt <= now`, processing ready | Same rules applied in-memory on `listAllStoredVideos()` | Server strictly enforces; client never receives uneligible records | **Limit-before-filter bug**: Mongo query in `getPublicVideoFeedPage` previously used `{ isPublished: true }` before cursor limit. Must use `buildPublicVideoMongoFilter(now)` so unready items do not displace eligible items. |
| **Selected Video** | `?video=<id>` URL query param | `getPublicVideoForMetadata(id)` via Mongo `findOne` | `getStoredVideoById(id)` fallback when Mongo down | Server SSR resolves selected item; client manages active selection | Previously, clicking queue items in client did not update URL or push browser history. 3.14A synchronizes URL via `window.history.pushState` and supports browser Back/Forward. |
| **Default Video** | Latest eligible standard video | First item of public feed query | First item of public feed rows | Server resolves `initialItems[0]` when `?video` missing | Must guarantee feed is pre-filtered by full publication eligibility before picking first item. |
| **Feed Eligibility** | Standard vs Short partition | Filter on `isShort` and aspect ratio | Same | Server partitions feeds; client displays queue | File store fallback in `getHomeFeedVideos` checked `isPublished !== false` instead of `isPubliclyPublishedVideo`. Remediated to use full predicate. |
| **Pagination / Limit** | `cursorPage` utility with `limit` (default 20) | Cursor on `publishedAt` and `_id` | Cursor on sorted in-memory array | Client calls `/api/v1/public/videos/latest` with cursor | Ensure cursor pagination query matches exact public filter so cursor continuity is preserved. |
| **Category / Tag** | `NEWS_CATEGORIES` taxonomy (`nameEn` enum) | `Video.category` matching category enum | `StoredVideo.category` | Client displays localized name via `resolveNewsCategory` | VideoFilterBar was unmounted in `VideosPageClient`. 3.14A integrates category filtering backed by real taxonomy without inventing artificial categories. |
| **Source Provider** | `inferVideoMediaProvider` (`'youtube'` or `'spaces-mp4'`) | `mediaProvider` enum on `Video` model | Same on `StoredVideo` | `VideoPlayer` dispatches to YouTube iframe or HTML5 `<video>` | Provide clean unavailable/error state if YouTube iframe or video fails; do not crash page. |
| **Playback URL** | `playbackUrl` with fallback to `videoUrl` | `playbackUrl` / `videoUrl` fields | Same | Server normalizes; player consumes | Ensure YouTube `/shorts/` and `/live/` URLs convert cleanly to embed URLs via `buildYouTubeEmbedUrl`. |
| **Poster / Thumbnail** | `resolveThumbnail` order: `posterUrl` -> `thumbnail` -> YouTube HQ default -> `/lokswami-share-preview.png` | `posterUrl`, `thumbnail` | Same | Server resolves; client renders with `ReaderImage` | Eliminate PDF thumbnail leakage (`isPdfThumbnail`). Use high priority only for selected player; lazy load queue thumbnails. |
| **Canonical URL** | `buildVideoReaderPath` & `buildSwipeReaderPath` in `readerContentPaths.ts` | Derived from `_id` / `slug` | Same | Server injects in `<link rel="canonical">` and JSON-LD | Exact match with Phase 3.13 contract. |
| **Share URL** | `buildUniversalSharePayload` via `ShareMenu` | Matches canonical URL | Same | Client triggers native share or Web Share API | Selected video actions must update share payload dynamically when selection changes. |
| **Metadata URL** | `buildVideoPageMetadata` & `buildVideosPageMetadata` | Resolves from `getPublicVideoForMetadata` | Same | Server renders OpenGraph, Twitter, canonical, robots | Missing/invalid `?video=<id>` serves hub metadata with `robots: { index: false, follow: true }`. |
| **Analytics** | `trackClientEvent` | N/A | N/A | Client hooks in `useSwipeAnalytics` and `ShareMenu` | Video Hub 2.0 must preserve existing analytics without sending staging mutations during QA. |
| **Short History** | Push/replace state on swipe | N/A | N/A | Client manages history stack | Hub selection history must not conflict with future Shorts swipe navigation (3.14B). |

---

## 4. Phase 3.14 Acceptance Criteria Detail

### 3.14A — Video Architecture + Video Hub 2.0 (This Task)

1. **Safety & Baseline**:
   - Clean merge from `origin/b3/foundation` (`1833939f86858bed4a8b518e750fdeea270fc823`).
   - Isolated worktree `C:\Dev\Lokswami-phase3.14-video-hub-shorts` on branch `b3/phase3.14-video-hub-shorts`.
   - Main repository foundation checkout remains clean.

2. **Public Eligibility & Limit-Before-Filter Fixes**:
   - `buildPublicVideoMongoFilter(now)` applied in `VideoRepository.getPublicVideoFeedPage` mongoFilter.
   - `getHomeFeedVideos` file-store fallback applies `isPubliclyPublishedVideo` and `isSwipeFeedEligibleVideo`.
   - Direct video selection (`getPublicVideoForMetadata`) verifies publication status; unavailable or hidden Mongo records never resurrect from stale file-store copies.
   - Unpublished, draft, scheduled-not-due, future, or processing-unready videos are excluded from public feeds and direct selection.

3. **Video Hub 2.0 Page Structure (`/main/videos`)**:
   - **Header**: Editorial section header with Lokswami Reader visual language and language-aware labels.
   - **Hero Section**: Primary selected video player with responsive aspect ratio (16:9 for landscape, centered 9:16 framed container for Shorts).
   - **Video Information Panel**: Headline/title (`<h1>` or `<h2>` depending on hierarchy), publish date formatted via `formatUiDate`, category badge, duration label, views badge (when present in data), and description toggle (`showMore`/`showLess`).
   - **Actions Row**: Universal Share (`ShareMenu`) populated with exact selected video canonical URL, Watch Later bookmark toggle, and playback controls.
   - **Up Next / Discovery Queue**: Clean, accessible queue with active selection indicator, live badges, thumbnail preview, and keyboard-navigable list items.
   - **Category Filtering**: Filter bar backed by existing editorial taxonomy categories (`National`, `State`, `Regional`, etc.) allowing instant category filtering.
   - **Search Filter**: Title/description search within eligible loaded videos.

4. **URL Selection & Browser History**:
   - Direct access to `/main/videos?video=<id>` selects the exact video on SSR and client hydration.
   - Selecting a video from the queue updates the browser URL to `/main/videos?video=<id>` via `window.history.pushState` (or router navigation).
   - Reloading the page preserves the selected video.
   - Browser Back and Forward buttons correctly transition between previously selected videos.
   - When no `video` query is present, defaults to the first public eligible video.
   - Invalid `?video=<missing-id>` falls back safely to the latest video and generates noindex metadata.

5. **Canonical & Share Integration**:
   - Standard videos share: `/main/videos?video=<id>`.
   - Shorts appearing in the hub share: `/main/shorts/<slug>`.
   - Queue selection changes immediately update the `ShareMenu` target URL.

6. **Responsive UX & Accessibility**:
   - Mobile (390px): Clean single-column layout, sticky or top player, readable text, touch targets >= 44px, no horizontal overflow.
   - Desktop (1440px): 12-column grid with 8-column hero/info and 4-column sticky up-next queue sidebar.
   - Visible focus states, proper ARIA labels on buttons, accessible player names, no keyboard trap.

7. **Error & Unavailable States**:
   - Safe empty state when no public videos exist.
   - Fallback error display if video media or YouTube fails to load, without crashing the page or trapping the user.

---

### 3.14B — Shorts / Swipe 2.0 (Scheduled Next)

- Vertical full-screen swipe feed with snapping and touch gesture momentum.
- Quick Article bottom sheet integration for linked stories.
- Swipe settings drawer (autoplay, captions, mute defaults, data saver).
- Mobile-first immersive viewing mode.
- Canonical URL synchronization on snap transition.

---

### 3.14C — Playback / Analytics / Performance / Resilience (Scheduled)

- Advanced playback resilience: adaptive buffering, network recovery, player warmup.
- Consolidated video telemetry: watch time milestones (25%, 50%, 75%, 100%), pause/seek telemetry, error tracking.
- Pre-caching and asset optimization for mobile devices.
- Network condition resilience (offline warning, data saver bitrates).

---

### 3.14D — Final Hardening / PR Preparation (Scheduled)

- End-to-end Playwright tests across desktop and mobile viewports.
- Security and CSP audits for external media frames and origins.
- Lint and typecheck validation.
- Deployment build verification (`npm run build:ci`).
- Pull request documentation and review artifacts.
