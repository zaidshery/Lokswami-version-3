# CMS acceptance increment 04

Checkpoint: 12 October 2026. Foundation remains **0396d1565270f011e078dfb87b2698405760063f**. No product correction or production deployment is claimed in this increment.

## Recovery and fresh validation

Workspace maintenance removed the previous disposable build and QA runtime. Repository source and the CMS03 evidence packet were recovered from Git. The original user checkout stayed clean and unchanged. New owned checkouts, Node 20.20.2, Chromium 151 and MongoDB 7.0.16 were restored for isolated validation.

The exact #48 implementation head **021a02ba4bf802568a796d759404807f121c4233**, tree **a29a79fe44a4cf849c61b0dc0d0a8db9ee5433da**, received a fresh 657-package npm ci and empty-output production build. Its tree equals current foundation. The existing five browser cases passed with no unexpected, skipped or flaky cases. Build ID: **0_o74teiUGWXpm3oozn6-**. No application files changed; only disposable QA analytics data changed through local browser telemetry. The unchanged CI result remains 3,418 tests; no new full CI run is implied by this local check.

## Runtime probes

The package's component tests use React 18.3.1, whereas Next's App Router bundles **19.2.0-canary-0bdb9206-20250818**. Eight controlled probes loaded the actual AdminShell source using that bundled React/ReactDOM and Node 20.20.2: four completed-HTML cases and four streamed Suspense cases, with combinations of mount-time language updates and unrelated external-store updates. All eight rendered the content without recoverable errors.

These probes mock navigation, icons and the store subscription. They do not contain Next's RSC transport, real authentication or an actual browser HTML parser, so they do not reproduce or clear the production blocker. The first streaming harness implementation incorrectly used only the first output chunk; that harness was corrected to collect the complete initial shell and preserve document loading state. Only the corrected final runner and its final reports are retained here. No product patch was made from the discarded harness failures.

## Browser stream-order comparison

A separate diagnostic reused the newly verified production artifact with a fresh empty isolated MongoDB and actual password sign-ins/session-role assertions. It tested Admin and Reporter, Hindi and English, US browser timezone, two rounds and four routes per context: dashboard, Work Queue, Content Queue and Review Queue. Restricted Reporter routes redirected to Work Queue with access=denied. All 64 route visits completed.

| Mode | Route cases | Globally captured hydration errors |
| --- | --- | --- |
| Normal JavaScript delivery | 32 | 3 |
| JavaScript requests wait for document response completion | 32 | 3 |

The delayed mode held same-origin static JavaScript requests until the corresponding document response finished, with the request count recorded in the raw report. This deliberately changes delivery timing and is diagnostic only, not a proposed workaround or acceptance result. Both modes retain fatal-error listeners from sign-in through navigation; global counts can include arrival documents as well as the 64 target visits. No articles were seeded in this diagnostic; it does not replace the earlier representative timestamp/deadline checks.

The overall error-free gate remains failed. Completing HTML delivery first did not eliminate the failure in this experiment. Root cause remains unproven; the earlier traces still locate the mismatch at the shell content container beside streamed Suspense markers. Further work must isolate the actual Next layout/transport behavior before making a scoped correction. No error suppression, dependency upgrade, auth-policy change, refactor or deployment occurred. Owned browser/server/database processes were stopped, and passwords/secrets/cookies are excluded from retained evidence.

## Remaining work

The five launch items in the [current checklist](PHASE3_18C_FINAL_CHECKLIST.md) remain open: CMS/publication acceptance, reader acceptance, migration/rollback, staging, and production cutover. This increment updates diagnosis only; it does not move to another launch phase.
