# Office archived Article publication correction

Continuation base: draft PR #56, `070961671af8783b15deeccca2c74053afe4f14d`, office build `Yb0TPcDpFcJOJG9E2vL4y`.

Genuine Super Admin and Admin password sessions reproduced `PATCH /api/admin/articles/6ace80a6e110254454c18a94` with `{ "action": "publish", "expectedVersion": 6 }` returning HTTP 500, `{ "success": false, "error": "Failed to process request" }`. The server exception was `Cannot move article from archived to published` from the shared Article workflow engine. Before/after Mongo documents were identical; public Article GET remained 404. Reporter and Copy Editor received 403, anonymous requests 401, and stale versions 409.

The approved requirements require human publication authority and exclusion of archived Articles from public feeds. They establish revision history/restoration but do not establish Article publication reactivation. The current Article workflow has no outgoing archived transition; urgent publishing also rejects archived state. The legacy/new Article CMS exposes historical content Restore separately from workflow actions. The E-Paper production workflow has different transitions and does not authorize an Article reactivation transition.

The correction returns a controlled HTTP 409 for archived Article workflow actions, after existing authorization and expected-version checks and before readiness, persistence or side effects. The message explicitly distinguishes content revision restoration from publication reactivation. No state-machine transition, permission, lease, CAS, scheduling or visibility rule changes. Both persistence modes share this service boundary. Active Article workflows and revision restoration retain their existing behavior.

Focused route coverage exercises actual publish requests in Mongo and file modes, both publishing roles, scheduling/urgent-publish rejection, unauthorized/anonymous requests, unchanged Article data, absent writes/activity/notifications, and stale-version conflict precedence. Existing successful publishing, scheduling, revision restoration and public eligibility regressions remain applicable.

Publication reactivation is a separate unresolved product decision. This correction documents current rejection; it does not certify that policy as an approved reactivation design or fulfill a reactivation acceptance gate.

Raw candidate/build-bound office observations and preserved failures are under the original checkout's ignored `artifacts/phase3-qa/phase318c-office-20261013/archive-content-20261014/`. PR #56 cleanup acceptance is reused; the continuation reviews compound ordering, fixed cutoffs, bounded wrap, durable checkpoint scope/atomic rename, restart and lock behavior without rerunning its full provider/expiry acceptance.

The historical R08 packet was not located in the searched office project/archive paths. An independent approved public GET/HEAD snapshot recovered September magazine source `6ab67a054962ca75c38e8294`, with a 10,279,913-byte PDF and its cover. Its PDF SHA-256 is `6d93e0fdcf90631e01a9d6d542af37046d5273cbb753f39c88292b2dfc9b48e5`. This is a fresh public snapshot, not recovery of the original R08 manifest. Daily source PDFs remain daily sources only. English representative copy, source captions, device/screen-reader/browser-zoom and performance gates require their own evidence.
