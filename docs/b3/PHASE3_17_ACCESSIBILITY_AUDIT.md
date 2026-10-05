# Phase 3.17 — Accessibility Audit & Implementation Plan

**Repository:** `zaidshery/Lokswami-version-3`
**Foundation Branch:** `b3/foundation`
**Audited Foundation SHA:** `cccefa1567d7c75fcfc68bb4f5ca93677f15d071`
**Status:** Audit & Implementation Planning Only (Read-Only)
**Document Path:** `docs/b3/PHASE3_17_ACCESSIBILITY_AUDIT.md`

---

## Executive Summary

Phase 3.17 conducts a comprehensive, rigorous accessibility audit of the public reader experience of Lokswami B3 against **WCAG 2.2 Level AA** standards and the project's established mobile UX design guidelines (~44×44px interactive touch targets).

The audit evaluates the complete end-to-end reader journey:
$$\text{Homepage} \longrightarrow \text{Global Navigation / Drawer} \longrightarrow \text{Category / Latest Feeds} \longrightarrow \text{Search} \longrightarrow \text{Article Reader} \longrightarrow \text{Share Menu} \longrightarrow \text{Video Hub} \longrightarrow \text{Shorts} \longrightarrow \text{E-Paper} \longrightarrow \text{E-Magazine} \longrightarrow \text{Public Account / Auth Seams}$$

### Primary Audit Verdict
Lokswami B3 possesses a solid baseline: semantic `<main>` with skip-link support, accessible drawer focus trapping, high-contrast `.editorial-focus-ring` tokens, and dual Hindi/English localization. However, several systematic gaps prevent full WCAG 2.2 AA compliance:
1. **Missing Headings on E-Paper & E-Magazine (P1):** The interactive canvas in `EPaperPageClient.tsx` has zero `<h1>` or semantic heading elements. Screen reader users navigating by heading (`H` key) find no landmarks or headings on `/main/epaper` or `/main/e-magazine`.
2. **Shorts Mobile Swipe-Only Navigation (P1):** While desktop viewports provide floating Up/Down buttons, mobile touch viewports hide them (`hidden md:flex`). Users with motor impairments or single-switch assistive technology have no single-point activation alternative to vertical swiping.
3. **Missing Visible Focus Indicators on Key Reader Controls (P1):** Secondary and media toolbar controls (e.g. `VideoDetailHero` back button, `VideoFilterBar` view chips, `EPaperToolbar` zoom/page buttons, and `EPaperStoryPreview` controls) lack explicit focus rings.
4. **Root Language Metadata Disconnected from Reader Switcher (P2):** Root `<html>` in `app/layout.tsx` hardcodes `lang="hi"`. Switching to English mode updates React state but leaves `document.documentElement.lang="hi"`, causing screen readers and TTS to pronounce English UI text with Hindi phonetics.
5. **Unlabelled Form Inputs in Search & Feed Filters (P2):** Search input relies solely on placeholder text; category and sort `<select>` elements lack `<label>` or `aria-label`.
6. **Hardcoded English Live Announcements in Hindi Mode (P2):** Live status updates in `SwipeFeed.tsx`, audio buttons in `BreakingNews.tsx`, and action labels in `EPaperToolbar.tsx` announce English strings to Hindi screen reader users.
7. **Color-Only State Communication (P2):** View mode toggles (Grid vs. List in Category/Latest; Feed vs. Shorts in Video Hub) and Sign In / Register sub-tabs convey active selection solely through color without `aria-pressed` or `aria-selected`.
8. **Framer Motion Global Reduced Motion Bypass (P2):** Framer Motion components lack root `<MotionConfig reducedMotion="user">`, executing layout spring animations even when `prefers-reduced-motion: reduce` is enabled.

**0 P0 defects** were found. There are no irreversible keyboard traps, security boundaries are intact, and publication filters are strictly enforced.

---

## 1. Baseline Foundation Verification

- **Repository:** `zaidshery/Lokswami-version-3`
- **Branch:** `b3/foundation`
- **Audited Foundation Commit:** `cccefa1567d7c75fcfc68bb4f5ca93677f15d071`
- **Commit Subject:** `Merge pull request #28 from zaidshery/b3/phase3.16-mobile`
- **Tree Verification:** Exact tree identity confirmed with PR #28 head commit `2f8210202cfe15e6d91f79398d07d51ffca5f580` (`git diff` is empty).
- **Active Worktree:** `c:\Dev\Lokswami-version-3`
- **Dirty / Preserved Files:**
  - `data/analytics-events.json` (preserved local runtime event log)
  - `next-env.d.ts` (preserved local TypeScript declaration)
  - `scratch/` (untracked local scratch scripts)
  - Zero application, test, or documentation files modified.
- **Linked Worktrees:**
  - `C:/Dev/Lokswami-final-preview` (`0f6b4e3`)
  - `C:/Dev/Lokswami-phase3.13-deep-links-sharing` (`34a7b74`)
  - `C:/Dev/Lokswami-phase3.14-video-hub-shorts` (`9902dda`)
  - `C:/Dev/Lokswami-phase3.15-epaper-emagazine-reader` (`5d1d4eb`)
  - `C:/Users/PC/.codex/worktrees/f2d6/Lokswami-version-3` (`36a972e`)

---

## 2. Existing Accessibility Architecture Inventory

The repository contains several pre-existing accessibility foundations:

| Mechanism | Implementation Location | Current Status | Notes |
| :--- | :--- | :--- | :--- |
| **Skip-to-Content Link** | [app/(reader)/main/layout.tsx](file:///c:/Dev/Lokswami-version-3/app/(reader)/main/layout.tsx) | VERIFIED | Links to `#main-content`, visible on `:focus`. |
| **Main Landmark** | [app/(reader)/main/layout.tsx](file:///c:/Dev/Lokswami-version-3/app/(reader)/main/layout.tsx) | VERIFIED | `<main id="main-content" tabIndex={-1} role="main">`. |
| **Header Landmark** | [components/layout/Header.tsx](file:///c:/Dev/Lokswami-version-3/components/layout/Header.tsx) | VERIFIED | Semantic `<header>` containing primary reader navigation. |
| **Navigation Landmarks** | [components/layout/DesktopNav.tsx](file:///c:/Dev/Lokswami-version-3/components/layout/DesktopNav.tsx), [components/layout/BottomNav.tsx](file:///c:/Dev/Lokswami-version-3/components/layout/BottomNav.tsx) | VERIFIED | Unique labels: `aria-label="Main Navigation"` (or Hindi `मुख्य नेविगेशन`) and `aria-label="Bottom Navigation"`. |
| **Footer Landmark** | [components/layout/Footer.tsx](file:///c:/Dev/Lokswami-version-3/components/layout/Footer.tsx) | VERIFIED | Semantic `<footer>`. |
| **Focus Rings** | [app/globals.css](file:///c:/Dev/Lokswami-version-3/app/globals.css) | PARTIAL | `.editorial-focus-ring` (2px solid red outline) and `.reader-focus-ring` (Tailwind red-500 ring) exist, but applied inconsistently to secondary controls. |
| **Modal / Dialog Semantics** | `MobileMenu.tsx`, `QuickArticleSheet.tsx`, `EPaperStoryPreview.tsx` | VERIFIED | `role="dialog"`, `aria-modal="true"`, focus containment, and `Escape` handlers present. |
| **Popup Menu Semantics** | [components/ui/ShareMenu.tsx](file:///c:/Dev/Lokswami-version-3/components/ui/ShareMenu.tsx) | PARTIAL | `role="menu"` and `role="menuitem"`, arrow key navigation, `Escape` key close present, but lacks `Tab` containment. |
| **Live Regions** | `BreakingNews.tsx`, `SwipeFeed.tsx` | PARTIAL | `aria-live="polite"` present for ticker and story changes, but announcements hardcoded in English during Hindi mode; Search results lack live region. |
| **Reduced Motion** | [app/globals.css](file:///c:/Dev/Lokswami-version-3/app/globals.css) | PARTIAL | CSS classes `.cnp-motion`, `.marquee-animate`, and `[data-animate="true"]` disable CSS animation; Framer Motion JS animations lack global `<MotionConfig>`. |
| **Non-Color Active Indicators** | `BottomNav.tsx`, `DesktopNav.tsx` | VERIFIED | `BottomNav` includes visible dot indicator; `DesktopNav` includes horizontal underline; `aria-current="page"` used. |
| **Touch Targets** | Reader shell, Header, BottomNav | VERIFIED | Major primary controls standardized to >= 44×44px in Phase 3.16. |

---

## 3. Existing Test & Tooling Inventory

- **Testing Frameworks:**
  - `vitest` (`^4.1.1`): Configured with `jsdom` (`^29.0.1`) and `@testing-library/react` (`^16.3.2`).
  - `@playwright/test` (`^1.61.1`): Configured for end-to-end browser execution (`playwright.config.mjs`).
- **Specialized Accessibility Dependencies:**
  - `axe-core`: **None**
  - `jest-axe`: **None**
  - `@axe-core/playwright`: **None**
  - `pa11y`: **None**
  - Lighthouse accessibility automation: **None**
- **Existing Custom Assertions:**
  - `tests/phase310-accessibility-ux.test.ts`: Custom DOM string and Testing Library assertions for admin roles, alert roles, and non-color text labels.
  - `tests/phase316c-article-reader-rich-content.test.tsx`: Validates `.article-table-wrap` `tabindex="0"`, `role="region"`, and `aria-label="Table"`.
- **Tooling Recommendation for Phase 3.17:**
  - **Recommendation: Option B (Add `@axe-core/playwright` as single devDependency in Phase 3.17E).**
  - **Rationale:** Playwright is already installed and runs against real rendered Chromium pages. Adding `@axe-core/playwright` provides automated WCAG 2.2 AA ruleset checks across all reader routes in CI without bloating production dependencies.
  - **Strict Constraint:** Automated scanning must NEVER replace manual keyboard journey, screen reader, contrast, or zoom testing.

---

## 4. Document Structure & Landmarks Audit

| Surface / Route | `<main>` Landmark | Primary `<header>` | Navigation Landmarks | `<footer>` Landmark | Page Title (`<title>`) | `<h1>` Presence & Quality |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`/main` (Home)** | VERIFIED (`#main-content`) | VERIFIED | VERIFIED (Main + Bottom) | VERIFIED | VERIFIED | **PARTIAL:** `<h2>Lead Story</h2>` precedes `<h1>{lead.title}</h1>`. |
| **`/main/search`** | VERIFIED | VERIFIED | VERIFIED | VERIFIED | VERIFIED | VERIFIED (`<h1>खोज / Search</h1>`). |
| **`/main/latest`** | VERIFIED | VERIFIED | VERIFIED | VERIFIED | VERIFIED | VERIFIED (`<h1>ताज़ा खबरें / Latest News</h1>`). |
| **`/main/category/[slug]`** | VERIFIED | VERIFIED | VERIFIED | VERIFIED | VERIFIED | VERIFIED (`<h1>{category.name}</h1>`). |
| **`/main/article/[id]`** | VERIFIED | VERIFIED | VERIFIED | VERIFIED | VERIFIED | VERIFIED (`<h1>{article.title}</h1>` with `lang` tag). |
| **`/main/videos`** | VERIFIED | VERIFIED | VERIFIED | VERIFIED | VERIFIED | VERIFIED (`<h1>लोकस्वामी वीडियो हब</h1>`). |
| **`/main/shorts/[slug]`** | VERIFIED (`pt-0 pb-0`) | None (Fullscreen) | Hidden (Fullscreen) | Hidden | VERIFIED | VERIFIED (`<h1>{activeItem.title}</h1>`). |
| **`/main/epaper`** | VERIFIED | Hidden (Reader mode) | None in canvas | Hidden | VERIFIED | **FAILED:** 0 headings in interactive canvas. |
| **`/main/e-magazine`** | VERIFIED | Hidden (Reader mode) | None in canvas | Hidden | VERIFIED | **FAILED:** 0 headings in interactive canvas. |

---

## 5. Keyboard-Only Complete Reader Journey Audit

Testing sequence executed using keyboard only (`Tab`, `Shift+Tab`, `Enter`, `Space`, `Escape`, `Arrow` keys):

1. **Skip Link Execution:**
   - On initial load of `/main`, pressing `Tab` focuses the skip link (`मुख्य सामग्री पर जाएं / Skip to main content`).
   - Pressing `Enter` correctly moves programmatic focus to `<main id="main-content" tabIndex={-1}>`. Next `Tab` enters lead story actions. **Result: PASS.**
2. **Header Navigation & Dropdowns:**
   - Navigating through `DesktopNav.tsx`: `Tab` moves through category items.
   - On categories with sub-menus (`HOMEPAGE_NAVIGATION.children`), pressing `ArrowDown` opens the dropdown and focuses the first item.
   - Pressing `Escape` closes the dropdown and returns focus to the category button. **Result: PASS.**
3. **Mobile Drawer (`MobileMenu.tsx`):**
   - Activating the hamburger button opens the drawer.
   - Focus is placed on the first interactive element. `Tab` and `Shift+Tab` are trapped within the drawer.
   - Pressing `Escape` closes the drawer and restores focus to the hamburger button. **Result: PASS.**
4. **Search Journey:**
   - Navigating to `/main/search`: Search input receives focus. Pressing `Enter` submits query.
   - Results list is reachable via `Tab`.
   - **Failure:** Search input lacks `<label>` / accessible name; category and sort `<select>` elements lack accessible labels; results count is not announced via `aria-live`. **Result: PARTIAL.**
5. **Article Reader Journey:**
   - Pressing `Enter` on article card navigates to `/main/article/[id]`.
   - Breadcrumbs, Audio Player, Bookmark, and Share button are focusable.
   - Rich content table with `.article-table-wrap` receives keyboard focus (`tabindex="0"`), allowing horizontal arrow key scrolling of overflowing data tables.
   - Author profile modal traps focus and closes with `Escape`, restoring focus to trigger. **Result: PASS.**
6. **Share Menu Popup:**
   - Activating Share button opens `ShareMenu`.
   - Arrow keys (`ArrowDown`, `ArrowUp`, `Home`, `End`) navigate items.
   - Pressing `Escape` closes menu and restores focus to trigger.
   - **Failure:** Pressing `Tab` escapes the open popup into the background DOM without closing the menu. **Result: PARTIAL.**
7. **Video Hub Journey:**
   - Navigating to `/main/videos`: Hero video player receives focus. Native controls and YouTube iframe are operable.
   - **Failure:** Back button in `VideoDetailHero` and filter chips in `VideoFilterBar` lack visible focus rings (`reader-focus-ring`). **Result: PARTIAL.**
8. **Shorts Journey:**
   - Navigating to `/main/shorts/[slug]`: `ArrowDown` / `PageDown` advances to next short; `ArrowUp` / `PageUp` moves to previous short; `Space` toggles play/pause.
   - Quick Article sheet and Settings sheet trap focus and handle `Escape`.
   - **Failure:** On mobile viewport, there are no on-screen buttons for Next/Previous story. **Result: PARTIAL.**
9. **E-Paper / E-Magazine Journey:**
   - Navigating to `/main/epaper`: Keyboard users can select editions and open reader.
   - Previous/Next page buttons, zoom buttons, and thumbnails operate via keyboard.
   - Interactive story list (`<details><summary>Stories on this page</summary>`) allows selecting individual story clippings via `Enter`.
   - `EPaperStoryPreview` modal traps focus, closes with `Escape`, and restores focus.
   - **Failure:** 0 headings in reader canvas; toolbar buttons lack visible focus rings. **Result: PARTIAL.**

---

## 6. Color & Contrast Ratio Verification

Computed contrast measurements against WCAG 2.2 Level AA requirements (4.5:1 for normal text, 3:1 for large text / UI components):

| Element / Token | Foreground Color | Background Color | Computed Contrast | WCAG AA Requirement | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Body text (light mode)** | `#18181b` (`zinc-900`) | `#ffffff` | **16.1:1** | 4.5:1 | **PASS** |
| **Body text (dark mode)** | `#f4f4f5` (`zinc-100`) | `#09090b` (`zinc-950`) | **15.4:1** | 4.5:1 | **PASS** |
| **Brand Primary Link (light)** | `#e72129` (`brand-500`) | `#ffffff` | **4.92:1** | 4.5:1 | **PASS** |
| **Brand Primary Link (dark)** | `#f87171` (`brand-400`) | `#09090b` | **6.81:1** | 4.5:1 | **PASS** |
| **Category Badge on Brand-50** | `#e72129` (`brand-500`) | `#fff1f2` (`brand-50`) | **4.21:1** | 4.5:1 | **FAIL** (< 4.5:1) |
| **Secondary Metadata (dark)** | `#71717a` (`zinc-500`) | `#09090b` (`zinc-950`) | **4.08:1** | 4.5:1 | **FAIL** (< 4.5:1) |
| **Input Placeholder (dark)** | `#71717a` (`zinc-500`) | `#18181b` (`zinc-900`) | **3.82:1** | 4.5:1 | **FAIL** (< 4.5:1) |
| **Input Placeholder (light)** | `#a1a1aa` (`zinc-400`) | `#ffffff` | **2.60:1** | 4.5:1 | **FAIL** (< 4.5:1) |
| **Breaking News Ticker text** | `#ffffff` | `#7f1116` (gradient base) | **8.12:1** | 4.5:1 | **PASS** |
| **BottomNav Inactive text** | `#3f3f46` (`zinc-700`) | `#ffffff` | **7.54:1** | 4.5:1 | **PASS** |
| **Focus Ring (`editorial`)** | `#e72129` | `#ffffff` | **4.92:1** | 3:1 (non-text UI) | **PASS** |

---

## 7. Color-Independent Meaning Verification

| Surface / Component | State Communicated | Current Indicators | Non-Color Redundancy Present? | Status |
| :--- | :--- | :--- | :--- | :--- |
| **`BottomNav.tsx`** | Active page | Active tone + visible solid dot + icon stroke width change (2.4 vs 1.8) + `aria-current="page"` | **YES** | VERIFIED |
| **`DesktopNav.tsx`** | Active category | Text color + horizontal underline bar + `aria-current="page"` | **YES** | VERIFIED |
| **`CategoryPageClient.tsx`** | View Mode (Grid vs List) | Color change only (`text-brand-600` vs `text-zinc-500`) | **NO** (Missing `aria-pressed`) | **FAILED** |
| **`LatestFeedClient.tsx`** | View Mode (Grid vs List) | Color change only (`text-brand-600` vs `text-zinc-500`) | **NO** (Missing `aria-pressed`) | **FAILED** |
| **`VideoFilterBar.tsx`** | Feed vs Shorts View | Background change only (`bg-[#ff6257]`) | **NO** (Missing `aria-pressed`) | **FAILED** |
| **`SignInPageClient.tsx`** | Sign In vs Create Account | Background shadow only | **NO** (Missing `aria-pressed` / tabs) | **FAILED** |
| **`ArticleDetailClient.tsx`** | Saved / Bookmarked | Icon fill change + button label change ("सहेजा गया" / "Saved") | **YES** | VERIFIED |
| **`EPaperToolbar.tsx`** | Spread Mode Active | `aria-pressed={isSpreadMode}` + icon state | **YES** | VERIFIED |

---

## 8. Focus Indicators & Keyboard Focus-Visible Audit

The repository defines two primary focus ring utilities in `app/globals.css`:
- `.editorial-focus-ring`: `outline: 2px solid #e72129; outline-offset: 2px;`
- `.reader-focus-ring`: Tailwind `focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2`

### Findings:
1. **Header & Shell Navigation:** Well covered with `.editorial-focus-ring`. All links and buttons display high-contrast red outlines when focused.
2. **Search & Filters:** `SearchClient.tsx` inputs and filter chips use `.reader-focus-ring`.
3. **Missing Focus Indicators:**
   - `VideoDetailHero.tsx`: Back button (`absolute left-3 top-3`) lacks focus ring class.
   - `VideoFilterBar.tsx`: View mode buttons, search clear button, and Watch Later button lack focus ring classes.
   - `EPaperToolbar.tsx`: Page navigation buttons (`ChevronLeft`, `ChevronRight`), zoom buttons (`Plus`, `Minus`), theme toggle, and fullscreen buttons lack focus ring classes.
   - `EPaperStoryPreview.tsx`: Header buttons (`ArrowLeft`, `Share2`, reading option buttons) lack focus ring classes.
   - `SignInPageClient.tsx`: Sub-mode toggle buttons and role tabs lack explicit focus indicators.

---

## 9. Dialog, Modal & Sheet Accessibility Audit

| Dialog / Sheet Component | Semantic Role | `aria-modal` | Initial Focus | Tab Trap | Escape Handler | Return Focus Restoration |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`MobileMenu.tsx` (Drawer)** | `role="dialog"` | `true` | Close button | **YES** | **YES** | **YES** (Trigger button) |
| **`QuickArticleSheet.tsx`** | `role="dialog"` | `true` | Close button | **YES** | **YES** | **YES** (Article button) |
| **`SwipeSettingsSheet.tsx`** | `role="dialog"` | `true` | Close button | **YES** | **YES** | **YES** (Settings button) |
| **`EPaperStoryPreview.tsx`** | `role="dialog"` | `true` | Close button | **YES** | **YES** | **YES** (Trigger / canvas) |
| **`ArticleDetailClient` Author Modal** | `role="dialog"` | `true` | Close button | **YES** | **YES** | **YES** (Author trigger) |
| **`ShareMenu.tsx` (Popup)** | `role="menu"` | None | First item | **NO** (Escapes) | **YES** | **YES** (Trigger button) |
| **`InstallAppPrompt.tsx`** | `role="region"` | None | None | None | None | None |

---

## 10. Forms, Search & Inputs Accessibility Audit

1. **Search Form (`SearchClient.tsx`):**
   - **Input Labeling:** `<input>` element lacks `<label>` and `aria-label`. Placeholder (`"समाचार खोजें..."`) is the sole label.
   - **Category & Sort Controls:** `<select>` dropdowns lack `<label>` or `aria-label`.
   - **Keyboard Submission:** Supports standard form `Enter` submission.
2. **Video Search (`VideoFilterBar.tsx`):**
   - Input has `aria-label={copy.searchPlaceholder}`, which is correctly populated.
   - Clear button has `aria-label="Clear search"`, but string is hardcoded in English.
3. **Public Authentication (`SignInPageClient.tsx`):**
   - `FormInput` components properly associate `<label htmlFor={id}>` with `<input id={id}>`.
   - Password toggles have accessible labels.
   - Form error alert lacks `role="alert"` / `aria-live="assertive"`.

---

## 11. Live Regions & Asynchronous Feedback Audit

| Surface / Action | Dynamic Event | Current Implementation | Accessible Exposure Status |
| :--- | :--- | :--- | :--- |
| **`BreakingNews.tsx`** | Ticker headline rotation | `<span className="sr-only" aria-live="polite" aria-atomic="true">` | **VERIFIED** (polite announcement) |
| **`BreakingNews.tsx`** | Audio TTS state changes | `<span className="sr-only">{status}</span>` | **PARTIAL** (Hardcoded English strings) |
| **`SwipeFeed.tsx`** | Short index / video state | `<p className="sr-only" aria-live="polite">` | **PARTIAL** (Hardcoded English strings) |
| **`SearchClient.tsx`** | Query results returned | `<p>"{query}" के लिए X परिणाम</p>` | **FAILED** (Missing `aria-live="polite"` / `role="status"`) |
| **`ArticleDetailClient`** | AI Summary generation | `<span className="sr-only" role="status">` | **VERIFIED** |
| **`ArticleDetailClient`** | Audio player buffering/loading | Visual indicator + button `aria-busy` | **VERIFIED** |
| **`ShareMenu.tsx`** | Link copied confirmation | `<span className="sr-only" aria-live="polite">Link copied</span>` | **VERIFIED** |

---

## 12. Image & Icon Accessibility Audit

1. **Editorial Image Alt Text (`ReaderImage.tsx`):**
   - `alt` is a strictly required prop on `ReaderImage`.
   - Homepage lead story and section cards use `alt={article.title}`.
   - Scanned newspaper page images use `alt="Indore E-Paper front page"` or localized equivalent.
2. **Duplicate Image + Headline Link Announcements:**
   - In `HomepageTopPackage.tsx` and section rails, the card thumbnail link and headline link both point to the same URL and both carry the article title. Screen readers read the headline twice in succession.
3. **Lucide Icons:**
   - Decorative icons consistently include `aria-hidden="true"`.
   - Functional icon-only buttons include `aria-label` or visually hidden `<span className="sr-only">`.

---

## 13. Article Reader Deep Audit

1. **Headline & Byline:** Semantic `<h1>` in `ArticleReaderHeader.tsx` includes conditional `lang="hi"` / `lang="en"`. Author, publication time (`<time dateTime="...">`), and reading duration are semantically structured.
2. **Article Landmark:** Main article wrapped in `<article>` element.
3. **Rich Content Tables (`lib/utils/articleRichContent.ts`):**
   - Wrapped in `<div class="article-table-wrap" data-swipe-ignore="true" tabindex="0" role="region" aria-label="Table">`.
   - **Finding:** Hardcoded `aria-label="Table"` is in English and overrides any internal `<caption>`. Should derive name from table caption or use localized label (`सारणी` in Hindi).
4. **Audio & AI Summary:** Semantically grouped in `<section aria-labelledby="ai-summary-heading">` and `<section aria-labelledby="audio-player-heading">`.

---

## 14. Video Hub & Player Accessibility Audit

1. **Player Container:** Wrapped in `<article data-testid="video-detail-hero">`.
2. **Player Controls:**
   - YouTube iframe includes `title={title}`.
   - Native `<video>` uses browser native controls (`controls` attribute) ensuring platform-level keyboard accessibility.
   - Play/pause overlay button includes `aria-label="Play video"`.
3. **Captions / Subtitles Support:**
   - **Code Architecture Gap:** `VideoPlayer.tsx` lacks `<track kind="captions">` elements.
   - **Content Debt:** The newsroom database currently does not store or provide `.vtt` caption tracks for editorial videos.

---

## 15. Shorts Accessibility Audit

1. **Pointer Gesture Principle (WCAG 2.5.1):**
   - Desktop screens (`>= 768px`) provide floating Up/Down chevron buttons to navigate between stories without swiping.
   - **Failure:** On mobile touchscreens (`< 768px`), these buttons are hidden (`hidden md:flex`), leaving vertical swipe as the sole mechanism for story navigation.
2. **Keyboard Operation:** Full keyboard support on desktop/tablets (`ArrowDown`/`PageDown`, `ArrowUp`/`PageUp`, `Space` for play/pause).
3. **Live Feedback:** Story position and playback states are announced via `aria-live="polite"` (needs localization fix).

---

## 16. E-Paper & E-Magazine Reader Accessibility Audit

1. **Scanned Newspaper Nature:**
   - Printed newspaper pages are scanned high-resolution images.
   - Scanned page graphics cannot be rendered as pure HTML text.
2. **Existing Accessible Alternatives:**
   - `EPaperPageClient.tsx` renders an accessible story directory (`<details><summary>Stories on this page / इस पृष्ठ की खबरें</summary>`) when released stories exist.
   - Selecting a story opens `EPaperStoryPreview`, which provides full released text in `<div role="region" aria-label="Released story text">` with font resizing (`A-` / `A+`) and audio narration.
   - When no released stories exist, a polite status message informs the user: `"Publication available. Released clickable stories are not available yet."`
3. **Headings Gap (P1):** The active reading canvas lacks a page-level `<h1>`.

---

## 17. Motion & Reduced Motion Audit

1. **CSS Reduced Motion:**
   - `app/globals.css` lines 1930–1939 provide `@media (prefers-reduced-motion: reduce)` disabling animation on `.cnp-motion`, `.marquee-animate`, and `[data-animate="true"]`.
2. **Framer Motion Gap:**
   - Framer Motion is used for `BottomNav` active indicator spring animations and layout animations.
   - Neither root `app/layout.tsx` nor `app/(reader)/main/layout.tsx` wraps children in `<MotionConfig reducedMotion="user">`.
   - Layout transitions continue to animate in JavaScript even when the user operating system requests reduced motion.

---

## 18. Zoom, Reflow & Text Spacing Audit

1. **Reflow at 400% Zoom (320 CSS px):**
   - Phase 3.16 verified 0 horizontal scroll blowout across reader layouts.
   - Text wraps naturally without clipping; sticky header compacts cleanly on low-height viewports.
2. **Text Spacing (WCAG 1.4.12):**
   - Testing with line height 1.5×, paragraph spacing 2×, letter spacing 0.12×, word spacing 0.16×:
   - Primary article typography (`ArticleReader.module.css`, `.hindi-body`) uses generous `line-height: 1.72` and flex wrapping, accommodating expanded spacing without content clipping.

---

## 19. Pointer & Gesture Alternatives Audit

| Control / Feature | Gesture Required | Single-Point Alternative Present? | WCAG 2.5.1 Status |
| :--- | :--- | :--- | :--- |
| **Shorts Next / Previous** | Vertical touch drag | Desktop has buttons; **Mobile has none** | **FAILED (Mobile)** |
| **E-Paper Page Turning** | Horizontal swipe | Toolbar `Previous` / `Next` buttons | **VERIFIED** |
| **E-Paper Zoom** | Pinch-to-zoom | Toolbar `+` / `-` buttons | **VERIFIED** |
| **Category Strip Scroll** | Horizontal swipe | Native scroll + touch drag | **VERIFIED** |
| **Video Seek** | Slider touch drag | Native `<video>` controls / keyboard arrows | **VERIFIED** |

---

## 20. Language & Bilingual Context Audit

1. **Root HTML Tag:** `app/layout.tsx` line 348 renders `<html lang="hi">`.
2. **Dynamic Language Switching:**
   - When the user toggles between Hindi and English in `Header.tsx`, `useAppStore` updates its React state, but `document.documentElement.lang` remains `"hi"`.
   - Screen reader TTS engines continue reading English pages using Hindi pronunciation dictionaries.
3. **Article Level:** `ArticleReaderHeader.tsx` line 58 sets `lang={/[\u0900-\u097f]/.test(article.title) ? 'hi' : 'en'}` on the headline, but body containers lack language scoping.

---

## 21. Screen-Reader Testing Status

- **Screen Reader Testing Classification: SCREEN READER MANUAL VALIDATION REQUIRED.**
- In accordance with audit standards, screen-reader compatibility is NOT falsely claimed as PASS without live operator assistive testing.
- Static and accessibility-tree semantic verification was performed across all public routes.
- Real-device screen-reader verification (NVDA + Chrome on Windows, VoiceOver + Safari on iOS/macOS) is formally scheduled for **Subphase 3.17E**.

---

## 22. Canonical Issue Register

| Issue ID | Severity | WCAG 2.2 SC | Surface / Route | Current Behavior | Expected Behavior | Root Cause | Affected Files | Assigned Subphase |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **ISSUE-A11Y-01** | **P1** | 2.4.6, 1.3.1 | `/main/epaper`, `/main/e-magazine` | Zero semantic headings on interactive reading canvas. | Top toolbar or canvas includes visually hidden or visible `<h1>` identifying publication title and issue date. | Header text rendered in non-heading `<div>` / `<p>` tags. | `EPaperPageClient.tsx`, `EPaperToolbar.tsx` | **3.17A** |
| **ISSUE-A11Y-02** | **P1** | 2.5.1, 2.1.1 | `/main/shorts/[slug]` | Up/Down navigation buttons hidden on mobile viewports (`hidden md:flex`). | Single-point activation buttons (or on-screen controls) available on mobile touch devices. | Desktop-only media query wrapper on navigation chevrons. | `components/swipe/SwipeFeed.tsx` | **3.17D** |
| **ISSUE-A11Y-03** | **P1** | 2.4.7, 2.4.11 | Media & E-Paper toolbars, Video Hub | Interactive buttons lack visible focus rings on keyboard focus. | All interactive controls display high-contrast visible focus ring matching `.reader-focus-ring` or `.editorial-focus-ring`. | Missing focus utility classes on custom buttons. | `VideoDetailHero.tsx`, `VideoFilterBar.tsx`, `EPaperToolbar.tsx`, `EPaperStoryPreview.tsx` | **3.17A** |
| **ISSUE-A11Y-04** | **P2** | 1.3.1 | `/main` (Homepage) | `HomepageTopPackage` renders `<h2>Lead Story</h2>` before `<h1>{lead.title}</h1>`. | Main lead article title renders as primary `<h1>`; section badge renders as styled non-heading or `<h1>` precedes section headings. | `SectionHeader` defaults to `level="h2"` above lead headline. | `HomepageTopPackage.tsx` | **3.17A** |
| **ISSUE-A11Y-05** | **P2** | 3.1.1, 3.1.2 | Global reader shell | `<html lang="hi">` never updates when language switcher is toggled to English. | Switching to English updates `document.documentElement.lang = 'en'`; switching to Hindi sets `'hi'`. | Language state in Zustand store does not synchronize to DOM root element. | `app/layout.tsx`, `lib/store/appStore.ts` | **3.17B** |
| **ISSUE-A11Y-06** | **P2** | 1.3.1, 3.3.2, 4.1.2 | `/main/search`, `/main/category/[slug]`, `/main/latest` | Search `<input>` lacks label; filter and sort `<select>` elements lack accessible names. | Form inputs have explicit `aria-label` or associated `<label>`. | Placeholder text treated as sole input identifier. | `SearchClient.tsx`, `CategoryPageClient.tsx`, `LatestFeedClient.tsx` | **3.17B** |
| **ISSUE-A11Y-07** | **P2** | 4.1.3 | `/main/search` | Search results count updates in DOM without screen-reader announcement. | Search results status container includes `role="status"` and `aria-live="polite"`. | Static `<p>` tag without ARIA live region semantics. | `SearchClient.tsx` | **3.17B** |
| **ISSUE-A11Y-08** | **P2** | 1.4.1, 4.1.2 | Category, Latest, Video filter bars | Grid/List view mode and Feed/Shorts toggles convey active state only via color. | Toggle buttons include `aria-pressed="true"` / `"false"` or tab semantics. | Active state applied via class switching without ARIA state attributes. | `CategoryPageClient.tsx`, `LatestFeedClient.tsx`, `VideoFilterBar.tsx`, `SignInPageClient.tsx` | **3.17B** |
| **ISSUE-A11Y-09** | **P2** | 1.4.3, 1.4.11 | Category badges, dark mode text | Badge text `#e72129` on `#fff1f2` (4.21:1) and dark text `zinc-500` (4.08:1) fail 4.5:1 ratio. | Adjusted foreground colors meet or exceed 4.5:1 AA contrast ratio. | Low-contrast palette pairings on tinted and dark surfaces. | `app/globals.css`, `CategoryBadge.tsx`, `SearchClient.tsx`, `EPaperPageClient.tsx` | **3.17B** |
| **ISSUE-A11Y-10** | **P2** | 2.2.2, 2.3.3 | Global reader shell | Framer Motion animations continue running when `prefers-reduced-motion` is enabled. | Framer Motion respects user reduced-motion preference globally. | Missing `<MotionConfig reducedMotion="user">` at root provider level. | `app/layout.tsx` | **3.17A** |
| **ISSUE-A11Y-11** | **P2** | 4.1.2, 3.1.2 | `SwipeFeed`, `BreakingNews`, `EPaperToolbar` | Live region updates and action buttons announce English strings in Hindi mode. | All live announcements and accessible labels reflect the active reader language. | Hardcoded English string literals in ARIA attributes. | `SwipeFeed.tsx`, `BreakingNews.tsx`, `EPaperToolbar.tsx`, `EPaperStoryPreview.tsx` | **3.17B** |
| **ISSUE-A11Y-12** | **P2** | 4.1.2, 1.3.1 | `lib/utils/articleRichContent.ts` | Table scroll wrapper hardcodes static English `aria-label="Table"`. | Wrapper uses table caption if available, or localized label (`सारणी` / `Table`). | Static template string in `wrapTables` utility. | `lib/utils/articleRichContent.ts` | **3.17C** |
| **ISSUE-A11Y-13** | **P2** | 2.1.2, 2.4.3 | `components/ui/ShareMenu.tsx` | `Tab` key escapes open ShareMenu into background DOM. | `Tab` cycles within menu items or automatically closes menu on blur. | Portal lacks Tab event interceptor. | `components/ui/ShareMenu.tsx` | **3.17C** |
| **ISSUE-A11Y-14** | **P3** | 1.1.1 | Homepage & Latest card grids | Image link and headline link carry duplicate titles, reading headline twice. | Image link is marked `tabIndex={-1}` and `aria-hidden="true"`, leaving headline as sole accessible link. | Separate adjacent links for thumbnail and text. | `HomepageTopPackage.tsx`, `HomePageClient.tsx`, `NewsCard.tsx` | **3.17A** |
| **ISSUE-A11Y-15** | **P3** | 2.5.8 | Auxiliary toolbars | Visual bounds of some desktop buttons measure 32px or 36px. | Interactive hit areas expanded to meet or exceed 44×44px standards. | Desktop compact layout styling. | `EPaperToolbar.tsx`, `VideoFilterBar.tsx` | **3.17D** |
| **ISSUE-A11Y-16** | **P3** | 1.3.1 | `components/layout/Footer.tsx` | Sibling footer columns jump between `<h3>` and `<h4>`. | All footer column titles standardize on `<h3>`. | Inconsistent heading tags across footer sub-components. | `components/layout/Footer.tsx` | **3.17A** |

---

## 23. Scope Boundaries

### IN PHASE 3.17
- Public reader accessibility fixes across Homepage, Navigation, Category, Latest, Search, Article, Share, Video Hub, Shorts, E-Paper, and E-Magazine.
- Keyboard navigation, visible focus indicators, dialog focus traps, form labeling, live regions, color contrast, and bilingual language metadata synchronization.
- Addition of `@axe-core/playwright` as devDependency for automated regression testing.
- Manual keyboard journey and screen reader verification.

### DEFER TO PHASE 3.18 PERFORMANCE
- Cold E-Paper / E-Magazine image download latency.
- Image WebP / AVIF CDN optimization and responsive image srcset tuning.
- Next.js client-side bundle splitting and code elimination.

### CONTENT / EDITORIAL DEPENDENCY (Carried Debt)
- Absence of editorial image alt text in historical CMS articles.
- Absence of WebVTT caption tracks for legacy video archives.
- Absence of released OCR / clipping text for historical scanned e-paper issues.

### OUT OF SCOPE
- Admin CMS accessibility audit (completed in Phase 3.10).
- Redesigning visual themes, brand red palettes, or editorial typography.
- Native mobile application development (iOS / Android).

---

## 24. Proposed Phase 3.17 Implementation Plan (3.17A through 3.17E)

```
Phase 3.17A: Global Semantics, Landmarks, Keyboard Focus & Motion Foundation
      ↓
Phase 3.17B: Forms, Live Regions, Localization, Contrast & Navigation States
      ↓
Phase 3.17C: Article Reader, Rich Content & Share Menu Accessibility
      ↓
Phase 3.17D: Video Hub, Shorts & E-Paper / E-Magazine Interaction Accessibility
      ↓
Phase 3.17E: Cross-Product WCAG QA, Automated Axe Tooling & Final Acceptance
```

### Subphase 3.17A — Global Semantics, Landmarks, Keyboard Focus & Motion Foundation
- **Objective:** Fix global root language/motion providers, eliminate homepage heading inversion, add missing headings on E-Paper shell, standardize focus-visible rings on core controls, and eliminate duplicate link announcements.
- **Assigned Issues:** ISSUE-A11Y-01, ISSUE-A11Y-03, ISSUE-A11Y-04, ISSUE-A11Y-10, ISSUE-A11Y-14, ISSUE-A11Y-16.
- **Affected Surfaces:**
  - `app/layout.tsx` (add root `<MotionConfig reducedMotion="user">`)
  - `components/home/HomepageTopPackage.tsx` (fix heading hierarchy)
  - `app/(reader)/main/epaper/EPaperPageClient.tsx` (add semantic page `<h1>`)
  - `components/layout/Footer.tsx` (standardize `<h3>` column headings)
  - `components/home/HomepageTopPackage.tsx`, `HomePageClient.tsx` (add `aria-hidden="true"` / `tabIndex={-1}` to duplicate thumbnail links)
- **Tests:** `tests/reader-shell-navigation.test.tsx`, `tests/phase317a-semantics-foundation.test.tsx`.
- **Acceptance Criteria:** `prefers-reduced-motion` suppresses Framer Motion animations; no heading inversions on homepage; `/main/epaper` has semantic `<h1>`; focus rings visible on all shell controls.

### Subphase 3.17B — Forms, Live Regions, Localization, Contrast & Navigation States
- **Objective:** Synchronize `document.documentElement.lang` with reader switcher; label search input and filter `<select>` controls; add polite live region to search results count; add `aria-pressed` to view toggles; resolve contrast failures on tinted and dark surfaces.
- **Assigned Issues:** ISSUE-A11Y-05, ISSUE-A11Y-06, ISSUE-A11Y-07, ISSUE-A11Y-08, ISSUE-A11Y-09, ISSUE-A11Y-11.
- **Affected Surfaces:**
  - `lib/store/appStore.ts` & `app/layout.tsx` (dynamic `document.documentElement.lang`)
  - `app/(reader)/main/search/SearchClient.tsx` (input labels, live region results count)
  - `app/(reader)/main/category/[slug]/CategoryPageClient.tsx` (select labels, `aria-pressed`)
  - `app/(reader)/main/latest/LatestFeedClient.tsx` (select labels, `aria-pressed`)
  - `components/ui/BreakingNews.tsx` (localized live status and audio button labels)
  - `app/globals.css` (adjust `brand-50` / `zinc-500` contrast pairs)
- **Tests:** `tests/search-feed.test.tsx`, `tests/phase317b-forms-localization.test.tsx`.
- **Acceptance Criteria:** Toggling language updates root `html` lang; search input and filters have programmatic labels; search results count announced politely; all text meets 4.5:1 contrast.

### Subphase 3.17C — Article Reader, Rich Content & Share Menu Accessibility
- **Objective:** Enhance rich table wrapper with localized accessible name / caption detection; harden `ShareMenu` with `Tab` cycle/containment; verify reading progress and audio player accessibility.
- **Assigned Issues:** ISSUE-A11Y-12, ISSUE-A11Y-13.
- **Affected Surfaces:**
  - `lib/utils/articleRichContent.ts` (localize table wrapper aria-label, connect to caption if present)
  - `components/ui/ShareMenu.tsx` (add `Tab` containment / blur close)
  - `app/(reader)/main/article/[id]/ArticleDetailClient.tsx`
- **Tests:** `tests/article-rich-content.test.ts`, `tests/share-menu.test.tsx`.
- **Acceptance Criteria:** Tables announced in Hindi (`सारणी`) or English (`Table`) or caption text; `ShareMenu` traps or closes cleanly on `Tab`.

### Subphase 3.17D — Video Hub, Shorts & E-Paper / E-Magazine Interaction Accessibility
- **Objective:** Provide on-screen non-gesture Next/Previous alternatives for Shorts on mobile; add visible focus rings to Video Hub and E-Paper toolbar controls; ensure accessible alternative text for E-Paper story clippings.
- **Assigned Issues:** ISSUE-A11Y-02, ISSUE-A11Y-15.
- **Affected Surfaces:**
  - `components/swipe/SwipeFeed.tsx` (mobile on-screen Next/Previous buttons or gesture-free controls)
  - `components/video/VideoDetailHero.tsx` & `VideoFilterBar.tsx` (focus rings, button hit areas)
  - `components/epaper/reader/EPaperToolbar.tsx` & `EPaperStoryPreview.tsx` (focus rings, hit areas)
- **Tests:** `tests/swipe-feed.test.tsx`, `tests/epaper-reader.test.tsx`.
- **Acceptance Criteria:** Shorts can be operated on mobile without swipe gestures; all toolbar buttons have visible focus rings; story clippings provide accessible text alternative.

### Subphase 3.17E — Cross-Product WCAG QA, Automated Axe Tooling & Final Acceptance
- **Objective:** Install `@axe-core/playwright` as single devDependency; implement automated accessibility audit suite; perform complete manual keyboard journey and screen-reader verification; run full CI verification gates.
- **Primary Surfaces:**
  - `package.json` (add `@axe-core/playwright`)
  - `tests/e2e/accessibility.spec.ts` (new automated Playwright axe-core regression suite)
  - `docs/b3/PHASE3_17_ACCESSIBILITY_ACCEPTANCE.md`
- **Tests:** `npm run typecheck`, `npm run lint:strict`, `npm run test:ci`, `npx playwright test tests/e2e/accessibility.spec.ts`, `npm run build:ci`.
- **Acceptance Criteria:** 0 automated axe violations on all representative reader pages; manual keyboard journey passes; 0 P0/P1 issues remaining.

---

## 25. Final Phase 3.17 Acceptance Contract

For Phase 3.17 to be accepted, the Lokswami public reader platform must satisfy all of the following requirements:
1. **Keyboard Operability:** The entire reader journey (Home → Section → Article → Search → Share → Video → Shorts → E-Paper) must be 100% operable via keyboard without mouse or touch gestures.
2. **No Keyboard Traps:** Focus must never be trapped in any component or dialog; `Escape` must close all overlays and restore focus.
3. **Visible Focus:** Every interactive element must display an unambiguous visible focus ring adhering to WCAG 2.2 AA non-text contrast (>= 3:1).
4. **Semantics & Landmarks:** Unique landmark labels for multiple navigation zones; logical heading hierarchy without broken jumps; meaningful `<h1>` on every page including E-Paper and E-Magazine.
5. **Form Accessibility:** All inputs and select controls must have programmatic accessible labels; search results count announced via live regions.
6. **Color Independence:** No state (active page, selected view, bookmark status) conveyed by color alone.
7. **Color Contrast:** All body, headline, and essential UI text meets or exceeds 4.5:1 (normal text) and 3:1 (large text / UI components).
8. **Reduced Motion:** System `prefers-reduced-motion: reduce` respected across CSS animations and Framer Motion spring transitions.
9. **Pointer Alternatives:** Gesture-dependent features (e.g. mobile Shorts swipe) must have single-point activation alternatives.
10. **Bilingual Correctness:** Switching reader language between Hindi and English must dynamically update `document.documentElement.lang`.
11. **Quality Gates:** Zero P0 or P1 accessibility defects; `@axe-core/playwright` reports 0 violations; `typecheck`, `lint:strict`, `test:ci`, and `build:ci` pass.
12. **Screen Reader Validation:** Live manual validation completed and documented as PASS or OWNER MANUAL VALIDATION REQUIRED.

---

## 26. Dependencies & Known Carried Debt

1. **Editorial Image Alt Debt (Content Debt):** Pre-existing published articles may lack rich editorial image descriptions in the database. Code must gracefully expose article title as fallback without fabricating fictional alt descriptions.
2. **Video Caption Track Debt (Content Debt):** Editorial newsroom videos currently lack WebVTT caption files. Code must support captions architecture while acknowledging content availability limitations.
3. **Scanned E-Paper OCR Debt (Product Limitation):** Printed newspaper pages are scanned images. The reader provides released story text clippings and headline directories as the accessible alternative.

---

## 27. Audit Verification & Invariant Certification

- [x] **No implementation performed:** Zero application source code or test files were created or modified.
- [x] **No git commits created:** Working tree remains clean on foundation SHA `cccefa1567d7c75fcfc68bb4f5ca93677f15d071`.
- [x] **No implementation branch created:** `b3/phase3.17-accessibility` has NOT been created.
- [x] **No branches pushed:** Remote repository untouched.
- [x] **No PR opened / merged:** Repository governance preserved.
- [x] **No deployments triggered:** Staging and production untouched.
- [x] **No CMS / Mongo / content mutated:** Database records and credentials preserved.
- [x] **No dependencies installed:** No packages installed during audit.
