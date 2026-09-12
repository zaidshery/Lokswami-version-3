# LokSwami B3 — Phase 3.1: UX / Product Experience Audit

**Authoritative Program**: LokSwami B3 — Reader / Product Experience 2.0  
**Phase**: 3.1 (UX / Product Experience Audit)  
**Baseline SHA**: `f7eaa65d565693afd3aea0a85c8b7e0093632423`  
**Branch**: `b3/phase3-ux-audit-design-system`  
**Date**: September 2026  
**Auditor Roles**: Principal Product Engineer, Frontend Architect, Design-System Architect, UX Auditor, Accessibility Reviewer, Hindi Digital News UX Specialist  

---

## 1. Executive Summary

Phase 2 established a correct, verified, and frozen backend engine for LokSwami B3:
- Domain boundaries are strictly partitioned (Content, Video, E-Paper, Reader Identity, Audience, Distribution, Analytics, Media, Audio/TTS).
- Human editorial authority is enforced (zero autonomous AI publishing).
- Credential authority fails closed on MongoDB.
- Four-role newsroom governance and release snapshot immutability are preserved.

However, an evidence-based audit of the current reader-facing frontend reveals that the reader experience has not yet reached the level of a premier, trustworthy, and modern Indian digital news publication. The current frontend suffers from:
1. **Architectural Route Shims**: Reader traffic is split between top-level vanity URL shims and canonical `/main/...` routes.
2. **Brittle Header Stacking & Visual Jumps**: Fixed `BreakingNews` (top-0) and `Header` (top-11/12) use hardcoded numeric offsets (`pt-[8rem] sm:pt-[8.5rem] md:pt-[9rem]`). When breaking news items unmount or wrap to multiple lines, the header either floats with an empty gap or collides with breaking news text.
3. **Gesture Collisions on Mobile**: `MobileSwipeTabs.tsx` wraps the entire reader body in a horizontal swipe detector. Horizontal thumb movements during normal reading inadvertently navigate between Home, E-Paper, E-Magazine, Video, Quick, and Profile tabs. On `/main/ftaftaf` (shorts swipe feed), horizontal swipe conflicts directly with vertical feed navigation.
4. **Color Aliasing Hack**: `tailwind.config.js` aliases the entire Tailwind `orange` palette to LokSwami Red (`#e72129`). As a result, codebases intermix `text-orange-600`, `bg-orange-50`, `border-orange-300`, and `red-600` for identical or contradictory brand semantics.
5. **Clashing Dark Mode Surfaces**: The app defines multiple competing dark mode backgrounds (`#242024` in base CSS `html.dark`, `#020617` / `slate-950` in `MainLayout`, `#050608` / `#080c11` in `.newsroom-home`, and `#18181b` / `#0b0b0f` in utility classes), creating visual banding and poor contrast.
6. **Card & Header Duplication**: `HomePageClient.tsx` declares four private card components (`HeadlineImageCard`, `LiveUpdateStory`, `RankedStoryList`, `FeaturedStoryBand`) and a private section header instead of consuming unified design system primitives.
7. **Hindi Devanagari Typography Flaws**: Devanagari text suffers from clipping on ascenders/descenders (matras like ो, ौ, े, ै, ं, ु, ू) due to tight English line-heights (`leading-none`, `leading-tight`) and micro font sizes (down to 8.5px in bottom nav).
8. **Excessive Client Rendering**: The root reader layout `app/(reader)/main/layout.tsx` is marked `'use client'`, hydrating multiple orchestrators (`DailyEpaperAlert`, `PopupOrchestrator`, `SigninRoleBanner`, `MobileSwipeTabs`) unconditionally on every reader surface.

---

## 2. Audit Methodology & Evidence Limits

To preserve strict engineering and reporting integrity, this audit establishes explicit evidence categories for all observations:

### Evidence Categories:
- **A. Source-Code Verified Findings**: Direct inspection of JSX markup, CSS stylesheets, Tailwind configuration, component trees, and event listeners (e.g. fixed stacking z-indices, `MobileSwipeTabs` global touch listeners, color aliasing definitions, line-height classes).
- **B. Automated-Test Verified Findings**: Deterministic unit and integration tests executing against design-system primitives, routing shims, security policies, and newsroom governance contracts (e.g. `tests/design-system-primitives.test.tsx`, four-role governance tests, security tests).
- **C. Build/CI Verified Findings**: TypeScript typecheck (`npm run typecheck`), strict lint rules (`npm run lint:strict`), dependency floor security checks, and Next.js production builds (`npm run build:ci`) confirming bundle generation, static page counts, and syntax correctness.
- **D. Rendered / Manual Browser Findings**: Observations from active, rendered browser execution across physical device viewports. In this foundational architecture and design-system slice, a full live physical-device matrix was **NOT** executed.

