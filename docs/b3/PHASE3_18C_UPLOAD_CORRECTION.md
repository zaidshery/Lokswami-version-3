# Phase 3.18C controlled upload corrections

Scope: last verified Story video removal and admin-only pending Story video cancellation.

Story edits validate receipt-backed `mediaAssets` before deriving storage fields. Client-supplied
trusted fields must agree with the canonical result; a request without an asset update cannot
change them. Removing the last video derives an image-only Story and clears its video key,
size, MIME and provider. Existing CAS, leases, edit permissions and revision snapshots remain.

`POST /api/admin/media/:id/cancel` follows the existing admin deletion policy. Reporter and
Copy Editor library deletion and cancellation remain forbidden. Only a server-issued pending
Story video receipt can enter cancellation; verified or attached receipts cannot. The pending
state transition competes atomically with completion. Cancelled receipts cannot be completed,
registered or attached. Cancellation does not repair `referenceTrackingComplete`.

Before cancellation and every cleanup retry, authoritative current and revision references
are checked across persisted content, including foreign owners and alternate delivery paths.
Lookup failures refuse provider deletion. Historical receipts derive their expiry from their
server creation time plus the existing fixed 600-second signing lifetime; missing dates fail
closed. New receipts store the actual signed target expiry.

A still-valid PUT URL cannot be individually revoked with the current provider contract.
Cancellation returns 202 and defers object cleanup until its recorded expiry. After expiry,
successful exact-key cleanup returns 200, but keeps a cancelled tombstone permanently eligible
for `MediaService.reconcileCleanup` and repeat cancellation calls. An upload begun before expiry
may finish later; expiry or a successful DELETE is not proof of permanent provider absence.
The tombstone is deliberately retained so a late object remains owned and recoverable, and
every reconciliation rechecks authoritative references before deleting that exact key.
Provider failures return 503 without reviving the receipt and can be retried idempotently.

Operational limitation: this repository has no scheduled caller for `reconcileCleanup`.
A continuously operated reconciler is required before this can certify automatic cleanup of
late in-flight PUTs. This change does not claim immediate revocation or permanent absence from
one inventory. Do not discard cancelled tombstones or drop a database containing them while
an upload may still be in flight. No cloud lifecycle/permission change is part of this patch.

Controlled fixtures certify these pipeline paths only. Representative editorial workflows,
revision restoration, daily E-Paper/monthly E-Magazine controls and the original ECONNRESET
investigation remain separate acceptance tasks. PR #51 is not modified by this correction.
