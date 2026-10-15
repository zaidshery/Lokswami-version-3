# Phase 3.12A — article reader foundation

## Base and isolation

Branch: `b3/phase3.12-article-reader`, from exact foundation
`b70657c07d60e96e2dee19cb3947a9b791f3cf0f`. The primary checkout has unrelated
data/generated changes and remains untouched. This work uses an ignored isolated
worktree. Phase 3.11 office/homepage work is excluded; no commit, push, PR,
publication or deployment is part of this run.

## Current-state audit

- **Route:** `/main/article/[id]`; the token can be a canonical slug or ID. The
  guarded public resolver redirects obsolete/non-authoritative tokens. The
  `/article/[id]` compatibility route uses the same permanent redirect helper.
- **Server:** article `page.tsx` resolves and projects public data, then retrieves
  related stories. Article `layout.tsx` supplies canonical/OG/Twitter metadata,
  NewsArticle and breadcrumb JSON-LD. No redesign of these domain contracts.
- **Client:** `ArticleDetailClient.tsx` is already a client component, rendered
  on the server initially. It owns bookmarks, sharing, author-photo dialog,
  on-demand Listen/audio controls, AI summary, related pagination and read tracking.
- **Desktop/mobile:** one hero-first surface, up to 896px wide, followed by a
  crowded category/actions row, compact H1, byline, summary, audio tools and body.
  Mobile uses smaller typography and horizontal overflow for the action row.
- **Fields:** title, summary, rich body, image, category, author name/avatar/program,
  published time, image alt/caption/credit, flags and slug. Public data also has
  `updatedAt`, currently discarded by the reader projection. There is no separate
  subheadline field. Missing optional information must be omitted.
- **Primitives:** Container editorial widths, existing news fonts and surface,
  focus/touch helpers, category resolver/link helper, article image variants,
  sanitized rich-content renderer, ShareMenu and NewsCard.
- **Sharing:** existing canonical article path and branded WhatsApp helpers;
  ShareMenu owns native/social/copy handling and share analytics.
- **Audio:** existing on-demand article TTS request and playback hook, cached or
  manual audio where available, voice/language controls and browser fallback.
  No audio request on hydration. AI summary remains an explicit reader action.
- **Related:** server-selected public same-category/backfill stories, maximum 20;
  four initial crawlable cards, four more per reader click. No recommendation changes.
- **Analytics:** `/api/user/track` after 80% progress or the existing 60-second
  timer; bookmark `/api/user/save`; ShareMenu share events. Progress currently
  measures the entire document, including recommendations/footer, with React
  updates on each scroll event.
- **Body:** `renderArticleRichContent` sanitizes HTML and supports existing lists,
  quotes, inline media, YouTube/social/resource markup. Retain this renderer.
- **Ads/comments:** no dedicated inline ad or comments component in the article
  detail client. Global reader chrome/popups remain in the shared main layout.
- **States/storage:** missing stories use Next notFound; unavailable/ambiguous
  authority fails closed. Client has a defensive null state. No route-local
  loading/error override. Repository supports Mongo and file-store fallbacks and
  applies published/due visibility guards before this component receives data.
- **Localization:** app-store HI/EN controls UI labels; article content remains
  its original editorial language. Existing header/body use the news UI font.
- **Tests:** article-page-ssr, reader-actions, redirect/url governance, share,
  SEO, public article service/client, server publication, rich-content/document
  and TTS hook coverage. Preserve hydration and no-audio-prefetch assertions.

## Implementation plan

1. Extract a presentational article header: existing category destination, H1,
   optional summary, supplied byline, publication/meaningful update times and
   unchanged reader actions. Use fixed India time to keep SSR/hydration stable.
2. Place the existing responsive hero after the header; retain contain behavior,
   image variant/fallback, real alt and optional caption/credit.
3. Apply article-scoped CSS: responsive 28–48px headline, 720px body column,
   17/18px body text, generous long-form spacing and intact rich embeds. No global
   homepage CSS changes or empty secondary rail.
