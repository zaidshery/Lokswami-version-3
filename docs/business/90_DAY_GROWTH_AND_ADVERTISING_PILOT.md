# Ninety-day reader and advertising pilot

Date: 16 October 2026. Planning windows begin after reliability acceptance and named ownership; they are not a record of campaigns already run. Linked measurement contract: [reader and commercial baseline](../analytics/READER_AND_COMMERCIAL_BASELINE.md).

## Operating sequence

| Window | Owner | Work and concrete output | Gate before expanding |
|---|---|---|---|
| Days 1-7 | Engineering / release owner | Review and release sitemap, thumbnail and Node 24 changes; enable branch protections; record exact build and rollback artifact; diagnose production news-sitemap discrepancy | Built checks and remote exact-SHA CI/review; effective protection; host/runtime/worker configuration verified |
| Days 1-14 | Editorial / engineering | Inspect the published Indore edition with zero stories; create/review/release story mappings through the CMS; test page selection, hotspots, swipe, zoom and download on mobile/tablet | Genuine published stories appear and touch QA passes. Monthly magazine remains a separate product. |
| First 14 complete validated measurement days | Audience / engineering | Validate consent and events; collect and review the baseline in the linked contract | Source coverage, reconciliation, exclusions and denominators accepted; no fabricated retention or lead counts |
| Days 15-30 | Editorial / audience | Select one city/beat already supported by staff; produce a recurring briefing and a consistent landing experience; define channel/UTM convention | Repeatable editorial capacity, appropriate opt-in and channel access; acquisition starts only after reliability gates |
| Days 31-60 | Audience / commercial | Run one distribution experiment and a small advertising pilot with verified inventory; log every opportunity and delivery obligation | Readership and qualified leads measured; signed scope, delivery evidence and receipts for paid campaigns |
| Days 61-90 | CEO / owners | Review mature cohorts, delivery cost, complaints, contribution and renewals; retain, revise or stop each pilot | Expand only offers and channels with supported repeat-readership and commercial evidence |

## Pilot package briefs

These are draft scopes to quote after inventory verification. They are not public promises of available inventory, audience size, rates or outcomes.

| Draft offer | Buyer goal | Scope to agree in the proposal | Delivery evidence |
|---|---|---|---|
| Regional display pilot | Local awareness | Verified available page/section positions, dates, geography if supported, creative sizes, landing URL, inventory cap and make-good terms | Placement checks and agreed reporting; use measured impressions/clicks only if the delivery system supports them |
| Clearly labelled sponsored story | Explain a product or business | Paid-content label, claim review, approved copy/assets, distribution scope, publication period and correction process | Published URL, label screenshot, actual delivery/engagement report; editorial independence and approval retained |
| Video sponsorship pilot | Demonstrate an offer | Existing supported placement/player format, duration/assets, rights, schedule and reporting; do not sell pre-roll until its serving path is verified | Approved creative and real placement evidence; actual starts/completions only if instrumented and validated |

Each proposal needs an owner, inventory confirmation, objective, dates, acceptance criteria, price, direct cost estimate, payment terms, cancellations and reporting date. The media kit includes only dated audience/geography figures from verified sources and availability the team can fulfil. Do not invent reach, sell-through, testimonials or guaranteed results.

## Distribution experiment

Use a single regional beat and recurring briefing as the initial editorial hypothesis. Choose a channel the team can actually operate, such as an existing consented newsletter or owned social account. Use stable lowercase UTM values: `utm_source=<channel>`, `utm_medium=<owned-medium>`, `utm_campaign=<city>_<briefing>_<yyyymm>`, and `utm_content=<creative-variant>`. Do not place personal identifiers in URLs.

Change one acquisition variable at a time. Use distinct published landing URLs where needed, comparable weekday windows, fixed editorial quality review and the baseline definitions. Inspect second-story reading, accepted opt-ins and consent-covered return cohorts alongside costs and complaints. Set spend and stop thresholds only after the CEO sees the baseline and approves a budget; no money is committed by this plan.

## Weekly review and lead handover

Keep one ledger row per opportunity: enquiry record ID, received date, qualification date/status, assigned staff, next action/date, proposal amount, agreed inventory/delivery dates, actual receipts, direct costs, campaign result, renewal and reason lost. Keep personal data in the authorised enquiry/CRM source rather than copying it into shared analytics exports.

The commercial owner reviews accepted enquiries, confirms feasibility with editorial/ad operations, qualifies the opportunity, records a next action, and follows through until delivered or closed. Zaid was confirmed as owner on 19 October 2026. The existing admin Contact Inbox includes the advertising queue, next-action notes and dates, with an explicit recovery-file source to inspect after database incidents. Optional staff alerts to the confirmed `tech.lokswami@gmail.com` destination require production activation and delivery validation; see [advertising notifications](../deployment/ADVERTISING_NOTIFICATIONS.md). Staff must still check the queue because alerts are best effort. Choose a response expectation that staffing can meet before publishing it.

The CEO's weekly agenda is one reliability decision, one reader-growth decision and one commercial decision. Record the evidence, accountable owner and due date. Missing source data is an action to resolve, not a zero or an assumed success.