### Evidence Limit Notice for Responsive Viewport Matrix:
The viewport observations across 360px, 375px, 390px, 412px, 430px, 768px, 1024px, and 1440px+ in Section 10 are **code-derived responsive risks / expected behavior pending rendered QA**. They are inferred directly from breakpoint declarations (`sm:`, `md:`, `lg:`, `xl:`, `2xl:`), fixed container constraints (`max-w-[86rem]`, `max-w-4xl`), and touch handler boundaries in source code, rather than live multi-device visual screenshots. Full cross-device visual rendering verification is scheduled for subsequent reader UI migration slices (Phase 3.3+).

---

## 3. Current Reader Architecture

### 3.1 Shell Hierarchy
```
app/layout.tsx (Root HTML Shell, Noto Sans + Noto Sans Devanagari Font Loading, Dark Theme Script)
  └── AuthSessionProvider
        └── ThemeProvider
              └── ToastProvider
                    └── AuthSync, FullscreenFix, SitePageTracker
                          └── app/(reader)/main/layout.tsx ('use client' Reader Shell)
                                ├── BreakingNews (Fixed top-0, z-[60], h-11/h-12)
                                ├── Header (Fixed top-11/md:top-12, z-50, h-12/sm:h-[3.45rem])
                                ├── MobileMenu (Slide-out drawer)
                                ├── MobileSwipeTabs (Global horizontal touch gesture listener)
                                │     └── main (Dynamic padding: pt-[8rem] sm:pt-[8.5rem] md:pt-[9rem])
                                │           ├── SigninRoleBanner
                                │           └── Container (max-w-[86rem] / 1376px)
                                │                 └── Page Content (SSR or Client)
                                ├── Footer (Desktop & Tablet footer)
                                ├── DailyEpaperAlert (Unconditional reader alert modal/banner)
                                ├── PopupOrchestrator (Smart engagement popup orchestrator)
                                └── BottomNav (Fixed bottom-0, z-50, xl:hidden)
```

### 3.2 Server/Client Boundary Observations
- `app/layout.tsx` is a Server Component, responsible for critical meta tags, Google Fonts `<link>` tags, and theme initialization scripts.
- `app/(reader)/main/layout.tsx` is a Client Component (`'use client'`). Because it wraps all child routes, server-rendered pages (like `app/(reader)/main/page.tsx` and `app/(reader)/main/article/[id]/page.tsx`) pass their JSX into this client shell as children.
- While App Router preserves server rendering of children passed to client layouts, the layout executes window listeners (`resize` for `setIsMobile` / `setIsTablet`), reads route state, and forces immediate hydration of the entire outer shell.

---

## 4. Current Route Inventory

An exhaustive inspection of the filesystem confirms the following active reader routes:

