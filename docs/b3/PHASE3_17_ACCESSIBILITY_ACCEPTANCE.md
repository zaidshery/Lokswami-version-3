# Phase 3.17 Accessibility Acceptance

Status: automated acceptance complete; manual screen-reader and publication-content validation remain required.
Date: 2026-10-07. This report establishes scoped automated evidence, not WCAG certification.

## Provenance and scope

- Correct worktree: `C:/Dev/Lokswami-phase3.17-accessibility`.
- Branch: `b3/phase3.17-accessibility`.
- Starting local and fetched remote SHA: `80c1d827fad88cca4c4fd1315927c78712b219e8`; clean preflight.
- QUARANTINED PATCH NOT APPLIED. Its SHA256 was `854A1E3DEB5F01E4208351AFE5E89C3C2E398A0F6565E08136EA874444B2E8A5`.
- WRONG CHECKOUT NOT MODIFIED FURTHER. The preserved checkout at `C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-version-3` was not reset, unstaged, cleaned, or used for implementation.
- npm resolved `@axe-core/playwright@4.13.0`; its existing axe-core dependency resolves to 4.13.0. No additional accessibility framework.
- Edge headless through existing Playwright, owned local server on port 3017. Only a disposable process-local auth secret; no environment file copied or changed.
- Canonical A–D audit and four existing focused suites were reviewed. A–D were reopened only where fresh rendered evidence demonstrated a failure.
- No publication authority, releasedSnapshot, article/video eligibility, models, CMS schemas, RBAC, or auth boundary logic changed. Auth changes affect colors only.

## Reproduced findings and classifications

Every axe violation retains route, rule, impact, target, node HTML, related nodes, measured colors, and failure summary in the JSON evidence. All confirmed contrast violations below are `color-contrast`, serious impact, classification A (app-owned).

| Surface / owner | Before: rendered foreground / background | Before ratio | Narrow correction | After pair ratio |
| --- | --- | --- | --- | --- |
| Videos selected Feed/Shorts, VideoFilterBar | #ffffff / #ff6257 | 2.94:1 | selected background red-600 (#c61d24) | 5.83:1 |
| Videos Up Next, VideoFeedGrid, light | #ff6b5f / #ffffff | 2.79:1 | light text red-700 (#a8181f); retain dark text | 7.46:1 |
| Auth inactive portal button, light | #71717a / #f4f4f5 | axe 4.39:1 | zinc-600 (#52525b) | 7.03:1 |
| Auth legal footer, light | #a1a1aa / #ffffff | 2.56:1 | zinc-600; preserve dark zinc-400 | 7.73:1 |
| Auth Continue as guest, dark | #c61d24 / #09090b | 3.41:1 | dark red-400 (#fb7185) | 7.39:1 |
| Search populated Trending badge, NewsCard, light | #e72129 / #111827 | axe 3.92:1 | orange-400 (#fb7185), matching existing dark badge | 6.59:1 |

After ratios use the WCAG relative-luminance calculation on the rendered/computed CSS pairs, rounded to two decimals. Axe's displayed before ratios may round down differently. The populated-card fixture records actual foreground rgb(251,113,133) and light background rgb(17,24,39); all four settled fixture scans pass.

Other classification A findings:
- ShareMenu Tab targeted buttons inside CSS-hidden responsive ancestors, leaving focus on body. Visibility now checks the ancestor chain, hidden/inert/aria-hidden, display, and visibility. Two behavioral regressions added.
- EPaperStoryPreview's horizontal scrolling reading toolbar clipped the Fit ring. A component CSS module places the ring and outline inside the scrolling controls; local padding preserves space. All five viewport/theme pairs pass.
- The existing non-modal location recommendation could cover the focused Search sort select at 320, 844 landscape, and 768 widths. PopupFrame now dismisses a recommendation that overlaps the focused background control, including when the popup appears after focus is already established. It does not introduce a modal focus trap or change scheduling, consent, notification, or content behavior. Two behavioral tests and the final browser repeat pass.

