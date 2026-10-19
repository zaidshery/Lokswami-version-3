# Lokswami 360 implementation plan

Date: 16 October 2026. Baseline: `b307f170097f2752ede6ebde9bc782d0980c2b3c`.
Implementation branch: `fix/360-reliability-foundation`.

## Objective and scope

Deliver three outcomes in sequence: reliable publication and reading, loyal regional readership, and sustainable advertising revenue. Keep the modular monolith, shared navigation, published-only visibility, Mongo/file compatibility, human publication authority, daily E-paper, and monthly E-magazine contracts.

This plan extends the canonical B3 roadmap and gated release matrix; it does not certify or bypass their release gates. A passing local build is not production acceptance. Preserve existing user changes. Do not use live editorial writes to manufacture QA data or business metrics.

## Workstreams and exit gates

| Workstream | Accountable owner | Deliverables | Exit evidence |
|---|---|---|---|
| A. Reader reliability | Engineering | Sitemap routing, thumbnail recovery, investigation of recent-news eligibility and story readiness | Built-app HTTP checks; focused tests; typecheck; build; browser/device checks |
| B. Release and runtime | Engineering / release owner | Supported Node LTS, canonical branch policy, required CI/review, exact-SHA deployment record and rollback | LTS test/build/native-worker evidence; effective GitHub rules; deployment and rollback receipts |
| C. Reader experience | Product / editorial / engineering | Prompt timing, contrast, Hindi typography, daily/monthly reader acceptance | Mobile/tablet reading, swipe, zoom, hotspots, keyboard/reflow, and contrast evidence |
| D. Measurement | Audience / data owner | Validated existing reports, consent/event tests, baseline and metric dictionary | Source coverage, stable denominators, event deduplication and consent evidence; two-week baseline |
| E. Audience growth | Editorial / audience lead | One regional beat, one recurring briefing, controlled distribution experiment | Attributed landing quality, second-story reading, opt-in and return cohorts |
| F. Commercial | Commercial lead / CEO | Audience-backed media kit, qualified campaign enquiry, pilot packages and fulfilment reporting | Qualified leads, proposals, fulfilled campaigns, costs, revenue and renewals |

Planning windows: A/B begin in days 1–14; C/D in days 8–30; E/F pilots in days 31–60; review and expand demonstrated results in days 61–90. These windows depend on owner capacity and access, not assumed commitments.

## Current implementation batch

1. Move the custom sitemap index out of the special `sitemap.xml` metadata namespace. Preserve the advertised `/sitemap.xml` entry through a permanent redirect and retain `/sitemap/{id}.xml` chunks. Do not change publication filters or bypass article SEO exclusion settings.
2. Add a regression check that runs against the built application in the existing critical-smoke suite: robots advertisement → sitemap redirect/index → first generated chunk. Function-only tests did not catch the route conflict.
3. Retry a failed E-paper thumbnail once using its unchanged original asset URL. Preserve optimisation and lazy/viewport loading in the normal path, page selection after failure, and a bounded final placeholder.
4. Test the supported-LTS migration using a temporary Node runtime before changing the declared runtime and CI. Preserve the developer's installed Node version and active server.
5. Run focused tests, typecheck, changed-file lint, and `build:ci`; verify built routes and thumbnail recovery in the browser when practical. Record precise failures and limits.

The developer's server owns `.next-dev`; production validation must use `.next` and a separate port. Preserve the existing generated `next-env.d.ts` content after build preparation.

## Investigation gates

### News sitemap

An empty recent-news sitemap is not sufficient evidence of a code defect. Check the deployed SHA, storage authority, eligible published timestamps within 48 hours, and `includeInNewsSitemap`. Maintain intentional editor exclusions and future-scheduled/draft privacy. Fix only a reproduced cause, with Mongo/file parity tests. Do not change live article settings as part of code validation.

### Clickable E-paper stories

Trace upload finalisation → job/worker ownership → processed pages → reviewed story mappings → public reader projection. The local worker opt-out is not a production worker configuration. Do not automatically publish OCR/AI output or invent hotspots to hide an incomplete edition. Verify public story readiness using read-only evidence; exercise writes only in isolated QA resources.

### Node LTS

Verify the dependency lock, Next build, native canvas/image/PDF loading, and worker tests on the selected supported runtime. Update the root engine and workflow versions together. Deployment-host runtime changes remain an operational step and must be verified before rollout; a manifest change alone does not migrate the host.

## Product and business implementation backlog