### 4.1 Canonical Reader Routes (`/main/...`)
| Route | Type | Implementation Path | Description |
|---|---|---|---|
| `/main` | Server + Client | `app/(reader)/main/page.tsx` + `HomePageClient.tsx` | Main editorial homepage feed |
| `/main/article/[id]` | Server + Client | `app/(reader)/main/article/[id]/page.tsx` + `ArticleDetailClient.tsx` | Article reader & listening experience |
| `/main/category/[slug]` | Server + Client | `app/(reader)/main/category/[slug]/page.tsx` + `CategoryPageClient.tsx` | Category-specific editorial feed |
| `/main/latest` | Server + Client | `app/(reader)/main/latest/page.tsx` + `LatestFeedClient.tsx` | Chronological news feed |
| `/main/news` | Server + Client | `app/(reader)/main/news/page.tsx` | News category directory index |
| `/main/epaper` | Server + Client | `app/(reader)/main/epaper/page.tsx` + `EPaperToolbar.tsx` + `EPaperCanvas.tsx` | E-Paper viewer & edition selector |
| `/main/e-magazine` | Server + Client | `app/(reader)/main/e-magazine/page.tsx` | Monthly E-Magazine reader |
| `/main/ftaftaf` | Server + Client | `app/(reader)/main/ftaftaf/page.tsx` + `SwipeFeed.tsx` | Rapid vertical shorts / swipe feed |
| `/main/shorts/[slug]` | Server + Client | `app/(reader)/main/shorts/[slug]/page.tsx` | Direct permalink for vertical short story |
| `/main/videos` | Server + Client | `app/(reader)/main/videos/page.tsx` | Video hub & video gallery |
| `/main/search` | Server + Client | `app/(reader)/main/search/page.tsx` + `SearchClient.tsx` | Editorial search surface |
| `/main/saved` | Client | `app/(reader)/main/saved/page.tsx` | Saved / bookmarked articles |
| `/main/account` | Client | `app/(reader)/main/account/page.tsx` | Reader profile, login status, preferences link |
| `/main/preferences` | Client | `app/(reader)/main/preferences/page.tsx` | Language preference & display settings |
| `/main/author/[id]` | Server + Client | `app/(reader)/main/author/[id]/page.tsx` | Author byline archive |
| `/main/elections` | Server + Client | `app/(reader)/main/elections/page.tsx` | Election data tracker & results table |
| `/main/about` | Server | `app/(reader)/main/about/page.tsx` | Company profile & editorial mission |
| `/main/contact` | Server + Client | `app/(reader)/main/contact/page.tsx` | Reader contact form & editorial address |
| `/main/careers` | Server | `app/(reader)/main/careers/page.tsx` | Recruitment & career openings |
| `/main/advertise` | Server | `app/(reader)/main/advertise/page.tsx` | Commercial & ad rate card inquiries |
| `/main/digital-newsroom` | Server | `app/(reader)/main/digital-newsroom/page.tsx` | Editorial transparency & digital operations |
| `/main/privacy` | Server | `app/(reader)/main/privacy/page.tsx` | Privacy policy & data protection terms |
| `/main/terms` | Server | `app/(reader)/main/terms/page.tsx` | Terms of service |
| `/main/disclaimer` | Server | `app/(reader)/main/disclaimer/page.tsx` | Editorial disclaimer |
| `/main/cookies` | Server | `app/(reader)/main/cookies/page.tsx` | Cookie usage disclosure |
| `/main/sitemap` | Server | `app/(reader)/main/sitemap/page.tsx` | HTML reader sitemap |

### 3.2 Legacy Redirect Shims (Top-Level)
| Legacy Shim Path | HTTP Code | Target Canonical Path |
|---|---|---|
| `/` (root) | 307/308 | `/main` |
| `/article/[id]` | 308 permanentRedirect | `/main/article/[id]` |
| `/business` | 308 permanentRedirect | `/main/category/business` |
| `/education` | 308 permanentRedirect | `/main/category/education` |
| `/entertainment` | 308 permanentRedirect | `/main/category/entertainment` |
| `/epaper` | 308 permanentRedirect | `/main/epaper` |
| `/health` | 308 permanentRedirect | `/main/category/health` |
| `/lifestyle` | 308 permanentRedirect | `/main/category/lifestyle` |
| `/news` | 308 permanentRedirect | `/main/news` |
| `/profile` | 308 permanentRedirect | `/main/account` |
| `/science` | 308 permanentRedirect | `/main/category/science` |
| `/sports` | 308 permanentRedirect | `/main/category/sports` |
| `/technology` | 308 permanentRedirect | `/main/category/technology` |
| `/world` | 308 permanentRedirect | `/main/category/world` |
| `/a/[id]` | 308 permanentRedirect | `/main/article/[id]` (Short URL handler) |
| `/e/[paper]` | 308 permanentRedirect | `/main/epaper` (Short URL handler) |

---

## 5. Current Component Inventory

### 5.1 Global Layout Components
- `Header.tsx` (`components/layout/Header.tsx`): Main reader navigation bar with desktop logo, mobile logo, user avatar menu, search link, theme toggle, and drawer trigger. Fixed positioning at `top-11 md:top-12`.
- `DesktopNav.tsx` (`components/layout/DesktopNav.tsx`): 15-item horizontal navigation list for desktop. Overflows between 1024px and 1280px.
- `BottomNav.tsx` (`components/layout/BottomNav.tsx`): 6-item mobile navigation bar (`Home`, `E-Paper`, `E-Mag`, `Video`, `Quick`, `Profile/Login`). Visible up to `xl:hidden` (1280px).
- `MobileMenu.tsx` (`components/layout/MobileMenu.tsx`): Slide-out navigation drawer with social links, category links, and language toggles.
- `MobileSwipeTabs.tsx` (`components/layout/MobileSwipeTabs.tsx`): Global touch gesture handler routing left/right horizontal swipes across the viewport.
- `Footer.tsx` (`components/layout/Footer.tsx`): Multi-column reader footer with category links, corporate links, copyright, and social icons. Contains inconsistent link targets (`/about` vs `/main/about`).
- `Container.tsx` (`components/layout/Container.tsx`): Max-width wrapper (`max-w-[86rem]` / 1376px) with responsive horizontal padding.

