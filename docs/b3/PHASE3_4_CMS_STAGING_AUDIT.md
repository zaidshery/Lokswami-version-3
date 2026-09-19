# LokSwami B3 — Phase 3.4 CMS Audit + Staging / Preview Foundation

**Status:** REPOSITORY COMPLETE — INFRASTRUCTURE PENDING
**Phase:** 3.4
**Base branch:** `b3/foundation`  
**Working branch:** `b3/phase3.4-cms-audit-staging`  
**Baseline merge:** PR #16 / `cf713e1a3591368ed8c224f788c1e7e9adec5b34`

## 1. Purpose

Phase 3.4 is the discovery and staging-safety gate before any runtime RBAC hardening.
It inventories the current CMS and authorization system, defines a safe Preview/Staging environment contract, and records permission gaps that will be implemented separately in Phase 3.5.

### Non-negotiable invariants

- **No runtime RBAC migration in Phase 3.4.**
- `lib/auth/permissions.ts` and `lib/auth/roles.ts` remain authoritative and unchanged by this phase.
- Live `lokswami.com` and its production data, storage, credentials, outbound integrations, analytics, and DNS remain untouched.
- Staging must never reuse the production MongoDB database, auth secrets, media bucket, or outbound-delivery credentials.
- Human editorial authority remains final; no autonomous publishing or notification dispatch is introduced.

---

## 2. Current CMS inventory

The existing CMS is already broad and production-oriented. The following functional surfaces were found in the repository and should be treated as the current runtime baseline rather than rebuilt in Phase 3.4.

### Newsroom work and editorial operations

- Dashboard
- Work Queue
- My Work
- Review Queue
- Assignments
- Content Queue
- Copy Desk
- Notifications
- Push Alerts

### Content creation and publishing

- Articles: list, create, edit, workflow actions, revisions, locks, TTS/AI helpers
- Stories: list, create, edit, workflow actions
- Videos: list, create, edit, workflow actions
- Social Posts: draft generation, review/status management, dispatch
- Media library and upload flows

### E-Paper

- Issue list/create/edit
- Page upload and page editing
- Hotspots / article extraction
- OCR assistance and OCR jobs
- Page-image generation
- TTS and audio helpers
- Publication / unpublication / release workflow
- Processing jobs and storage-backed assets

### Administration and operations

- Team
- Users / subscribers
- Polls
- Categories
- Contact messages
- AI Ops
- Newsroom Settings
- Election Settings / election-result infrastructure
- Revenue / business-value views
- Core Analytics
- Audit Log
- Permission Review
- Operations Center
- Operations Diagnostics

### API and infrastructure boundary

- Admin APIs exist under `app/api/admin/**`.
- Middleware already applies session/route guarding and rate-limit policy to protected surfaces.
- Database-backed workflows use `MONGODB_URI` through the existing Mongoose adapter.
- Media uploads can use DigitalOcean Spaces.

**Phase 3.4 conclusion:** this phase is an audit and environment-isolation exercise. It is not a CMS rewrite.

---

## 3. Current RBAC inventory

The runtime uses four newsroom roles:

| Role | Current intent |
|---|---|
| `super_admin` | Platform owner / highest control-plane role |
| `admin` | Operational newsroom administration |
| `copy_editor` | Scoped editorial review and editing |
| `reporter` | Content creation and submission |

The current permission matrix contains 39 canonical admin page keys. It already distinguishes several Super-Admin-only surfaces, but some capabilities that are part of the owner-approved future control plane are currently shared with `admin` and/or `copy_editor`.

### Phase 3.5 permission-gap register

These are **findings only**. They MUST NOT be changed in Phase 3.4.

| Capability | Current runtime observation | Approved future direction | Owner phase |
|---|---|---|---|
| E-Paper lifecycle | Admin and/or Copy Editor can access meaningful parts of create/edit/prepare/publish flows | Full sensitive lifecycle governed by Super Admin control-plane policy | 3.5 |
| Team / identity governance | `admin` and `super_admin` can manage team operations | High-stakes role/identity control consolidated under Super Admin policy | 3.5 |
| Newsroom settings | `admin` and `super_admin` currently share access | System-wide settings reviewed for Super Admin-only control | 3.5 |
| Global AI Ops | `admin` and `super_admin` currently share runtime capability | Global AI administration separated from editorial AI assistance and governed by Super Admin | 3.5 |
| Social automation dispatch | Dispatch endpoint currently permits `admin` and `super_admin` | Re-evaluate as a high-impact outbound action during RBAC hardening | 3.5 |
| Operations surfaces | Some operational controls are shared with `admin` | Classify high-stakes controls and apply the approved control-plane policy | 3.5 |
| Election platform controls | Election infrastructure/settings exist | Keep infrastructure/tally/live-widget control distinct from ordinary election journalism; restrict per approved policy | 3.5 |
| Ads / revenue controls | Revenue surface exists; a complete dedicated ad-control domain is not yet represented as a single canonical runtime boundary | Complete permission inventory before Phase 3.10 admin/control-panel expansion | 3.5 / 3.10 |

### Explicit non-changes

