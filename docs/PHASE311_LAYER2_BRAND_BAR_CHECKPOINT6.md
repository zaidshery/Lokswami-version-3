# Phase 3.11 office checkpoint 6

Branch: `b3/phase3.11-homepage-ui-office`.
Starting HEAD: `e5ca8110b8f9831120f763710272bfb7d37deb18`.
One local commit: `fix(home): refine mobile brand action bar`.
No push, merge, reset or previous-commit rewrite.

## Layer 1 restoration and Layer 3 freeze

Only `components/ui/BreakingNews.tsx` and `BreakingNews.module.css` were restored
to checkpoint 4 (`5b1589b01f2dd0ce6eee6aca8ca59ae15578321d`). A Git comparison
against that commit is empty for both files. This restores the preferred LIVE
badge, pulse, red gradient/shadow and previous inner Container presentation.
Existing publication/feed, audio, empty-state and accessibility behavior is
unchanged. The shared ReaderHeaderContainer itself was not modified.

The entire category-bar block in Header was compared with starting HEAD and is
unchanged. DesktopNav, category order/routes/spacing, native scroll, active
underline and More behavior remain frozen. No homepage body changes.

## Layer 2

Header now uses the complete existing `Logo` composition with canonical
`LogoIcon` (`logo-header-cutout.png`, 572px square) and `LogoWordmark`
(`logo-wordmark-final.png`, 847 x 181). An opt-in responsive header mode sets
icon/wordmark dimensions and gaps together. Other Logo placements retain their
existing behavior. The header composition does not animate in or float, and
both elements render before hydration. Wordmark preserves intrinsic proportions;
emblem remains square, with no cropping or asset enlargement.

| Viewport | Emblem | Wordmark |
| --- | --- | --- |
| 320 | 28px | 88px |
| 360 | 32px | 100px |
| 390, 414, 430 | 32px | 112px |
| 768 | 46px | 172px |
| 1024, 1440 | 44px | 208px |

Mobile retains the 56px brand row and 44px menu/search targets. E-Paper is one
42px-wide, 44px-high action, Newspaper icon above the small `ePaper` label,
brand-red accent, accessible name E-Paper and existing `/main/epaper` href.
Language uses matching icon/label composition: Lucide Languages above current
HI/EN, one 42px-wide/44px-high button, existing two-way store toggle, descriptive
accessible name and pressed state for English. Search is a quiet 44px icon-only
action with the existing route and focus behavior. Mobile controls share a quiet
surface, icon weight, height and focus treatment rather than separate large
button shapes. Account/theme remain discoverable in the unchanged drawer.

Tablet/desktop retain horizontal icon/text E-Paper and segmented language.
Desktop account/theme controls remain. The natural left identity group and
bounded right actions fit 320px without absolute logo centering, overlap,
clipping, wrapping or document overflow. Dark/light wordmark treatment is reused.

## Verification

- Focused: five files / 22 tests passed. Final Layer 2 state assertion rerun:
  14 tests passed in the updated responsive-header contract file.
- Broader header/navigation: three files / 30 tests passed.
- Typecheck, strict server lint, changed-file ESLint with zero warnings and diff
  whitespace checks passed. Existing Vite configuration warning remains.
- Edge: all eight exact widths (320/360/390/414/430/768/1024/1440), Hindi/English,
  light/dark. All 32 cases passed. Loaded canonical emblem and proportional
  wordmark, mobile icon/label visibility, one-row controls, no overlap, no
  document overflow and expected header/body/sticky behavior verified.
- Category navigation visibility/scroll/active/More focus behavior still passes.
  Mobile language keyboard switching, persisted-language reload, drawer Escape
  and three-layer SSR without JavaScript pass; no JavaScript page errors.
- Screenshots captured at all widths/themes/languages; 320px light and 1440px
  dark inspected visually. Layer 1 source restoration and Layer 3 source freeze
  verified independently of screenshot geometry.
- Evidence: `artifacts/phase3-qa/phase311-layer2/report.json` and 32 screenshots.
  Reproduce with `node scripts/phase3/phase311-header-browser-qa.cjs
  http://localhost:3112` against the isolated local app.
- Whole-app console is not clean: sandbox-blocked external resources and existing
  fallback API 500s remain without MongoDB. Real local stored media was used;
  published article/breaking inventory is empty. No headline fabrication,
  injected app fixtures, seeding or network bypass. No production build/deploy
  was run for this UI-only local checkpoint.

QA used the owned temporary source/dependency copy on port 3112; the workspace
server was preserved. `next-env.d.ts` remains exactly preserved and unstaged,
SHA256 `376F0D33F4341A2B83AA11C2B284653B7CB10C979A91EAE0A491CBC23E4675FE`.
Homepage body, category implementation and PR #20 protected backend: NONE
touched. Production mutations: 0.

## Intended files

- `components/layout/Header.tsx`
- `components/layout/Logo.tsx`
- `components/ui/BreakingNews.tsx` (checkpoint 4 restoration only)
- `components/ui/BreakingNews.module.css` (checkpoint 4 restoration only)
- `tests/header-responsive-contract.test.tsx`
- `scripts/phase3/phase311-header-browser-qa.cjs`
- `docs/PHASE311_LAYER2_BRAND_BAR_CHECKPOINT6.md`