### 5.2 Content Cards & Presentation Components
- `NewsCard.tsx` (`components/ui/NewsCard.tsx`): Primary reusable article card supporting `grid`, `horizontal`, `compact`, `featured`, and `editorial` variants.
- `HeroCard.tsx` (`components/ui/HeroCard.tsx`): Carousel card used on homepage. Renders `<h1>` in each slide.
- `HeroCarousel.tsx` (`components/ui/HeroCarousel.tsx`): Embla-based hero carousel with auto-play, pause on hover, and slide indicators.
- `DesktopHeroEpaperCard.tsx` (`components/ui/DesktopHeroEpaperCard.tsx`): Specialized homepage card highlighting today's E-Paper front page.
- `ArticleMetaRow.tsx` (`components/ui/ArticleMetaRow.tsx`): Specialized metadata display with category, author byline, time, WhatsApp share button, and E-Paper CTA.
- `ReaderImage.tsx` (`components/ui/ReaderImage.tsx`): Image wrapper over `next/image` with error fallback handling.
- `SkeletonCard.tsx` (`components/ui/SkeletonCard.tsx`): Basic loading skeleton card.

### 5.3 Breaking News & Engagement Components
- `BreakingNews.tsx` (`components/ui/BreakingNews.tsx`): Fixed top bar (`z-[60]`) with live marquee, audio TTS player toggle, and category pill.
- `DailyEpaperAlert.tsx` (`components/ui/DailyEpaperAlert.tsx`): Persistent alert prompt nudging readers to read today's E-Paper edition.
- `PopupOrchestrator.tsx` (`components/ui/PopupOrchestrator.tsx`): Client controller coordinating smart popups, polls, and app installation prompts.
- `InstallAppPrompt.tsx` (`components/ui/InstallAppPrompt.tsx`): PWA installation prompt.
- `SmartEngagementPopup.tsx` (`components/ui/SmartEngagementPopup.tsx`): Engagement modal for returning readers.
- `NewsPoll.tsx` (`components/ui/NewsPoll.tsx`): Reader poll widget.

### 5.4 Media & Reader Tools
- `ShareMenu.tsx` (`components/ui/ShareMenu.tsx`): Dropdown menu sharing content to WhatsApp, Facebook, X, LinkedIn, or copying URL.
- `VideoPlayer.tsx` (`components/ui/VideoPlayer.tsx`): Video player component.
- `VideoShortsFeed.tsx` (`components/ui/VideoShortsFeed.tsx`): Vertical video feed container.
- `SwipeFeed.tsx` (`components/swipe/SwipeFeed.tsx`): Fullscreen touch-enabled vertical story card player.
- `EPaperToolbar.tsx` (`components/epaper/EPaperToolbar.tsx`): E-Paper header toolbar with city picker, date picker, zoom controls, and page navigation.
- `EPaperCanvas.tsx` (`components/epaper/EPaperCanvas.tsx`): PDF rendering canvas for newspaper pages.

---

## 6. Visual Brand & Style Debt

### 6.1 The Orange/Red Palette Clash
In `tailwind.config.js`:
```javascript
red: {
  500: '#e72129', // LokSwami Red
  600: '#c61d24',
  ...
},
orange: {
  500: '#e72129', // IDENTICAL to red.500
  600: '#c61d24', // IDENTICAL to red.600
  ...
}
```
**Consequences:**
- The Tailwind `orange` palette was overridden with identical red hex codes to make legacy `orange-*` classes appear red.
- When developers wrote `text-orange-600` in `BottomNav.tsx`, `ArticleDetailClient.tsx`, or `preferences/page.tsx`, they generated red text, but the codebase reads as orange.
- New developers trying to use actual warm accent colors (e.g., amber/orange badges) find the colors render as blood red.
- In `HomePageClient.tsx`, `border-orange-500/25` is mixed with `bg-red-600` and `from-red-600 via-rose-500 to-amber-500`.

### 6.2 Competing Dark Mode Backgrounds
Four distinct dark backgrounds currently compete across reader surfaces:
1. `html.dark` (in `app/globals.css`): `#242024` (Raisin Black — warm purplish dark gray)
2. `MainLayout` (in `app/(reader)/main/layout.tsx`): `dark:bg-slate-950` (`#020617` — cold deep blue-black)
3. `.newsroom-home` (in `app/globals.css`): `#050608` / `#080c11` (Onyx black)
4. Utility card backgrounds (in `ArticleDetailClient.tsx`, `HomePageClient.tsx`): `dark:bg-zinc-900` (`#18181b`) and `dark:bg-zinc-950` (`#09090b`)

