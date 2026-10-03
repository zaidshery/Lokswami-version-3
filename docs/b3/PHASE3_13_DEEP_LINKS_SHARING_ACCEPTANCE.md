# Phase 3.13 — Public deep links, sharing and social previews

Baseline: `0f6b4e3075072c1faebc3a19f746f88b2064fc4d` (HOME, `b3/foundation`).
This local slice implements **3.13A only**. B/C/D are future acceptance requirements.

## A1 — Source inventory and URL contract

| Content | Current public route / canonical | Legacy route | Redirect behavior | Source / authority |
| --- | --- | --- | --- | --- |
| Homepage | `/main` | `/` | 307 to `/main` | marketing page; main page |
| Article | `/main/article/<current-slug>`; ID fallback for slugless records | `/article/<id-or-token>`; previous slug or ID at reader path | 308, one hop to current authority; preserve public query parameters, remove Next internal parameters | articleSeo; publicArticleService; article page; middleware |
| Short article bridge | canonical article above | `/a/<id-or-token>` | Existing HTTP 200 preview bridge with client replacement/meta refresh; missing token reaches reader 404 | app/a/[id] |
| Categories and states | `/main/category/<taxonomy-slug>` | top-level category aliases below | Existing aliases are 307; known taxonomy aliases at category path normalize to taxonomy authority | newsCategories; category page/layout |
| Standard video | `/main/videos?video=<id>` | No dedicated legacy video route | Exact eligible video selected; missing/unavailable selection falls back to hub | readerContentPaths; videos page; publicVideos/videoPublication |
| Short/swipe video | `/main/shorts/<slug>` | `/main/videos?video=<id>` remains compatible | Swipe route requires beta flag and eligible exact story; missing/disabled is 404 | readerContentPaths; shorts page; publicSwipeFeed |
| E-Paper archive / issue | `/main/epaper`; issue query `paper`, `city`, `date`, optional `page`, `story` | `/epaper`; `/e/<paper>?p=<page>&s=<story>` | `/epaper` 307; `/e` existing 200 client/meta-refresh bridge | EPaperPageServer/Client; epaperPublication; app/e |
| E-Magazine archive / issue | `/main/e-magazine`; `paper`, `month=YYYY-MM`, optional `page`, `story` | No magazine short bridge | Monthly global issue; no daily city/date semantics | shared publicationType/base-path seam |
| Public author | `/main/author/<id>` | None | Existing author lookup and not-found behavior; published articles only | author page |
| Latest news | `/main/latest` | `/news`, `/main/news` | 307 | reader pages |
| Search | `/main/search?q=<search>` | None | Existing search; query is functional, not a new language route | search page/client |
| Account/preferences/saved | `/main/account`, `/main/preferences`, `/main/saved` | `/profile` to account (307) | Existing signed-in guards; not content share targets | middleware; routeGuards |
| Other reader pages | `/main/ftaftaf`, `/main/elections`, `/main/digital-newsroom`, `/main/about`, `/main/contact`, `/main/advertise`, `/main/careers`, `/main/privacy`, `/main/terms`, `/main/cookies`, `/main/disclaimer`, `/main/sitemap` | marketing aliases for about/contact/advertise/careers; `/digital-newsroom` | Marketing aliases use 307; digital-newsroom remains a direct render of the shared page | app/(reader)/main; app/(marketing) |

Taxonomy slugs (source: `READER_CATEGORIES`): regional, politics, national,
international, sports, entertainment, technology, business, crime, madhya-pradesh,
maharashtra, rajasthan, uttar-pradesh, gujarat, lokswami-special, kisaan, jobs,
sarkari-yojana, dharm-jyotish. Labels and navigation order remain unchanged.
Known aliases resolve using the existing taxonomy, including Tech → technology,
MP → madhya-pradesh. Unknown categories keep the existing empty/noindex reader
behavior; the known-category helper returns an empty path instead of inventing slugs.

