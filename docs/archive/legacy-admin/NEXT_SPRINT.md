# Next Sprint Direction

> [!NOTE]
> **Historical Document**: This sprint planning note predates the official Phase 2 Architecture Freeze v1.
> Authoritative project direction is maintained in `docs/b3/ROADMAP.md` and `docs/b3/ARCHITECTURE_FREEZE_V1.md`.

## Sprint Goal

Make production operations boring.

That means:

- admin login should work every deploy
- CMS screens should load without auth or data surprises
- uploads and e-paper publishing should be easy to verify
- production issues should be diagnosable quickly

## Priority Order

1. Prove login and admin flows in a real deploy
2. Harden uploads and e-paper publishing
3. Improve production visibility
4. Raise the SEO/content-discovery baseline again

## 1. Login And Admin Runtime Proof

Why this is first:

- local tests are better now, but live admin behavior still needs stronger runtime proof
- this is the fastest way to catch broken auth, bad env values, callback mistakes, and redirect loops

Work:

- add one documented production admin verification pass for `articles`, `videos`, `stories`, `epapers`, and `media`
- add a focused regression script for credentials-based admin login if the current scripts are not enough
- document the exact Google OAuth production checks when Google sign-in is enabled
- verify all `/api/admin/*` read and write routes follow the same auth rule

Done when:

- guest users are blocked from all admin APIs
- admin sign-in works after deploy without redirect loops
- admin lists load for articles, videos, stories, e-papers, and media
- one create or edit action succeeds in production

## 2. Upload And E-Paper Hardening

Why this is second:

- uploads and e-paper publishing are the highest-risk editor workflows
- these features depend on storage, permissions, and external config, so they deserve explicit hardening

Work:

- add tests for e-paper upload and import edge cases
- improve error messages for upload failures so editors can tell whether the issue is auth, file type, file size, storage, or config
- verify DigitalOcean Spaces and local-storage fallback behavior is intentional
- document recovery steps for a failed e-paper upload or failed page-image generation

Done when:

- one article image upload succeeds
- one e-paper upload succeeds
- the latest e-paper opens from the reader side after publish
- a failed upload shows an actionable error instead of a generic failure

## 3. Production Visibility

Why this matters:

- a stable app is much easier to keep stable when failures are obvious

Work:

- add structured logging around admin auth failures, upload failures, e-paper import failures, and database connection errors
- make the deploy checklist point to the exact logs or routes to inspect first
- review `/api/health` and decide whether a storage sanity check should be added without exposing sensitive details

Done when:

- a failed deploy can be triaged in under 5 minutes
- auth, DB, and storage problems are distinguishable from each other
- the smoke checklist plus logs are enough to decide whether to roll forward or stop

## 4. SEO And Content Discovery

Why this is fourth:

- the metadata baseline is better now, so the next lift should focus on richer search presentation instead of basic tags

Work:

- add structured data for the site and key content pages
- review category naming so canonical category URLs stay consistent
- extend metadata coverage to any remaining reader routes that still rely on defaults
- prepare a Search Console and sitemap verification checklist for the live domain

Done when:

- the core reader routes have intentional metadata and structured data
- category URLs are predictable
- sitemap and robots output are verified against the live production domain

## Not This Sprint

Avoid diluting the sprint with these unless they become blocking:

- major visual redesign work
- large AI feature expansion
- broad analytics/dashboard refactors
- non-production deployment targets

## Recommended Sequence

1. Finish the live admin verification script/checklist
2. Harden upload and e-paper failure paths
3. Add logs and triage notes
4. Do the next SEO pass

## Sprint Exit Rule

Call the sprint successful only if:

- deploy smoke checks pass
- admin login is proven in production
- one CMS upload and one e-paper publish succeed
- production issues are easier to diagnose than they were at the start of the sprint
