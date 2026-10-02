# Phase 3.11 office homepage checkpoint

Base: `99613e72a72e0117f19b2e058c1289cb64fbd441`.
Branch: `b3/phase3.11-homepage-ui-office`. Local checkpoint only; no push or deployment.

The pure selector consumes eligible public articles after publication filtering
and editorial flag expiry. Lead sorts by publishedAt descending, then ID
descending. Latest holds four recent stories, preferring alternatives to Lead.
Popular holds four stories ordered by effective Trending, views, publishedAt,
then ID descending. It prefers alternatives to Lead and Latest. Sparse rails
backfill with existing stories; each rail has unique IDs and no invented flags.
Mongo selection uses the existing bounded recent candidate query; it is not an
all-time popularity query. File storage uses the same selector and eligibility rules.

The public feed adds `topPackage` while keeping existing section fields compatible.
The mapper retains its stories so popular candidates outside the old hero/latest
slices survive hydration. The top package renders during SSR without a mount gate.
DOM order is Lead, Latest, Popular. Desktop uses 3/6/3, tablet uses a full-width
Lead with two rails below, and mobile stacks all three. Only Lead image is priority.
Breaking continues to receive priority in the separate Live Updates rail.

## Supported navigation and SEO

Main navigation reuses `/main`, `/main/videos`, `/main/epaper`,
`/main/e-magazine`, `/main/elections`, and canonical category paths under
`/main/category/`: regional, politics, national, international, sports,
entertainment, technology, business. Mobile exposes the same supported links,
alongside the existing drawer destinations. Header controls remain unchanged.
More retains supported Latest News, Digital Newsroom and Contact destinations.
These are interim utility destinations, not substitutes for the requested topics.

Category links are real anchors. Existing category landing pages retain their H1,
`buildCategoryPageMetadata` pattern, canonical URLs and server-provided article
feed. No new category pages, aliases, schemas or third-party SEO dependencies.

State-specific article classification and canonical topic routes are absent;
E-paper city definitions are not a news category system. Pending destinations:

- `PHASE311_CATEGORY_ROUTE_REQUIRED:MP`
- `PHASE311_CATEGORY_ROUTE_REQUIRED:Chhattisgarh`
- `PHASE311_CATEGORY_ROUTE_REQUIRED:Rajasthan`
- `PHASE311_CATEGORY_ROUTE_REQUIRED:Maharashtra`
- `PHASE311_CATEGORY_ROUTE_REQUIRED:Uttar Pradesh`
- `PHASE311_CATEGORY_ROUTE_REQUIRED:Kisan`
- `PHASE311_CATEGORY_ROUTE_REQUIRED:Jobs`
- `PHASE311_CATEGORY_ROUTE_REQUIRED:Sarkari Yojana`
- `PHASE311_CATEGORY_ROUTE_REQUIRED:Dharm & Jyotish`
- `PHASE311_CATEGORY_ROUTE_REQUIRED:Lokswami Special`

## Future analytics event map (documentation only)

Preserve the existing analytics integration. No GTM deployment or direct gtag calls.
Future events should use the existing analytics helper after an approved event contract.
Common properties: destination href, placement, language, and article ID/category
where applicable. Exclude user identity and personal data.

| Event | Trigger | Placement / additional properties |
| --- | --- | --- |
| lead_story_click | Lead image or headline | homepage_lead; article_id |
| latest_story_click | Latest headline | homepage_latest; article_id, position |
| popular_story_click | Popular headline | homepage_popular; article_id, position |
| category_click | Canonical category anchor | header, drawer, lead_badge; category_slug |
| regional_state_click | Future supported state anchor | regional_menu; state_slug |
| video_click | Video navigation or story | header, drawer, video_rail; video_id if present |
| short_click | Short story entry | shorts_rail; short_id, position |
| epaper_click | E-Paper entry | header, drawer, homepage_publication |
| emagazine_click | E-Magazine entry | header, drawer, homepage_publication; issue_month if present |

## Boundaries

No PR #20 publication repository, revision, workflow, automation, model, OCR,
PDF worker or readiness files were changed. No production mutations. The local
generated `next-env.d.ts` must remain byte-for-byte preserved and unstaged.

## Local verification evidence

- Focused: 12 files, 58 tests passed, including pure selection, SSR markup,
  Mongo/file publication filtering, expiry, mapping, homepage and navigation.
- Broader suite: 319 files, 2,213 tests passed. The subsequently added two
  storage integration cases also passed in the final focused run.
- Typecheck, strict lint, touched-file lint and diff checks passed.
- Browser: real local app with `.env.staging.local`, 320, 360, 375, 390, 414,
  430, 768, 1024 and 1440 in light and dark. No document overflow or error
  overlay; correct mobile, tablet and desktop geometry. More and drawer usable.
- All 13 main navigation destinations returned HTTP 200. All eight category
  destinations included server-rendered H1s and canonical links.
- Browser acceptance is incomplete: staging Atlas could not connect, and
  fallback article storage is empty. Populated Lead/Latest/Popular, Hindi
  headline wrapping, real-story links and populated browser deduplication are
  not verified. No fake articles were injected to conceal this limitation.
- Final browser capture recorded six `ERR_NETWORK_ACCESS_DENIED` resource
  errors and `/api/poll/current` HTTP 500 after MongoDB connection failure.
  No uncaught JavaScript errors. The QA runner exits nonzero for incomplete
  content or console errors; it must not be interpreted as clean browser PASS.
- Local browser artifacts: `artifacts/phase3-qa/phase311/report.json` and
  screenshots. Rerun `node scripts/phase3/phase311-homepage-browser-qa.cjs`
  against an owned local server after staging access is available.
- Browser request interception suppressed three non-GET/HEAD requests.
  No publication workflows or production data were mutated.
- Build validation uses a temporary source/dependency copy, so `build:ci`
  can regenerate its own route-types reference without touching the office
  checkout's `next-env.d.ts`. Environment requirements did not change.
- `build:ci` passed in that temporary copy: compilation, all 175 pages and
  standalone packaging completed. MongoDB was intentionally unconfigured;
  missing-URI warnings are not production environment verification. An initial
  dependency-junction attempt compiled but failed standalone trace copying;
  the successful retry used a full dependency copy.
- Preserved generated-file SHA-256:
  `376F0D33F4341A2B83AA11C2B284653B7CB10C979A91EAE0A491CBC23E4675FE`.

Vite emitted its existing native-config compatibility warning; the broader
suite also emitted jsdom's unsupported document-navigation diagnostic.