Phase 3.4 does **not** alter:

- role names or role normalization;
- menu/sidebar visibility;
- route authorization;
- API endpoint authorization;
- article/story/video workflow permissions;
- E-Paper runtime permissions;
- owner identity rules.

---

## 4. Environment architecture

Canonical progression:

```text
LOCAL
  -> VERCEL PREVIEW / STAGING
  -> PRODUCTION (Phase 3.19 only)
```

### Local

Purpose: authoring, unit/integration tests, fixtures, local browser QA.

- Local database / approved development fixture store.
- Local secrets only.
- Outbound integrations disabled by default.
- No production media bucket.

### Preview / Staging

Purpose: PR preview, CMS UAT preparation, integration testing, responsive QA, migration rehearsal preparation.

Required isolation:

1. **Dedicated MongoDB database**
   - Database name must clearly include `staging`, `preview`, or `test`.
   - Never point `MONGODB_URI` at the live production database.
   - Start with synthetic/fixture content; do not clone sensitive production user data by default.

2. **Dedicated auth/session secrets**
   - Staging `NEXTAUTH_SECRET` must be unique.
   - Staging OAuth callback/origin must be registered separately when Google login is enabled.
   - Never reuse production admin credentials or production session secrets.

3. **Dedicated media storage**
   - Use a separate DigitalOcean Spaces bucket whose name clearly identifies staging/preview/test.
   - Staging CORS must include only local/staging origins.
   - Production `lokswami.com` CORS is not required for the staging bucket.

4. **Outbound integrations fail closed**
   - Social automation provider: `manual`.
   - Social/n8n webhook URLs: empty.
   - Resend API key: empty.
   - Leadership/report cron secrets: empty during Phase 3.4.
   - Staging database starts without production webhook schedules.
   - No real WhatsApp/social/push/email dispatch from staging.

5. **Analytics isolation**
   - Production GTM/analytics identifiers are not reused.
   - Keep `NEXT_PUBLIC_GTM_ID` empty until a dedicated staging property/container is intentionally approved.

6. **External AI/OCR isolation**
   - Paid AI keys remain empty by default.
   - Remote OCR/custom endpoints remain disabled unless a sandbox endpoint is explicitly approved.

The repository-side template is `.env.staging.example` and the fail-closed validator is `scripts/validate-staging-env.js`.

---

## 5. Vercel Preview foundation

There is no checked-in `vercel.json` baseline in the current branch. Phase 3.4 therefore treats Vercel Preview as an environment/infrastructure concern rather than introducing a repository config that could accidentally alter production deployment behavior.

### Required Vercel configuration

- Connect the repository to a non-production Preview/Staging project or an equivalent isolated Preview environment.
- Keep the production project/domain untouched.
- Scope the staging variables from `.env.staging.example` to Preview/Staging only.
- Use a stable staging alias/domain for CMS testing where possible.
- Confirm PRs create Preview deployments from feature branches.
- Do not promote a Preview deployment to the production domain.
- Do not import production environment variables wholesale.
- Run `node scripts/validate-staging-env.js` against the configured staging environment before CMS UAT begins.

### Recommended deployment gates

1. Branch / PR created from `b3/foundation`.
2. GitHub CI passes on the exact PR head.
3. Preview deployment builds successfully.
4. Staging-env validator passes.
5. Guest/admin route-boundary smoke tests pass against the Preview URL.
6. No outbound email/social/webhook event is emitted during smoke/UAT.
7. No production datastore/storage hostname or credential is present in the Preview environment.

---

## 6. Outbound integration inventory

### Social automation

Runtime can dispatch an approved/scheduled social post to n8n or a generic webhook when a provider and webhook URL are configured. Staging must keep the provider in `manual` mode and webhook variables empty.

### Email

Team-invite and contact-acknowledgement email paths use Resend when `RESEND_API_KEY` and a from-address are configured. With credentials absent, those helpers skip delivery. Staging intentionally leaves these values empty.

### Leadership/report webhooks

Leadership report webhook delivery accepts destination URLs from stored schedule/configuration data. Because this path does not rely on a provider API key, Phase 3.4 staging must use an isolated fresh database and must not import production schedules/webhook URLs. Cron secrets remain unset during this phase.

### Push / messaging

Push and other future distribution actions remain human-gated and must stay disabled/sandboxed in staging until their dedicated implementation phase supplies an explicit test provider.

---

## 7. Data and storage policy

- Production data is read-only/out-of-scope for Phase 3.4.
- No production data mutation or migration is authorized.
- Staging uses synthetic fixtures or sanitized datasets.
- User/subscriber PII must not be copied into staging by default.
- Staging media assets use a dedicated bucket/prefix and can be deleted independently.
- Any future production-to-staging snapshot process requires a separate reviewed sanitization procedure.

---

## 8. Phase 3.4 acceptance criteria & status matrix

This checklist tracks the 15 acceptance criteria for Phase 3.4, clearly separating repository-complete items from external infrastructure and verification tasks.