Legacy top-level routes: `/business`, `/sports`, `/entertainment`, `/technology`
redirect to corresponding category paths. `/world`, `/education`, `/health`,
`/lifestyle`, `/science` redirect to existing category paths with those literal
tokens; they are not added to the editorial taxonomy in this slice.

### A2–A7 acceptance

- Extend existing articleSeo, newsCategories and readerContentPaths helpers;
  no second resolver or persistence system. Paths are relative by default.
- Valid article slugs follow existing Unicode letters/marks/numbers and hyphen
  rules. IDs are trimmed and encoded as one segment. Missing identity produces
  no article link. Path separators/control characters cannot become identifiers.
- Published article authority, historical aliases and ID resolution stay with
  publicArticleService. Draft, rejected, scheduled-not-due, unpublished and
  future-published records never resolve publicly in Mongo or file-store mode.
  Missing articles produce 404; ambiguity/unavailability fail closed.
- Query parameters do not create article authority. Article redirect preserves
  public parameters (including tracking/language if supplied) and strips internal
  Next transport keys. Hindi/English uses the existing client preference; no locale
  prefix or translated slug is introduced.
- Video paths encode the exact ID/slug. Public-video eligibility applies to direct
  selection as well as feed selection; private/future videos cannot bypass it.
- Publication path generation reuses publicationType and publicBasePath. E-Paper
  is daily/city based; magazine uses month and ignores daily city/date dimensions.
  `paper` identifies the exact issue; date/month/city are existing archive filters.
  Existing page/story query support is preserved; no hotspot UI is added.
- Unpublished/unreleased publications and stories remain excluded by existing
  publication services. Missing issue selection keeps current archive behavior.
- Reuse `NEXT_PUBLIC_SITE_URL`/getSiteUrl for configured public origin. Explicit
  local, staging and production HTTP(S) origins normalize to origin only; no
  credentials or arbitrary absolute destination is accepted by public-path joining.
  Existing production localhost guard and production fallback remain. Deployment
  must configure its public reader origin, never the CMS/internal host.
- High-confidence UI, existing share URL sources and sitemap generation consume
  the same helpers. Do not expand sitemap content coverage. No draft/future/admin
  entries, duplicate legacy article authority or redirect loops.
- No redesign, dependency upgrade, production/staging mutation, push, PR, merge
  or deployment. Protected runtime/data/env/QA files are excluded from commits.

## 3.13B — Universal Share (future; not implemented here)

- Native Web Share API when available; WhatsApp, Facebook, X, Telegram and Copy
  Link share the resolved canonical public URL.
- Desktop/mobile fallback remains usable when native sharing is unavailable,
  cancelled or fails; copy provides feedback and accessible controls.
- Never share CMS/admin URLs, legacy preview bridges or internal hostnames.
- Preserve exact article/video/publication selection and existing language semantics.

## 3.13C — OG/social preview and SEO (future; not implemented here)

- Canonical metadata and OG URL match the public URL contract and sitemap.
- OG title/description/image and Twitter/X card identify exact content; locale
  matches content language. Article hero/SEO image and video poster/thumbnail
  selection have an approved branded fallback.
- E-Paper previews identify issue/city/date/page; magazine previews identify
  monthly issue/month/year/page without daily publication assumptions.
- Preview bridges/search/account and missing/private content use appropriate
  noindex rules. Draft/future/unpublished records are excluded from index and
  preview lookup. Validate crawler-visible metadata and reachable image assets.

## 3.13D — QA/hardening and PR (future acceptance)

- Browser checks on desktop/mobile and Hindi/English cover direct load, refresh,
  copied path, article click, exact video/short and publication issue links.
- Verify redirect status/destination, one-hop legacy article redirects, no loops,
  missing/private/future behavior and no 500s or broken historical links.
- Check canonical/metadata/social URL/sitemap consistency, encoding, origin safety,
  open redirects, language and Mongo/file-store parity.
- Run focused tests before typecheck/lint and relevant Homepage 3.11 / Reader 3.12
  regressions; run build:ci before considering deployment-sensitive work complete.
