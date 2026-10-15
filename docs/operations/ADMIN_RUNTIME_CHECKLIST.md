# Admin Runtime Checklist

Run this after the basic deploy smoke test when you want to prove admin and CMS behavior in production.

## Automated Guest Boundary Check

Run:

```bash
npm run test:admin-runtime -- https://your-domain.com
```

Or run the combined deploy verification:

```bash
npm run verify:deploy -- https://your-domain.com
```

Current production example:

```bash
npm run test:admin-runtime -- https://lokswami.com
```

This script checks that guests:

- are redirected from `/admin`
- are redirected from `/admin/articles`, `/admin/videos`, `/admin/stories`, `/admin/epapers`, `/admin/media`, and `/admin/categories`
- get `401 Unauthorized` from `/api/admin/articles`, `/api/admin/videos`, `/api/admin/stories`, `/api/admin/epapers`, `/api/admin/media`, `/api/admin/categories`, and `/api/admin/contact-messages`
- get `403 Forbidden` from the super-admin-only `/api/admin/team`

If this script fails, do not trust the admin boundary until the failure is fixed.

## Manual Signed-In Checks

Complete these in a real browser session after logging in with the expected admin method:

1. Open `/admin` and confirm the dashboard loads without a redirect loop.
2. Open `/admin/articles`, `/admin/videos`, `/admin/stories`, `/admin/epapers`, `/admin/media`, and `/admin/categories`.
3. Confirm each list screen loads real data and does not show `Unauthorized`, `Failed to fetch`, or an empty broken state.
4. Open one create or edit screen for articles, videos, stories, and e-papers and confirm the form loads.
5. Open `/admin/settings` and `/admin/ai` and confirm the TTS settings and operations panels load.
6. Perform one safe content action, such as saving a draft article edit, regenerating one TTS asset, or uploading a small image.
7. If Google login is enabled, sign out and sign back in with Google once.

## Super Admin Governance Follow-Up

If the release includes Phase 5 governance surfaces, also check:

1. Open `/admin/audit-log` as `super_admin`.
2. Open `/admin/permission-review` as `super_admin`.
3. Open `/admin/operations-diagnostics` as `super_admin`.
4. Open `/admin/settings` and confirm `Deployment Safeguards` loads above the report and TTS panels.
5. Confirm none of those pages show hydration errors, broken cards, or empty crash states.

## Recommended Network Spot Checks

While the signed-in pages are open, confirm the browser network tab shows successful responses for:

- `/api/admin/articles`
- `/api/admin/videos`
- `/api/admin/stories`
- `/api/admin/epapers`
- `/api/admin/media`
- `/api/admin/categories`

## Release Rule

Do not call admin healthy until:

- `npm run test:admin-runtime -- https://your-domain.com` passes
- the signed-in admin dashboard loads
- the core CMS list screens load
- one safe create, edit, or upload action succeeds
