# LokSwami V3 — Production Cutover & Disaster Recovery Runbook

**Document Version**: 3.19-RELEASE-RUNBOOK  
**Certified Release Candidate**: `1cfc83c18583ba74dfe314c4a8283dfd05d639c2` on `b3/foundation`  
**Target Environment**: Production (`lokswami.com`)  
**Database**: MongoDB Atlas Production Replica Set  
**Object Storage**: DigitalOcean Spaces Production Bucket  

---

## 1. Pre-Cutover Readiness Checklist

Before initiating the maintenance window, verify all prerequisite gates:

| Gate | Requirement | Verification Command / Evidence | Status |
|:---|:---|:---|:---:|
| **Gate 1** | Functional QA Passed | `artifacts/phase3-qa/3.18c-functional/STAGE1_FUNCTIONAL_REPORT.md` | ✅ PASS |
| **Gate 2** | Manual QA & A11y Passed | `artifacts/phase3-qa/3.18c-manual/STAGE2_MANUAL_REPORT.md` | ✅ PASS |
| **Gate 3** | RC Commit Frozen | `git rev-parse HEAD` = `1cfc83c18583ba74dfe314c4a8283dfd05d639c2` | ✅ PASS |
| **Gate 4** | Migration Rehearsal | `artifacts/phase3-qa/3.18d-migration/reconciliation/RECONCILIATION_REPORT.json` | ✅ PASS |
| **Gate 5** | Recovery & Idempotency | `artifacts/phase3-qa/3.18d-recovery/rerun/REPEAT_MIGRATION_REPORT.json` | ✅ PASS |
| **Gate 6** | Environment Verification | `npm run verify:prod-env` passes with zero missing secrets | ✅ READY |

---

## 2. Maintenance Window Initiation

1. **Notify Stakeholders**: Announce scheduled 30-minute maintenance window for reader & CMS.
2. **Freeze CMS Writes**: Disable editorial write operations on legacy server.
3. **Verify Git Working Tree**:
   ```bash
   git status
   # Must return: On branch b3/foundation, working tree clean
   ```

---

## 3. Production Backup Protocol (Hard Gate)

Before writing to the production database:

```bash
# 1. Capture MongoDB production dump
mongodump --uri="$MONGODB_PRODUCTION_URI" --out="backups/pre-cutover-$(date +%Y%m%d%H%M%S)"

# 2. Compute archive checksum
sha256sum backups/pre-cutover-* > backups/backup_sha256.txt

# 3. Snapshot media assets
# Ensure media storage snapshot or sync is complete
```

> **Mandatory Rule**: Do NOT proceed with migration until the backup size and checksum are verified.

---

## 4. Production Migration Execution Sequence

Run the proven, idempotent migration pipeline:

```bash
# Step 1: Pre-flight validation
node scripts/rehearsal/rehearse-migration-318d.js --validate

# Step 2: Live migration execution
node scripts/rehearsal/rehearse-migration-318d.js --execute

# Step 3: Automated reconciliation
node scripts/rehearsal/rehearse-migration-318d.js --reconcile
```

---

## 5. Post-Cutover Verification (Smoke Tests)

### 5.1 Public Reader Smoke Checks
- [ ] **Homepage**: `https://lokswami.com/` loads in < 1.5s with zero console errors.
- [ ] **Live Updates Rail**: Breaking stories display top priority; non-empty.
- [ ] **Popular News Rail**: Trending stories display; non-empty.
- [ ] **Article Detail**: Readability, responsive typography, images load with proper aspect ratios.
- [ ] **Daily E-Paper**: Edition selector, page flip/navigation, PDF zoom, and download link operational.
- [ ] **Monthly E-Magazine**: Separated monthly issue view loads independently without daily edition filters.
- [ ] **Video Player**: HLS / MP4 playback, captions toggle, and keyboard controls functional.
- [ ] **Search**: Full-text Hindi and English search query returns valid matches.

### 5.2 CMS & Editorial Smoke Checks
- [ ] **Staff Login**: Secure session cookies set (`HttpOnly`, `SameSite=Lax`, `Secure`).
- [ ] **Article Editor**: Create draft, attach featured image, save, preview, and publish.
- [ ] **E-Paper Ingestion**: Upload daily PDF issue, verify page rendering and thumbnail generation.
- [ ] **Withdrawal Test**: Withdraw/unpublish controlled QA article, verify immediate removal from reader feed.

---

## 6. Rollback Decision Matrix

| Trigger Condition | Classification | Action | SLA |
|:---|:---|:---|:---:|
| Database corruption or data loss | **P0 Emergency** | Immediate Rollback to Pre-Cutover Backup | < 5 min |
| Editorial CMS login / publish failure | **P0 Emergency** | Immediate Rollback to Pre-Cutover Backup | < 5 min |
| Public reader 5xx rate > 1% | **P0 Emergency** | Immediate Rollback to Pre-Cutover Backup | < 5 min |
| Missing media assets (> 5% broken) | **P1 Critical** | Rollback if hot-sync fails in 10 minutes | < 10 min |
| Isolated styling defect or minor tag warning | **P2/P3 Non-blocking** | Hotfix in forward release; do NOT rollback | Next release |

---

## 7. Emergency Rollback Execution Sequence

If a P0 condition is triggered:

```bash
# 1. Point traffic back to previous release or maintenance splash
# Switch Cloudflare / reverse proxy router to fallback backend

# 2. Restore production database from pre-cutover dump
mongorestore --uri="$MONGODB_PRODUCTION_URI" --drop backups/pre-cutover-<TIMESTAMP>

# 3. Purge edge CDN caches
# Cloudflare / reverse proxy purge cache: Entire site

# 4. Verify restored site
curl -I https://lokswami.com/api/v1/public/health

# 5. Notify incident team and record post-mortem findings
```