- Later PR requires CI on the exact reviewed HEAD, scope/security review and final
  owner review. This local A slice stops before remote operations and B/C/D work.

## 3.13A local implementation and evidence — 3 October 2026

### Baseline and isolation

- Initial only modification: next-env.d.ts route types `.next/types/routes.d.ts`
  → `.next-dev/types/routes.d.ts`. Verified generated-only and restored just that
  file. Fetch confirmed local and remote foundation at the baseline above.
- Baseline Homepage: `/` → 307 `/main` → 200; Top Package/navigation and 14
  sections visible. Reader headline, metadata, content and share controls visible;
  no browser page errors.
- Published Reader used: `/main/article/bhopal-digital-arrest-35-lakh-cyber-fraud`.
  Legacy `/article/6ab83cdf64b786a3b089c23b` → 308 to that path → 200.
- Development automation worker disabled. Dev servers stopped after checks.
- Branch: `b3/phase3.13-deep-links-sharing`; worktree:
  `C:\Dev\Lokswami-phase3.13-deep-links-sharing`. Starting SHA equals baseline.
  Foundation checkout remains clean. Existing installed dependencies reused
  through a local ignored junction; no dependency or environment-source changes.

### Implemented contract

- `readerContentPaths` is the public helper entry point, re-exporting the existing
  article/category authorities and adding publication path/URL builders.
  `publicUrl` supplies token encoding, origin normalization and safe public-path
  joining. Existing getSiteUrl import locations remain compatible.
- Article resolver and permanent legacy redirects are reused; malformed path
  identity produces no link. Existing article share sources now use current
  reader authority. Historical `/a` and `/e` bridges remain accessible.
- Category aliases normalize to existing taxonomy slugs with one 308 redirect;
  canonical categories render directly. Invalid percent encoding returns 404 in
  page and metadata. Unknown categories retain empty/noindex behavior.
- Standard videos use exact `video` query selection; Swipe uses exact encoded
  slug paths in metadata, history, analytics and existing share source. Direct
  video lookup now uses the feed publication predicate in both stores and cannot
  resurrect an authoritative private/missing Mongo video from a stale file copy.
- Publication links reuse monthly/daily and base-path seams. Existing magazine
  share sources now point to `/main/e-magazine`, preserving exact paper/page/story
  selection. No new share controls, cards or OG images were implemented.
- Homepage publication cards, public city taxonomy, publication service hrefs,
  existing metadata URL construction and E-Paper sitemap entries share helpers.
  Sitemap article authority remains the existing public service. The duplicate
  redirecting root Homepage entry was removed; content coverage was not expanded.

### Validation

- Final combined suite: **38 files, 436 tests passed**. Covers new public deep
  links, direct-video eligibility and category routes; existing article URL and
  redirect governance; share bridges; reader metadata and video sitemap;
  Homepage discovery/category file reuse/navigation/selection/Top Package;
  Reader SSR/actions/header/related stories; sitemap pagination/SEO indexing;
  public article/video/publication eligibility; publication API fallback; CMS
  system-category protection and reader navigation.
- New files: `tests/public-deep-links.test.ts`,
  `tests/public-video-deep-link-eligibility.test.ts`,
  `tests/category-deep-link-route.test.tsx`.
- Typecheck and lint:strict pass. All changed files except the E-Paper client
  pass zero-warning ESLint. That client has 65 existing unused-variable warnings;
  exact baseline/current message comparison confirms no additions and zero errors.
- Desktop 1440px and mobile 390px: article click/direct load/refresh/copy-path
  equivalent navigation pass; legacy ID, reader ID and trailing slash redirect
  once with 308 to the same canonical 200 page. Normal/state categories and Tech
  alias pass. Hindi/English preference retains the same URL; no mobile overflow.
