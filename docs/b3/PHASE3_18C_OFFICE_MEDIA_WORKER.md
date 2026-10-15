# Office-only bounded media reconciliation

`scripts/media/run-office-reconciliation.cjs` calls the existing media cleanup service. It does not provision a scheduler or load environment files. The operator must supply the owned loopback MongoDB database on port 27038, `LOKSWAMI_CMS_QA=true`, its matching QA database name, and the verified `lokswami-staging-media` key, secret, region and `LOKSWAMI_QA_SPACES_ACCESS_KEY_SHA256`.

Example after supplying that isolated environment:

```powershell
node scripts/media/run-office-reconciliation.cjs --cycles 2 --interval-ms 15000 --limit 25 --max-runtime-ms 120000
```

Each cycle emits its actual cutoff and service counters. The service retains receipt validation, reference protection, cancellation tombstones and provider-failure labels. MongoDB and file storage apply the batch bound before cleanup. Existing callers without a bound retain their behavior.

An atomic lock in the machine temporary directory covers the entire execution, including the interval between cycles. A second process for the same database reports `worker_lock_exists` and performs no cleanup. This is single-machine QA coordination, not a distributed production lease.

Normal completion removes only this process's lock. A forced deadline exit retains the lock. Before manually removing a stale lock, inspect its recorded PID and database scope and confirm that the owner has stopped; the worker never automatically reclaims it. Limits are 1–10 cycles, 1–100 candidates per cycle, 1–60 seconds between cycles and at most 10 minutes of runtime. No production scheduler is configured.
