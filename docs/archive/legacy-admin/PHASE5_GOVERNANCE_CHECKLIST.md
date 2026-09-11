# Phase 5 Governance Checklist

> [!NOTE]
> **Historical Document**: This document reflects historical pre-freeze governance verification.
> The canonical B3 architecture is defined in `docs/b3/ARCHITECTURE_FREEZE_V1.md` and current operational procedures are in `docs/operations/ADMIN_RUNTIME_CHECKLIST.md`.

Run this when you want to close Phase 5 properly and prove the new super-admin governance surfaces are healthy.

## Automated Checks

Run:

```bash
npm run test:governance
```

These checks cover:

- super-admin-only governance surfaces
- permission helper behavior by role
- deployment safeguard logic
- operational diagnostics runtime helpers

## Manual Super Admin Checks

Sign in as `super_admin` and open:

- `/admin`
- `/admin/audit-log`
- `/admin/permission-review`
- `/admin/operations-diagnostics`
- `/admin/settings`

### Dashboard

1. Open `/admin`.
2. Confirm the leadership dashboard loads without hydration errors.
3. Confirm `Operational Watchlist` still loads.
4. Confirm leadership links to analytics, settings, and other governance pages still work.

### Audit Log

1. Open `/admin/audit-log`.
2. Switch `Audit Scope` between:
   - `All Activity`
   - `Workflow`
   - `Reporting`
   - `Alerts`
3. Switch `Content Filter` between:
   - `All Content`
   - `Articles`
   - `Stories`
   - `Videos`
   - `E-Papers`
4. Confirm the page updates without broken states.
5. Confirm the audit timeline still loads entries.

### Permission Review

1. Open `/admin/permission-review`.
2. Confirm the summary cards load.
3. Confirm `Role Coverage` loads.
4. Confirm `Risk Highlights` loads.
5. Confirm `Route Access Matrix` loads.
6. Confirm these surfaces appear as super-admin-only:
   - `Audit Log`
   - `Permission Review`
   - `Operations Diagnostics`

### Operations Diagnostics

1. Open `/admin/operations-diagnostics`.
2. Confirm the page loads without SSR/hydration issues.
3. Confirm these sections show:
   - `Operational Lanes`
   - `Runtime Readiness`
   - `Active Operational Alerts`
   - `Escalated Report Jobs`
   - `Blocked Editions`
   - `Low-Quality Pages`
   - `Recent TTS Failures`
4. Confirm the related links open:
   - `/admin/settings`
   - `/admin/analytics`
   - `/admin/epapers`
   - `/admin/review-queue`

### Settings

1. Open `/admin/settings`.
2. Confirm `Deployment Safeguards` loads.
3. Confirm `Leadership Report Settings` still loads below it.
4. Confirm `TTS Settings` still loads below that.
5. In `Deployment Safeguards`, confirm:
   - the status cards load
   - the runtime checks load
   - the verification commands are visible
   - the deploy-doc links are visible

## Production Readiness Follow-Up

Before calling Phase 5 complete for production:

1. Run:

```bash
npm run verify:prod-env
```

2. After deployment, run:

```bash
npm run verify:deploy -- https://your-domain.com
```

3. Complete [`ADMIN_RUNTIME_CHECKLIST.md`](../../operations/ADMIN_RUNTIME_CHECKLIST.md).

## Phase 5 Close Rule

Do not call Phase 5 complete until:

- the automated governance tests pass
- typecheck passes
- `/admin/audit-log` works
- `/admin/permission-review` works
- `/admin/operations-diagnostics` works
- `/admin/settings` shows `Deployment Safeguards`
- no new governance/hydration error appears in the browser