Investigated leads:
- Search, Latest, and Category selects already have localized accessible names. No label changes.
- Homepage headline/live-update/dark-surface leads were not reproduced in available settled data. Published homepage/article content is unavailable locally; populated-page acceptance remains DATA-DEPENDENT.
- Some initial Search measurements included fade-in compositing. Settled cards are scanned after animation, without disabling motion or axe rules. The independently reproduced Trending badge failure was corrected.
- Classification D: guessed Shorts slug /latest returned 404; use the real public-feed slug instead. External-frame localStorage initialization caused access-denied errors; initialization is now restricted to localhost. A geometry assertion originally confused horizontal clipping with vertical overflow; corrected by testing each axis separately.
- A one-off initial E-Magazine runtime “Invalid or unexpected token” error had an unknown origin (F); subsequent repeats show no page errors. No application fix or exemption was asserted from that transient error.
- A temporary duplicate CSS import caused HTTP 500 during development; corrected and failed runs preserved. Those results are not acceptance passes.
- B: historical image descriptions, caption files, released clipping/OCR text, and missing authoritative publication/article data remain editorial/data dependencies.
- C: provider-player internals and real remote playback remain external dependencies.
- E: no standards exception applied. No broad rule suppression or selector exclusions.
- Remaining current app-owned P0/P1: none identified in the accepted automated scope. Published content, real provider playback, and manual screen-reader behavior remain unverified.

## Axe route acceptance

Coverage: English/Hindi × light/dark, 1440×900, WCAG 2 A/AA, 2.1 A/AA, 2.2 AA tags. No disableRules and no excluded subtree.
The final route matrix passed 36 scans with four explicit DATA-DEPENDENT article skips after the PopupFrame correction.

| Route | HTTP in accepted matrix | Scan | Initial violation rules per scan | After |
| --- | --- | --- | --- | --- |
| /main | 200, all four cases | yes; local loading/empty shell | 0 | 0 |
| /main/search?q=news | 200, all four | yes | initial baseline 0; later populated light scan 1 contrast rule | 0 |
| /main/latest | 200, all four | yes | 0 | 0 |
| /main/category/lokswami-special | 200, all four; discovered public nav link | yes | 0 | 0 |
| /main/article/[id] | no valid public link available | no | unavailable | DATA-DEPENDENT, four skips; not PASS |
| /main/videos | 200, all four | yes | 1 contrast rule each; multiple failing nodes | 0 |
| /main/shorts/[real public slug] | 200, all four | yes | guessed /latest originally 404, no valid scan | 0 |
| /main/epaper | 200, all four | yes; available shell | 0 | 0 |
| /main/e-magazine | 200, all four | yes; available shell | 0 | 0 |
| /signin | 200, all four | yes | 1 contrast rule each | 0 |

Shorts route was discovered via safe GET `/api/v1/public/shorts?limit=1`: `महाकाल-लोक-उज्जैन-संध्या-आरती-का-विहंगम-दृश्य-shorts-v-short-03`, URL-encoded.
Unavailable routes are recorded explicitly; HTTP ≥400 is never counted as an axe PASS. If a discovered article detail returns 404, its JSON records status and scanExecuted=false and the test annotates DATA-DEPENDENT.

### External iframe handling

All external GET resources are blocked in the deterministic local suite, and non-GET/HEAD browser requests are fulfilled locally to prevent mutations. This is network isolation, not an axe rule exception.
App-owned iframe elements are scanned and their accessible titles asserted:
- Videos: youtube-nocookie.com/embed/jfKfPfyJRdk, title “लोकस्वामी 24x7 LIVE 🔴: देश और मध्य प्रदेश की ताज़ा ख़बरें सीधा स्टूडियो से”.
- Shorts: youtube-nocookie.com/embed/6nSlAy5QwXY, title “महाकाल लोक उज्जैन: संध्या आरती का विहंगम दृश्य #Shorts”.
No proven provider violation was suppressed; no iframe subtree was excluded. Remote player content/playback/captions are not certified by this run.
Axe incomplete results (gradient/image backgrounds, frame coverage, closed-popup ID references) are retained for manual review; absence from violations is not a WCAG claim.

## Keyboard, focus and motion

