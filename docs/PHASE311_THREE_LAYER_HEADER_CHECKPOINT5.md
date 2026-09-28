# Phase 3.11 office checkpoint 5

Branch: `b3/phase3.11-homepage-ui-office`.
Starting HEAD: `5b1589b01f2dd0ce6eee6aca8ca59ae15578321d`.
One local commit: `fix(home): finalize three-layer reader navigation`.
No push, merge, previous-commit rewrite or production mutation.

## Final header

All three rows use `ReaderHeaderContainer`: the existing wide editorial maximum
width, centered, with identical padding (8px on phones, 20px at small widths,
24px at large widths, 32px at extra-large widths). Outer backgrounds are full
viewport width; no negative margins or translations. The 8px narrow padding
preserves the proven 320px toolbar fit. Desktop inner alignment matches the wide
editorial grid rather than three unrelated offsets.

1. Breaking: solid slim red strip, compact white LIVE badge, published update
   ticker and existing opt-in mute/voice control. Removed badge glow/pulse and
   oversized strip shadows. Loading/empty text truncates locally and never wraps
   into a second row. Existing publication filtering, headline links, queue,
   reduced-motion and keyboard behavior remain. No fabricated headline.
2. Brand: canonical `LogoWordmark` / `logo-wordmark-final.png`, intrinsic 847:181
   ratio. Phone widths 120/136/144px, tablet 172px, desktop 208px. Menu and search
   remain 44px; mobile E-Paper icon and single language toggle remain 40px.
   Tablet/desktop retain icon/text E-Paper and segmented language. Account/theme
   remain in the drawer on mobile and directly available on desktop. Initial
   language/theme rendering remains hydration-safe. Removed the outer header
   shadow/backdrop treatment for a cleaner row hierarchy.
3. Category: unchanged supported order: Home, Regional, Video, E-Paper,
   E-Magazine, Politics, National, International, Sports, Entertainment, Tech,
   Business, Election, More. Single visible row, active underline/aria-current,
   native local horizontal scrolling with contained overscroll. First item is
   fully reachable, and More remains reachable at the end; Escape restores
   focus. No custom drag, global touch interception or fake destinations.

Heights remain 36/40px live, 56/64px brand and 44px category. The existing reader
layout owns one sticky wrapper. It was inspected and preserved; no additional
sticky layer, spacer or homepage body integration was introduced.

## Evidence

- Focused header/navigation: four files / 21 tests passed.
- Broader navigation/reader shell/logo: four files / 31 tests passed.
- Typecheck, strict server lint, changed-file ESLint with zero warnings and diff
  whitespace checks passed. Existing Vite configuration warning remains.
- Edge: 320, 360, 390, 414, 430, 768, 1024, 1440px; Hindi and English, light and
  dark. All 32 cases passed. Each checks three visible layers, canonical loaded
  proportional logo, controls inside viewport/on one row, no overlap, nav on one
  row, first item reachable, last More reachable, active Home, local scrolling,
  aligned inner widths/padding, edge-to-edge outer backgrounds and no document
  horizontal overflow.
- Each browser case checks initial body clearance and the unchanged header
  height/top position after scrolling 400px. Sticky stability passed throughout.
  Mobile language keyboard activation, persisted-language reload, drawer Escape
  and all three layers with JavaScript disabled also passed.
- No JavaScript page errors. Screenshots at all eight widths in both languages
  and themes; 320px light and 1440px dark inspected visually.
- Evidence: `artifacts/phase3-qa/phase311-header-final/report.json` and 32
  screenshots. Reproduce with
  `node scripts/phase3/phase311-header-browser-qa.cjs http://localhost:3112`.
- Whole-app console is not clean: sandbox-blocked external requests and existing
  fallback API 500s remain without MongoDB configuration. Real local fallback
  content was used; published article/breaking inventory is empty. No fixture
  injection, content seeding or network bypass. This is header acceptance, not
  populated staging or production acceptance.
- No production build was run for this local header-only checkpoint; there are
  no environment, backend or deployment changes.

QA used the owned temporary source/dependency copy on port 3112; the original
workspace server is preserved. `next-env.d.ts` remains exactly preserved and
unstaged/uncommitted, SHA256
`376F0D33F4341A2B83AA11C2B284653B7CB10C979A91EAE0A491CBC23E4675FE`.
Homepage body files: NONE. PR #20 protected backend files: NONE. OCR/PDF,
publication workflow, SEO category pages and GTM: NONE touched.
Production mutations: 0.

## Intended files

- `components/layout/Header.tsx`
- `components/layout/ReaderHeaderContainer.tsx`
- `components/ui/BreakingNews.tsx`
- `components/ui/BreakingNews.module.css`
- `tests/header-responsive-contract.test.tsx`
- `scripts/phase3/phase311-header-browser-qa.cjs`
- `docs/PHASE311_THREE_LAYER_HEADER_CHECKPOINT5.md`
