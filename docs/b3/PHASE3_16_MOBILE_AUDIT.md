# Phase 3.16 — Mobile Experience Audit & Implementation Plan

**Repository:** `zaidshery/Lokswami-version-3`
**Foundation Branch:** `b3/foundation`
**Audited Foundation SHA:** `e7599f7d89010ab5d615c36a9c8bae2fc35f31f3`
**Status:** Audit & Implementation Planning Only (Read-Only)
**Document Path:** `docs/b3/PHASE3_16_MOBILE_AUDIT.md`

---

## Executive Summary

Phase 3.16 assesses whether the Lokswami reader platform delivers a truly first-class mobile experience across the entire end-to-end reader journey:
$$\text{Open Lokswami} \longrightarrow \text{Homepage} \longrightarrow \text{Section / Category} \longrightarrow \text{Article Reader} \longrightarrow \text{Search / Share} \longrightarrow \text{Video / Shorts} \longrightarrow \text{E-Paper / E-Magazine}$$

### Primary Audit Verdict
Lokswami B3 has already built substantial mobile foundations (Phase 3.11 Homepage 2.0, Phase 3.12 Article Reader 2.0, Phase 3.13 Deep-links/Sharing, Phase 3.14 Video Hub/Shorts, and Phase 3.15 E-Paper/E-Magazine Reader). However, mobile usability is currently **partially shared and inconsistent across surfaces**:
1. **Vertical Chrome Compression (P1):** On small and landscape screens (e.g. 844×390, 740×360), stacked sticky elements (`BreakingNews` 36px + `Header` 56px + Category bar 44px + `BottomNav` 64px = 200px) consume >51% of vertical viewport height, leaving <190px for reading content.
2. **iOS Safe Area Evaluation (P1):** Root `app/layout.tsx` lacks `viewportFit: 'cover'`, causing `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` to evaluate to `0px` in standard iOS Mobile Safari, putting bottom navigation and floating controls at risk of notch and home-indicator collision.
3. **Theme & Localization Incoherence in Search & Category (P2):** Search (`SearchClient.tsx`), Latest (`LatestFeedClient.tsx`), and Category feeds (`CategoryPageClient.tsx`) have hardcoded dark classes (`bg-lokswami-surface` `#18181b`, `text-lokswami-white` `#f4f4f5`) on light backgrounds, and Search displays Romanized Hinglish strings (`Khoj`, `Khabar khoje...`) instead of authentic Devanagari Hindi (`खोज`, `समाचार खोजें...`).
4. **Article Rich-Content Table/Pre Overflow (P2):** Article rich text has no overflow scroll containment for HTML `<table>` or `<pre>` elements, which can break horizontal mobile viewport bounds.
5. **Short Landscape Collision in Shorts Player (P2):** On landscape phones, `SwipeActions` right-side vertical floating buttons collide with the top navigation bar due to fixed large bottom offsets.

**No P0 defects** were found. Public content contracts, server publication filters, and authentication boundaries are completely intact.

---

## 1. Baseline Foundation Verification

- **Branch:** `b3/foundation`
- **Verified Foundation Commit:** `e7599f7d89010ab5d615c36a9c8bae2fc35f31f3`
- **Merge Commit Message:** `Merge pull request #27 from zaidshery/b3/phase3.15-epaper-emagazine-reader`
- **Worktree State:**
  - Active Worktree: `c:\Dev\Lokswami-version-3`
  - Unstaged Changes: Preserved pre-existing `data/analytics-events.json` and `next-env.d.ts`. Zero other files modified.
  - Linked Worktrees: `C:\Users\PC\.codex\worktrees\f2d6\Lokswami-version-3` and branch folder `c:\Dev\Lokswami-phase3.15-epaper-emagazine-reader`.

---

## 2. Existing Mobile Architecture Map

The mobile architecture is **partially shared**:

