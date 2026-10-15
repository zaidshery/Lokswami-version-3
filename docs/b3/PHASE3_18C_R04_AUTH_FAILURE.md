# Phase 3.18C R04 — reconstructed middleware failure scope

The original R04 audit text is unavailable. This replacement scope is based on
the referenced middleware-auth area and a reproducible exception-path defect.

When token decoding or middleware dependencies throw, middleware previously
returned `NextResponse.next()` for protected CMS and reader routes. The patch
returns a generic, non-cacheable 503 for `/admin`, `/api/admin` and the same
account/saved/preferences prefixes already governed by the reader guard.

Acceptance: protected exception paths never forward the request; internal error
details do not enter the response; ordinary successful/unauthenticated flows
and public read availability retain their existing behaviour. Existing upload
stream bypass and route-level authorization are outside this correction.

Regression coverage: `tests/middleware-auth-failure.test.ts`, existing middleware
rate-limit tests, route guard tests and auth-guard checks. Full CI and independent
exact-head review remain merge gates.
