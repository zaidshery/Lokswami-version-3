# Reader and commercial measurement contract

Status: measurement design and local instrumentation, 16 October 2026. No production baseline or targets have been measured by this change. Accountable roles below need named people before launch.

## Decisions and sources

Weekly decisions: retain a regional beat/briefing when it improves repeat engaged reading without harming reader reliability; expand an advertising package only after delivery and contribution are demonstrated. The CEO/release owner assigns one engineering, editorial/audience and commercial owner.

Use the existing CMS audience report and first-party event store for anonymous tab-session diagnostics, GA4 for consent-covered cross-visit cohorts after runtime validation, the enquiry store for accepted requests, and a commercial ledger for qualification, proposals, delivery, receipts and costs. Do not combine these into a person-level profile or treat a tab session as a returning person. No new dashboard is required to start.

## Metric dictionary

| Metric / decision role | Definition and window | Authority and owner | Limits / action |
|---|---|---|---|
| Weekly returning engaged readers / audience outcome | GA4 returning users with an engaged session on reader content, seven complete days in Asia/Kolkata | Validated GA4 export; audience owner | Consent/device coverage only, not all readers. Mark unavailable until that source is validated. Set a target after baseline. |
| Second-story rate / reading driver | Tab sessions with at least two distinct published article paths divided by tab sessions with at least one, over seven complete days | First-party page views, canonical path deduplication; audience owner | Exclude admin, preview, test and known bot activity. Reloads of the same story do not qualify. Sessions are tab-scoped, not people. |
| Briefing opt-ins / distribution driver | Distinct newly consented subscriber records created during the period, deduplicated by the existing subscription authority | Subscriber / marketing-lead records; audience owner | Separate existing subscribers, failed captures and bot honeypots. Do not count clicks as subscriptions. |
| Weekly qualified campaign enquiries / commercial outcome | Accepted requests first qualified during the week with valid contact, real business, geography, objective, intended timing and feasible inventory | Enquiry record plus human qualification ledger keyed by record ID; commercial owner | One business opportunity once. Exclude tests, spam and repeated requests. Missing budget is an item to clarify, not automatic rejection. |
| Intake completion / funnel diagnostic | `advertise_inquiry_success` divided by `advertise_inquiry_start` in the same tab-session cohort, allowing seven days to mature | First-party event store; engineering/audience owner | Client success is diagnostic, not authoritative accepted/qualified leads. Reconcile accepted records; honeypot responses must not be reported as real leads. |
| Proposal-to-paid conversion / sales driver | Qualified opportunities that pay within 30 days divided by qualified opportunities with a complete 30-day observation window | Commercial ledger and payment receipts; commercial owner | Group by qualification cohort; do not divide this week's payments by this week's new leads. |
| Monthly revenue and campaign contribution / commercial outcome | Actual received campaign payments; contribution equals received campaign revenue less agreed direct fulfilment costs | Payment receipts, credits/refunds and cost ledger; CEO/commercial owner | State currency, tax treatment and recognition basis. Proposal amounts and uncollected invoices are separate. |
| Delivery completion and renewal / fulfilment | Agreed placements/time periods delivered divided by contracted placements; repeat paid campaigns from mature completed-campaign cohorts | Approved inventory plan, delivery log, receipts; commercial owner | Report missed placements, make-goods, complaints and unpaid work alongside revenue. |

## Events and privacy

The new form emits `advertise_inquiry_start` once per mounted form, then `advertise_inquiry_success` or `advertise_inquiry_error` after a response. Source: `advertise_page`. Only campaign type and coarse UI context belong in these events. Contact details, message, target city text, budget and dates stay in the enquiry record. The server classifies this source as anonymous and drops arbitrary metadata, IP and user agent from its analytics events. Contact data remains in the separate enquiry storage under its existing access controls.

Contact consent is a required explicit boolean. The server records its own timestamp and `advertise-contact-v1`, plus the campaign timing. This is permission to answer the enquiry, not a newsletter subscription. Existing historical records without those fields are not retroactively consented. Mongo and file fallback both preserve the new fields.

## Fourteen-day baseline protocol

1. **Day 0, engineering + audience:** deploy the reviewed build, verify `/api/version`, use GTM Preview/GA4 DebugView to check decline, allow, withdrawal, initial page view and SPA navigation. Confirm no duplicate container/history page view. Test at least desktop, mobile and tablet. Record hostname, build SHA, tag/container revision, timezone, consent coverage and exclusions.
2. **Days 1-2, source validation:** run an isolated test brief, check that exactly one accepted record is available to the responsible staff member, compare anonymous funnel events, and exclude that test from business reports. Verify successful/failed newsletter captures separately. Do not send QA requests to live storage in automated tests.
3. **Days 1-14, baseline:** collect two complete weeks after the checks pass. Export the same source windows daily; preserve late-arrival cutoff and distinguish zeros from missing data. Freeze event definitions during the window or restart affected comparisons after a material change.
4. **Weekly, all owners:** review raw counts and denominators before percentages. Inspect source/device/city coverage, bot/test exclusions, duplicate requests and missing event days. Report disagreement between client events and accepted records as a data-quality issue.
5. **Day 15, CEO + owners:** choose explicit targets from observed traffic, editorial capacity and fulfilment margin. For sparse counts, extend observation and report counts; do not claim statistical improvement from a few enquiries. Compare weekdays and attribution coverage before interpreting a change.

Guardrails at each review: public availability and sitemap status, publish-to-reader delay, failed assets, corrections and complaints, opt-out/dismissal rates, and field mobile Core Web Vitals from a real-user source. Release blockers take priority over acquisition spend.

## Operational gaps before baseline

On 19 October 2026 the user assigned Zaid as commercial follow-up owner. The existing admin Contact Inbox now includes advertising enquiries, status, next-action notes and a follow-up date. New and unassigned enquiries default to Zaid. Database and recovery-file queues are explicitly selected, and stale edits fail instead of overwriting another change. This does not send email notifications or subscribe leads to marketing. Verify the deployed staff flow and recovery-file retrieval before promoting the form.

Production GA4 browser access was declined on 19 October; no property setting was changed and no validated baseline was started. The payment ledger, source coverage, inventory and spending limit still require verification before any paid pilot. No cross-visit retention or revenue figures are certified here. The baseline window begins only after the Day 0 acceptance above, not automatically on the date of this document.
