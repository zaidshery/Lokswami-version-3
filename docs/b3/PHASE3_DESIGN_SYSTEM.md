# LokSwami B3 — Phase 3.2: Design System Foundation

**Authoritative Program**: LokSwami B3 — Reader / Product Experience 2.0  
**Phase**: 3.2 (LokSwami Design System Foundation)  
**Status**: ACTIVE FOUNDATION  
**Branch**: `b3/phase3-ux-audit-design-system`  
**Date**: September 2026  
**Architectural Scope**: Presentation Layer Design Tokens, Core Primitives, Typography Standards, and Accessibility Guidelines  

---

## 1. Design Language & Brand Identity

LokSwami is a premier, serious, and authoritative Hindi digital news publication. The design language reflects:
- **SERIOUS & EDITORIAL**: Grounded in classic Indian print journalism, adapted cleanly for modern high-DPI digital screens. No gimmicks, cartoonish elements, or SaaS dashboard aesthetics.
- **TRUSTWORTHY & CREDIBLE**: Clear visual hierarchy, explicit bylines, publication timestamps, and authoritative section headers.
- **INDIAN NEWS IDENTITY**: Authentic Hindi Devanagari typography treated as a first-class citizen, not an afterthought fitted into English design molds.
- **MODERN & CLEAN**: Crisp borders, restrained elevation, plenty of white space, and clear focal points.
- **FAST & MOBILE-FIRST**: Featherweight CSS tokens, zero heavy JavaScript animation dependencies, strict touch target standards, and zero layout shift.
- **PREMIUM & RECOGNIZABLE**: Anchored by the signature **LokSwami Red** (`#e72129`), accented by deep charcoal, crisp white, and warm neutral grays.

### What LokSwami Is NOT:
- Not a generic SaaS dashboard with rounded pastel cards and neon AI gradients.
- Not an animation-heavy portfolio or gaming UI.
- Not a cluttered, sensory-overload television broadcast portal with 10 blinking tickers.
- Not a Western-centric English template with broken Devanagari matras.

---

## 2. Color System

### 2.1 Brand & Semantic Tokens
The color system is centralized in `tailwind.config.js` and `app/globals.css`.

| Token | Hex Code | Purpose / Usage |
|---|---|---|
| `brand-500` / `lokswami-red` | `#e72129` | **Primary Brand Red** — Logomark, primary buttons, active tabs, live indicators |
| `brand-600` / `brand-hover` | `#c61d24` | **Interactive Hover** — Hover states for primary buttons and links |
| `brand-700` / `brand-active` | `#a8181f` | **Interactive Active** — Pressed/active state for brand buttons |
| `breaking` | `#dc2626` | **Breaking News Accent** — High-urgency breaking news bar, live tickers, badges |
| `brand-50` | `#fff1f2` | Soft brand tint for light badges and active pill backgrounds |
| `brand-950` | `#3f070b` | Deep dark brand tone for dark-mode breaking badges |

### 2.2 Resolution of the "Orange" Aliasing Debt
Prior to Phase 3.2, `tailwind.config.js` aliased Tailwind's entire `orange` palette to red (`orange.500 = '#e72129'`).
- **Phase 3.2 Resolution**: The canonical `brand` palette (`brand-50` through `brand-950`) and explicit semantic tokens (`brand-hover`, `brand-active`, `breaking`) have been established.
- **Backwards Compatibility Guarantee**: The legacy `orange` and `red` aliases remain in `tailwind.config.js` so existing components function without disruption. Future Phase-3 slices will systematically migrate to `brand-*` tokens.

### 2.3 Normalized Editorial Surfaces (Light & Dark Mode)
To eliminate the dark-mode banding identified in Phase 3.1 (where `#242024`, `#020617`, and `#18181b` competed), Phase 3.2 defines cohesive surface scales:

#### Light Mode Surfaces
- **Base Canvas**: `#ffffff` (`bg-white`)
- **Elevated Card**: `#ffffff` (`bg-white border border-zinc-200/80`)
- **Muted Section / Well**: `#f8f9fa` (`bg-zinc-50/80`)
- **Border Subtle**: `#e4e4e7` (`border-zinc-200`)
- **Border Strong**: `#d4d4d8` (`border-zinc-300`)
- **Text Primary**: `#0f1419` (`text-zinc-950`)
- **Text Secondary**: `#4b5563` (`text-zinc-700`)
- **Text Muted**: `#6b7280` (`text-zinc-500`)

