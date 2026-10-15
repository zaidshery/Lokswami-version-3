# Phase 3.11 office checkpoint 2

Remote backup: `b3/phase3.11-homepage-ui-office` was pushed without force to
`bb92fda01309e56e4f8517ef27a44504906fe494`. No PR or merge was created. The
category/media commit is local only.

## Implementation

3.11C: Regional uses the reusable CategorySection large variant (up to four);
National and Politics use compact cards (up to three). 3.11D adds Business,
Technology, Sports, Entertainment and International with the compact variant.
One deterministic selector resolves canonical category aliases, filters wrong
categories, deduplicates IDs, sorts publication date then ID descending, and
prefers stories unused by the top package before sparse-content repeats.
Zero stories omit the section; one/two/three/four render the actual count.
All story and category destinations are ordinary server-renderable anchors.

The server requests 13 published candidates per canonical category: enough for
the nine top-package positions plus four Regional cards. Existing public article
services retain Mongo/file-store behavior and publication visibility. Category
failures are isolated. No browser category fetch or visibility-triggered loader
is required.

3.11E: Videos shows at most three real standard published videos, excludes
Shorts, uses 16:9 thumbnails, headlines, play affordances and supplied metadata,
and links to `/main/videos?video=ID`. Missing standard thumbnails use the existing
ReaderImage fallback. Unknown durations/dates are omitted. No embedded playback
is created. Empty results omit the section; a media service failure supplies an
honest compact status and Videos destination.

Shorts shows at most three real public Swipe-eligible records with usable title
and poster. Canonical slug links use the existing reader helper. Mobile uses
native horizontal scrolling with two complete cards and the third reachable;
tablet/desktop uses a three-column grid. No demo records, invented metadata,
custom drag handling, homepage playback or client data fetch remains. Media
candidates are bounded to 12 of each kind and rechecked with existing public
publication/Swipe eligibility helpers before preview mapping.

## Unsupported route audit

These destinations remain absent from navigation:

- PHASE311_CATEGORY_ROUTE_REQUIRED:MP
- PHASE311_CATEGORY_ROUTE_REQUIRED:Chhattisgarh
- PHASE311_CATEGORY_ROUTE_REQUIRED:Rajasthan
- PHASE311_CATEGORY_ROUTE_REQUIRED:Maharashtra
- PHASE311_CATEGORY_ROUTE_REQUIRED:Uttar Pradesh
- PHASE311_CATEGORY_ROUTE_REQUIRED:Kisan
- PHASE311_CATEGORY_ROUTE_REQUIRED:Jobs
- PHASE311_CATEGORY_ROUTE_REQUIRED:Sarkari Yojana
- PHASE311_CATEGORY_ROUTE_REQUIRED:Dharm & Jyotish
- PHASE311_CATEGORY_ROUTE_REQUIRED:Lokswami Special

`lib/constants/newsCategories.ts` defines the eight canonical reader categories.
The CMS Category model stores name, slug, description and icon, without a parent
or structured state hierarchy. Articles store a category string and a freeform
`reporterMeta.locationTag`; public DTO city values also accept legacy city,
cityName and locationTag fields. The public city filter is substring matching,
not a reliable state classification. Category filters resolve canonical aliases
or match an unknown category exactly. There is no verified state taxonomy or
published-content association for these ten destinations.

Later implementation should agree a single canonical taxonomy shared by CMS
and reader definitions, add validated state IDs and city mappings for Regional,
and migrate/backfill Mongo and file records with appropriate indexes. Topic
categories can reuse the category seam after canonical slugs, aliases, labels,
CMS choices and actual published article associations are established. Verify
meaningful published inventory before exposing routes; preserve canonical
metadata and existing publication filters. Do not infer states from a freeform
city substring or create duplicate category systems or thin placeholder pages.
No taxonomy/schema/backend changes are included in this checkpoint.

## Future analytics integration

Use the existing consent-aware analytics owner when instrumentation is scheduled:

| Event | Trigger | Non-personal context |
| --- | --- | --- |
| category_click | Category heading/CTA or category story | canonical category, placement, article ID when applicable |
| video_click | Standard video card or Videos CTA | video ID when applicable, card position, placement |
| short_click | Short card or Shorts CTA | short ID when applicable, position, placement |

No GTM installation, direct gtag call or duplicate analytics transport is added.
Article/category SEO metadata and canonical routes remain owned by existing
reader route services.

## Boundaries and verification

PR #20 protected files and publication/OCR/PDF/automation/readiness internals:
NONE touched. No 3.11F redesign. Production mutations: 0.
Original `next-env.d.ts` remains intentionally dirty and unstaged, with SHA256
`376F0D33F4341A2B83AA11C2B284653B7CB10C979A91EAE0A491CBC23E4675FE`.
Build runs in the existing temporary source/dependency copy to preserve it.

Focused coverage checks publication eligibility, category correctness and sparse
counts, deterministic selection, real canonical links, media preview metadata,
no demo fallback, SSR cards, native rail classes and independent loader failures.
Final focused run: 11 files / 72 tests passed with exit 0 after the comparator
type adjustment and addition of loader coverage. Typecheck and strict server lint passed; changed UI
and selector files also pass ESLint with zero warnings. Full suite: 322 files /
2,247 tests passed, plus the three new loader tests passed separately (2,250
verified tests across 323 files). The captured PowerShell npm wrapper reports
exit 1 because it treats the existing Vite stderr warning as a native command
error; Vitest's completed summary reports all tests passed. Existing jsdom
navigation warnings were also emitted. Diff whitespace checks passed.

The isolated `build:ci` completed compilation, all 175 static pages, trace
collection and the final route report, producing the standalone artifact.
The snapshot intentionally has no MongoDB URI; existing missing-URI warnings
were emitted. PowerShell's stderr redirection likewise reports wrapper exit 1
for those warnings, rather than a Next build failure. This is local build
evidence only, not live database or production acceptance.

Populated browser QA remains pending: the prior real staging attempt could not
reach MongoDB Atlas and there is no local published article inventory. This run
also encountered an existing development-server ownership claim (launcher 1896,
child 4420), which was preserved. Unit fixtures are not claimed as populated
browser evidence. No staging network bypass or publication seeding was performed.

## Intended files

- `app/(reader)/main/HomePageClient.tsx`
- `app/(reader)/main/page.tsx`
- `components/home/CategorySection.tsx`
- `components/home/HomeVideosSection.tsx`
- `components/video/HomeShortsSection.tsx`
- `lib/content/homepageDiscovery.ts`
- `lib/content/homepageSections.ts`
- `lib/server/content/homepageDiscoveryService.ts`
- `tests/home-page-client-home-feed.test.tsx`
- `tests/home-page-shorts-section.test.tsx`
- `tests/homepage-category-media-ui.test.tsx`
- `tests/homepage-discovery.test.ts`
- `tests/homepage-discovery-service.test.ts`
- `docs/PHASE311_HOMEPAGE_CHECKPOINT2.md`
