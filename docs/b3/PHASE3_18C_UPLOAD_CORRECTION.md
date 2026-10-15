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

## Office reconciliation reporting correction

The office live pass at PR #52 head retained a video referenced by a restorable Story revision,
but the broad reconciliation catch counted it as failed and wrote
`cleanupError=provider_cleanup_failed`. A confirmed current or revision reference is now a
retained outcome: it causes no provider DELETE, failure count, or new cleanup-error write.
Registry links and authoritative persisted references are still checked before deletion.

`reconcileCleanup(before)` preserves its `{ deleted, failed }` result for existing callers.
`reconcileCleanupDetailed(before)` runs the same service path and adds `retained` (confirmed
references), `blocked` (invalid or unknown state, including an unexpired tombstone),
`lookupFailed` (authoritative reference lookup could not finish), `providerFailed`
(provider DELETE failed), `persistenceFailed` (database label write or receipt update failed),
and `labelFailed` (failure to persist the error label). `failed` remains the total operational
failure count, counting each failed candidate once regardless of dual provider/persistence
outages. A provider 409 alone is not a reference signal. Only an explicit reference result
or the service's typed reference protection outcome can count as retained. Lookup uncertainty
never permits provider deletion.

In both cancelled upload cleanup and ordinary cleanup, writing `cleanupError: 'provider_cleanup_failed'`
is guarded so a secondary database write failure cannot replace `MediaProviderCleanupError`, mask
`providerFailed`, or terminate iteration over subsequent candidates in the batch. Successful
provider deletion followed by receipt-persistence failure is similarly isolated and counted under
`persistenceFailed` without claiming provider deletion failed.

The historical office receipt already bears `provider_cleanup_failed`. Its provenance cannot
be established from that label alone, so the reporting pass preserves that value; it does not
silently clear or relabel it. The original sanitized before/after audit remains in the office
QA evidence directory. Any later decision to clear that one historical label requires an
audited, receipt-scoped service operation with independent evidence. No direct database repair
or migration is part of this correction.

Cancellation still uses the original expiry gate, exact object key and permanent tombstone.
The new counters do not schedule reconciliation. One successful DELETE or empty inventory
still cannot prove permanent absence of a late in-flight PUT.

Controlled fixtures certify these pipeline paths only. Representative editorial workflows,
revision restoration, daily E-Paper/monthly E-Magazine controls and the original ECONNRESET
investigation remain separate acceptance tasks. PR #51 is not modified by this correction.