| Deliverable | Implementation approach | Dependencies and acceptance |
|---|---|---|
| Reader prompt timing | Extend the existing shared engagement component; prompt after a meaningful engagement action | Baseline prompt conversion and dismissal; no early obstruction of reading |
| Readability / contrast | Adjust shared tokens and article styles; preserve established layout and localisation | Compare mobile Hindi reading, dark/light contrast, 200% zoom and keyboard focus |
| Analytics validation | Inspect existing reports before adding dashboards; test consent defaults/updates and SPA deduplication | GTM/GA4 runtime access or approved export; no PII in event metadata |
| Returning-reader KPI | Use an approved cross-visit measurement source | Tab/session IDs are not returning people; document consent/device coverage |
| Campaign intake | Extend the existing enquiry service, validation, storage fallback and admin views | Agree qualification fields and response ownership; integration tests in isolated QA |
| Media kit / packages | Publish verified geography, audience and fulfilment specifications | Real audience and inventory data; no invented reach, rates or testimonials |
| Regional distribution pilot | One beat and briefing; shared UTM convention; human editorial review | Channel access, editorial capacity, consented opt-in and measurable cohorts |
| Weekly operating review | One scorecard with engineering, audience and commercial owners | Two-week baseline, accountable decisions and dated follow-ups |

Proposed primary metrics: weekly returning engaged readers, weekly qualified advertising enquiries, and monthly advertising revenue with campaign contribution. Define each source, numerator, denominator, eligibility window and owner before setting targets. Driver metrics: second-story rate, accepted briefing opt-ins, and conversion of a mature qualified-lead cohort. Guardrails: reader availability, publish-to-reader latency, broken assets, corrections, complaints, and mobile field Core Web Vitals.

## Reviewable operational changes

Before applying GitHub protections, record the repository plan/capabilities, canonical target branch, required check names, reviewer policy and emergency access. Before deployment, record tested SHA, artifact digest, environment-validation result, target runtime, worker configuration, smoke result and rollback target. Do not mark either task complete because configuration templates or documentation exist.

`scripts/phase3/pr-readiness.js` retains `b3/foundation` by default and now accepts
`--base main` for an explicitly chosen main-target release PR. Production CI runs
on pushes to `main`. Record the selected branch policy before applying protections;
the option does not authorise changing the release path. Account for the actual
number of independent maintainers when choosing mandatory approval rules.

## Remaining-work implementation batch

| Original order | Local implementation / evidence | Remaining acceptance owner |
|---|---|---|
| 1. Sitemap | Index redirect and built regression implemented. On 16 October the configured DB had two recent included published articles, local news XML had two entries, and live XML had zero even with a cache-busting query. No eligibility rules changed. | Release owner: identify deployed build/storage/runtime, deploy reviewed code and verify current eligible URLs. |
| 2. E-paper | Thumbnail retry implemented. Read-only DB inspection found 12 published pages and zero stored/released stories for the inspected Indore issue. | Editorial: create/review/release real mappings; engineering: verify worker configuration and touch/zoom/hotspots on actual devices. |
| 3. Release controls | Build-time `/api/version`, strict read-only reader release checker, and explicit PR base selection implemented. | Repository/release owner: apply effective protections/required CI and review, record artifact digest and SHA, run staging rollback drill. |
| 4. Node LTS | Node 24 engine/CI/docs and temporary-runtime verification implemented. | Hosting owner: select Node 24 for web process and workers and verify the deployed artifact. |
| 5. Analytics | Google consent controls, separate Google/first-party page views, anonymous advertising event contract and regression coverage implemented. | Analytics owner: validate actual GTM/GA4 configuration and begin two complete measured weeks using the linked contract. |
| 6. Growth / revenue | Bilingual campaign form, timing and server-recorded contact consent, Mongo/file parity, measurement contract and pilot briefs implemented. | Commercial/CEO: assign triage ownership/retrieval, verify inventory/audience, approve rates/budget, run campaigns and measure receipts/costs. |

Execution references: [measurement contract](../analytics/READER_AND_COMMERCIAL_BASELINE.md), [90-day pilot and package briefs](../business/90_DAY_GROWTH_AND_ADVERTISING_PILOT.md), and [release verification](../deployment/HOSTINGER_DEPLOY.md).

The current request authorises planning and local implementation. Commits, pushes, PR publication, repository administration, production data changes and deployment are not performed by this local batch.

## Delivery record

Populate the accompanying implementation report only with completed checks and observed outcomes. Outstanding work remains explicit; the full 90-day programme is not complete when the current batch lands.
