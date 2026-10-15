# LOKSWAMI B3 PHASE 3.3: GLOBAL READER SHELL & NAVIGATION SPECIFICATION

## 1. PURPOSE

Phase 3.3 establishes an authoritative, predictable, accessible, and responsive reader shell for the LokSwami B3 digital newsroom. The reader shell provides the foundational frame for all public reader-facing routes (`/`, `/main`, `/main/epaper`, `/main/e-magazine`, `/main/videos`, `/main/ftaftaf`, etc.), guaranteeing:
- Elimination of fragile hard-coded page padding compensation (`pt-[8rem]`, `pt-[9rem]`) in favor of a unified natural-flow sticky shell.
- Removal of intrusive full-page gesture capture (`MobileSwipeTabs`) that previously collided with article reading, horizontal carousels, and vertical shorts feeds.
- A disciplined Desktop Navigation Information Architecture (Primary Editorial Links, Desktop Products, and an accessible "अन्य / More" menu) preventing horizontal overflow on 1024–1440px viewports.
- Fully accessible mobile navigation with `>=44x44px` touch targets, `>=11px` legible Hindi typography, and non-color active state indicators.
- A prominent, semantic search entry trigger in the top header.
- Robust focus management with modal drawer focus trapping and return-to-trigger on close.
- Strict compliance with the Phase 3.2 Design System tokens and Architecture Freeze v1 boundaries.

---

## 2. STARTING BASELINE

- **Authoritative Base Branch**: `b3/foundation`
- **Authoritative Starting Baseline SHA**: `e9ca7417e4dd0a92174f6c69aec34b6492e83ca2`
- **Included Predecessors**:
  - Phase 3.1: Reader UX / Product Experience Audit (`docs/b3/PHASE3_UX_AUDIT.md`)
  - Phase 3.2: LokSwami Design System Foundation (`docs/b3/PHASE3_DESIGN_SYSTEM.md`)
  - Phase 3.0: Pre-Phase-3 Repository Hygiene (`docs/b3/PHASE3_REPO_HYGIENE.md`)
  - Phase 2 Final Integration Audit & Architecture Freeze v1 (`docs/b3/ARCHITECTURE_FREEZE_V1.md`)
- **Test Baseline**: 229 Vitest test files, 1,207 tests, 172 static build pages, 0 strict lint errors.

---

## 3. EXISTING SHELL ARCHITECTURE & PROBLEMS ADDRESSED

### Prior Architecture Deficiencies (Identified in Phase 3.1 UX Audit)
1. **UX-001 (P1) — Fragile Stacking & Magic Pixel Offsets**:
   - `BreakingNews.tsx` was rendered with `fixed left-0 right-0 top-0 z-[60]`.
   - `Header.tsx` was rendered with `fixed left-0 right-0 top-11 md:top-12 z-50`.
   - `layout.tsx` compensated by forcing `<main>` into `pt-[8rem] sm:pt-[8.5rem] md:pt-[9rem]`.
   - *Failure Modes*: When Breaking News had no active alerts or was closed by the user, an empty 44px gap was left at the top. When Hindi headlines wrapped into 2 lines on small mobile screens, the header overlapped the breaking news or the content underneath was clipped.
2. **UX-002 (P1) — Broad Gesture Collision via MobileSwipeTabs**:
   - `layout.tsx` wrapped the entire `<main>` element with `<MobileSwipeTabs>`.
   - Global touch listeners on `<main>` intercepted horizontal touch movements across articles, interactive maps, tables, photo carousels, and vertical video feeds (`/main/ftaftaf`), causing accidental section jumps and breaking native scrolling.
3. **UX-009 (P2) — Unbounded Desktop Navigation Row**:
   - `DesktopNav.tsx` attempted to render 15+ links inline in a single row without an overflow strategy.
   - On 1024px and 1280px viewports, links were either truncated, clipped off-screen, or forced into illegible typography.
4. **UX-010 (P2 - Shell Controls) — Sub-44px Touch Targets**:
   - Breaking news voice toggle, search triggers, language switches, and drawer close buttons had touch targets measuring 32–36px.
5. **UX-005 (P2 - Navigation Typography) — Illegible Hindi Micro-Typography**:
   - `BottomNav.tsx` rendered Hindi category labels at `text-[8.5px]` and `text-[9px]`, violating legibility standards and causing Devanagari vowel sign (matra) clipping.

---

## 4. FINAL SHELL OWNERSHIP & CONTRACT

The LokSwami Reader Shell is strictly partitioned into single-responsibility layout layers:

```
┌─────────────────────────────────────────────────────────────┐
│ Reader Shell Wrapper (min-h-screen, overflow-x-clip)        │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Skip Link: #main-content (sr-only, focus:not-sr-only)    │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Unified Sticky Shell Container: sticky top-0 z-40 w-full │ │
│ │                                                         │ │
│ │  ┌──────────────────────────────────────────────────┐  │ │
│ │  │ BreakingNews Layer: relative z-[45] w-full       │  │ │
│ │  │ (Renders only when active breaking alerts exist) │  │ │
│ │  └──────────────────────────────────────────────────┘  │ │
│ │  ┌──────────────────────────────────────────────────┐  │ │
│ │  │ Header Layer: relative z-40 w-full               │  │ │
│ │  │ (Top branding row + Desktop Navigation bar)      │  │ │
│ │  └──────────────────────────────────────────────────┘  │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ MobileMenu Drawer: dialog role, z-[70], backdrop z-[60] │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Main Reader Content: <main id="main-content" role="main"│ │
│ │ (Normal document flow immediately below sticky shell;   │ │
│ │  Zero magic top padding; reader-bottom-safe-pad for nav)│ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Footer Layer: <footer role="contentinfo">               │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ BottomNav Layer: fixed bottom-0 z-50 xl:hidden          │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. HEADER BEHAVIOR

- **Container Positioning**: `Header.tsx` operates in normal flow inside the sticky shell container (`relative z-40 w-full`).
- **Brand Row**:
  - Left: Mobile hamburger menu trigger (`min-h-[44px] min-w-[44px]`, `aria-label`, `aria-expanded`, `aria-controls="mobile-drawer"`).
  - Center/Left: Authoritative `Logo` component linking to `/main`.
  - Right:
    - Dedicated semantic **Search Entry Button** (`Link href="/main/search"`, `min-h-[44px] min-w-[44px]`, `aria-label="खोजें / Search"`).
    - Quick E-Paper shortcut (`min-h-[44px]`, `hidden sm:inline-flex`).
    - Theme Toggle (`ThemeToggle`, `min-h-[44px] min-w-[44px]`).
- **Separation Line**: Signature LokSwami brand gradient accent bar (`h-[2px] bg-gradient-to-r from-brand-500 via-rose-500 to-amber-500`).
- **Desktop Navigation Integration**: Embedded as a dedicated lower bar inside `Header.tsx`, hidden below `lg` (1024px) breakpoint.

---

## 6. BREAKING-NEWS BEHAVIOR

- **Container Positioning**: `BreakingNews.tsx` is positioned as `relative z-[45] w-full bg-brand-500 text-white`.
- **Natural Stacking**:
  - When breaking news items exist: Renders at the very top of the sticky container, pushing `Header` directly below it.
  - When no breaking news items exist or all items are dismissed: Returns `null`. The sticky shell collapses smoothly, and `Header` rests naturally at `top: 0` with zero visual shift and zero empty whitespace.
- **Hindi Typography & Wrapping**:
  - Hindi text uses `font-semibold text-xs sm:text-sm tracking-normal leading-snug`.
  - Content wraps predictably without clipping matras or overflowing horizontally.
- **Controls & Accessibility**:
  - Voice TTS toggle button upgraded to `min-h-[44px] min-w-[44px]` with `editorial-focus-ring`.
  - Marquee animation respects `motion-reduce:animate-none`.

---

## 7. DESKTOP NAVIGATION INFORMATION ARCHITECTURE

To prevent 1024–1440px overflow, desktop links are categorized into an evidence-based hierarchy:

### 1. Primary Editorial Links (Always visible on desktop `>=1024px`):
1. **Home / मुख्य पृष्ठ**: `/main`
2. **Latest / प्रमुख खबरें**: `/main/latest`
3. **Elections / चुनाव 2026**: `/main/elections`
4. **Politics / राजनीति**: `/main/category/politics`
5. **National / देश**: `/main/category/national`
6. **Sports / खेल**: `/main/category/sports`
7. **Business / व्यापार**: `/main/category/business`
8. **Entertainment / मनोरंजन**: `/main/category/entertainment`

### 2. Desktop-Only Product Shortcuts (Visible on `>=1024px` via `hidden lg:inline-flex`):
9. **E-Paper / ई-पेपर**: `/main/epaper`
10. **E-Magazine / ई-पत्रिका**: `/main/e-magazine`
11. **Video / वीडियो**: `/main/videos`

### 3. Secondary Sections ("अन्य / More" Dropdown):
12. **Technology / तकनीक**: `/main/category/technology`
13. **Madhya Pradesh & Regional / मध्य प्रदेश**: `/main/category/madhya-pradesh`
14. **World / विदेश**: `/main/category/world`
15. **Contact / संपर्क**: `/main/contact`
16. **Digital Newsroom / डिजिटल न्यूज़रूम**: `/main/newsroom`

### Dropdown Mechanics:
- Button label: `अन्य` / `More` with an animated `ChevronDown` indicator.
- Keyboard accessible: Supports Enter/Space to open, Escape to close with automatic focus return to trigger.
- Click-outside handler to close automatically.
- Accessible ARIA contract: `aria-haspopup="true"`, `aria-expanded={isMoreOpen}`.

---

## 8. MOBILE NAVIGATION & DRAWER

### Mobile Navigation Priority:
Mobile users navigate primarily via:
1. **Top Header**: Logo + Mobile Hamburger Button + Direct Search Trigger.
2. **Bottom Navigation Bar**: Rapid thumb-zone switching between core reader experiences.
3. **Mobile Drawer**: Comprehensive category catalog, utility pages, language toggle, and social channels.

### Mobile Menu Drawer (`MobileMenu.tsx`):
- Semantic dialog: `role="dialog"`, `aria-modal="true"`, `aria-label="नेविगेशन मेनू"`.
- Focus Management:
  - Traps focus inside the drawer using Tab / Shift+Tab cycling.
  - Automatically restores focus to the invoking hamburger button upon dismissal.
  - Dismissible via `Escape` key, backdrop click, or explicit close button.
- Touch Targets: Close button and language switches guarantee `>=44x44px`.
- Scroll Isolation: Disables background document scrolling when open without resetting scroll position.

---

## 9. BOTTOM NAVIGATION

- **Target Viewports**: Displayed on mobile and tablet (`xl:hidden`), fixed to viewport bottom (`z-50`).
- **Safe Area Inset**: Utilizes `pb-[max(env(safe-area-inset-bottom),0.25rem)]` to respect modern edge-to-edge mobile screens.
- **Item Inventory**:
  1. Home (`/main`)
  2. E-Paper (`/main/epaper`)
  3. E-Magazine (`/main/e-magazine`)
  4. Video (`/main/videos`)
  5. Quick / फटाफट (`/main/ftaftaf`)
  6. Profile / Login (`/main/account` or `/signin`)
- **Typography**: Upgraded from `8.5px` to `text-[11px] sm:text-xs font-semibold tracking-normal leading-tight`.
- **Touch Target Floor**: Guaranteed `min-h-[44px] min-w-[44px]` per navigation slot.
- **Active State Differentiation**:
  - Spring-animated pill background (`motion.div layoutId="bottomNavActive"`).
  - Increased icon stroke weight (`strokeWidth={2.4}`).
  - Brand accent color (`text-brand-500 dark:text-brand-400`).
  - Visible non-color active dot indicator below label.
  - Semantic `aria-current="page"`.

---

## 10. SEARCH ENTRY

- Search entry is elevated to a primary header action (`Link href="/main/search"`).
- Rendered with `min-h-[44px] min-w-[44px]` and `editorial-focus-ring`.
- Exposes clear screen-reader accessible label: `aria-label="खोजें / Search"`.
- Backend search query semantics and `/main/search` result page rendering remain completely untouched.

---

## 11. ACTIVE NAVIGATION STATE BEHAVIOR

- Active state matching is unified under `isReaderNavigationActive(currentPathname, targetHref)` in `lib/constants/readerNavigation.ts`.
- **Sanitization**: Strips query strings, hashes, and trailing slashes prior to route comparison.
- **Equivalence**: Treats `/` and `/main` interchangeably as Home.
- **Exact vs Segment Matching**:
  - Exact match for root paths (`/` and `/main`).
  - Prefix segment match for sub-routes (e.g., `/main/category/politics` matches `/main/category/politics/assembly-election`).
  - Prevents substring false positives (e.g., `/main/news` will *not* falsely activate `/main/newsletter`).

---

## 12. GESTURE POLICY (RESOLUTION OF UX-002)

- **Root Problem**: Previously, `MobileSwipeTabs` wrapped `<main>`, intercepting horizontal touch events across all articles and interactive components.
- **Phase 3.3 Rule**: Reader content surfaces must **never** be subject to global horizontal gesture interception.
- **Resolution**: `<MobileSwipeTabs>` wrapper has been completely excised from `app/(reader)/main/layout.tsx`.
- **Result**:
  - Article readers can select text, swipe data tables, and scroll horizontal galleries without page jumps.
  - Vertical shorts feeds (`/main/ftaftaf`) operate smoothly with zero touch conflicts.
  - E-Paper pinch/pan/zoom is fully isolated.

---

## 13. HINDI TYPOGRAPHY CONTRACT

All shell and navigation elements adhere to the Phase 3.2 Hindi typography rules:
- `tracking-normal` applied across all Hindi text (strictly no negative tracking).
- Devanagari line-heights use `leading-normal` or `leading-tight` with safe padding to prevent matra clipping.
- No micro-typography below `11px` in navigation elements.
- Long Hindi breaking news headlines support natural wrapping.

---

## 14. ACCESSIBILITY & FOCUS MANAGEMENT

- **Semantic Landmarks**:
  - Skip link: `<a href="#main-content">` (first focusable item).
  - Primary navigation: `<nav aria-label="मुख्य नेविगेशन">` or `"Main Navigation"`.
  - Bottom navigation: `<nav aria-label="Bottom Navigation">`.
  - Reader content: `<main id="main-content" role="main" tabIndex={-1}>`.
- **Keyboard Navigation**:
  - Logical tab order through skip link, mobile menu trigger, logo, search button, theme toggle, and desktop links.
  - `Escape` closes both Mobile Menu and Desktop "More" dropdown.
  - Focus is restored to the triggering element upon closing menus.
- **Focus Rings**:
  - All interactive elements use `editorial-focus-ring` (`focus-visible:ring-2 focus-visible:ring-brand-500`).
- **Touch Targets**:
  - All shell buttons, links, and triggers strictly meet `>=44x44px`.

---

## 15. Z-INDEX CONTRACT

The shell normalizes z-index layers to avoid arbitrary values (`z-[9999]`):

| Layer | Z-Index | Purpose |
|---|---|---|
| Skip Link | `z-[100]` | Always visible on keyboard focus |
| Mobile Drawer | `z-[70]` | Highest interactive shell overlay |
| Mobile Drawer Backdrop | `z-[60]` | Modal backdrop behind drawer |
| Bottom Navigation | `z-50` | Sticky bottom mobile bar |
| Breaking News Layer | `z-[45]` | Top layer of sticky header |
| Header & Desktop Nav | `z-40` | Main sticky header row |
| Page Content / Main | `z-0` | Normal document flow |

---

## 16. PERFORMANCE & SSR BOUNDARY

- **Server-Side Rendering Preserved**:
  - Navigation links and static anchors render server-side for maximum crawlability and SEO.
  - Client state (`useAppStore`, `usePathname`) is localized to interactive controls (dropdown toggles, mobile drawer, active highlight).
- **Layout Shift Elimination (CLS <= 0.1)**:
  - Sticky container holds its own dimensions in normal flow, removing the reliance on JS-driven height calculations or magic padding classes.
  - Breaking news presence or absence does not trigger sudden content shifts.

---

## 17. REMAINING UX DEBT REGISTER STATUS

| ID | Priority | Description | Phase 3.3 Status |
|---|---|---|---|
| **UX-001** | P1 | Header + BreakingNews stacking relies on fragile magic padding | **RESOLVED**: Unified sticky container; magic padding eliminated. |
| **UX-002** | P1 | Global gesture capture on `<main>` collides with reading/shorts | **RESOLVED**: `MobileSwipeTabs` removed from `<main>`. |
| **UX-009** | P2 | DesktopNav unbounded 15+ links causes 1024-1280px overflow | **RESOLVED**: Primary links + "More" dropdown IA established. |
| **UX-010** | P2 | Touch targets <44x44px across shell controls | **RESOLVED (Shell portion)**: Header, BreakingNews, Nav, Drawer >=44px. |
| **UX-005** | P2 | Illegible 8.5px Hindi text in BottomNav | **RESOLVED (Nav portion)**: Floor raised to `>=11px` with safe line-height. |
| **UX-003** | P2 | Orange token alias migration | **PARTIAL**: Touched shell components migrated to `brand-*`. Global alias remains compatibility debt. |
| **UX-006** | P2 | Article body reading column width | *Out of scope (Phase 3.5)* |
| **UX-007** | P2 | Hero H1 semantic hierarchy | *Out of scope (Phase 3.4)* |
| **UX-008** | P2 | Homepage card duplication | *Out of scope (Phase 3.4)* |

---

## 18. ARCHITECTURE FREEZE COMPLIANCE

- **Backend Architecture**: Zero changes to MongoDB models, Mongoose schemas, API routes, or backend repositories.
- **Authentication**: Existing NextAuth reader session behavior preserved; no admin or staff privilege leaks.
- **Dependencies**: Zero changes to `package.json` or `package-lock.json`. No new drawer or gesture libraries installed.
- **Public URLs**: All public routes remain completely canonical and unchanged.

---

## 19. PHASE 3.4 HANDOFF NOTES

Phase 3.3 has stabilized the outer reader shell. Phase 3.4 (Homepage Experience 2.0) can now safely assume:
1. `<main id="main-content">` begins immediately below the sticky header with zero magic padding.
2. Breaking news alerts will not push or overlap homepage hero sections.
3. Desktop and mobile viewports have predictable, tested header dimensions.
4. No rogue horizontal touch listeners will hijack homepage carousel interactions.
