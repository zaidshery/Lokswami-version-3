# 360 reliability implementation: delivery record

Date: 16 October 2026. Branch: `fix/360-reliability-foundation`.
Base: `b307f170097f2752ede6ebde9bc782d0980c2b3c`.
Changes are local and uncommitted. Programme plan: [360 implementation plan](360_IMPLEMENTATION_PLAN.md).

## Implemented in this batch

- Moved the XML index handler from `app/sitemap.xml/route.ts` to `app/sitemap-index.xml/route.ts`, outside the special metadata route namespace. Added a permanent `/sitemap.xml` redirect; existing advertised and chunk URLs remain usable.
- Added a built-app regression to the existing critical Playwright suite: advertised sitemap resolves to the XML index and its first generated chunk returns XML.
- Added one original-source retry for failed E-paper thumbnail optimisation, followed by the existing placeholder. Kept viewport/lazy loading and page selection; no new asset host or server fetch capability was added.
- Updated the package and lockfile root engine, both CI workflows, `.nvmrc`, and setup/deployment documentation to Node 24 LTS. No dependency versions changed and the developer's installed Node was not switched.
- Added a phased implementation plan with owners, dependencies, business metrics, and explicit release gates.

## Verification

| Check | Result |
|---|---|
| Initial focused tests under existing Node 20 | 5 files, 70 tests passed |
| Expanded focused tests under temporary Node 24.22.0 | 12 files, 134 passed, 4 Windows-inapplicable signal tests skipped |
| TypeScript under Node 24 | Passed, exit 0 |
| Changed JS/TS/TSX ESLint under Node 24 | Passed, exit 0 |
| Native dependency smoke under Node 24 | Sharp WebP encoding and native canvas PNG encoding passed |
| Production build under Node 24 | Passed, exit 0; 175/175 static pages generated; no duplicate sitemap route warning |
| Built-app smoke under Node 24 | 6 Playwright checks passed against port 3108, including actual HTTP 308 redirect, XML index, and first chunk |

The focused set covers sitemap discovery/pagination, metadata routes, schema, E-paper strip/navigation, reader image delivery, page quality, publication invariants, PDF worker isolation, automation worker, and audience/distribution boundaries. Initial test expectations needed updating for the new one-retry behavior; the completed focused runs passed. Vite emits its existing config-loader compatibility warning. Tests using Next Image also emitted a test-context quality-configuration warning; the production config explicitly allows quality 55.

The build and smoke run used an empty Mongo URI and a temporary local auth secret.
Next's build configuration skips its built-in type/lint steps; both were checked
separately above. The local server logged sandbox outbound-image `EACCES` fetch
failures and an unconfigured Mongo-dependent poll route. These six passing smoke
assertions are not a clean live-data end-to-end certification. `next start` also
warned about the existing standalone output configuration; the deployment must
use the documented Hostinger launcher. The temporary test server was stopped.
Smoke-generated analytics file changes were restored to their pre-task baseline;
no test telemetry is included in the implementation diff.

## Current live observations, not fixed by local code alone

- The live root sitemap still returned 404 during implementation. Local changes have not been deployed.
- The live recent-news sitemap remained empty. Eligibility, deployed identity, and storage authority must be checked before changing filtering or editor settings.
- Public detail for Indore edition `6ad1e53a79c188cabb59ac41` returned 12 pages, published status, and **zero released articles**. Clickable stories require the processing/review/release workflow; no snapshots or hotspots were fabricated or automatically published.
- A later read-only probe found both the first page's original CDN image and one 128px/quality-55 optimizer variant returning HTTP 200. The earlier browser thumbnail failure is not a consistently reproduced optimizer outage. The implemented retry is failure recovery, not proof that every underlying delivery issue is resolved.

## Release and operational limits

The active user-owned development server was not stopped or replaced. Production validation used `.next` and a separate port. The pre-existing generated `next-env.d.ts` reference to `.next-dev` was restored at handoff.

GitHub protection/ruleset changes, full remote CI, the hosting runtime switch, deployed-SHA certification, worker operations, recent-news configuration, real-device touch acceptance, analytics-container consent verification, actual business baselines, commercial packages and marketing campaigns remain open. Local code and plans do not mark these tasks complete.

Node 24 must be selected on the deployment host before rollout. A manifest/workflow update does not migrate the host runtime. No production environment values were changed, and no production environment certification is claimed.

No commit, push, PR publication, production data mutation, campaign submission, repository administration or deployment was performed.

## Remaining-work batch: implementation and investigation

- Added a bilingual campaign enquiry form to the existing advertising page, with business/contact details, campaign type, geography, budget, timing, goals, explicit contact consent, bounded inputs, honeypot, duplicate-click protection and accessible success/failure states. It reuses the existing audience endpoint and Mongo/file fallback. Server-generated consent time/version cannot be supplied by the client. No new notification/inbox is claimed.
- Added `advertise_page` to anonymous event classification, with a coarse campaign-type allowlist. Form analytics contain no contact data or campaign brief; the server drops arbitrary metadata and does not retain IP/user agent for these events.
- Replaced unconditional Google loaders and the noscript iframe with an explicit analytics choice. Unknown/declined/unwritable preference blocks tags. Analytics settings allow changes; withdrawal reloads the document. Advertising consent stays denied. Google and first-party page-view dispatch are separate so accepting Google does not replay first-party views. Actual GTM tags/property settings still require owner validation.
- Added build-time Git identity and dirty-state evidence at `/api/version`, runtime Node major reporting, and `verify:reader-release` checks for expected clean SHA, Node 24, advertised sitemap/chunk, configurable news-entry minimum and optional published E-paper story readiness. Unknown or dirty identity fails closed; this does not replace artifact digests or deployment receipts.
- Added explicit `--base` support to the read-only PR checker, retaining the foundation default. CI includes intercepted consent/enquiry browser checks; production packaging forwards public analytics variables at build time.
- Added the measurement contract and 90-day growth/advertising pilot with metric definitions, source limits, owner roles, package scopes, fulfilment evidence and weekly decisions. No reach, prices, conversion improvement or revenue has been invented.

