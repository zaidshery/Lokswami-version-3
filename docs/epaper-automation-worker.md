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

Draft revisions cloned from published sources require fresh page QA before
automation or an explicit publish transition can make them ready. Adding a story
clears its page review and keeps the revision in hotspot mapping until that page
is reviewed again. Initial publications retain their existing readiness policy.
The shared E-Paper/E-Magazine page editor exposes revision page QA. Review writes
must carry the inspected edition version; a stale review is rejected with a
conflict instead of approving content saved after the reviewer loaded the page.
Editing or moving a story also clears review attribution on both affected pages;
saving story content does not complete page QA. Accepting an OCR suggestion on a
draft revision also leaves the page pending and clears review attribution; review
of an individual suggestion does not approve the entire page. Manual workflow note/assignment
saves compare the loaded edition version so a worker transition cannot be lost.

PDF worker page arrays are refreshed from the canonical edition before each
page. Processing, rendered-image, failure and final cover writes compare the
inspected version as well as generation/revision. A conflict leaves newer editor
state intact and the queue supervisor retries from the current snapshot.

Legacy editions with missing/null revision metadata normalize to revision 1 and
an empty generation. Page and automation write fences accept these legacy values
only for that normalized snapshot; later revisions and nonempty generations stay
exact. OCR freshness checks use the same revision normalization. A successful
versioned write advances the expected version even when its stored field was
missing, preventing a second stale request from reusing the initial snapshot.
Reconciliation timestamps use these same legacy snapshot filters so blocked
older drafts do not remain permanently unstamped at the front of the worker batch.
The CMS refreshes canonical readiness when automation becomes terminal, including
cloned revisions with no PDF job, and synchronizes its workflow controls while polling.

The preserved QA edition `6ab0da70c6aab6a2a6cab44e` is excluded from automation,
revisions, and story mutation. Use separate temporary staging editions for QA.

## Standalone Mongo content recovery

Hostinger and local development run the Next server and automation worker in
separate Node processes. Standalone content mutations use a database-visible
edition owner and durable write-ahead journal. Replica sets retain real driver
transactions. Fallback requires code 20 / IllegalOperation and the recognized
transaction-unavailable message before transactional mutation work starts.

Caller-version CAS acquires ownership and advances the edition version. Before
each child command, the journal stores its undo intent and original BSON state.
Child reservations carry unique tokens and monotonic content counters. Parent
page changes, QA clearing and ready-stage demotion are staged until the final
owned parent commit. Creating a story marks its page pending and clears its
review attribution, requiring another editorial review.

Ordinary model writes cannot modify an owned edition or reserved child. Readers
hide temporary reservations and pending deletions. Rollback runs undo intents in
reverse order, preserving original IDs and timestamps while advancing child
counters so delayed commands cannot reuse old snapshots. Conditional restoration
respects unique indexes and independent successors. Aborted creations retain a
hidden reservation for 24 hours; only these temporary records receive a TTL date.
Live stories do not receive that expiration.

The running lease lasts ten minutes. Worker cycles recover expired owners,
rollback journals and committed cleanup before processing other jobs. Eligible
journals are also recovered when an edition is loaded or automation is applied.
Failed repair remains durable, logs an error and blocks edits/publication until
recovery succeeds. This is recoverable compensation, not Mongo transaction
isolation. Maintenance using native collections must quiesce application writers
and preserve ownership/counter fences; application writes use the fenced models.

After commit, cleanup releases child tokens and physically removes hidden
deletions. Before releasing the journal, cleanup persists an independent result
receipt keyed by operation ID. Receipts expire after seven days through their
own TTL index and survive later edition mutations. This lets an original caller
recover its committed result when its acknowledgement was lost and another
process already cleaned the journal. Receipt persistence failure retains the
journal. Cleanup failure retains the committed journal for retry without
reporting a coherent save as failed. Audit and reconciliation effects run after
commit and log failures. Arbitrary Mongo errors never trigger fallback, and no
unsafe content mutation retry is introduced. Protected QA editions are excluded.