#### Dark Mode Surfaces
- **Base Canvas**: `#0e0e12` (Normalized deep onyx dark)
- **Elevated Card**: `#16161c` (`dark:bg-zinc-900/90 border dark:border-zinc-800`)
- **Overlay / Modal**: `#1f1f26` (`dark:bg-zinc-900 border dark:border-zinc-700/80`)
- **Muted Section**: `#272731` (`dark:bg-zinc-800/40`)
- **Border Subtle**: `#2e2e38` (`dark:border-zinc-800`)
- **Border Strong**: `#3f3f4c` (`dark:border-zinc-700`)
- **Text Primary**: `#f8fafc` (`dark:text-zinc-50`)
- **Text Secondary**: `#94a3b8` (`dark:text-zinc-300`)
- **Text Muted**: `#64748b` (`dark:text-zinc-400`)

---

## 3. Typography Foundation & Hindi First-Class Rules

### 3.1 Font Family Stack
Font families are defined in `app/globals.css` and `tailwind.config.js`:
- **Sans / UI (`font-sans`)**: `var(--font-news-ui), 'Noto Sans Devanagari', 'Noto Sans', Mangal, 'Kohinoor Devanagari', system-ui, sans-serif`
- **Hindi Primary (`font-hindi`)**: `'Noto Sans Devanagari', Mangal, 'Kohinoor Devanagari', sans-serif`
- **English Latin (`font-english`)**: `'Noto Sans', system-ui, -apple-system, sans-serif`

Google Fonts loads both `Noto Sans` and `Noto Sans Devanagari` across weights 400, 500, 600, 700, 800, and 900 with `display=swap` in `app/layout.tsx`.

### 3.2 Non-Negotiable Hindi Devanagari Rules

#### Rule 1: Shirorekha Protection (Zero Negative Tracking)
In Devanagari, characters hang from a continuous top hanging line (शिरोरेखा).
- **Prohibited**: Negative letter-spacing classes like `tracking-tighter` (-0.05em) or `tracking-tight` (-0.025em). They slice the shirorekha, creating visually fragmented words.
- **Mandatory**: Always use `tracking-normal` (`letter-spacing: 0`) for Devanagari text. The `.hindi-text`, `.hindi-headline`, and `.hindi-body` utility classes enforce `letter-spacing: 0 !important`.

#### Rule 2: Matra Vertical Clearance & Line-Height Standards
Devanagari glyphs have extensive vertical reach:
- Upper vowel marks (ऊपर की मात्राएं जैसे ो, ौ, े, ै, ं, ँ, र्) extend above the shirorekha.
- Lower vowel marks and modifiers (नीचे की मात्राएं जैसे ु, ू, ृ, ्र, ़) extend below the baseline.
- **Prohibited**: `leading-none` (1.0) and `leading-tight` (1.25) on Devanagari text. They cause upper matras to collide with the line above or get chopped by `overflow-hidden` containers.
- **Standards**:
  - **Devanagari Headlines**: `leading-[1.35]` to `leading-[1.45]` (`.hindi-headline`)
  - **Devanagari Body Paragraphs**: `leading-[1.65]` to `leading-[1.75]` (`.hindi-body`)
  - **Devanagari Metadata & Buttons**: `leading-[1.4]`

#### Rule 3: Minimum Legibility Size (11px Floor)
- Devanagari composite conjuncts (संयुक्त अक्षर जैसे क्ष, त्र, ज्ञ, द्ध, प्र, श्र) require sufficient vertical and horizontal pixel density to remain legible.
- **Prohibited**: Micro-fonts below 10px (e.g. the 8.5px text in legacy `BottomNav.tsx`).
- **Standard**: The absolute floor for Devanagari text is **11px** (`0.6875rem`), with **12px** preferred for badges/nav and **14px–16px** for UI controls.

#### Rule 4: Word Breaking
Devanagari compound words must not be broken mid-syllable:
- Always apply `word-break: keep-all; overflow-wrap: break-word;` via `.hindi-text`.

### 3.3 Typographic Scale
| Level | Font Size (Mobile → Desktop) | Line Height | Weight | Usage |
|---|---|---|---|---|
| **Display** | `clamp(2rem, 4vw, 3rem)` | 1.25 | 900 Black | Major editorial feature / lead headline |
| **Page Title** | `clamp(1.5rem, 3vw, 2.25rem)` | 1.30 | 900 Black | Reader page `<h1>` (Category, E-Paper, About) |
| **Section Title** | `clamp(1.125rem, 2vw, 1.5rem)` | 1.35 | 700 Bold | Section dividers, feed headers (`<h2>`) |
| **Article Headline** | `clamp(1.25rem, 2.5vw, 1.875rem)` | 1.35 | 800 ExtraBold | Article detail headline (`<h1>`) |
| **Card Headline** | `1rem` → `1.125rem` | 1.38 | 700 Bold | NewsCard headlines (`<h3>`) |
| **Article Summary** | `1.0625rem` (17px) | 1.60 | 500 Medium | Lead paragraph / article summary |
| **Article Body (Hindi)** | `1.0625rem` (17px) | 1.72 | 400 Regular | Long-form reading paragraphs |
| **Article Body (English)**| `1rem` (16px) | 1.65 | 400 Regular | English editorial content |
| **Metadata / Time** | `0.75rem` (12px) | 1.40 | 500 Medium | Timestamps, read times, bylines |
| **Caption** | `0.8125rem` (13px) | 1.40 | 500 Medium | Image captions, photo credits |
| **Button / Nav** | `0.875rem` (14px) | 1.40 | 700 Bold | Navigation links, buttons |
| **Badge / Tag** | `0.6875rem` (11px) | 1.20 | 700 Bold | Category pills, live breaking tags |