- A11Y-03: all five component viewports in both themes pass rendered indicator/ancestor-clipping checks on VideoDetailHero, EPaperToolbar, EPaperStoryPreview, StoryImageViewport, and ShareMenu. Explicit live VideoFilterBar, both Shorts directions, and auth portal/account modes pass at 390 and 1440 in both themes. Live controls additionally check elementFromPoint for obscuration. The final strengthened 14-case journey repeat passes.
- Focus palette: rendered light ring #e72129 against white is 4.52:1; rendered dark #fb7185 against #09090b is 7.39:1. The scrolling story toolbar uses an inset indicator so its scrollport cannot cut off the ring.
- A11Y-10: reduced Framer probe reaches x=100 after 100 ms without tweening; no-preference comparison x=22.5354 after 100 ms. Actual toolbar CSS transition 0s vs 0.15s. The real root MotionConfig provider is used; controls remain functional. Essential media playback is not required to vanish.
- A11Y-13: actual ShareMenu in article, video, and publication-toolbar contexts passes Enter-open, ArrowDown/Up, Home/End, Escape-close/restore, Tab-next and Shift+Tab-previous visible enabled control. No modal trap. English/Hindi boundary fallback returns to its trigger. Native clipboard copy and localized polite success feedback pass in the real article component.
- Modal overlays: MobileMenu, QuickArticleSheet, SwipeSettingsSheet, EPaperStoryPreview and author modal tested with native key events for containment and Escape. Trigger restoration tested where the component provides a return trigger. Non-modal ShareMenu and recommendation overlays remain non-modal.
- Existing safe article data renders ArticleDetailClient and NewsCard in memory only. This proves component mechanics; it does not bypass detail-route publication authority.
- Homepage skip link focuses #main-content. Desktop nav ArrowDown opens/focuses the first destination and Escape restores the trigger. Search enters G20 and exposes native category/sort controls and result status. Video controls, Shorts navigation, publication shells, and auth mode switches are exercised without sign-in, publishing, or social sharing.
- No messages sent through social share options. Clipboard checks remain inside the disposable browser context.

## Responsive, reflow, language and live regions

| Viewport | Component focus / overlays, light + dark | Public keyboard / overflow |
| --- | --- | --- |
| 320×800 | PASS | PASS |
| 390×844 | PASS | PASS |
| 844×390 | PASS | PASS |
| 768×1024 | PASS | PASS |
| 1440×900 | PASS | PASS |

No horizontal document overflow in the accepted matrices. 200% CSS zoom/reflow proxy on publication shell passed all five viewport/theme pairs. This is not native browser zoom; actual native 200% zoom is NOT RUN.
The root DOM lang is en/hi respectively and the root dark class follows saved theme across the 36 valid route scans. No reader wrapper forces dark and no global theme/token architecture changed.
DOM evidence records:
- Search: role=status, aria-live=polite, localized result/empty counts.
- Breaking News: localized region label, existing polite atomic hidden update text; unavailable feed does not invent stories.
- Shorts: localized “Story 1 of 3” / “स्टोरी 1/3” and localized polite loading status.
- Publication toolbar fixture: polite atomic page status; actual released-content traversal remains DATA-DEPENDENT.
- Share copy: “Link copied” / “लिंक कॉपी हो गया”, polite live region, successful browser clipboard URL.
These are DOM and keyboard results, not spoken screen-reader results.

## Data and manual acceptance

SCREEN READER MANUAL VALIDATION REQUIRED.
NVDA was not operated. VoiceOver/Safari was not operated; no Apple/Safari environment was used. No screen-reader PASS is asserted.
Released daily E-Paper and monthly E-Magazine traversal, clipping text quality, archive OCR, caption availability, and published article/homepage presentation remain DATA-DEPENDENT. No seed/publish step or CMS/Mongo mutation was performed.
Axe PASS does not establish WCAG compliance or certification.

## A11Y-01 through A11Y-16