- Exact video `6ab840b464b786a3b089c3c3` returns 200. E-Paper issue
  `6ab7c5ca12e417f446b53cbf` and magazine issue `6ab8421f64b786a3b089c440`
  with `paper`/`page=1` return 200. Missing article returns 404. No page errors,
  redirect loops or 500s. Short paths and beta eligibility have focused coverage;
  no separate live Short was required by the minimum browser matrix.
- build:ci exits 0: compilation and all 175 static pages complete. Existing
  no-Mongo build fallback exercised. Windows warns when tracing tries to create
  a standalone node_modules symlink from the reused dependency junction; the
  standalone deployment package was not validated or deployed in this slice.
- Local review covers duplicate construction, canonical/ID/slug alignment,
  encoding, origin/open-redirect safety, visibility, store parity, language and
  sitemap duplication. Protected runtime/data/env/QA files are not committed.
- Smoke-harness incident: the first pass allowed automatic web-vitals analytics
  beacons during navigation on the staging-backed local server. No editorial
  content/publication writes were made. Subsequent pass suppresses sendBeacon,
  blocks service workers and intercepts writes at context scope (10 blocked).
  No remote analytics cleanup was attempted.
- No push, PR, merge or deployment. B/C/D implementation remains deferred.

## 3.13A Short identity correction + 3.13B local evidence

### Starting state and isolated repair

- Starting HEAD: `0a599a5cb5049a4c70b84655f915424133a461e7` on
  `b3/phase3.13-deep-links-sharing`. The intentional unfinished B diff consisted
  of 13 modified files and two new files; it was preserved without reset,
  checkout, stash, amendment or blanket staging.
- Separate repair commit: `77b41cde366116d40ea155e0116b08901107e14a`,
  `fix(video): use canonical short slug in feed links`. Only
  `components/ui/VideoShortsFeed.tsx`, `components/video/types.ts` and
  `tests/video-shorts-canonical-identity.test.tsx` were staged. B remained intact.
- The two defective feed calls at lines 625 and 668 supplied `(id, title)`.
  Both now supply `(id, slug)`. The public video adapter preserves its optional
  authoritative slug rather than dropping it. Feed publication eligibility is
  unchanged. No title-to-slug conversion was added to the UI.
- Five new regression cases failed before the repair and passed afterward:
  distinct Hindi/English title and slug, encoded Hindi slug, missing slug and
  adapter preservation. Missing slug uses the existing exact video-ID fallback.
- The previously failing article SSR test passed on the first resumed run.
  The exact previous broader collection then passed: **44 files / 460 tests**.
  Repair/deep-link coverage passed: **9 files / 70 tests**.

### Video/Short route call-site audit

| Source | Identity supplied | Destination / action |
|---|---|---|
| VideoShortsFeed active share | `activeVideo.id, activeVideo.slug` | Fix title argument; exact Short or ID fallback |
| VideoShortsFeed card link | `video.id, video.slug` | Same fix and fallback |
| HomeShortsSection | `short.id, short.slug` | Already correct; retained |
| HomeVideosSection | `video.id` | Exact standard video ID; retained |
| VideosPageClient share | `selectedVideo.id` | Exact current video ID; added B integration |
| Video sitemap | ID, slug only for Short | Already correct; retained |
| Video metadata | `videoId` | Standard video ID; retained |
| Short metadata | `slug` | Canonical Short slug; retained |
| SwipeFeed history and previous/next selection | active item slug | Existing history helper retained |
| SwipeFeed share and analytics hook | active item slug | Shared menu; existing anonymous analytics hook retained |

All production `buildVideoReaderPath` and `buildSwipeReaderPath` calls were
inspected. None supplies a title as the canonical slug after this correction.

### Share architecture before and after

