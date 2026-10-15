# Phase 3.18C R03 — request-log privacy review and minimization

## Recovered finding and earlier scope

Earlier project records recovered on 11 October 2026 identify R03 as request-log IP/User-Agent and selected-query persistence outside the anonymous analytics boundary. The full original audit entry was not available verbatim. PR #34 corrected search q/query redaction under an explicitly reconstructed scope; it did not address raw IP/UA retention.

## Correction

Request JSONL entries now store pathname only: all query strings and fragments are removed, including arbitrary keys, encoded/repeated search terms and keys previously treated as benign. Raw IP and User-Agent fields are blank and duplicate actor email is null. The final serialization boundary applies these safeguards even to manually constructed entries.

Method, timestamp, route, status, duration, authenticated actor ID and role remain for operational/security correlation under ADR 003. These logs are not claimed to be anonymous analytics; retained actor IDs and pathnames can still be identifying. Rate limiting and route mutation audit records are unchanged. DISABLE_REQUEST_LOG=true / 1 remains supported. Newly created log directories/files use owner-only modes (0700/0600).

## Retention and access review

Daily file rotation is naming/partitioning, not a retention expiry. The current logger does not delete historic files. The change prevents future raw IP/UA/query/email persistence; it does not rewrite, purge or change permissions on historic production logs. Before enabling these logs in the live acceptance/deployment environment, operators must set and verify retention, restrict REQUEST_LOG_DIR and backup access, and inventory historic files. R06's missing isolated environment remains the practical verification gate. No unsupported retention period or production-deletion action is introduced.

Public analytics already enforces blank IP/UA and query/hash-free paths independently (Phase 3.18B). Its persistence contract and endpoints are unchanged.

## Validation

Actual temporary JSONL persistence checks confirm minimized fields, useful operational metadata and both disable-switch values. Serialization coverage verifies manually supplied raw entries cannot bypass minimization. The request-log aggregate reader continues to summarize status/timing without requiring raw IP/UA/email/query. Focused logger/reader tests passed (8 cases); final CI/review evidence is recorded in the PR and checklist.
