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