4. Replace document-wide progress with a small isolated client enhancement over
   the article region. Passive scroll, rAF coalescing, resize/image observation,
   imperative transform updates, cleanup on navigation, no live announcements.
   Retain read-tracking endpoint/timer/threshold without per-scroll React renders.
5. Add focused UI/progress regression coverage; run visibility/routing/SEO/audio
   regressions, typecheck, changed-file lint and build:ci. Browser-check an isolated
   loopback server on a separate port with local fixture data only.

## Deferred Phase 3.12B/P2

Listen presentation and audio accessibility refinements, related/Read Next visual
redesign, optional sticky sharing, and broader loading/performance polish. Do not
replace their current functionality during P0.

## Validation

- Focused Vitest: **15 files / 132 tests passed**, including SSR, header/progress,
  reader actions, share/canonical, SEO, redirects, visibility/publication guards,
  rich-content and TTS contracts. Existing tracking assertions were preserved;
  their geometry now models the article region rather than document height.
- Typecheck: passed. Changed-file lint: zero errors and two existing Listen
  effect dependency warnings, reproduced against the exact foundation version.
  All other changed TypeScript files passed with zero warnings.
- `npm run build:ci`: passed. `git diff --check`: passed.
- Browser: Hindi and English each passed all ten widths: 320, 355, 375, 390,
  430, 768, 1024, 1280, 1440 and 1920. No horizontal overflow or clipping;
  one H1, responsive loaded/contained hero, real caption/credit and dates,
  17px mobile / 18px desktop body text, 720px desktop reading column.
  Progress measured 50% midway and 100% at article end before related/footer.
  Light and dark themes were visually inspected; existing share menu opened.
- Browser metadata retained title, description, canonical, OG, Twitter,
  NewsArticle and BreadcrumbList. No hydration or page errors. One unrelated
  existing shared-header logo aspect warning appeared in development.
- Local HTTP checks: draft, future-scheduled and missing fixtures returned 404;
  legacy `/article/reader-qa-hi?qa=reader` returned 308 to the canonical route
  with its query preserved.
- QA used offline fixture copies and an isolated worker-disabled, Mongo-free
  loopback preview on port 3012. No CMS publication endpoint or production
  resource was used. The dedicated browser and verified preview process tree
  were closed. Temporary fixture/environment files were removed, generated
  analytics and next-env changes restored only in this worktree.
- Evidence: sibling `../reader-qa/matrix-hi.json`, `matrix-en.json`, header/body
  screenshots at 390/1440 and light-theme screenshots. Build output is stored
  in this worktree's ignored `artifacts/phase3-qa/build-ci.log`.

## Implementation decisions and review state

### Focused test command

```sh
npm test -- --run tests/article-page-ssr.test.tsx tests/article-reader-actions.test.tsx tests/article-reading-progress.test.tsx tests/article-reader-header.test.tsx tests/article-share.test.ts tests/article-seo.test.ts tests/article-url-governance.test.ts tests/article-redirect-governance.test.tsx tests/public-articles-service.test.ts tests/public-articles-client.test.ts tests/server-articles-publication.test.ts tests/use-article-tts.test.ts tests/article-document.test.ts tests/rich-text-editor-formatting.test.ts tests/seo-schema-and-sitemaps.test.ts
```

The new header precedes the existing hero. Meaningful updates appear only when
valid and at least a minute after publication. Optional author/summary/image
metadata are omitted when absent. Dates use existing parsing with a fixed India
timezone. Category links use the existing taxonomy resolver.

The progress enhancement observes the semantic article (header, hero and body),
excluding recommendations and footer. It updates a transform through rAF with
passive scroll, resize/image observation and cleanup, without React scroll state.
Restored scroll positions update the visual bar but require a fresh scroll before
triggering the existing 80% read event; the 60-second timer remains unchanged.

Sharing, on-demand Listen/AI summary, author-photo dialog and four-at-a-time
related stories remain supported. No new library, fetch, backend or sidebar.
The existing client boundary remains; SSR content and sanitization are retained.

Changes remain unstaged on `b3/phase3.12-article-reader`; HEAD remains the exact
foundation SHA. No commit, push, PR, merge, deployment or content publication.
The primary checkout's protected changes and Phase 3.11 remain untouched.