### Read-only evidence on 16 October 2026

The configured Mongo database contained two recent articles with `workflow.status=published`, inclusion enabled, and publication timestamps 15 October 07:21 UTC and 16 October 09:28 UTC. The existing local server returned two news XML entries, while production returned zero, including a fresh cache-busting request. This isolates a deployed-code/configuration/runtime/storage discrepancy; it does not establish the exact deployed SHA or prove that the hosting environment uses the identical storage authority. No filter was relaxed and no article was edited.

Edition `6ad1e53a79c188cabb59ac41` had published production status, twelve pages, **zero stored story records and zero released story snapshots** in the configured database. This is missing editorial/story data, not evidence that the reader should synthesise clickable hotspots. The CMS processing, review and release workflow and real-device acceptance remain required.

### Validation of this batch

Expanded focused validation initially passed 15 files / 169 tests under Node 24, with separate TypeScript and changed-file lint passing. Additional dispatch and built-app browser checks are recorded below once completed. The existing Vite config-loader warning remains. Tests mock enquiry persistence and external Google requests; no live commercial enquiry or newsletter subscription is created.

The final focused run passed **19 files / 186 tests**, including the two dispatch/privacy regressions and existing deployment, sitemap and browser-CI contracts. Auth guard regression checks passed all seven cases; synthetic admin credential regressions passed. The current-environment admin credential case was skipped because credentials were not configured in the test process.

An initial built-browser run passed the critical and audience cases, then exposed stale E-paper fixture language/selector assumptions. With deterministic English fixture preferences, seven of nine reader tests passed; the remaining two identified an obsolete mobile navigation selector and a genuine short-landscape canvas-height failure. The selector was updated to the existing visible Next page control. Landscape thumbnails now use a 32px image with the existing 44px width and labelled button, preserving its touch target while freeing reading height. Manual review also found the analytics-settings button underneath mobile bottom navigation; its position and regression coverage were corrected. Final rebuilt-browser results follow below; these earlier failures are not treated as passes.

The read-only live release check returned false for all four selected gates: clean tested identity/Node runtime, advertised sitemap/index/child, at least two current news entries, and published E-paper with released stories. No local result is presented as a production deployment.

### Final verification and handoff

| Final check | Observed result |
|---|---|
| Full Vitest suite, temporary Node 24.22.0 | **426 files passed; 3,600 tests passed; 4 platform-specific skips**, exit 0 |
| Auth guard / admin credentials regression scripts, Node 24 | Passed; current-environment credential check skipped, synthetic cases passed |
| TypeScript, Node 24 | Passed, exit 0 |
| Changed-file ESLint, including new browser tests | Passed with zero warnings |
| Final `npm run build:ci`, Node 24 | Passed, exit 0; all 175 static pages generated |
| Final built-app Playwright run, isolated port 3109 | **18 passed**: six critical, three audience/consent, nine E-paper/ E-magazine fixture journeys |
| Build identity endpoint | Correctly reported base commit, `dirty: true`, runtime Node major 24; clean-release gate correctly rejected the uncommitted build |
| Reader release checker against local build | Sitemap index/chunk and news XML checks passed; clean identity failed as expected for uncommitted work |
| Refreshed GitHub state | Main remains `b307f170097f2752ede6ebde9bc782d0980c2b3c`, unprotected, zero rulesets |

Final browser coverage includes consent decline/persistence/accept/withdrawal, one initial Google page-view event, mobile/tablet campaign brief submission with mocked persistence, visible analytics preferences above mobile navigation, page navigation, synthetic touch swipe, story crop/geometry/history/focus, story zoom and sharing, monthly issue shell/reduced motion, and short-landscape layout. These are controlled browser/fixture checks, not real-device or live editorial publishing acceptance. The new form's Mongo and file persistence paths are covered through mocked repository/API tests.

Full-suite output included existing JSDOM media/navigation/scroll limitations and the Vite config-loader warning. The isolated build/server intentionally had no Mongo URI and used a temporary auth secret and test-only Google ID. Next start emitted the existing standalone-output launcher warning, and some external image optimisation fetches logged sandbox `EACCES`. This does not certify Hostinger startup, the live Google container, all live images, or production environment values. Use the documented deployment launcher and production environment checks before rollout.

Manual Hindi UI review verified that analytics settings reopen above bottom navigation. Screenshot: [campaign enquiry](../../artifacts/360-audit-2026-10-16/campaign-enquiry-final.png). Temporary review tabs and servers were closed; generated local-review telemetry was restored to its pre-task state. The pre-existing `.next-dev` reference in `next-env.d.ts` and the original user-owned dev server were preserved.

Outstanding: effective GitHub protections/required review and CI, reviewed deployment with host/worker Node 24 and rollback receipt, live news-sitemap reconciliation, actual reviewed/released E-paper story mappings and real-device acceptance, actual GA4/container validation, named enquiry triage/retrieval ownership, fourteen complete measured days, and commercial pilots with verified inventory, costs and receipts. The installed default Windows Node runtime was not switched. All source changes remain local and uncommitted.
