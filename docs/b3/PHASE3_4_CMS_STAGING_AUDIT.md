# LokSwami B3 — Phase 3.4 CMS Audit + Staging / Preview Foundation

**Status:** IN PROGRESS — repository-side foundation established  
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

## 8. Phase 3.4 acceptance criteria

Repository-side acceptance criteria:

- [x] Dedicated Phase 3.4 working branch created from current `b3/foundation`.
- [x] Current CMS surface inventory recorded.
- [x] Four-role RBAC inventory reviewed without runtime modification.
- [x] Phase 3.5 permission-gap register recorded.
- [x] Staging environment architecture documented.
- [x] Dedicated staging env template added.
- [x] Fail-closed staging env validator added.
- [x] Outbound integrations and their staging safety defaults documented.
- [x] Production remains untouched.

Infrastructure acceptance criteria (must be verified outside repository code):

- [ ] Dedicated Preview/Staging deployment exists.
- [ ] Dedicated staging MongoDB database provisioned.
- [ ] Dedicated staging media bucket provisioned.
- [ ] Staging auth/OAuth origins and secrets configured.
- [ ] Staging environment passes `node scripts/validate-staging-env.js`.
- [ ] Preview build and admin route-boundary smoke checks pass.
- [ ] No real outbound email/social/webhook/push event is emitted during verification.

Phase 3.4 is complete only after both repository-side and infrastructure acceptance criteria are satisfied and an owner-reviewed PR is merged.

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