**Impact:** When transitioning between pages or viewing cards on the dark homepage, the reader sees harsh seams between `#242024`, `#020617`, and `#18181b`.

---

## 7. Navigation Findings

### 7.1 Top Stacking Offset Fragility (P1)
- `BreakingNews` is fixed `top-0`, height `44px` (mobile) / `48px` (desktop).
- `Header` is fixed `top-11` (`44px`) on mobile and `top-12` (`48px`) on desktop.
- `main` has a hardcoded class: `pt-[8rem] sm:pt-[8.5rem] md:pt-[9rem]`.
- **Failure Mode 1**: If breaking news is empty or closed, `BreakingNews` returns `null`. `Header` remains pinned at `top-11 / top-12`, leaving an empty bar of unclickable space at the top of the browser.
- **Failure Mode 2**: Hindi breaking headlines often contain long compound nouns. On narrow mobile screens (360px), if the headline wraps to 2 lines or the marquee pauses, the breaking bar exceeds 44px, causing the Header to overlap and obscure the breaking headline.

### 7.2 Mobile Horizontal Gesture Collision (P1)
- `MobileSwipeTabs.tsx` wraps the entire `<main>` element with `useSwipeable`.
- Swiping left navigates to the next tab (`Home` → `E-Paper` → `E-Magazine` → `Swipe` → `Quick` → `Profile`).
- **Failure Mode**: Users attempting to scroll horizontal image carousels, swipe horizontally in tables, or pan across an E-Paper page accidentally trigger full route changes.
- Furthermore, on `/main/ftaftaf` (which hosts the vertical swipe video shorts feed), `isSwipeRoute` evaluates to `false` (it only checks `/main/shorts/`), causing horizontal tab-switching to fight against the vertical swipe gesture engine.

### 7.3 Desktop Navigation Overflow (P2)
- `DesktopNav.tsx` renders 15 links (`Home`, `Elections`, `E-Paper`, `E-Magazine`, `Video`, 8 categories, `Search`, `Contact`) in a single row with `whitespace-nowrap`.
- On laptops with 1024px–1280px viewports, the nav links overflow the header, colliding with the right-side user profile button and search icon.

### 7.4 Bottom Nav Sizing & Matra Illegibility on Mobile (P2)
- `BottomNav.tsx` forces 6 buttons into a mobile viewport.
- On a 360px screen, each tab has only ~56px width.
- To fit the text, font size was reduced to `text-[8.5px]`.
- In Hindi Devanagari script, glyphs require upper vowel marks (ऊपर की मात्राएं जैसे ो, ौ, े, ै, ं) and lower vowel marks (नीचे की मात्राएं जैसे ु, ू, ृ). At 8.5px, these marks blend into the letter stems or clip against the icon above, making "ई-मैग" and "फ़टाफ़ट" difficult to read.

---

## 8. Surface-by-Surface Audit Findings

### 8.1 Homepage (`/main`)
- **Semantic Heading Hierarchy (P2)**: `HeroCard.tsx` renders an `<h1>` tag on every slide of `HeroCarousel`. A homepage with 5 carousel slides renders 5 separate `<h1>` tags, violating semantic structure and diluting primary page SEO.
- **Component Duplication (P2)**: `HomePageClient.tsx` defines 4 internal card components (`HeadlineImageCard`, `LiveUpdateStory`, `RankedStoryList`, `FeaturedStoryBand`) and an internal `NewsroomSectionHeader` instead of utilizing normalized design system primitives.
- **Visual Clutter**: Popups (`DailyEpaperAlert`, `PopupOrchestrator`, `InstallAppPrompt`) compete for user attention immediately upon landing.

### 8.2 Article Reader (`/main/article/[id]`)
- **Excessive Measure / Reading Width (P2)**: The article content container is set to `max-w-4xl` (896px). Standard typographic research indicates that optimal reading measure is 60–75 characters per line (~65–70ch / 680–720px). At 896px, lines span ~100 characters, leading to high reading fatigue and line-tracking errors in Hindi script.
- **Header Action Crowding**: The article header row squeezes category badge, breaking badge, bookmark button, share dropdown, and E-Paper button into a horizontal scroll strip on mobile (`-mx-0.5 overflow-x-auto`). On narrow screens, action buttons clip unpredictably.
- **AI/TTS Tool Prominence**: The AI summary and TTS audio player occupy a bulky card directly above the article body, pushing the headline and editorial body far down the viewport.

### 8.3 Video Hub (`/main/videos`) & Shorts (`/main/ftaftaf`)
- **Player Aspect Ratio Inconsistency**: Landscape video cards (16:9) and vertical shorts (9:16) lack standard framing containers.
- **Gesture Conflict on `/main/ftaftaf`**: As noted, `/main/ftaftaf` is not excluded from `MobileSwipeTabs`, so vertical swipe gestures frequently trigger accidental horizontal navigation to `/main/account`.