| Architecture Layer | Implementation Location | Sharing Model | Mobile Behavior |
| :--- | :--- | :--- | :--- |
| **Root Viewport** | [app/layout.tsx](file:///c:/Dev/Lokswami-version-3/app/layout.tsx) | Centralized | `width: 'device-width'`, `initialScale: 1`, `maximumScale: 5`, `themeColor: '#e72129'`. Missing `viewportFit: 'cover'`. |
| **Top Sticky Chrome** | [app/(reader)/main/layout.tsx](file:///c:/Dev/Lokswami-version-3/app/(reader)/main/layout.tsx) | Centralized | Stacks `<BreakingNews />` (36px) and `<Header />` (100px total: 56px top row + 44px category bar) inside `sticky top-0 z-40`. |
| **Bottom Navigation** | [components/layout/BottomNav.tsx](file:///c:/Dev/Lokswami-version-3/components/layout/BottomNav.tsx) | Shared reader shell | Rendered below `xl` (`xl:hidden`). 6 columns: Home, E-Paper, E-Mag, Video, Quick, Profile. Fixed `bottom-0 z-50`. |
| **Navigation Drawer** | [components/layout/MobileMenu.tsx](file:///c:/Dev/Lokswami-version-3/components/layout/MobileMenu.tsx) | Centralized | Triggered by hamburger button in `Header.tsx`. Traps focus, locks body scroll, handles Escape, includes safe-area bottom pad. |
| **Horizontal Category Strip** | [components/layout/DesktopNav.tsx](file:///c:/Dev/Lokswami-version-3/components/layout/DesktopNav.tsx) | Shared in Header | Rendered inside `Header.tsx` category bar on all viewports via `overflow-x-auto reader-scroll-x`. |
| **Touch / Gestures** | Surface-specific | Isolated | Multi-touch pinch/pan in `EPaperStoryImageViewport` and `EPaperCanvasViewport`; vertical touch drag in `SwipeFeed`; native scroll elsewhere. |
| **PWA / App Shell** | [public/sw.js](file:///c:/Dev/Lokswami-version-3/public/sw.js) & [app/manifest.ts](file:///c:/Dev/Lokswami-version-3/app/manifest.ts) | Centralized | App shell precached in production. Media files explicitly excluded from cache. `InstallAppPrompt.tsx` provides install UI. |

---

## 3. Global Mobile Shell Audit

### Header ([components/layout/Header.tsx](file:///c:/Dev/Lokswami-version-3/components/layout/Header.tsx))
- **Height:** Compact `h-14` (56px) on mobile (< 640px), `h-16` on sm+.
- **Controls at 320px:**
  - Menu button: `h-11 w-11` (44px target) with `<Menu strokeWidth={2.3} />`. Accessible label present.
  - Logo: Responsive sizing via CSS vars `[--reader-logo-icon:20px] [--reader-logo-wordmark:94px]` (~118px total).
  - ePaper icon link: `h-11 w-[42px]` (`order-0`).
  - Language toggle: `h-11 w-[42px]` (`order-1`, mobile toggle HI/EN with `aria-pressed`).
  - Search icon link: `h-11 w-11` (`order-2`, 44px target).
- **Findings:**
  - Total control width fits in 320px with ~20px margin remaining.
  - Language toggle and ePaper link widths are 42px (marginally below 44px guideline; height is 44px).
  - Category bar is rendered directly below Header top row (`h-11`, 44px), providing horizontal swipeable category chips.

### Breaking News ([components/ui/BreakingNews.tsx](file:///c:/Dev/Lokswami-version-3/components/ui/BreakingNews.tsx))
- **Height:** `h-9` (36px).
- **Audio Button:** `h-8 w-8` (32px × 32px), which is below standard 44px accessible touch target guidelines.
- **Marquee:** Smooth CSS ticker with accessible polite aria-live polite region for screen readers.

### Bottom Navigation ([components/layout/BottomNav.tsx](file:///c:/Dev/Lokswami-version-3/components/layout/BottomNav.tsx))
- **Visibility:** Rendered on all screens `< 1280px` (`xl:hidden`).
- **Columns:** 6 columns (`grid-cols-6`). At 320px, each column is ~50px wide. Minimum touch targets meet `min-h-[44px]`.
- **Active Indicator:** Smooth spring motion layoutId animation.
- **Safe Area:** Uses `pb-[max(env(safe-area-inset-bottom),0.25rem)]`.

### Drawer ([components/layout/MobileMenu.tsx](file:///c:/Dev/Lokswami-version-3/components/layout/MobileMenu.tsx))
- **Width:** `w-[84vw] max-w-[340px]`.
- **Keyboard & Focus:** Traps Tab/Shift-Tab focus inside modal; Escape closes drawer and restores focus to header hamburger trigger.
- **Scroll Locking:** Safely sets and restores `document.body.style.overflow = 'hidden'`.

---

## 4. Homepage Mobile Audit (Phase 3.11 Review)

### Lead Story & Top Package ([components/home/HomepageTopPackage.tsx](file:///c:/Dev/Lokswami-version-3/components/home/HomepageTopPackage.tsx))
- **Hero Aspect Ratio:** `aspect-video` (16:9), clean responsive scaling without letterboxing.
- **Headline Typography:** Fluid clamp `text-[clamp(1.3125rem,5.5vw,1.5rem)] font-bold leading-[1.23]`. Hindi typography does not truncate prematurely.
- **Metadata:** Category, publish date, and WhatsApp sharing button (`h-9 w-9`) fit across mobile viewports.

### Section Rails (Latest News & Popular News)
- **Thumbnail Grid:** `grid-cols-[88px_minmax(0,1fr)] gap-2` on mobile, scaling to `96px` on sm.
- **Line Clamping:** `line-clamp-2` with `break-words` ensures long Hindi headlines wrap naturally and do not overflow cards.
- **Empty States:** Renders polite accessible fallback message when feeds are empty.

### E-Paper & E-Magazine Homepage Promos
- **Indore E-Paper:** Renders 3:4 aspect ratio thumbnail `w-[min(78%,280px)]` with prominent "Read E-Paper" button and WhatsApp share.
- **Monthly E-Magazine:** Renders 3:4 aspect ratio cover with Container Queries (`@container`) adjusting layout smoothly between 320px and 768px.

### Media Rails
- **Videos Section:** 16:9 thumbnails with play badge, duration pill, and category badge. Single column on mobile.
- **Shorts Section:** 9:16 vertical cards with horizontal scroll rail `auto-cols-[calc((100%_-_0.75rem)/2)]` with `snap-x snap-proximity` and `data-swipe-ignore="true"` to prevent gesture hijacking.

---

## 5. Article Reader Mobile Audit (Phase 3.12 Review)

### Typography & Layout ([components/article/ArticleReader.module.css](file:///c:/Dev/Lokswami-version-3/components/article/ArticleReader.module.css))
- **Headline:** `clamp(1.75rem, 1.15rem + 2vw, 2.625rem)` with `line-height: 1.3`, `text-wrap: pretty`, and Devanagari font fallback stack (`var(--font-devanagari), Nirmala UI Bold, Mangal`).
- **Body Text:** `font-size: 1.0625rem` (17px) on mobile, `1.125rem` (18px) on desktop with `line-height: 1.8` and `overflow-wrap: anywhere`. Comfortable for long-form Hindi reading.
- **Hero Image:** `aspect-[16/10]` on mobile, `aspect-[16/9]` on sm, with `max-h-[480px]`. Caption and photo credit render below image.

### Controls & Actions
- **Header Actions:** Bookmark button, Share menu, E-Paper shortcut. At `< 640px`, CSS grid aligns actions neatly into 3 compact icon buttons (`min-height: 2.75rem`, 44px).
- **Audio Player:** Includes progress bar, speed control, Devanagari voice synthesis, and AI bullet summary generator with polite aria-live status announcements.
- **Author Profile Modal:** Dialog with focus trap, Tab cycle, Escape key dismissal, and backdrop blur.

### Identified Gap
- **Rich Content Overflow:** Embedded HTML tables (`<table>`) and code blocks (`<pre>`) lack an automated horizontal overflow scroll wrapper. If CMS editors insert wide data tables, they can push the mobile page beyond 100vw.

---

## 6. Video Hub & Shorts Mobile Audit (Phase 3.14 Review)

### Video Hub ([app/(reader)/main/videos/VideosPageClient.tsx](file:///c:/Dev/Lokswami-version-3/app/(reader)/main/videos/VideosPageClient.tsx))
- **Player Hero:** Embedded HTML5 / YouTube video player with custom controls, scrubbing, speed options, watch telemetry, and pause on visibility loss.
- **Filters & Category Chips:** Horizontal chips with search input. Supports single-tap filtering.
- **Browser History:** Syncs `?video=<id>` with `window.history.pushState` and handles `popstate` on browser Back.

### Shorts Immersive Mode ([components/swipe/SwipeFeed.tsx](file:///c:/Dev/Lokswami-version-3/components/swipe/SwipeFeed.tsx))
- **Immersive Shell:** Fullscreen `fixed inset-0 z-40 bg-black`. Hides top Header and Footer.
- **Touch Gestures:** Captures `changedTouches` delta in `handleTouchEnd`. Threshold `Math.abs(delta) >= 48px` triggers vertical slide navigation.
- **Autoplay & Data Saver:** Remembers user preferences in localStorage; pauses automatically on tab backgrounding.
- **Quick Article Sheet:** Swiping up or tapping "पूरी खबर पढ़ें" opens a modal bottom sheet displaying full story text without leaving the video stream.

### Identified Gap
- **Short Landscape Collision (ISSUE-MOB-06):** In landscape mode on phones (e.g. 844×390), the action buttons (`SwipeActions.tsx` positioned at `bottom-[calc(var(--reader-bottom-nav-space)+7.5rem)]`) collide with the top header bar.

---

## 7. E-Paper Mobile Audit (Phase 3.15 Integration)

- **Toolbar:** On mobile, top row provides Back, Logo, Fullscreen, Theme, and Share. A sub-toolbar provides Previous/Next page buttons (`h-11 w-11`), a page jump `<select>` dropdown (`h-11`), and a "Show/Hide pages" drawer toggle.
- **Touch Gestures:** `EPaperCanvasViewport.tsx` and `EPaperStoryImageViewport.tsx` support:
  - Multi-touch pinch-to-zoom using Pointer Events with pointer capture.
  - Double-tap zoom toggle between 100%, 200%, and 400%.
  - Pan gestures via `useRef` coordinate transforms avoiding React re-render cascades.
  - Horizontal swipe page turning (`PAGE_SWIPE_MIN_DISTANCE_PX = 36px`).
- **Floating Zoom HUD:** Displays floating on-screen zoom controls on mobile (`sm:hidden absolute bottom-2 left-1/2 -translate-x-1/2`) with Minus, Percentage, Plus, and Reset buttons (all with 44px touch targets).
- **Known Carried Debt:** Cold image download performance on slow mobile networks remains deferred to Phase 3.18.

---

## 8. E-Magazine Mobile Audit

- **Shared Reader Seam:** Reuses the verified `EPaperReaderModal` and `EPaperCanvasViewport` components.
- **Domain Boundaries:** Adheres to `publicationType: 'emagazine'`, monthly issue paths (`/main/e-magazine/[year]/[month]`), and monthly metadata without daily/city scheduling leakage.
- **Content Authority:** Database currently has published monthly magazine issues with cover pages and page spreads, but zero released story snapshots (known editorial debt). Story crop previews are gracefully disabled when snapshots are absent.

---

## 9. Search Mobile Audit

- **Entry Point:** Header search link (`h-11 w-11`) present on all viewports.
- **Search Experience:** Full page at `/main/search` with auto-focusing query input, instant local search over merged published articles, clear button (`h-12 w-12`), category filter, and sort selector.
- **Identified Issues:**
  1. **Theme Inversion (ISSUE-MOB-03):** Elements use hardcoded dark classes (`bg-lokswami-surface` `#18181b`, `text-lokswami-white` `#f4f4f5`) which look broken/inverted in light mode.
  2. **Hinglish Copy (ISSUE-MOB-04):** Displays Romanized strings (`Khoj`, `Khabar khoje...`, `Sabhi Categories`) instead of authentic Devanagari Hindi.

---

## 10. Share & Deep Linking Mobile Audit

- **Universal Share Implementation:** [components/ui/ShareMenu.tsx](file:///c:/Dev/Lokswami-version-3/components/ui/ShareMenu.tsx) uses:
  - Web Share API (`navigator.share`) when supported on mobile device.
  - Floating fallback menu with WhatsApp direct deep-link, Facebook, X, LinkedIn, Telegram, and clipboard copy.
- **Canonical URLs:** Strict canonical resolution via `resolveCanonicalShareUrl()` ensures deep links point to public article paths (`/main/article/[slug]`), video paths (`/main/videos?video=[id]`), and epaper editions (`/main/epaper/[city]/[date]`).
- **Deep Link Navigation:** Opening shared URLs directly initializes reader state correctly without broken modal overlays.

---

## 11. Touch & Gesture System Audit

| Surface | Gesture Types | Implementation File | Gesture Conflict Protection |
| :--- | :--- | :--- | :--- |
| **Global Page** | Vertical scroll | Native browser scroll | No touch event interception on `<body>`. Normal scroll remains 100% predictable. |
| **Category Bar** | Horizontal drag | [DesktopNav.tsx](file:///c:/Dev/Lokswami-version-3/components/layout/DesktopNav.tsx) | `overscroll-x-contain touch-pan-x` with `data-swipe-ignore="true"`. |
| **Shorts Rail** | Horizontal swipe | [HomeShortsSection.tsx](file:///c:/Dev/Lokswami-version-3/components/video/HomeShortsSection.tsx) | `snap-x touch-pan-x` with `data-swipe-ignore="true"`. |
| **Shorts Feed** | Vertical swipe | [SwipeFeed.tsx](file:///c:/Dev/Lokswami-version-3/components/swipe/SwipeFeed.tsx) | Touch delta threshold >= 48px; sub-sheets stop propagation. |
| **E-Paper Canvas** | Pinch, pan, swipe | [EPaperCanvasViewport.tsx](file:///c:/Dev/Lokswami-version-3/components/epaper/reader/EPaperCanvasViewport.tsx) | Pointer events with `setPointerCapture`; pointer count check distinguishes pan from pinch. |
| **Story Crop** | Pinch, pan, double-tap | [EPaperStoryImageViewport.tsx](file:///c:/Dev/Lokswami-version-3/components/epaper/reader/EPaperStoryImageViewport.tsx) | `touch-none` prevents browser scroll hijacking while interacting with image crop. |

---

## 12. Responsive Breakpoint Inventory

### Defined Tailwind Breakpoints
- `xs`: `360px`
- `sm`: `640px`
- `md`: `768px` (Mobile / Tablet threshold)
- `lg`: `1024px` (Tablet / Desktop threshold)
- `xl`: `1280px` (BottomNav hide threshold / Desktop aside rail activation)
- `wide`: `1440px`
- `2xl`: `1536px`

### Ad-hoc Breakpoints in Codebase
- `min-[360px]`: Header, BottomNav, Homepage magazine card.
- `min-[375px]`: MagazinePromoTile grid.
- `min-[380px]`: BottomNav icon size.
- `max-[420px]`: Article reader header action icon visibility.
- `@media (max-width: 639px)`: `ArticleReader.module.css` mobile grid overrides.
- `width < 768`: `app/(reader)/main/layout.tsx` device detection (`isMobile`).
- `768 <= width < 1024`: `isTablet` in layout.
- `xl:hidden`: BottomNav visibility (displayed up to 1279px, which includes 1024px tablets and small laptops).

---

## 13. Mobile Viewport Matrix QA Findings

| Viewport | Device Archetype | Horizontal Overflow | Layout Status | Key Findings / Anomalies |
| :--- | :--- | :--- | :--- | :--- |
| **320 × 740** | Narrow Mobile (iPhone SE 1st / Accessibility 320 Reflow) | None (0px) | Functional | Controls fit tightly in Header (290px / 320px). BottomNav 6 columns are ~50px wide each. All readable. |
| **360 × 800** | Compact Android (Samsung Galaxy A-series) | None (0px) | Excellent | Baseline mobile layout. Good padding and typography proportions. |
| **390 × 844** | Baseline iOS (iPhone 12 / 13 / 14 / 15 / 16) | None (0px) | Good | Clean rendering, but missing `viewportFit: 'cover'` inhibits notch/home-bar safe-area insets in standard Safari. |
| **430 × 932** | Large iOS / Android (iPhone Pro Max, Pixel Pro) | None (0px) | Excellent | Generous margins and breathing room. |
| **768 × 1024** | Portrait Tablet (iPad Mini / Air) | None (0px) | Mixed | Segmented language pill active; BottomNav still visible (due to `xl:hidden` at 1280px). |
| **844 × 390** | Short Mobile Landscape (iPhone landscape) | None (0px) | **Compromised** | Stacked sticky bars consume 200px (51% of 390px height). In Shorts player, floating actions collide with top bar. |
| **1440 × 900** | Desktop Reference | None (0px) | Excellent | Full desktop shell, SideRail, DesktopNav, 2-column homepage layout. |

---

## 14. Safe Area & Mobile Browser Chrome Audit

1. **`viewportFit: 'cover'` Missing:**
   In [app/layout.tsx](file:///c:/Dev/Lokswami-version-3/app/layout.tsx):
   ```ts
   export const viewport: Viewport = {
     width: 'device-width',
     initialScale: 1,
     maximumScale: 5,
     themeColor: '#e72129',
   };
   ```
   Lacks `viewportFit: 'cover'`. Without this setting, iOS WebKit sets `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` to `0px` in standard browser sessions.
2. **Safe Area CSS Variables:**
   In [app/globals.css](file:///c:/Dev/Lokswami-version-3/app/globals.css):
   `--bottom-nav-height: 4rem;` (64px)
   `--reader-bottom-nav-space: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom));`
   Main content area uses `.reader-bottom-safe-pad`, properly reserving scroll space above BottomNav.
3. **Dynamic Viewport Units:**
   `.h-vh-dvh` utility is defined with `100vh; height: 100dvh;` fallback. Used in Shorts and modal sheets.

---

## 15. Input Capability Audit

- **Pointer & Hover Distinction:**
  - In `globals.css`: `@media (hover: none) and (pointer: coarse)` disables 3D tilt transforms and hover scale effects on touch devices to avoid stuck hover states.
  - In `DesktopNav.tsx`: Dropdown hover listeners exit early if `!(hover: hover) and (pointer: fine)`.
  - In `EPaperStoryImageViewport.tsx`: Distinguishes between mouse double-clicks and multi-touch tap gestures using `pointerType`.
- **Hybrid Devices:** Tablets with keyboards and trackpads are supported without gesture locking.

---

## 16. Accessibility Baseline (Mobile Blockers vs Phase 3.17)

### Mobile Blockers (Addressed in Phase 3.16)
- **ISSUE-MOB-07:** Breaking News audio speaker button (`h-8 w-8` = 32px) touch target is below minimum 44px guideline.
- **ISSUE-MOB-08:** Header language switcher and ePaper link touch widths are 42px (marginally below 44px).
- **ISSUE-MOB-05:** Article rich-content table horizontal overflow containment.

### Deferred to Phase 3.17 (Dedicated Accessibility Hardening)
- Complete screen reader announcement audit across all assistive technology permutations.
- Comprehensive WCAG 2.1 AAA color contrast pass on subtle muted metadata.
- Full keyboard tab navigation order across nested popup/dropdown/flyout menus.

---

## 17. Performance Baseline (3.16 Usability vs 3.18 Debt)

### 3.16 Mobile Usability Risks
- Large unconstrained HTML tables causing reflow and horizontal layout shifts.
- Layout shift from sticky header stacking on landscape viewports.

### Carried Forward as Phase 3.18 Performance Debt
- Cold first-load E-Paper page image downloads on low-bandwidth mobile networks (large multi-megabyte canvas image assets).
- Dynamic client JS bundle-splitting and prefetching optimization.
- Audio and offline media asset caching.

---

## 18. PWA / App-Like Experience Audit

- **Manifest:** Defined via Next.js metadata route at [app/manifest.ts](file:///c:/Dev/Lokswami-version-3/app/manifest.ts), serving `/manifest.webmanifest`. Contains `display: 'standalone'`, portrait orientation, 192px and 512px maskable icons, and app shortcuts.
- **Service Worker:** [public/sw.js](file:///c:/Dev/Lokswami-version-3/public/sw.js) is registered in production by [components/ui/InstallAppPrompt.tsx](file:///c:/Dev/Lokswami-version-3/components/ui/InstallAppPrompt.tsx). It caches the application shell and static assets, while deliberately excluding streaming video extensions (`.mp4`, `.m3u8`, etc.) from runtime caching.
- **Install UI:** `InstallAppPrompt.tsx` provides an accessible custom install banner for Chrome/Android (`beforeinstallprompt`) and step-by-step "Add to Home Screen" instructions for iOS Safari.
- **Recommendation:** **Option C** — Current PWA implementation is already sufficient for app shell caching and home-screen installation. Expanding into offline article reading or push notifications is deferred to future roadmaps.

---

## 19. Native Mobile App Scope

- **Repository Audit:** Zero React Native, Expo, Capacitor, Ionic, Cordova, or Android/iOS native code exists in the repository.
- **Determination:** The product roadmap establishes Lokswami as a **100% web-first Next.js 15 App Router platform**. Phase 3.16 explicitly means **First-class Mobile Web & PWA Standalone Experience**. No native app development is in scope.

---

## 20. CMS / Content Contract Safety

- **Public Route Isolation:** All reader routes (`app/(reader)/main/*`) consume public server services (`publicHomeFeedService`, `publicArticles`, `publicVideos`, `publicEpapers`) that enforce:
  1. `status === 'published'`.
  2. Scheduled items not yet due (`publishDate <= now`) are strictly omitted.
  3. Zero draft content leakage.
  4. E-Paper and E-Magazine require released snapshots (`releasedSnapshot !== null`).
- **Safety Invariant:** Mobile UI optimizations will not mutate or bypass any server-side publication boundaries.

---

## 21. Current Mobile Test Coverage Assessment

| Test File | Surface | Scope | Assessment |
| :--- | :--- | :--- | :--- |
| `tests/phase3-responsive-qa.test.ts` | Canonical Viewports | Tests 360px through 1440px via runner | **PARTIAL** (omits 320px and short landscape 844x390) |
| `tests/header-responsive-contract.test.tsx` | Header & Drawer | Tests 320, 390, 768, 1024, 1440 DOM controls | **GOOD COVERAGE** |
| `tests/reader-shell-navigation.test.tsx` | Shell Navigation | Tests BottomNav active states and items | **GOOD COVERAGE** |
| `tests/mobile-runtime-compatibility.test.ts` | Legacy Browsers | Theme init scripts, MediaQueryList fallback | **GOOD COVERAGE** |
| `tests/article-reader-actions.test.tsx` | Article Detail | Header actions, bookmarks, sharing | **GOOD COVERAGE** |
| `tests/epaper-reader-2.test.tsx` | E-Paper Reader | Zoom, page turning, hotspot layer | **GOOD COVERAGE** |
| `tests/swipe-feed.test.tsx` | Shorts Player | Vertical navigation, playback controls | **GOOD COVERAGE** |
| `app/(reader)/main/search/` | Search Mobile | Search query, keyboard dismissal, filters | **MISSING** dedicated responsive unit tests |
| `components/article/` | Article Rich Content | Table / code overflow containment | **MISSING** overflow unit tests |

---

## 22. Mobile Issue Register

| Issue ID | Surface | Viewport(s) | Severity | Current Behavior | Expected Behavior | Likely Root Cause | Affected Files | Subphase |
| :--- | :--- | :--- | :---: | :--- | :--- | :--- | :--- | :---: |
| **ISSUE-MOB-01** | Global Shell | Short viewports (<= 500px height, mobile landscape) | **P1** | Sticky top chrome (136px) + BottomNav (64px) consumes 200px (>51% screen), leaving <190px for reading. | Top chrome collapses/compacts on downward scroll or hides secondary bars in landscape, restoring reading space. | Fixed sticky stacking of BreakingNews + Header + CategoryBar in `main/layout.tsx`. | `main/layout.tsx`, `Header.tsx`, `BreakingNews.tsx` | **3.16A** |
| **ISSUE-MOB-02** | Root Viewport | iOS notched / home-bar devices | **P1** | `env(safe-area-inset-*)` evaluates to 0px in standard Mobile Safari. | Safe area insets evaluate accurately to protect bottom nav and floating controls from home indicator. | Missing `viewportFit: 'cover'` in Next.js `Viewport` export. | `app/layout.tsx` | **3.16A** |
| **ISSUE-MOB-03** | Search / Latest / Category | All mobile & tablet in light mode | **P2** | Search inputs, filter dropdowns, and cards use hardcoded dark classes (`#18181b`) on white background. | Clean semantic editorial styling matching light and dark themes smoothly. | Hardcoded `bg-lokswami-surface` / `text-lokswami-white` classes instead of semantic tokens. | `SearchClient.tsx`, `LatestFeedClient.tsx`, `CategoryPageClient.tsx` | **3.16B** |
| **ISSUE-MOB-04** | Search | All mobile in Hindi mode (`hi`) | **P2** | Romanized Hinglish strings ("Khoj", "Khabar khoje...", "Sabhi Categories", "Prasangikta"). | Authentic Devanagari Hindi strings ("खोज", "समाचार खोजें...", "सभी श्रेणियां", "प्रासंगिकता"). | Hardcoded Latin transliteration in client copy dictionary. | `SearchClient.tsx` | **3.16B** |
| **ISSUE-MOB-05** | Article Reader | Mobile (< 640px, especially 320px–390px) | **P2** | Raw editor HTML tables (`<table>`) or code blocks (`<pre>`) can cause horizontal viewport blowout. | Tables and pre blocks are contained in responsive scroll containers (`overflow-x: auto; max-width: 100%`). | Missing table and pre overflow rules in rich content renderer. | `ArticleReader.module.css`, `articleRichContent.ts` | **3.16C** |
| **ISSUE-MOB-06** | Video / Shorts | Short landscape viewports (height <= 420px) | **P2** | Action buttons at `bottom-[calc(var(--reader-bottom-nav-space)+7.5rem)]` collide with top bar. | Responsive landscape positioning or scaling keeps actions accessible without overlap. | Fixed large vertical rem offsets in `SwipeActions.tsx`. | `SwipeActions.tsx`, `SwipeFeed.tsx` | **3.16D** |
| **ISSUE-MOB-07** | Breaking News | Touch viewports | **P3** | Audio speaker button touch target is 32px × 32px (`h-8 w-8`). | Minimum accessible touch target >= 44px × 44px. | Explicit `h-8 w-8` without touch expansion padding. | `BreakingNews.tsx` | **3.16A** |
| **ISSUE-MOB-08** | Header | Mobile viewports (< 768px) | **P3** | Language switch and ePaper link touch widths are 42px. | Touch target dimensions meet standard 44px minimum hit area. | Compact header styling `w-[42px]`. | `Header.tsx` | **3.16A** |
| **ISSUE-MOB-09** | QA Suite | Test Infrastructure | **P3** | `responsive-qa.js` omits 320px and short landscape (844×390) from canonical viewport list. | Automated test suite validates 320px and landscape mobile. | Viewport list started at 360px and only tested portrait mobile. | `scripts/phase3/responsive-qa.js`, `tests/phase3-responsive-qa.test.ts` | **3.16E** |

---

## 23. Scope Boundaries

- **IN SCOPE:**
  - Viewport safe area configuration (`viewportFit: 'cover'`).
  - Mobile sticky chrome vertical height optimization (auto-compact on scroll, landscape compression fix).
  - Touch target standardization (minimum 44px hit areas on all shell controls).
  - Search, Latest, and Category mobile feed visual consistency and Hindi localization.
  - Article rich-content table/pre horizontal scroll containment.
  - Video Hub & Shorts landscape collision resolution and gesture isolation.
  - E-Paper / E-Magazine mobile toolbar and drawer integration verification.
  - Expansion of canonical viewport QA matrix to include 320px and 844×390 landscape.
- **OUT OF SCOPE:**
  - Developing a native mobile app (React Native / Capacitor / Expo).
  - Redesigning CMS / Admin interfaces.
  - Redesigning social share cards / OpenGraph banners.
- **DEFERRED TO PHASE 3.17 (ACCESSIBILITY):**
  - Full assistive technology screen reader audit across all devices.
  - Complete ARIA live region orchestration and WCAG 2.1 AAA contrast passes.
- **DEFERRED TO PHASE 3.18 (PERFORMANCE):**
  - Cold first-load E-Paper page image downloads on low-bandwidth connections.
  - Offline article reader service worker caching.
- **DEFERRED TO FUTURE ROADMAP:**
  - Web Push Notifications / APNs push notifications.

---

## 24. Proposed Phase 3.16 Execution Plan (3.16A through 3.16E)

```
Phase 3.16A: Mobile Shell, Safe Area & Navigation Foundation
      ↓
Phase 3.16B: Search, Category & Latest Feeds Mobile Polish
      ↓
Phase 3.16C: Article Reader Mobile Typography & Inline Media
      ↓
Phase 3.16D: Video Hub, Shorts & Media Touch Interaction
      ↓
Phase 3.16E: Cross-Device QA Matrix, Regression & Final Acceptance
```

### Subphase 3.16A — Mobile Shell, Safe Area & Navigation Foundation
- **Objective:** Fix iOS safe area propagation (`viewportFit: 'cover'`), resolve vertical chrome compression on mobile scroll and landscape viewports, and standardize minimum 44px touch targets on Header and Breaking News.
- **Primary Surfaces:**
  - `app/layout.tsx` (add `viewportFit: 'cover'`)
  - `app/(reader)/main/layout.tsx` (optimize sticky header container on mobile scroll / landscape)
  - `components/layout/Header.tsx` (standardize 44px touch targets for language switch and ePaper link)
  - `components/ui/BreakingNews.tsx` (expand audio button touch hit area to 44px)
  - `components/layout/BottomNav.tsx`
- **Tests:** `tests/header-responsive-contract.test.tsx`, `tests/reader-shell-navigation.test.tsx`, `tests/breaking-news-header.test.tsx`.
- **Acceptance Criteria:** `viewportFit: 'cover'` active; sticky chrome does not consume >30% of screen height during active scrolling or landscape; all interactive header buttons have >= 44px touch targets.

### Subphase 3.16B — Search, Category & Latest Feeds Mobile Polish
- **Objective:** Fix theme token inversion in Search, Latest, and Category feeds (eliminate dark-on-light hardcoded classes in light mode); replace Romanized Hinglish strings with authentic Devanagari Hindi; optimize mobile keyboard dismissal and filter chips.
- **Primary Surfaces:**
  - `app/(reader)/main/search/SearchClient.tsx`
  - `app/(reader)/main/latest/LatestFeedClient.tsx`
  - `app/(reader)/main/category/[slug]/CategoryPageClient.tsx`
- **Tests:** New focused unit tests for `SearchClient` and `CategoryPageClient` theme rendering and Hindi copy.
- **Acceptance Criteria:** Search, Latest, and Category pages render seamless light/dark surfaces; authentic Hindi Devanagari labels displayed; search query clear button and keyboard dismissal operate smoothly.

### Subphase 3.16C — Article Reader Mobile Typography & Inline Media
- **Objective:** Ensure rich-content tables (`<table>`) and code blocks (`<pre>`) are contained in horizontal scroll wrappers to prevent 100vw blowout; verify line lengths, caption spacing, audio player controls, and bottom safe pad spacing.
- **Primary Surfaces:**
  - `components/article/ArticleReader.module.css`
  - `lib/utils/articleRichContent.ts`
  - `app/(reader)/main/article/[id]/ArticleDetailClient.tsx`
- **Tests:** `tests/article-reader-actions.test.tsx`, `tests/article-rich-content.test.ts`.
- **Acceptance Criteria:** Zero horizontal overflow on 320px–430px viewports with articles containing rich tables or preformatted code; reading progress and audio player remain fully interactive above BottomNav.

### Subphase 3.16D — Video Hub, Shorts & Media Touch Interaction
- **Objective:** Eliminate landscape collisions in `SwipeFeed` / `SwipeActions`; refine touch swipe vs scroll isolation across video cards and horizontal rails; verify video orientation transitions.
- **Primary Surfaces:**
  - `components/swipe/SwipeFeed.tsx`
  - `components/swipe/SwipeActions.tsx`
  - `components/video/HomeShortsSection.tsx`
  - `app/(reader)/main/videos/VideosPageClient.tsx`
- **Tests:** `tests/swipe-feed.test.tsx`, `tests/video-detail-hero.test.tsx`.
- **Acceptance Criteria:** In landscape orientation (height <= 420px), floating action buttons scale or reposition cleanly without overlapping top navigation controls; horizontal rails swipe smoothly without triggering vertical page jumps.

### Subphase 3.16E — Cross-Device QA Matrix, Regression & Final Acceptance
- **Objective:** Update `scripts/phase3/responsive-qa.js` to include 320px portrait and 844×390 landscape; execute full responsive verification; run end-to-end reader journey validation across all supported viewports; verify zero regression in CI pipeline.
- **Primary Surfaces:**
  - `scripts/phase3/responsive-qa.js`
  - `tests/phase3-responsive-qa.test.ts`
- **Tests:** `npm run typecheck`, `npm run lint:strict`, `npm run test:ci`, `npm run build:ci`.
- **Acceptance Criteria:** All canonical viewports (320, 360, 375, 390, 412, 430, 768, 820, 1024, 1440, and 844×390 landscape) report 0 horizontal overflow and 0 page errors; full reader journey passes verification.

---

## 25. Phase 3.16 Acceptance Contract

A reader using a smartphone or tablet must be able to comfortably complete the entire public product journey without experiencing mobile-specific usability defects:
1. **Homepage:** Access lead story, latest news, popular news, live updates, and e-paper/magazine cards with zero horizontal overflow and proper aspect-ratio image scaling.
2. **Navigation:** Seamlessly open categories and sections via the bottom navigation bar, header category strip, or slide-out hamburger drawer with reliable focus management.
3. **Article Reading:** Read long-form Hindi and English articles with comfortable fluid typography, audio narration, AI summary, bookmarking, and native/fallback sharing, with rich tables cleanly scroll-contained.
4. **Search:** Search news in authentic Devanagari Hindi or English, filter by category/sort, and clear queries with touch-friendly controls.
5. **Video & Shorts:** Watch landscape videos in Video Hub and swipe vertically through Shorts in full-screen mode, with responsive controls in both portrait and landscape.
6. **E-Paper & E-Magazine:** Browse editions, zoom pages via pinch or double-tap, pan freely, turn pages via horizontal swipe, and inspect hotspot story crops.
7. **Standards Compliance:**
   - 0 P0 or P1 mobile usability defects remaining.
   - 0 horizontal page overflow at 320px, 360px, 390px, 412px, 430px, or 844×390 landscape.
   - All interactive touch targets meet or exceed 44px × 44px hit areas.
   - Full publication authority maintained (zero draft or scheduled content leakage).
   - All quality gates pass (`npm run typecheck`, `npm run lint:strict`, `npm run test:ci`, `npm run build:ci`).

---

## 26. Dependencies & Known Carried Debt

1. **Cold E-Paper/E-Magazine First-Load Performance:** High-resolution page image downloads on cold caches and slow mobile networks remain carried forward as **Phase 3.18 performance debt**.
2. **Real E-Magazine Story Snapshots:** Live database has 0 released story snapshots for monthly e-magazine issues. This remains **editorial debt**; the reader interface gracefully falls back to page spread view.
3. **Newsroom Placeholder Content:** Some demo/mock articles in local development remain **content debt**, strictly isolated from production publication services.

---

## 27. Audit Verification & Invariant Certification

- [x] **No implementation performed:** Zero application source code or test files were created or modified.
- [x] **No git commits created:** Working tree remains on clean foundation SHA `e7599f7d89010ab5d615c36a9c8bae2fc35f31f3`.
- [x] **No branches pushed:** Remote repository untouched.
- [x] **No PR opened / merged:** Repository governance preserved.
- [x] **No deployments triggered:** Vercel / Hostinger staging and production environments untouched.
- [x] **No CMS / Mongo / content mutated:** Database records, analytics files, and CMS credentials preserved.
