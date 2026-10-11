# Phase 3.18C R03 — reconstructed request-logging correction

The original R03 finding text is unavailable. The owner authorized completing
the referenced findings on 11 October 2026 after review of the reconstruction
proposal. This document defines the replacement scope from verified behaviour;
it does not claim recovery or closure of an unknown original audit specification.

## Problem and acceptance criteria

`/api/v1/public/search` accepts `q` and `query`. Middleware request logging
previously persisted both terms verbatim, including repeated parameters, in
security JSONL files. Existing secret-key redaction did not cover these keys.

- Redact every `q` and `query` value before a request path is persisted.
- Handle URL-decoded keys, repeated parameters, case variants, Hindi/English,
  and encoded punctuation consistently.
- Preserve benign query fields and existing secret redaction.
- Preserve security forensic identity fields, route/method/status/timing and the
  `DISABLE_REQUEST_LOG=true` / `1` controls.
- Verify actual persistence in a disposable temporary log directory.

This correction changes request-path redaction only. IP and User-Agent policy,
middleware authorization, analytics persistence and search behaviour retain
their existing contracts. Security forensics remain distinct from anonymous
analytics telemetry, as described in ADR 003.

## Verification

Focused coverage: `tests/security-request-logger.test.ts` and
`tests/security-request-log-reader.test.ts`. Release gates are Node 20 focused
tests, typecheck, lint, full CI, build and exact-head independent review.