### 8.4 E-Paper Viewer (`/main/epaper`)
- **Toolbar Stacking on Mobile (P2)**: `EPaperToolbar.tsx` contains 8 controls (City picker, date picker, page number, zoom in, zoom out, zoom reset, fullscreen toggle, share). On viewports below 430px, these wrap into 3 vertical rows, consuming over 140px of screen height and obscuring the newspaper page canvas.
- **Touch Target Density**: Zoom controls (`Plus`, `Minus`, `RotateCcw`) have compact hit areas that are difficult to tap accurately on small mobile screens.

### 8.5 Search (`/main/search`)
- **Hinglish / Roman Transliteration in Hindi Mode (P2)**: When the site is set to Hindi (`language === 'hi'`), `SearchClient.tsx` displays trending search chips in Roman script (`'Mausam Update'`, `'Gold Price'`) and category dropdowns as `'Sabhi Categories'`. This contradicts the editorial standard of a premier Hindi news publication.

### 8.6 Reader Account & Preferences (`/main/account`, `/main/preferences`)
- **Inconsistent Button Systems**: `preferences/page.tsx` uses custom pill buttons (`rounded-full border border-zinc-300 px-5 py-2`) that do not match the card-like buttons used in `account/page.tsx` or the rounded-xl buttons in `BottomNav.tsx`.
- **Red/Orange Utility Mixing**: Language selector buttons use `text-orange-600` and `bg-orange-100`, while the "Home Page" action uses `bg-red-600`.

### 8.7 Universal Share System (`components/ui/ShareMenu.tsx`)
- **Portal Calculation Risk on Mobile**: `ShareMenu.tsx` calculates absolute coordinates via `getBoundingClientRect()`. On fast-scrolling mobile viewports, the dropdown can detach or open partially off-screen. A native bottom drawer / sheet is needed on mobile viewports.
- **Canonical URL vs Current URL**: Share utilities sometimes share `window.location.href` (which may contain legacy query parameters or redirect artifacts) instead of the canonical editorial URL (`buildArticlePublicPath`).

---

## 9. Hindi Typography First-Class Audit

Hindi Devanagari is the primary language of LokSwami. Devanagari has unique structural characteristics:
1. **Shirorekha (Top Hanging Line)**: Hindi characters hang from a continuous top line.
   - *Finding*: Any use of negative tracking (`tracking-tight`, `tracking-tighter`, `letter-spacing: -0.05em`) fragments the shirorekha, creating visually broken words.
   - *Rule*: Devanagari text must always use `tracking-normal` (`letter-spacing: 0`).
2. **Matra Vertical Clearance**:
   - Vowels like ो, ौ, े, ै and modifiers like ं, ँ extend significantly above the shirorekha.
   - Modifiers like ु, ू, ृ extend below the character baseline.
   - *Finding*: English-oriented line-heights like `leading-none` (1.0) and `leading-tight` (1.25) cause top matras to collide with the line above, or get sliced off by containers with `overflow-hidden`.
   - *Rule*: Devanagari body text requires a minimum line-height of `1.6`–`1.7` (`leading-relaxed`), and headlines require `1.35`–`1.45`.
3. **Minimum Legibility Size**:
   - *Finding*: Bottom navigation uses `8.5px` and `9px` for Hindi labels. At this scale, composite ligatures (e.g., क्ष, त्र, ज्ञ, द्ध, प्र) turn into illegible ink-blots.
   - *Rule*: The absolute minimum font size for Devanagari labels must be `11px` (`0.6875rem`), with `12px` preferred for navigation.

---

## 10. Mobile-First & Responsive Evaluation

### 10.1 Evaluation Across Standard Viewports
*(Evidence Level: Code-derived responsive risk / expected behavior pending rendered QA)*