---

## 4. Spacing Scale

Spacing is anchored on a 4px modular grid:
- `space-1`: `0.25rem` (4px) — micro gaps, inline badge icons
- `space-2`: `0.5rem` (8px) — tight element gaps, chip spacing
- `space-3`: `0.75rem` (12px) — card internal padding, compact items
- `space-4`: `1rem` (16px) — standard card padding, form gaps
- `space-5`: `1.25rem` (20px) — medium component padding
- `space-6`: `1.5rem` (24px) — section gaps on mobile
- `space-8`: `2rem` (32px) — section margins on desktop
- `space-12`: `3rem` (48px) — major layout bands

---

## 5. Containers & Editorial Reading Widths

Excessively wide lines cause eye strain and tracking errors. Standardized container widths are defined in `tailwind.config.js` and `app/globals.css`:

| Container Token | Max Width | Target Use Case |
|---|---|---|
| `max-w-reading` / `.max-w-reading-optimal` | **68ch** (~680px) | **Optimal Editorial Measure** — Long-form article text, opinion essays, editorials |
| `max-w-article-container` / `.max-w-article-optimal` | **52rem** (832px) | Article reader frame (headline, media, body, share rail) |
| `max-w-page-narrow` | **48rem** (768px) | Centered utilities: login, settings, contact forms, legal text |
| `max-w-page-standard` | **72rem** (1152px) | Standard content feeds: category feeds, search results, video hub |
| `max-w-page-wide` | **86rem** (1376px) | Full editorial homepage feed, multi-rail layout |
| `max-w-full` | **100%** | Full-bleed media, breaking news marquee, E-Paper canvas |

---

## 6. Border Radius Scale

Restrained, editorial radii prevent UI elements from looking like bubbly toy apps:
- `rounded-editorial-xs`: `0.25rem` (4px) — small badges, live pills, category tags
- `rounded-editorial-sm`: `0.375rem` (6px) — buttons, form inputs, thumbnails
- `rounded-editorial-md`: `0.5rem` (8px) — news cards, section headers, panels
- `rounded-editorial-lg`: `0.75rem` (12px) — feature cards, popups, alert boxes
- `rounded-editorial-xl`: `1rem` (16px) — hero banners, modals, drawers
- `rounded-editorial-pill`: `9999px` — floating toggles, pill badges

---

## 7. Shadow & Elevation Scale

Elevation is minimal and crisp, simulating quality editorial print on digital surfaces:
- `shadow-editorial-sm`: `0 1px 2px 0 rgba(0, 0, 0, 0.05)` — subtle card resting state
- `shadow-editorial`: `0 2px 6px -1px rgba(0, 0, 0, 0.08), 0 1px 4px -1px rgba(0, 0, 0, 0.04)` — cards, buttons
- `shadow-editorial-md`: `0 6px 16px -2px rgba(0, 0, 0, 0.08), 0 2px 6px -1px rgba(0, 0, 0, 0.04)` — card hover, dropdowns
- `shadow-editorial-lg`: `0 12px 28px -4px rgba(0, 0, 0, 0.12), 0 4px 10px -2px rgba(0, 0, 0, 0.06)` — modals, floating overlays

---

## 8. Breakpoints & Responsive Strategy

Responsive design follows a strict mobile-first progression:
- `xs`: **360px** — Compact Android handsets
- `sm`: **640px** — Large phones / landscape mobile
- `md`: **768px** — Portrait tablets / iPad mini
- `lg`: **1024px** — Landscape tablets / small laptops
- `xl`: **1280px** — Standard desktop monitors
- `2xl`: **1440px** — Wide desktop monitors

**Rules**:
- No ad-hoc media queries (`min-[380px]`, `min-[420px]`) unless mathematically justified for multi-column grids.
- Mobile experience is primary: all content must read gracefully at 360px without horizontal document clipping or overflow.

---

## 9. Motion & Accessibility

### 9.1 Motion Standards
- **Fast (`150ms`)**: Button clicks, hover states, toggles.
- **Normal (`250ms`)**: Dropdown open/close, tab switches, badge fades.
- **Slow (`400ms`)**: Drawer slides, modal entrances.
- **Easing**: `cubic-bezier(0.2, 0.8, 0.2, 1)` (snappy editorial response).

