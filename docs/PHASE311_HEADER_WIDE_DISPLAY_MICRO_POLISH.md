# Phase 3.11 header micro-polish from current baseline

Starting branch: `b3/phase3.11-homepage-ui-office`.
Starting HEAD: `a374ebbf9bd991e6c0de36d84e839e081a90e4f5`.
Earlier checkpoint `e5ca8110b8f9831120f763710272bfb7d37deb18` is an ancestor (exit 0).

## Changes

- Desktop hamburger: 44px button / 20px icon becomes 48px / 24px, with 2.3 stroke instead of 2. Mobile/tablet retain their 44px / 20px dimensions. Location, labels, keyboard behavior, and drawer implementation remain unchanged.
- Desktop canonical emblem: 44px to 40px. Wordmark: 208px to 186px. Existing 10px gap and intrinsic asset proportions remain unchanged. Combined width falls from 262px to 236px (9.92%). Mobile/tablet logo dimensions remain unchanged.
- Wide composition retains the existing `max-w-page-wide` 86rem (1376px) container, centered inside the edge-to-edge background. No competing container or shared container changes were needed. Logo dimensions stop growing at desktop.

## Local verification

- Five focused header/navigation Vitest files: 47 tests passed.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint:strict`: passed.
- Changed-file ESLint: Header, Logo, and browser script passed with zero warnings. Including the test file exposes its pre-existing `@typescript-eslint/no-explicit-any` warning at the session mock; it was not introduced by this patch.
- `git diff --check`: passed.
- Edge browser QA: 28 matrix cases passed (Hindi/English, light/dark, 390/768/1280/1440/1920/2560/3840px), plus mobile keyboard language switching, drawer Escape, language persistence after reload, and JavaScript-disabled header layers.
- Matrix checks cover centered inner content, edge-to-edge background, loaded canonical proportional assets, target desktop sizes, drawer interaction, single-row controls, overlap/overflow, category navigation, More focus restoration, sticky stability, and body clearance.
- Screenshots reviewed at 390, 768, 1440, and 3840px. Local artifacts: `artifacts/phase3-qa/phase311-header-wide/report.json` and accompanying screenshots.

| Viewport | Inner container | Desktop emblem / wordmark | Button / icon |
| --- | --- | --- | --- |
| 1280 | 1280px | 40px / 186px | 48px / 24px |
| 1440 | 1376px centered | 40px / 186px | 48px / 24px |
| 1920 | 1376px centered | 40px / 186px | 48px / 24px |
| 2560 | 1376px centered | 40px / 186px | 48px / 24px |
| 3840 | 1376px centered | 40px / 186px | 48px / 24px |

The isolated QA source copy used a separate local server without production environment files. No browser JavaScript exceptions occurred. Console errors included blocked network resources and API 500 responses in that environment; this is focused header acceptance, not clean whole-app or production acceptance. No production build/deployment was performed.

## Scope preservation

Breaking/LIVE, E-Paper, language controls, Search, Sign In/account, Theme, category navigation, More, sticky implementation, homepage body, SEO, GTM, and backend remain unchanged. The right-side action/category source block matches the starting checkpoint. `ReaderHeaderContainer.tsx` and PR #20 protected files are untouched.

`next-env.d.ts` remains preserved and unstaged; SHA256 before/after: `376F0D33F4341A2B83AA11C2B284653B7CB10C979A91EAE0A491CBC23E4675FE`.

Changed files: `components/layout/Header.tsx`, `components/layout/Logo.tsx`, `tests/header-responsive-contract.test.tsx`, `scripts/phase3/phase311-header-browser-qa.cjs`, and this report.

One new local commit is authorized: `fix(home): tune header scale for wide displays`. No push, merge, amend, or production mutations.