| Width | Device Class | Key Findings & Usability Issues (Code-Derived Responsive Risks) |
|---|---|---|
| **360px** | Compact Android (e.g. Galaxy A series) | Extreme crowding in `BottomNav` (6 tabs in 360px); `EPaperToolbar` wraps to 3 rows; breaking news bar wraps to 2 lines, colliding with Header. |
| **375px** | iPhone SE / older iOS | Small hit targets on article action bar; bottom sheet padding requires safe area inset consideration. |
| **390px** | Standard iPhone 14/15/16 | Layout stabilizes, but `MobileSwipeTabs` still triggers accidental tab navigation during one-handed thumb scrolling. |
| **412px** | Standard Pixel / Galaxy | Adequate width for 2-column cards; article header actions fit without scroll strip. |
| **430px** | iPhone Pro Max / Plus | Header looks clean, but 6-tab bottom nav still exhibits small 9px text. |
| **768px** | iPad Mini / Portrait Tablet | Bottom nav remains visible (hidden at `xl`); content container has wide margins; hero card switches to landscape layout. |
| **1024px** | iPad Pro / Small Laptop | `DesktopNav` appears; 15 links overflow horizontally and bump into search/profile actions. |
| **1440px+**| Large Desktop | `Container` caps at `86rem` (1376px); article reader extends to `max-w-4xl` (896px), which is too wide for comfortable reading. |

### 10.2 Touch Target Compliance
- Standard WCAG 2.2 Success Criterion 2.5.8 (Target Size Minimum) requires interactive targets to be at least **24×24px**, with **44×44px** recommended for primary mobile controls.
- *Findings*:
  - Several icon buttons in `BreakingNews.tsx` (volume toggle) and `HeroCarousel.tsx` (dots) have active hit areas smaller than 36px.
  - E-Paper zoom controls have small touch areas that lead to missed taps on mobile.

---

## 11. Accessibility (a11y) Findings

1. **Heading Structure**:
   - Multiple `<h1>` elements rendered by `HeroCarousel.tsx` (one per slide).
   - Some section titles in `HomePageClient.tsx` use un-semantic `<div>` or `<p>` tags with heading classes instead of proper `<h2>` tags.
2. **Color Contrast**:
   - `orange-500/10` background with `orange-700` text in dark mode fails WCAG AA 4.5:1 contrast requirement.
   - Muted date timestamps (`text-zinc-500` / `#71717a` against dark background `#18181b`) achieve ~3.8:1 contrast, falling below the 4.5:1 minimum for normal text.
3. **Keyboard Focus Visibility**:
   - While `.reader-focus-ring` is defined in `app/globals.css`, several custom buttons and cards omit `focus-visible:` styling, resulting in invisible focus states for keyboard users.
4. **Reduced Motion Support**:
   - `HeroCarousel` auto-scroll and `BreakingNews` marquee ticker do not automatically pause when `prefers-reduced-motion: reduce` is detected.

---

## 12. Performance & Core Web Vitals (CWV) Risks

1. **Cumulative Layout Shift (CLS)**:
   - `BreakingNews.tsx` mounts asynchronously on the client. When breaking news items load or unmount, the document body shifts by `44px–48px`, degrading CLS.
   - Carousel slide transitions without fixed aspect-ratio placeholders cause micro-layout shifts during hydration.
2. **Largest Contentful Paint (LCP)**:
   - On the homepage, `HeroCard` uses `next/image` with `priority`, which is good. However, because `MainLayout` is a client component executing multiple store initializations, the initial HTML stream contains client boundary scripts before hero image rendering begins.
3. **Interaction to Next Paint (INP)**:
   - `MobileSwipeTabs` attaches heavy `onTouchMove` and `onTouchEnd` event listeners to the entire body, creating main-thread execution overhead during scroll and swipe interactions.

---

## 13. Prioritized Findings (P0 / P1 / P2 / P3)

