# Phase 3.11 office checkpoint 3

Branch: `b3/phase3.11-homepage-ui-office`.
Starting HEAD: `09f841146740df9d9bd0d8161ea42f1f276ab6f4`.
One local commit is authorized; no push, merge, PR or production mutation.

## Shared header

The existing reader shell already stacks BreakingNews and Header in one sticky
container. This checkpoint extends those components rather than creating a
parallel header. All normal reader breakpoints now show the same three layers:

1. Compact red live bar, existing published breaking feed and opt-in voice
   controller. Empty/loading states preserve height and supply honest text.
   No fabricated headlines or autoplay. Decorative repeated links are excluded
   from keyboard traversal; existing hover/focus and reduced-motion rules remain.
2. One brand/action row: menu plus real Lokswami wordmark on the left; E-Paper,
   HI/EN and search on the right at every width. Existing desktop account/theme
   actions remain. Menu/search retain 44px touch targets; narrow language controls
   remain 44px high and 28px wide, expanding at the small breakpoint. Initial
   language/theme output is hydration-safe without hiding the structural rows.
3. One horizontal category bar: fixed row height, active route indication,
   native local horizontal scrolling and the existing accessible More portal.
   No global gesture capture. More closes on Escape and restores trigger focus.

The header uses fixed responsive heights and transitions colors rather than
control widths. The same supported anchors render before hydration. Existing
drawer, fullscreen/immersive-reader exceptions and homepage modules remain.
No reader shell, homepage content or publication backend is changed.

Supported primary destinations: Home `/main`; Regional
`/main/category/regional`; Video `/main/videos`; E-Paper `/main/epaper`;
E-Magazine `/main/e-magazine`; Politics `/main/category/politics`; National
`/main/category/national`; International `/main/category/international`; Sports
`/main/category/sports`; Entertainment `/main/category/entertainment`; Tech
`/main/category/technology`; Business `/main/category/business`; Election
`/main/elections`; More exposes Latest News `/main/latest`, Digital Newsroom
`/main/digital-newsroom` and Contact `/main/contact`. Search uses `/main/search`.

Unsupported destinations remain absent: MP, Chhattisgarh, Rajasthan,
Maharashtra, Uttar Pradesh, Kisan, Jobs, Sarkari Yojana, Dharm & Jyotish,
Lokswami Special. Canonical taxonomy and real published inventory remain future
work documented in checkpoint 2; no placeholder routes were introduced.

## Verification

- Focused: seven files / 49 tests passed after the responsive/hydration fixes.
- Broader homepage/reader: eight files / 53 tests passed.
- Typecheck passed; strict server lint passed; changed UI/script ESLint passed
  with zero warnings. Diff whitespace checks passed.
- Browser: Edge, 320/390/768/1024/1440px, Hindi/English, light/dark: all 20
  structure cases passed. Three layers visible, controls inside viewport,
  no brand overlap, no horizontal page overflow, category scrolling, active
  Home and More/Escape focus checks passed. Drawer Escape, persisted-language
  reload and all three layers with JavaScript disabled also passed.
- No JavaScript page errors in the final run. This is not clean whole-app QA:
  external resource requests were sandbox-blocked, and existing fallback API
  requests returned 500 without MongoDB configuration. Real local fallback
  content was used; there is no populated published article/breaking inventory.
  No fixtures were injected into the app and no Atlas bypass or seeding occurred.
- Browser evidence: `artifacts/phase3-qa/phase311-header/report.json` and 20
  screenshots. Reproduce with `node scripts/phase3/phase311-header-browser-qa.cjs
  http://localhost:3112` against an isolated local app.
- No new production build was run for this UI-only local checkpoint. This is not
  deployment acceptance; checkpoint 2 separately recorded its isolated build.

The original workspace dev server was preserved. Browser QA used an owned
temporary source/dependency copy on port 3112; its generated Next files are
separate. The original `next-env.d.ts` remains unstaged/uncommitted with SHA256
`376F0D33F4341A2B83AA11C2B284653B7CB10C979A91EAE0A491CBC23E4675FE`.
All PR #20 protected files and PDF/OCR/publication/processing backends: NONE
touched. Production mutations: 0.

## Intended files

- `components/layout/Header.tsx`
- `components/layout/DesktopNav.tsx`
- `components/ui/BreakingNews.tsx`
- `tests/header-responsive-contract.test.tsx`
- `tests/navigation-mobile-refactor.test.tsx`
- `tests/breaking-news-empty-feed.test.tsx`
- `tests/breaking-news-header.test.tsx`
- `scripts/phase3/phase311-header-browser-qa.cjs`
- `docs/PHASE311_RESPONSIVE_HEADER_CHECKPOINT3.md`
