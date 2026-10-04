# Phase 3.15 — E-Paper & E-Magazine Reader 2.0 Acceptance Criteria

Baseline: `5f5872270409c0b5d8fd59687e42d4c19da52186` (HOME, `b3/foundation`).  
Worktree: `C:\Dev\Lokswami-phase3.15-epaper-emagazine-reader` on branch `b3/phase3.15-epaper-emagazine-reader`.

---

## 1. Phase Structure Overview

```text
3.15A — E-Paper Reader 2.0 (CURRENT TASK: Reader UX, Page Nav, Thumbnails, Zoom, Fullscreen, URL Sync)
3.15B — Hotspots + Story Interaction (Interactive Hotspots, Clipping, Read in Text Mode, Audio TTS)
3.15C — Exact Page/Story Sharing (Canonical Deep Links, Multi-Channel WhatsApp/Social, Share Preview)
3.15D — E-Magazine Reader 2.0 (Monthly Publication Seams, Issue Month Picker, No City Separation)
3.15E — Final Hardening / Security Audit / CI / Antigravity Review / Codex Review
```

---

## 2. Public Route & Canonical Authority Contracts

The Phase 3.13 URL authorities remain binding and strictly preserved:

### E-Paper Reader Route
```text
/main/epaper?paper=<paperId>&city=<citySlug>&date=<YYYY-MM-DD>&page=<pageNumber>&story=<storyToken>
```
- **Authority Helper**: `readerContentPaths.buildEPaperReaderPath`
- **Default Issue**: First eligible published issue matching city/date filters, or latest public issue.
- **Default Page**: `&page=1` (or clamped to valid page range `1..pageCount`).

### E-Magazine Reader Route
```text
/main/e-magazine?paper=<paperId>&month=<YYYY-MM>&page=<pageNumber>&story=<storyToken>
```
- **Authority Helper**: `readerContentPaths.buildEMagazineReaderPath`
- **Default Issue**: Latest eligible published monthly issue.
- **City**: Magazines are nationwide / global (`city: 'all'`). Never enforce daily city dimensions on E-Magazine.

---

## 3. Data Authority & Architecture Matrix

| Concern | Mongo Authority | File Store Fallback | Storage Assets | Reader Client | Current Authority & Safeguards |
|---|---|---|---|---|---|
| **Issue Identity** | `EPaper._id` (ObjectId string) | `StoredEPaper._id` (`data/epapers.json`) | DigitalOcean Spaces / S3 PDF & Pages | Client `paperId` query & state | Mongo authoritative when available; fallback strictly bounded by timeout. |
| **Publication Type** | `publicationType: 'epaper' \| 'emagazine'` | Same field on stored record | Separate folder paths (`epapers/` vs `emagazines/`) | Distinguishes daily edition vs monthly magazine | Daily editions enforce city/date; magazines enforce month only. |
| **City** | `citySlug` (e.g. `indore`, `bhopal`, `ujjain`) | `city` string mapped to slug | N/A | `EPaperCityPicker` filter | Normalized via `normalizeCitySlug`. E-Magazine ignores city filter. |
| **Issue Date** | `publishDate` (ISODate/string `YYYY-MM-DD`) | `publishDate` string | N/A | `EPaperDatePicker` filter | Daily: `YYYY-MM-DD`. Monthly: `YYYY-MM` via `normalizePublicationIssueMonth`. |
| **Page Count** | `pageCount: number` | `pages: number` | Extracted page images | Toolbar & selector bounds | Clamped to `1..pageCount`. Page index is 1-based. |
| **Page Image** | `pages[].imagePath` | N/A (generates PDF fallback if missing) | `/uploads/epapers/.../page-N.webp` | `EPaperCanvasViewport` | High-priority current page; lazy-loaded thumbnails. |
| **Thumbnail** | `thumbnailPath` | `thumbnailPath` / `thumbnail` | Cover thumbnail webp | Page strip & issue cards | Scaled preview for fast loading without full-page memory penalty. |
| **Story Identity** | `EPaperArticle._id` / `slug` | `articleHotspots[].id` | Story clippings & TTS audio | Modal & URL `&story=<token>` | Token matched against `releasedSnapshot.slug` first, then `_id`. |
| **Hotspots** | `EPaperArticle.hotspot` | `articleHotspots[].{x,y,w,h}` | Geometry on page canvas | Canvas overlay layer | Deferred to Phase 3.15B. |
| **Release Status** | `status: 'published'`, `isCurrentRevision: true` | Legacy records published by default | N/A | Server pre-filters | Stale file-store content NEVER resurrects hidden/draft Mongo content. |
| **Released Snapshot** | `releasedSnapshot` object | In-memory normalized snapshot | N/A | Public story rendering | For released stories, `releasedSnapshot` is immutable public authority. |
| **Public Eligibility** | `status === 'published' && publishDate <= now && publishedAt <= now` | In-memory date check | N/A | Reader feeds & metadata | Drafts, future, and scheduled-not-due items excluded before limits. |
| **Metadata Route** | `generateEPaperMetadata` | `getPublicEpaperForMetadata` fallback | Social share preview image | `<meta>` & OpenGraph tags | Unavailable or hidden selectors emit `robots: { index: false }`. |
| **Share Route** | `ShareMenu` component | N/A | Share text & canonical URL | Universal Web Share / WhatsApp | Generates exact canonical path matching selected issue and page. |

