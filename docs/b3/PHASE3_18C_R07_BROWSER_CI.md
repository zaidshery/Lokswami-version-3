# Reconstructed R07: critical browser CI

The original R07 acceptance criteria remain unavailable. This scope was reconstructed from the recovered Playwright CI reference and the owner's 11 October 2026 authorization.

## Verified defects

- The workflow installed Chromium but never ran the critical Playwright end-to-end suite. Vitest explicitly excludes `tests/e2e`.
- The unauthenticated admin assertion accepted any URL containing `admin`, including the protected page itself.
- Playwright could reuse a pre-existing server in CI instead of exercising the tested build.

## Acceptance criteria

- After a successful production build, CI runs the two critical smoke tests with Chromium.
- `/main` exposes the reader title; an unauthenticated `/admin` request reaches `/signin` with `/admin` as its redirect target.
- CI starts its own production server, rejects `test.only`, and fails on browser errors.
- Local development server reuse and explicit `PLAYWRIGHT_BASE_URL` support remain available.
- The isolated CI server receives a synthetic auth secret and localhost auth origin so the sign-in surface can render in production mode. These are test-only values, not deployed credentials.

This smoke suite requires no live CMS credentials. It does not replace representative-content or four-role acceptance testing. Validation includes the configuration contract tests, lint, typecheck, full CI tests, production build and the new browser step. This reconstructed correction does not establish recovery of the original audit finding.
