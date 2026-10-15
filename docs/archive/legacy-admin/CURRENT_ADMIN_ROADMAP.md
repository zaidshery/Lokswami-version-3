# Lokswami Admin Current Roadmap Status

> [!WARNING]
> **Historical Document**: This document reflects historical admin roadmap status prior to Architecture Freeze v1.
> The canonical roadmap is located at `docs/b3/ROADMAP.md` and current architectural specifications are at `docs/b3/ARCHITECTURE_FREEZE_V1.md`.

This file replaces the older "future roadmap" view with the current real build status of the admin platform.

## Purpose

Use this document as the live status sheet for the admin system:

- what is already built
- what is partially complete
- what is still missing
- which phase is actually current
- what should be built next

## Completed Build-Wise

### Workflow and permissions foundation

- Central role model and permission helpers are in place.
- Role-aware page access exists across the admin shell and core admin routes.
- Shared newsroom workflow states, transitions, assignments, and activity patterns are implemented across core content flows.

### Role-based admin experience

- Super admin has a leadership-style dashboard and navigation.
- Reporter, editor, admin, and super admin workflows have different landing experiences.
- Shared queue-style views such as `My Work` and `Review Queue` are present.

### Content workflow

- Articles support newsroom workflow, assignment, review actions, timeline/activity, and queue filtering.
- Stories support the same newsroom workflow model instead of simple CRUD only.
- Videos support the same newsroom workflow model instead of simple CRUD only.
- E-paper has a production workflow with page QA, quality signals, blockers, production stages, and shared queue visibility.

### Super admin leadership and reporting

- Leadership dashboard exists with decision center, watchlist, team health, and growth highlights.
- Analytics center is no longer a placeholder.
- Leadership briefings exist in daily, weekly, monthly, and growth variants.
- Report delivery supports dashboard links, markdown export, email, and webhook delivery.
- Delivery providers include generic JSON, Slack, Discord, Microsoft Teams, and Telegram.
- Delivery preview, retry, diagnostics, metrics, trends, alerts, mute, acknowledge, and resolve flows exist.

### Governance and hardening

- Audit log exists for super admin.
- Permission review exists for super admin.
- Operational diagnostics exists for super admin.
- Deployment safeguards exist in settings.
- Governance test suite and runtime checklists exist.

### Audience, growth, and business insight

- Audience analytics tracks page views and engagement-style events.
- Audience segmentation includes device, acquisition source, section, timezone, language, country, and campaign data.
- Conversion leaders exist by device, source, section, and campaign.
- Best and worst converting audience paths exist.
- Growth analytics has its own dedicated tab.
- Growth watchlists, opportunity matrix, and growth highlights exist.
- Growth insight is included in dashboard, exports, and leadership briefings.

## Partial / In Progress

These areas are real and usable, but not fully finished across the entire platform.

### Design consistency

- The modern super-admin shell and analytics/reporting surfaces are strong.
- Some older admin pages still need visual unification under one premium design system.
- Categories, media, and some legacy content pages still do not feel as polished as the newest dashboards and operations panels.

### Team and inbox operations

- Team management is strong and leadership-friendly.
- Contact inbox exists and is usable.
- Deeper inbox operations such as SLA views, canned replies, richer resolution analytics, and stronger management reporting are still incomplete.

### Final phase closeout

- Several later phases are build-complete, but still need browser QA and milestone closeout.
- Some phases also still need final milestone commits if you want the roadmap to be "administratively closed," not just feature-built.

## Still Remaining

These are the main roadmap items that are not yet fully built.

### Newsroom operations still missing

- Breaking-news / push-alert composer
- Homepage slot management
- Stronger live newsroom control-room tooling

### Deeper admin modernization

- Media library modernization: better search, tagging, usage references, and bulk operations
- Categories modernization: stronger search, usage context, and better workflow fit
- Final design-system unification across every admin page

### Business and monetization depth

- Lead-value scoring
- Section-value scoring
- Best lead-producing page analysis
- Strongest campaign-to-contact surface analysis
- Revenue / ad analytics if ads become part of the product

### External analytics depth

- Deeper external analytics integration beyond internal tracking
- GA4-style broader reporting if you decide to merge first-party and external signals

## Phase Status

### Phase 1: Workflow Foundation

Status: complete build-wise

Included:

- permissions foundation
- workflow contracts
- role-aware shell
- newsroom workflow base across core modules

### Phase 2: Leadership Dashboard and Analytics Foundation

Status: complete build-wise

Included:

- leadership dashboard
- analytics center foundation
- saved views, compare, export, briefing generation

### Phase 3: Reporting Automation and Delivery Intelligence

Status: complete build-wise

Included:

- delivery center
- email and webhook delivery
- retries, diagnostics, trends, alerts, notifications

### Phase 4: Audience and Growth Analytics Expansion

Status: build-complete, closeout pending

Included:

- audience segmentation
- conversion leaders
- path performance
- campaign analytics

Closeout still needed:

- browser QA
- export checks
- milestone commit if desired

### Phase 5: Governance and Hardening

Status: build-complete, closeout pending

Included:

- audit log
- permission review
- operational diagnostics
- deployment safeguards
- governance test coverage

Closeout still needed:

- browser QA
- runtime checklist confirmation
- milestone commit if desired

### Phase 6: Business Growth Intelligence

Status: build-complete, closeout pending

Included:

- growth tab
- growth watch
- growth opportunity matrix
- dashboard growth highlights
- growth briefings

Closeout still needed:

- browser QA
- export checks
- milestone commit if desired

### Phase 7: Business Value and Revenue Intelligence

Status: in progress (backend aggregation APIs built)

Recommended scope:

- [x] lead-value scoring API
- [x] top lead-producing pages API
- [ ] section-value scoring
- [ ] business impact ranking
- [ ] strongest campaign-to-contact surfaces
- strongest campaign-to-contact surfaces

### Phase 8: Advanced External Analytics and Monetization Ops

Status: future

Recommended scope:

- external analytics integration depth
- revenue / ad analytics
- monetization performance reporting
- executive commercial dashboards

## Current Priorities

### First priority

Close out the later build-complete phases properly:

1. Phase 4 QA and closeout
2. Phase 5 QA and closeout
3. Phase 6 QA and closeout

### Second priority

Start Phase 7 only after the closeout above is done cleanly.

## Recommended Next Build

If you want to continue after closeout, the strongest next build is:

### Phase 7: Business Value and Revenue Intelligence

Build this in order:

1. lead-value scoring
2. section-value scoring
3. lead-producing page leaders
4. strongest campaign-to-contact surfaces
5. business impact summary on super-admin dashboard
6. value snapshot in leadership briefings

## Simple Summary

The admin is no longer just a CMS base.

It is now:

- a newsroom workflow system
- a leadership reporting system
- a governance and diagnostics surface
- a growth analytics surface

What remains is no longer the original foundation work.

What remains is:

- closeout and QA for later phases
- final design consistency
- business value / revenue intelligence
- advanced newsroom operations like breaking alerts and homepage control