| # | Acceptance Item | Category | Status | Details |
|---|---|---|---|---|
| 1 | **Repository staging safety** | Repository | `REPOSITORY COMPLETE` | Isolated staging contract defined in `.env.staging.example`, zero prod secrets, strict non-prod naming markers. |
| 2 | **CI exact-head green** | Repository | `REPOSITORY COMPLETE` | Lint `@typescript-eslint/no-require-imports` resolved, 19 validator tests pass, `check:phase3-scope` pass, `build:ci` pass. |
| 3 | **Vercel preview/staging provisioned** | External Infrastructure | `EXTERNAL INFRASTRUCTURE PENDING` | Operator action required: connect repo in Vercel, configure Preview environment, set staging env vars per runbook. |
| 4 | **Dedicated staging MongoDB configured** | External Infrastructure | `EXTERNAL INFRASTRUCTURE PENDING` | Operator action required: create `lokswami_staging` database & user in MongoDB Atlas with least privilege. |
| 5 | **Dedicated staging DigitalOcean Spaces bucket configured** | External Infrastructure | `EXTERNAL INFRASTRUCTURE PENDING` | Operator action required: create `lokswami-staging-media` Space, configure CORS, generate staging keys. |
| 6 | **Staging auth secrets configured** | External Infrastructure | `EXTERNAL INFRASTRUCTURE PENDING` | Operator action required: generate 32+ char random `NEXTAUTH_SECRET` & `JWT_SECRET` in Vercel Preview settings. |
| 7 | **Staging OAuth redirect/origin configured if Google auth is enabled** | External Infrastructure | `EXTERNAL INFRASTRUCTURE PENDING` | Operator action required: add staging origin/callback to Google Cloud Console; keep production callbacks intact. |
| 8 | **Production email disabled** | Repository Safety | `REPOSITORY COMPLETE` | Staging contract & validator fail closed if `RESEND_API_KEY` or email sender addresses are populated. |
| 9 | **Production automation disabled** | Repository Safety | `REPOSITORY COMPLETE` | Staging contract & validator fail closed if `SOCIAL_AUTOMATION_PROVIDER !== 'manual'` or webhook URLs are present. |
| 10 | **Production analytics separated/disabled** | Repository Safety | `REPOSITORY COMPLETE` | Staging contract & validator fail closed if production `NEXT_PUBLIC_GTM_ID` or `NEXT_PUBLIC_GA4_MEASUREMENT_ID` are configured. |
| 11 | **Staging env validator passes** | Tooling | `REPOSITORY COMPLETE` | `node scripts/validate-staging-env.js` and `npm run verify:staging -- --env-only` pass with zero errors. |
| 12 | **Admin guest boundary smoke test passes** | Tooling / Smoke | `REPOSITORY COMPLETE — LIVE PROBE READY` | Implemented in `scripts/verify-staging.js`. Tested locally via mock scenarios; awaiting live Preview URL. |
| 13 | **Authenticated CMS smoke test documented** | Documentation / QA | `REPOSITORY COMPLETE` | Step-by-step authenticated editorial QA procedure documented in `docs/b3/PHASE3_4_STAGING_RUNBOOK.md` §7.3. |
| 14 | **Media upload verification documented** | Documentation / QA | `REPOSITORY COMPLETE` | Staging Spaces upload and network inspection procedure documented in `docs/b3/PHASE3_4_STAGING_RUNBOOK.md` §7.3. |
| 15 | **Proof no production outbound event fires** | Governance / Safety | `REPOSITORY COMPLETE` | Runtime architecture verified: missing credentials cause Resend/social/cron dispatchers to gracefully no-op. |

### Status Categorization Summary:
- **Repository-complete items:** Items 1, 2, 8, 9, 10, 11, 12, 13, 14, 15 (All repository artifacts, tooling, validators, and runbooks are complete and verified).
- **External infrastructure items:** Items 3, 4, 5, 6, 7 (Require external operator provisioning in Vercel, MongoDB Atlas, DigitalOcean, and Google Cloud).
- **Manually verified items (pending deployment):** Items 13, 14 (To be executed by operator following `docs/b3/PHASE3_4_STAGING_RUNBOOK.md` once Preview deployment is live).
- **Blocked items:** None blocked within repository scope. External live probes report `MANUAL / BLOCKED` until preview deployment URL is provided.

**Overall Phase 3.4 Status:** `REPOSITORY COMPLETE — INFRASTRUCTURE PENDING`

Phase 3.4 will transition to `COMPLETE` after operator completes external provisioning, live smoke verification passes, and PR #17 is reviewed.

---

## 9. Phase 3.5 handoff

Once Phase 3.4 is accepted, Phase 3.5 may implement the owner-approved CMS Shell / Auth / RBAC hardening across:

- sidebar/menu permissions;
- page/route authorization;
- API endpoint authorization;
- domain permission helpers;
- E-Paper lifecycle controls;
- Team / identity governance;
- Newsroom Settings;
- Global AI administration;
- Election platform controls;
- Ads/revenue control gaps;
- four-role negative/positive authorization tests.

Phase 3.5 must begin from the then-current `b3/foundation` only after Phase 3.4 is reviewed and merged.
