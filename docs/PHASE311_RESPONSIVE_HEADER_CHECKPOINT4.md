# Phase 3.11 office checkpoint 4

Branch: `b3/phase3.11-homepage-ui-office`.
Starting HEAD: `cc33d9900d49d13fc3e6eddd0879b83b5e84c51e`.
One local commit only: `fix(home): polish responsive reader header`.
No push, merge, amend, PR or production mutation.

## Canonical logo evidence

`LogoWordmark` in `components/layout/Logo.tsx` already uses
`/logo-wordmark-final.png`: 847 x 181 pixels, ratio 4.6796:1. The legacy
`Lokswami Logo.jpeg` has the same dimensions. Other existing assets include the
572px square emblem/header/icon variants, 512px app marks and the 1536 x 1024
red-tab/AI compositions; none replaces the wordmark in this checkpoint.

The wordmark artwork was inspected visually. Existing standard rendering is
black in light theme; the existing dark brightness/invert treatment makes it
white in dark theme. No new artwork or text logo is introduced.

Checkpoint 3 constrained a desktop-sized image box to a 76px link at 320px,
making the logo unnecessarily small. Header now reuses `LogoWordmark` with an
opt-in responsive presentation: natural asset width/height attributes, automatic
image height, no crop, no stretch, non-shrinking frame and fixed responsive
width. Other Logo/LogoWordmark placements keep their existing sizing behavior.
Only an unused pre-existing icon variant binding was removed for zero-warning
lint; the supported public prop remains.

| Viewport | Wordmark width | Measured height | Header QA |
| --- | --- | --- | --- |
| 320 | 120px | 25.64px | PASS |
| 360 | 136px | 29.06px | PASS |
| 390 | 144px | 30.77px | PASS |
| 414 | 144px | 30.77px | PASS |
| 430 | 144px | 30.77px | PASS |
| 768 | 172px | 36.75px | PASS |
| 1024 | 208px | 44.44px | PASS |
| 1440 | 208px | 44.44px | PASS |

## Mobile actions and shared rows

Below 768px, the left side holds menu and wordmark. The right side holds the
existing Newspaper icon link (40px, accessible name E-Paper), one 40px language
button showing the current HI/EN state, and the existing 44px search icon link.
The language button toggles the existing store in both directions and supports
keyboard activation; its accessible name includes the current language and the
next action. No oversized red text pill or two desktop language buttons is
visible on mobile. Tablet/desktop retain the red icon/text E-Paper CTA and
segmented language controls. Desktop account/theme controls and the existing
drawer account/appearance functions remain available.

The flex rows use bounded non-shrinking logo/actions and responsive spacing,
without negative margins or forced wrapping. All three outer backgrounds remain
edge-to-edge. The compact red live layer and honest empty state are preserved.
Brand row remains the largest layer. Category strip remains visible, single-row,
locally scrollable, keyboard reachable and marked with an active underline.
Supported destinations and More contents are unchanged; unsupported state/topic
routes remain absent. No homepage section or publication backend changes.

## Verification and limits

- Focused: eight files / 52 tests passed.
- Broader homepage/reader: eight files / 53 tests passed.
- Typecheck, strict server lint, changed-file ESLint with zero warnings, and diff
  whitespace checks passed.
- Edge browser: all eight exact widths in both languages and both themes;
  all 32 geometry/structure cases passed. Real wordmark loaded, aspect ratio
  preserved, logo readable, controls on one row, no overlap, all three layer
  backgrounds start at x=0 and span viewport width, no document horizontal
  overflow. Category scrolling, active Home and More/Escape focus passed.
- Mobile language keyboard toggling in both directions, persisted-language
  reload, drawer Escape and all three SSR layers with JavaScript disabled passed.
  No JavaScript page errors in the final run.
- Screenshots captured at every width/language/theme combination. Visual
  inspection included 320px light, 390px dark, 768px light and 1440px dark.
- Evidence: `artifacts/phase3-qa/phase311-header-polish/report.json` and 32
  screenshots; reproducible local script:
  `node scripts/phase3/phase311-header-browser-qa.cjs http://localhost:3112`.
- Whole-app console is not clean: existing external resource requests were
  sandbox-blocked and fallback API requests returned 500 without MongoDB.
  Local stored media was available but published article/breaking inventory was
  empty. No fake headlines, injected app fixtures, seeding or Atlas bypass.
  This is header polish acceptance, not populated/live-production acceptance.
- No production build was run for this local UI-only checkpoint; no deployment
  or environment requirement changes.

QA ran in the owned temporary source/dependency copy on port 3112. The original
workspace server is preserved. Original `next-env.d.ts` is preserved exactly,
unstaged/uncommitted, SHA256:
`376F0D33F4341A2B83AA11C2B284653B7CB10C979A91EAE0A491CBC23E4675FE`.
All PR #20 protected files and OCR/PDF/revision/publication processing: NONE
touched. Production mutations: 0.

## Intended files

- `components/layout/Header.tsx`
- `components/layout/Logo.tsx`
- `tests/header-responsive-contract.test.tsx`
- `tests/navigation-mobile-refactor.test.tsx`
- `scripts/phase3/phase311-header-browser-qa.cjs`
- `docs/PHASE311_RESPONSIVE_HEADER_CHECKPOINT4.md`