---

## 4. Phase 3.15A Acceptance Criteria Detail

### 1. Unified E-Paper Reader Experience (`/main/epaper`)
- Navigating to `/main/epaper` displays the **E-Paper Reader 2.0** as the primary interactive experience.
- When query parameters are present (`?paper=...&city=...&date=...&page=...`), the reader immediately opens the specified issue and page on initial render.
- When query parameters are absent, the reader defaults to the latest public eligible issue and Page 1.
- If no public issues exist at all, a clean empty state is displayed without infinite spinners or layout breakage.

### 2. Issue, City & Date Selection
- **City Picker**: Allows switching between authorized publication cities (`Indore`, `Bhopal`, `Ujjain`, etc.) or viewing all editions.
- **Date Picker**: Allows picking issue dates with published archives.
- Changing city or date filters fetches matching eligible issues and updates the selected issue and canonical URL safely.
- An archive drawer or edition switcher allows rapid switching between other published editions of the same date or recent issues.

### 3. Page Navigation & Boundaries
- **Previous / Next Controls**: Navigate between pages sequentially.
  - Previous button is disabled or hidden on Page 1.
  - Next button is disabled or hidden on Page N (last page).
- **Direct Page Selector**: Allows jumping directly to any page `1..N`.
- **Page Clamping**: Entering an out-of-range page query (e.g. `&page=0` or `&page=999`) safely clamps to Page 1 or Page N without crashing.

### 4. Page Thumbnail Rail
- A horizontal page thumbnail rail displays actual issue pages with 1-based page numbers.
- The active page is highlighted with a distinct active indicator and auto-scrolls into view.
- Thumbnails use low-bandwidth previews (`sizes="64px"` / WebP) and lazy-load non-visible pages.
- Thumbnails feature accessible ARIA labels (e.g. `aria-label="Jump to page 3"`).

### 5. Primary Page Viewer & Image Rendering
- Selected page renders sharply, maintaining exact aspect ratio within the viewport without horizontal layout spill.
- Displays an accessible loading spinner while page images load.
- If a page image is missing or fails to load, gracefully attempts PDF page rendering fallback or displays a clean error card with retry.
- Touch pinch-to-zoom and pan gestures are supported on touch devices; click-and-drag panning is supported on desktop when zoomed.

### 6. Reader Zoom Controls
- **Zoom In (`+`)**: Increases zoom level up to a safe maximum (4×).
- **Zoom Out (`-`)**: Decreases zoom level down to 1×.
- **Reset Zoom (`0`)**: Immediately resets zoom to 1× and centers viewport.
- Changing pages retains zoom if within predictable viewport bounds; changing issues resets zoom to 1×.

### 7. Fullscreen Viewing Mode
- Fullscreen button triggers native browser Fullscreen API on the reader container.
- Feature-detects `requestFullscreen` and `exitFullscreen` with graceful fallback for unsupported browsers (e.g. iOS Safari).
- Pressing `Escape` exits fullscreen cleanly.

### 8. Keyboard Navigation
- **ArrowRight**: Advances to next page (when not on last page).
- **ArrowLeft**: Returns to previous page (when not on first page).
- **`+` / `=`**: Zooms in.
- **`-`**: Zooms out.
- **`0`**: Resets zoom.
- **`Escape`**: Exits fullscreen or closes open menus.
- Keyboard listeners are strictly gated so they do not intercept keystrokes when typing inside inputs, selects, or modal dialogs.

### 9. URL & History Synchronization
- All navigation updates the browser URL to the canonical format:
  `/main/epaper?paper=<id>&city=<city>&date=<YYYY-MM-DD>&page=<page>`
- Page navigation updates browser history so browser **Back** and **Forward** buttons transition between visited pages and issues seamlessly.
- Page reload preserves the exact issue and active page.
- Zoom state is preserved in component memory and does NOT pollute browser history.

### 10. Performance & Anti-Degradation
- Only the currently visible page and adjacent page thumbnail are prioritized.
- Avoid preloading the entire issue at once.
- Automated PDF worker and ingestion pipeline remain 100% untouched.

---

## 5. Verification Matrix & Quality Gates

| Check | Tool / Command | Pass Criteria |
|---|---|---|
| **TypeScript** | `npm run typecheck` | 0 errors |
| **Strict Lint** | `npm run lint:strict` | 0 errors, 0 warnings |
| **Changed-File Lint** | `npx eslint <changed-files>` | 0 errors, 0 warnings |
| **Focused Vitest Tests** | `npx vitest run tests/epaper*` | All focused E-Paper reader tests pass |
| **Public Eligibility** | Vitest regressions | Hidden/future/draft issues blocked; stale file fallback safe |
| **Page Navigation & Zoom** | Vitest unit tests | Page boundary clamping, zoom limits, keyboard shortcuts pass |
| **CI Build** | `npm run build:ci` | All static & dynamic routes build cleanly |
| **No Deploy** | Policy invariant | 0 deployments, 0 staging mutations |