| Severity | ID | Surface / Area | Finding Description | Recommended Action |
|---|---|---|---|---|
| **P0** | — | — | *None identified in Phase 3.1. Zero data-loss, security, or publication blockers.* | — |
| **P1** | UX-001 | Global Navigation | `BreakingNews` & `Header` fixed stacking uses fragile hardcoded numeric padding (`pt-[8rem]...`). If breaking news is empty, Header floats with an empty gap. If Hindi headline wraps, Header overlaps breaking text. | Refactor global reader shell in Phase 3.3 to use CSS variable-driven dynamic top offset or sticky document flow. |
| **P1** | UX-002 | Mobile Interaction | `MobileSwipeTabs.tsx` captures horizontal gestures across the whole reader body, causing accidental route transitions during reading and breaking vertical shorts on `/main/ftaftaf`. | Eliminate global swipeable tab router in Phase 3.3; restrict gestures exclusively to dedicated swipe media feeds. |
| **P1** | UX-003 | Design System | Tailwind `orange` palette is aliased to red (`#e72129`), causing semantic confusion, mixed utility classes, and inability to use legitimate warm secondary accents. | Canonical `brand-*` tokens are established in Phase 3.2. The legacy `orange->red` alias remains temporarily for backward compatibility. Existing `orange-*` usage will be migrated incrementally in later Phase-3 reader slices before the alias is safely removed. |
| **P2** | UX-004 | Dark Mode | Four competing dark mode background definitions (`#242024`, `#020617`, `#050608`, `#18181b`) cause visual seams and banding. | Canonical surface tokens established in Phase 3.2. Existing reader surfaces will migrate incrementally in later Phase-3 slices. |
| **P2** | UX-005 | Hindi Typography | Devanagari top matras clip on tight line-heights (`leading-none`, `leading-tight`); 8.5px bottom nav text is illegible. | Establish explicit Hindi typography rules in Phase 3.2 with minimum 11px font size and relaxed line heights. |
| **P2** | UX-006 | Article Reader | Reading measure (`max-w-4xl` / 896px) is excessively wide for editorial reading comfort (~100 chars/line). | Define standardized editorial reading containers (`max-w-reading` ~ 68ch / 680px) in Phase 3.2 tokens. |
| **P2** | UX-007 | Homepage | `HeroCard.tsx` renders multiple `<h1>` tags inside carousel slides, violating semantic hierarchy. | Restrict `<h1>` to single page title; standardize carousel card headlines to `<h2>` or `<h3>`. |
| **P2** | UX-008 | Component Duplication | `HomePageClient.tsx` has 4 private card components and a private section header instead of shared design system primitives. | Establish normalized `NewsCard`, `Badge`, `SectionHeader`, and `Container` primitives in Phase 3.2. |
| **P2** | UX-009 | Desktop Navigation | `DesktopNav.tsx` has 15 links in a single row that overflow horizontally between 1024px and 1280px. | Implement responsive category overflow/dropdown in Phase 3.3. |
| **P2** | UX-010 | Accessibility | Touch targets on breaking news audio toggle and carousel dots are below 44×44px; dark mode contrast on muted text is below 4.5:1. | Normalize touch target minimums and high-contrast color tokens in Phase 3.2 primitives. |
| **P3** | UX-011 | Search Surface | Hindi search interface displays Roman transliterated keywords ("Mausam Update", "Sabhi Categories"). | Localize search trending chips and categories into pure Devanagari Hindi in future search polish. |
| **P3** | UX-012 | Reader Preferences | Inconsistent pill button styling and lack of standardized button component in preferences/account pages. | Adopt normalized `Button` primitive from Phase 3.2. |

---

## 14. Recommended Phase 3 Implementation Sequence

Based on the evidence gathered in this audit, the following sequenced roadmap is strongly recommended:

1. **Phase 3.2 — LokSwami Design System Foundation (CURRENT WORK)**:
   - Centralize brand colors (LokSwami Red `#e72129`, Charcoal, Dark surfaces, Breaking Red).
   - Establish canonical `brand-*` tokens while maintaining legacy `orange->red` alias for backward compatibility until incremental reader migration is complete.
   - Establish Hindi typography scale (Devanagari first, line-height 1.6+ for body, no negative tracking, shirorekha protection).
   - Define editorial reading containers (`max-w-reading` 68ch, article container 840px, wide 1440px).
   - Build accessible core primitives: `Button` (forwardRef accessible button primitive), `Badge`, `BreakingBadge`, `SectionHeader`, `Container`, `ReaderPageShell`, `EmptyState`, `ErrorState`, `Skeleton`, `MetadataRow`.
   - Guarantee reduced-motion support at primitive level (`motion-reduce:*`) and enforce mobile touch-target contract (`min-h-[44px]`).
   - Comprehensive documentation in `docs/b3/PHASE3_DESIGN_SYSTEM.md`.

2. **Phase 3.3 — Global Reader Shell & Navigation 2.0**:
   - Replace hardcoded fixed header offsets with a cohesive, collision-free sticky header architecture.
   - Remove disruptive `MobileSwipeTabs` global gesture router.
   - Refactor `DesktopNav` to handle category overflow cleanly.
   - Redesign `BottomNav` with 5 well-spaced, highly legible mobile tabs (min 11px font size).

3. **Phase 3.4 — Homepage 2.0**:
   - Unify homepage feed using the normalized `NewsCard` and `SectionHeader` primitives.
   - Fix single `<h1>` hierarchy.
   - Eliminate internal card component duplication.

4. **Phase 3.5 — Article Reader 2.0**:
   - Implement optimal reading width (`max-w-reading`).
   - Clean up top action bar; streamline AI/audio tools into an elegant collapsible drawer or rail.

5. **Subsequent Slices (Phase 3.6 to 3.18)**:
   - Deep links, Universal Share, Branded OG Engine, Video Hub 2.0, Swipe 2.0, E-Paper 2.0, E-Magazine, Mobile Hardening, A11y & Performance UX.
