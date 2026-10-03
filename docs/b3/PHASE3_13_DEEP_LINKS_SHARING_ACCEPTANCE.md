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
| Other reader pages | `/main/ftaftaf`, `/main/elections`, `/main/digital-newsroom`, `/main/about`, `/main/contact`, `/main/advertise`, `/main/careers`, `/main/privacy`, `/main/terms`, `/main/cookies`, `/main/disclaimer`, `/main/sitemap` | matching marketing aliases for about/contact/advertise/careers/digital-newsroom where present | Preserve existing page behavior and redirects | app/(reader)/main; app/(marketing) |

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