| Issue | Code-state disposition / evidence |
| --- | --- |
| 01 Publication headings | CLOSED, A foundation + focused regression + shell axe |
| 02 Shorts pointer alternatives | CLOSED, D implementation + mobile/desktop both-direction browser activation |
| 03 Visible unobscured focus | CLOSED in tested states: final rendered focus and responsive repeats pass after local fixes |
| 04 Homepage heading order | CLOSED, A implementation + focused tests; populated real content DATA-DEPENDENT |
| 05 Root document language | CLOSED, B implementation + English/Hindi browser DOM |
| 06 Programmatic form/select names | CLOSED, B implementation + existing names and route axe |
| 07 Search live result status | CLOSED, B implementation + browser DOM |
| 08 Toggle pressed state | CLOSED, B/D implementation + actual keyboard mode switching |
| 09 Contrast | CLOSED for measured scoped app pairs, settled populated card/auth scans and route axe |
| 10 Reduced motion | CLOSED, actual reduce/no-preference Framer and CSS comparison |
| 11 Localized reader status/name seams | CLOSED, B/D tests + representative browser DOM |
| 12 Rich table naming | CLOSED, C implementation + focused regression |
| 13 ShareMenu non-modal exit | CLOSED, real three-context browser journeys + boundary + regressions |
| 14 Duplicate thumbnail announcements | CLOSED, A implementation + focused regression |
| 15 Touch target controls | CLOSED, D implementation + measured toolbar/Shorts control rectangles |
| 16 Footer heading consistency | CLOSED, A implementation + focused regression |

Code-state closure is separate from manual screen-reader/content/remote-player acceptance.

## Automated gates

| Gate | Result |
| --- | --- |
| Focused regression suites | 19 files / 240 tests PASS |
| Playwright route axe | 36 PASS / 4 explicit DATA-DEPENDENT article skips |
| Playwright mechanics | 18 PASS |
| Playwright populated cards/auth states | 4 PASS; zero violations in 20 state scans |
| Playwright final keyboard/responsive/focus | 14 PASS |
| typecheck | PASS |
| test:ci | PASS: 391 files / 3,225 Vitest tests; auth guards and synthetic admin credentials pass |
| lint:strict | PASS |
| test:security | PASS |
| test:governance | PASS |
| test:auth-guards | PASS: 7 cases |
| test:admin-credentials | PASS: 8 synthetic cases; configured credentials unavailable locally |
| check:phase3-scope | PASS |
| git diff --check | PASS |
| build:ci | PASS: 175 static pages generated |

npm installation reported 50 existing dependency vulnerabilities (34 moderate, 15 high, 1 critical). No broad dependency remediation or npm audit fix was applied. The requested security regression gate remains a separate check.

## Evidence and reproducibility

Task-local evidence root: `C:/Users/Appex/AppData/Local/Temp/phase317e-clean-20261007`.
Per-case JSON retains detailed axe nodes, DOM, iframe names, runtime errors, keyboard focus geometry, overlay behavior, and motion values. Playwright JSON/trace/screenshot outputs are outside the committed patch.
- Initial baseline and after-colors results retain failures, including fixture errors.
- Final route evidence: axe-delivery directory / axe-delivery.json.
- Final keyboard evidence: journeys-delivery directory / journeys-delivery.json.
- Component mechanics: mechanics-accepted directory / mechanics-accepted.json.
- Populated card/auth states: states-probe directory / states-probe.json.
- Final focused result: focused-delivery.json.
- Full gate logs and gate exit/duration index: gates.json.

The component suites require an explicitly provided temporary local route that imports `tests/e2e/fixtures/phase317e-reader`; the QA-only entry point is removed before build/delivery. Do not publish that entry.
Reproduction parameters:
`PLAYWRIGHT_BASE_URL=http://localhost:3017`,
`PHASE317E_FIXTURE_PATH=/phase317e-fixture`,
`PHASE317E_EVIDENCE_DIR=<local evidence directory>`.
Run the four phase317e spec files using existing Playwright and installed Edge. Without an explicitly supplied fixture route, component-only cases annotate DATA-DEPENDENT and skip; they never claim success.

## Delivery guardrails

No page-wide axe suppression. No unproven global theme change. No WCAG certification claim. No screen-reader PASS without a real test.
No PR, merge, deployment, CMS/Mongo/staging/production mutation.
Environment files, next-env.d.ts, analytics/runtime data, temporary QA entry, helper scripts, logs, screenshots and traces are excluded from delivery.
Commit/remote/final status: to be recorded after reviewed intended-file staging and delivery.
Final recommendation: READY FOR PR REVIEW after a clean commit and normal push. Manual screen-reader, published-content, and external-player acceptance remain separate follow-up work.