### 9.2 Reduced Motion Guarantee
All animations degrade gracefully when the reader enables reduced motion at the OS level:
```css
@media (prefers-reduced-motion: reduce) {
  .cnp-motion,
  .marquee-animate,
  [data-animate="true"] {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### 9.3 Focus States
- Interactive elements must support the `.editorial-focus-ring` utility.
- When focused via keyboard (`:focus-visible`), a 2px high-contrast LokSwami Red ring (`#e72129`) with a 2px offset appears.
- Never set `outline: none` without replacing it with an accessible focus indicator.

### 9.4 Touch Target Minimums
- All primary interactive elements on mobile (buttons, nav tabs, icon controls) must maintain a minimum touch target of **44×44px** (`min-h-[44px]`), with secondary desktop controls having a minimum of **36×36px**.

---

## 10. Core Design Primitives Reference

The following normalized primitives have been established in `components/ui/`:

### 1. `Button` (`components/ui/Button.tsx`)
- **Variants**: `primary`, `secondary`, `outline`, `ghost`, `destructive`, `breaking`
- **Sizes**: `sm` (34-36px), `md` (40-44px), `lg` (44-48px)
- **Features**: Accessible `aria-busy` and `aria-disabled` on loading, left/right icon slots, keyboard focus ring, touch-target compliant.

### 2. `Badge` (`components/ui/Badge.tsx`)
- **Variants**: `brand`, `breaking`, `neutral`, `outline`, `success`, `warning`
- **Sizes**: `sm` (11px), `md` (12px)
- **Features**: Uppercase tracking-normal Devanagari protection, icon slot.

### 3. `BreakingBadge` (`components/ui/BreakingBadge.tsx`)
- **Features**: Live pulsing dot indicator, high-urgency urgent red styling, `role="status"`.

### 4. `SectionHeader` (`components/ui/SectionHeader.tsx`)
- **Features**: Signature LokSwami vertical red accent bar, configurable semantic heading level (`h1`, `h2`, `h3`, `h4`), optional call-to-action link (`ArrowRight`), Devanagari line-height protection.

### 5. `Container` (`components/layout/Container.tsx`)
- **Variants**: `reading` (68ch), `article` (52rem), `narrow` (48rem), `standard` (72rem), `wide` (86rem, default), `full` (100%).
- **Features**: 100% backwards-compatible with existing codebase while providing explicit editorial width controls.

### 6. `ReaderPageShell` (`components/ui/ReaderPageShell.tsx`)
- **Features**: Standardized page title (`<h1>`), eyebrow, summary, and action bar wrapper.

### 7. `EmptyState` (`components/ui/EmptyState.tsx`)
- **Features**: Centered icon, title, description, and primary action slot for empty feeds and search results.

### 8. `ErrorState` (`components/ui/ErrorState.tsx`)
- **Features**: `role="alert"` container, retry button callback, error title and description.

### 9. `Skeleton` (`components/ui/Skeleton.tsx`)
- **Variants**: `text`, `circular`, `rectangular`, `rounded`
- **Features**: `aria-hidden="true"`, subtle pulse animation, respects `prefers-reduced-motion`.

### 10. `MetadataRow` (`components/ui/MetadataRow.tsx`)
- **Features**: Standardized article byline, published date with clock icon, reading time estimate, category badge, and accessible separator dots.

---

## 11. Component Adoption & Migration Strategy

Phase 3.2 establishes the design system foundation. It explicitly **does NOT** perform a mass-refactor of every existing page in this pull request.

### Adoption Roadmap by Phase:
- **Phase 3.3 (Global Reader Shell & Navigation)**: Adopt `Button`, `Container`, and `editorial-focus-ring` in `Header.tsx`, `DesktopNav.tsx`, and `BottomNav.tsx`. Remove `MobileSwipeTabs` gesture conflict.
- **Phase 3.4 (Homepage 2.0)**: Replace `HomePageClient.tsx`'s internal `NewsroomSectionHeader` with `SectionHeader`, and normalize duplicated card variants to `NewsCard` using design tokens. Fix `<h1>` carousel slide bug.
- **Phase 3.5 (Article Reader 2.0)**: Apply `Container variant="reading"` and `MetadataRow` to `ArticleDetailClient.tsx`. Streamline AI and audio tools.
- **Phase 3.7 (Universal Share)**: Upgrade `ShareMenu.tsx` to use design system buttons and mobile bottom-sheet primitives.
- **Phase 3.9–3.14 (Video & E-Paper)**: Adopt normalized player framing, touch targets, and `ErrorState` / `EmptyState` primitives.

This restrained, slice-by-slice adoption model ensures that the frozen Phase 2 engine remains completely stable while the reader experience upgrades cleanly.
