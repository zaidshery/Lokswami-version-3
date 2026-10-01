# Phase 3.11 Homepage final implementation

This supersedes the presentation and unsupported-category notes in checkpoint 2.
The owner approved shared state/topic taxonomy and subsequently added Crime.
The E-Magazine checkpoint `8c9c277650c923918e18ab10ee63def7ba359b3f` is preserved.

## Composition and routes

The server page loads the public top feed and bounded discovery in parallel.
`HomePageClient` retains its existing client boundary and fallback loading;
important headlines and anchors render during SSR. No additional viewport gate,
category fetch, embedded video player, autoplay or global story state is added.

Main content order: Top Package, Videos, Lokswami Shorts, Madhya Pradesh,
Maharashtra, Crime, National, Politics, International, Rajasthan, Uttar Pradesh,
Gujarat, Entertainment, Sports, Business, Tech. Empty category/media sections are
omitted; partial sections render only supplied valid records.

Top Package contains Lead Story and Latest News. Its neighboring desktop rail
contains exactly one Indore E-Paper, Monthly E-Magazine and Live Updates, in that
order; the optional poll follows. No rail is sticky or fixed. Categories follow
the entire upper composition at the normal full Homepage container width.

Every category View All uses `/main/category/<canonical-slug>`:

| Label | Canonical slug |
| --- | --- |
| Madhya Pradesh | madhya-pradesh |
| Maharashtra | maharashtra |
| Crime | crime |
| National | national |
| Politics | politics |
| International | international |
| Rajasthan | rajasthan |
| Uttar Pradesh | uttar-pradesh |
| Gujarat | gujarat |
| Entertainment | entertainment |
| Sports | sports |
| Business | business |
| Tech | technology |

Shared reader definitions resolve canonical English/Hindi names and aliases;
shared CMS defaults expose those choices through the existing Mongo/file-store
taxonomy service. This does not migrate article associations, infer states from
locations, or alter stored `data/categories.json` during implementation.

Latest News and Live Updates use `/main/latest`. Videos and Shorts View All use
`/main/videos`; preview links use existing video reader helpers. Indore issues
use `/main/epaper?city=indore&date=<issue-date>`; missing issues offer the general
archive. The narrow home-feed edition mapper guard excludes explicit unpublished,
superseded and wrong-publication records before presentation. It changes no
publication, PDF/OCR, scheduling or automation workflow.

Monthly E-Magazine retains its localized heading, All Issues archive at
`/main/e-magazine`, current-issue month-filtered Read Magazine destination,
12px header/content gap and container-based hiding of the archive on narrow
cards. The shared rail owns max-width below desktop; desktop fills its column.

## Cards and progressive reveal

All categories use one `CategorySection`: one column below 768px, two from
768px, four from 1280px. Cards have 12px outer/8px image radii, 16:9 image boxes,
three-line headlines, date and sibling utility actions. Border thickness remains
1px on hover/focus; only its color changes. There is no translate/glow motion.

Initially four valid stories render. A secondary 44px Load More Stories /
और खबरें देखें button reveals four more supplied stories per activation and
disappears when exhausted. Enter/Space work without fetching or scrolling.
IDs and canonical destinations are deduplicated within each section. Existing
recency ordering and preference for stories unused by top selection remain;
there is no new global editorial dedupe policy.

E-Paper utility links go to `/main/epaper` without an invented story relationship.
WhatsApp uses existing canonical share/analytics helpers and the brand glyph.
Compact approved utility targets are 36px on mobile and 32px at sm+, with 40px
Indore actions; they are below the general 44px recommendation. Load More and
the magazine primary CTA are 44px. Accessible names and visible focus are retained.

## Weight, images and boundaries

Discovery retains the existing cap of 13 candidates per category: at most 169
preview records across 13 modules, enough for 4 + 4 + 4 + 1 local reveal and the
existing unused-story preference. No cap increase or unbounded fetch is added.
Full article bodies are removed from these preview DTOs before serialization.
Detail services and public visibility rules remain unchanged. Media discovery
retains 12 candidates per kind and supplies at most three eligible previews.

The obsolete category variant prop and duplicate Homepage hero/header/date
presentation are removed. Shared category arrays are constructed once instead
of repeatedly concatenated during alias resolution. The old standalone
DesktopHeroEpaperCard is retained because source-contract tests still reference
it; Homepage does not render it. No global design-system rewrite is made.

Only the lead story image is priority within Homepage content. Small latest/live
images use thumbnail variants and measured `sizes`; the lead uses a hero variant
and bounded desktop sizes. Category, magazine and paper imagery remain lazy in
stable aspect-ratio boxes using ReaderImage fallbacks. The global brand logo has
its separate existing preload. Media sections render posters, not players.

Reduced-motion controls disable the new category/share transitions and poll
fallback pulse. Existing global reduced-motion CSS remains authoritative for
reader navigation and ticker behavior. Main metadata, canonical and structured
data ownership remain on existing server routes.

Final exact-head gates and browser evidence belong in the local finalization
report under ignored `artifacts/phase3-qa/finalization-review`. No production
credentials, stored content, dependency updates or outbound publication actions
are required. Protected office files remain outside commits.
