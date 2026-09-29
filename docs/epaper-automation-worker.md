# Publication automation worker

E-Paper and monthly E-Magazine use the same asynchronous page/OCR job services
and canonical workflow reconciliation. Upload finalization queues work; HTTP
requests do not perform PDF conversion. The pipeline stops at Ready To Publish.
Only an authorized Super Admin publishes a revision.

## Local development

`npm run dev` starts one supervised worker alongside Next. It loads only the
repository's staging environment files and validates the explicit staging
database, origin, and credential configuration before starting either process.
Set `EPAPER_AUTOMATION_WORKER_ENABLED=0` to opt out. An arbitrary development or
production database is not accepted by the development launcher.

## Long-lived Node / Hostinger

Set `EPAPER_AUTOMATION_WORKER_ENABLED=1` in the deployed Node environment to
enable the worker under `npm start`. Production activation is explicit; staging
still requires staging validation. The worker requires the full application
source, `tsconfig.json`, and production dependencies, including `ts-node` and
`tsconfig-paths`, at the project root. A standalone-only Next artifact is not a
complete worker distribution.

For a separately supervised Node process, use `npm run epaper:automation-worker`
with the same validated environment. This persistent process is not intended
for serverless request lifetimes. Do not also run an unmanaged companion under
the same application owner.

The companion restarts with 5?60 second backoff after a crash. Job leases,
revision/generation checks, retry schedules, and renderer containment remain
the correctness boundaries across owners. Idle cycles wait 15 seconds; active
cycles wait two seconds. SIGINT/SIGTERM stops new cycles, lets contained work
finish, and disconnects MongoDB. Existing lease expiry recovers interrupted
work after a process crash.

OCR honors `EPAPER_LOCAL_OCR_ENABLED`. Disabled OCR is reported as skipped;
terminal failures remain failures and warnings, not successful extraction.
Suggestions are never automatically accepted as stories. CMS Advanced /
Recovery offers retry, OCR, and idempotent reconciliation controls.

New revisions remain blocked while source stories/assets are cloning.
Concurrent Add Story requests retry the same initializing draft rather than
creating another. A failed clone remains explicitly blocked; recover it or
delete the incomplete draft through the canonical CMS workflow before retrying.

The preserved QA edition `6ab0da70c6aab6a2a6cab44e` is excluded from automation,
revisions, and story mutation. Use separate temporary staging editions for QA.

## Standalone Mongo content compensation

Hostinger and local development can run the Next server and automation worker
in separate Node processes; multiple owners can share Mongo. Content mutations
therefore use database CAS and conditional compensation, not a process mutex.
Replica sets continue using real driver transactions. Fallback is allowed only
for code 20 / IllegalOperation with the recognized transaction-unavailable
message, before transactional mutation work starts.

Create, legacy story update/delete, and OCR acceptance pass the caller's edition
version. Standalone CAS advances that version before child writes. QA clearing
and ready-stage demotion occur at the final fenced parent write. Create also
performs that final fence even though it has no replacement page array.
Update/delete/OCR finish at their final fenced page write.

On a reported failure, child undo runs in reverse order independently of parent
rollback. Created articles are deleted only if their complete stored snapshot
still matches; updates restore the prior BSON document only if the written
snapshot still matches. Deleted objects are reinserted with the original ID and
timestamps, subject to Mongo's ID and edition/slug uniqueness constraints. OCR
suggestion restoration and article cleanup belong to the same undo sequence.
Newer independent parent writes are preserved. A callback failure after a parent
write restores its affected fields only while its version fence still holds;
versions remain monotonic even when compensation succeeds.

Compensation cannot overwrite a newer child or a valid successor. A failed undo
is logged and raised as incomplete compensation; all remaining undo steps are
still attempted. Compensation is not a substitute for transaction isolation or
durable crash recovery. Audit and reconciliation effects run after commit;
their failures are logged without reporting a committed content save as failed.
No unsafe mutation retry or additional notification/TTS write is introduced.