| Area | Before B | URL authority / B change |
|---|---|---|
| Article Reader | Direct WhatsApp header; shared menu on cards | Existing `buildArticlePublicPath`; header opens universal menu |
| Standard video | No active selection share control | `buildVideoReaderPath(selectedVideo.id)`; shared menu follows queue selection |
| Legacy Short presentation | ShareMenu; title incorrectly passed as slug | Repair supplies canonical slug to existing helper |
| Swipe Short reader | Separate native/clipboard callback and runtime origin | `buildSwipeReaderPath(activeItem.slug)`; same shared menu and anonymous analytics |
| E-Paper issue/story | Toolbar menu and modal-specific copy/WhatsApp | Existing publication bridge now preserves city/date/page/story; shared story/clipping menu |
| Magazine issue/story | Same shared publication infrastructure | Monthly/global seam retained: paper/month/page/story, no daily city/date |

Content identity flows through the 3.13A helper, `resolveCanonicalShareUrl`,
then `universalShare` service/native/copy functions. Relative URLs use the
configured public origin via `getSiteUrl`/`toAbsolutePublicUrl`. Absolute inputs
must match that origin and a supported canonical reader route. Unknown query
keys, duplicate dimensions, credentials, fragments, malformed encoding,
traversal, schemes, legacy bridges and arbitrary origins are rejected.
The older generic absolute helper remains for asset URLs, outside share targets.

### Destinations and interaction behavior

- WhatsApp: `wa.me` with encoded branded text and one canonical URL.
- Facebook: existing `facebook.com/sharer/sharer.php`, canonical `u` only;
  no deprecated title/image parameter assumptions or preview work.
- X: `x.com/intent/tweet`, canonical `url` plus encoded headline. The compatible
  intent route is retained on the current X hostname.
- Telegram: `t.me/share/url`, separately encoded `url` and `text`, following
  [Telegram's custom-button contract](https://core.telegram.org/widgets/share).
- Existing LinkedIn option is preserved alongside the required destinations.
- Native share returns shared/cancelled/unavailable/failed without uncaught
  rejections. Success closes and restores focus. Cancellation/rejection keeps
  social/copy choices and a localized hint; cancellation is not logged as an
  application error. Unsupported browsers omit the native option.
- Copy uses Clipboard API, then the synchronous textarea fallback after API
  absence/rejection. Fallback removes the textarea and restores focus. Only an
  actual successful copy reports success; failure leaves perceivable retry
  feedback. External popup opening does not claim completed sharing, and Copy
  remains available if the browser blocks the window.
- Portal menu uses viewport width/height limits and scrolling, sits above
  publication dialogs, supports arrow/Home/End/Escape and restores trigger
  focus. Trigger/menu keys are isolated from video playback/navigation shortcuts.
  Existing visual styles are reused. Short events retain `lokswami_swipe`
  privacy behavior and canonical slug metadata through `useSwipeAnalytics`.

### Final automated validation

- Focused sharing plus defect/integration coverage: **10 files / 110 tests
  passed / 0 failed**.
- Final broader collection: **48 files / 498 tests passed / 0 failed**. Includes
  the former 44-file collection, repair, video selection, Homepage Short cards
  and anonymous Swipe analytics privacy. Covers Phase 3.11 Homepage rails,
  discovery/navigation/selection, Phase 3.12 Reader actions/header/SSR/related
  stories/progress, publication routes/domain seams, sitemaps, SEO indexing,
  category routes/system protection and public video eligibility.
- English/Hindi, spaces, ampersands, question marks, percent signs, Unicode,
  encoded path segments and pre-existing publication query dimensions pass.
  Admin/CMS/internal/loopback/arbitrary-origin, malformed scheme/encoding,
  traversal and markup-as-text cases pass. No dangerous HTML interpolation.
- Typecheck and strict lint pass. Changed-file ESLint has zero errors and no
  new warnings. Exact rule/message comparisons: E-Paper **65 -> 65**, clipping
  modal **1 -> 1**, story modal **1 -> 1**, clipping test **1 -> 1**,
  repaired legacy Short feed **5 -> 5** (73 inherited warnings across repair/B);
  all other changed source/test files have zero warnings.
- `build:ci` passes, including all **175** static pages. The existing Windows
  warning remains one failed traced-file copy caused by the dependency junction
  (`EPERM`, symlink into `.next/standalone/node_modules`). Text/cause/count are
  unchanged; standalone deployment packaging is outside this slice.
- Final diff checks and explicit protected-file audit pass before the separate
  local B commit. The dev server is stopped and the repository's production
  preparation restores the generated declaration's baseline reference. B's exact
  commit SHA is recorded in the owner-facing report.

### Browser evidence and limits

Read-only staging-backed local server on port 3001, automation worker disabled,
with `NEXT_PUBLIC_SITE_URL=https://lokswami.com` supplied only to the QA process.
At **1440px** and **390px**, seven cases per width pass: Article, exact standard
Video, real Short, E-Paper issue/story and magazine issue/story. Every case checks
all four service destinations, exact copied URL, labels, menu viewport bounds,
arrow navigation, Escape/focus restoration and absence of horizontal overflow.
Desktop additionally activates the trigger with Space and Copy with Enter.

- Article: `/main/article/bhopal-digital-arrest-35-lakh-cyber-fraud`.
- Video: `6ab840b464b786a3b089c3c3` via exact `video` query.
- Short slug: `सोना-कम-तौलने-का-आरोप-ज्वेलर्स-पर-केस`, distinct from title
  `सोना कम तौलने का आरोप, ज्वेलर्स पर केस!`; copied/service path uses the encoded
  canonical slug once. English/Hindi deliberately different fixtures also have
  component regression coverage.
- E-Paper: `6ab7c5ca12e417f446b53cbf`, Indore, `2026-09-25`, page 2; story
  `6ab7d76c12e417f446b53fa8` retains all five dimensions.
- Magazine: `6ab8421f64b786a3b089c440`, `2026-09`, page 2; story
  `6ab9e63d41d2101b3bbd0811` retains its page 1 selection and monthly semantics.
- Four additional browser checks cover native success/cancellation/rejection,
  unsupported native sharing, truthful Clipboard failure and successful fallback.
  Native, clipboard and external window contracts are mocked; no OS share sheet
  or third-party social post is claimed. External YouTube playback transport is
  mocked to isolate share checks from intermittent provider errors. Local browser
  preferences suppress unrelated onboarding; reader UI source is unchanged.
- Final browser pass: **18 checks passed**, **zero page errors**, **zero
  non-GET/HEAD requests forwarded**. With external player transport mocked,
  no non-GET/HEAD requests reached the interception rule in that final pass.
- Harness suppresses sendBeacon before app scripts, blocks service workers and
  fulfills every non-GET/HEAD browser request locally. No staging editorial or
  publication mutations occur. Final browser report, logs and screenshots live
  outside the repository in the task visualization directory.
- Original A commits are retained. No dependency upgrades, push, PR, merge,
  deployment or 3.13C/D implementation is part of this completion.

### B file scope

The separate B commit contains exactly these 19 files:

```text
app/(reader)/main/article/[id]/ArticleDetailClient.tsx
app/(reader)/main/epaper/EPaperPageClient.tsx
app/(reader)/main/videos/VideosPageClient.tsx
components/epaper/reader/modals/ArticleClippingModal.tsx
components/epaper/reader/modals/ArticleStoryModal.tsx
components/swipe/SwipeActions.tsx
components/swipe/SwipeFeed.tsx
components/ui/ShareMenu.tsx
lib/utils/articleShare.ts
lib/utils/universalShare.ts
tests/article-page-ssr.test.tsx
tests/article-reader-actions.test.tsx
tests/article-share.test.ts
tests/epaper-clipping-modal.test.tsx
tests/share-menu.test.tsx
tests/swipe-feed.test.tsx
tests/universal-share.test.ts
tests/video-page-share.test.tsx
docs/b3/PHASE3_13_DEEP_LINKS_SHARING_ACCEPTANCE.md
```

The repair's three files remain in their separate commit. Data, environment,
generated declarations and QA/runtime artifacts are excluded from both commits.
