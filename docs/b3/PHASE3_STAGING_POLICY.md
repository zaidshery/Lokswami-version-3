# LokSwami B3 — Staging & Environment Policy

## Overview

This policy governs the separation of environments across LokSwami B3. Strict isolation between environments prevents accidental data corruption, unauthorized external notifications, credential leakage, and premature writes to production systems.

---

## The Three Environments

```
+---------------------+     +--------------------------+     +---------------------+
|        LOCAL        |     |     PREVIEW / STAGING    |     |      PRODUCTION     |
| Developer / Harness |     |  Vercel / Staging Domain |     |     Live Readers    |
+---------------------+     +--------------------------+     +---------------------+
| .env.local          |     | Dedicated Staging DB     |     | Dedicated Prod DB   |
| Local/Test Mongo    |     | Sandboxed Integrations   |     | Full Integrations   |
| Offline Snapshots   |     | Mock Outbound Channels   |     | Controlled Cutover  |
| No Live Outbound    |     | Never Reuses Prod Secrets|     | Restricted Access   |
+---------------------+     +--------------------------+     +---------------------+
```

---

### 1. LOCAL Environment

The local development environment is where features and fixes are actively authored and verified via the Fast Loop.

- **Configuration**: Managed via `.env.local` (always gitignored).
- **Database**:
  - Local MongoDB instance or isolated dev test database.
  - Safe local file-store fallback when MongoDB is unavailable (as supported by `lib/db/isMongoAvailable`).
- **Content Harness**:
  - Developers use offline fixtures and real-content snapshots (`npm run content:snapshot:pull`) stored locally under `.local/content-snapshots/`.
- **Integrations & External Outbound**:
  - Strictly **NO production writes**.
  - No live outbound push notifications (Firebase/WebPush disabled or mocked).
  - WhatsApp broadcast triggers disabled or mocked.
  - Social media auto-share disabled or mocked.
  - TTS audio generation sandboxed or using mock audio files.
- **Server Lifecycle**:
  - Run using the canonical launcher: `npm run dev`.
  - Concurrency and PID state are managed via `.next-dev-server.json`. Do not kill global Node processes or run multiple overlapping dev instances.

---

### 2. PREVIEW / STAGING Environment

The staging and preview environment provides a production-grade verification target for PR previews, QA engineers, and editorial review without impacting live readers.

- **Targets**:
  - Vercel Preview deployments (tied to PRs).
  - Dedicated staging domain (e.g., `staging.lokswami.com` or equivalent preview URL).
- **Database Isolation**:
  - Must connect to a **dedicated staging MongoDB database** (e.g., `lokswami-staging`).
  - Under NO circumstances may preview or staging deployments connect to the production MongoDB cluster.
- **Authentication & Secrets**:
  - Separate staging auth secrets (`AUTH_SECRET`, `NEXTAUTH_SECRET`).
  - Staging test user accounts with pre-configured roles for automated and manual QA.
- **Media & Asset Storage**:
  - Isolated staging S3 / DigitalOcean Spaces bucket or distinct `staging/` path prefix.
  - Test uploads must never overwrite or pollute production media assets.
- **Outbound Publishing & External APIs**:
  - Outbound publishing must be **disabled or sandboxed**.
  - Push notifications: sandboxed test topic or disabled.
  - WhatsApp integration: test number/sandbox only.
  - Analytics: events routed to test analytics sink or disabled.
- **Configuration Hygiene**:
  - **NEVER blindly copy or reuse production `.env` files into preview/staging.**
  - Variables must be populated via Vercel Preview environment settings or staging environment injection.

---

### 3. PRODUCTION Environment

The live, reader-facing platform serving news to real users.

- **Scope**: Live production domain (`lokswami.com`).
- **Credentials**: Production-only credentials, production database connection strings, and production CDN/storage keys.
- **Phase Restriction**:
  - Production deployment/cutover may occur only in the explicitly approved cutover phase defined by the canonical B3 roadmap. Accelerator tooling must never initiate production cutover.
  - No experimental code, incomplete migrations, or interim accelerator tooling may target production before formal sign-off under the canonical B3 roadmap.

---

## Secret Hygiene & Zero-Leakage Mandate

1. **Gitignore Integrity**:
   - All `.env`, `.env.local`, `.env.production`, `.env.staging`, and `.env*.local` files are strictly gitignored.
   - Run `npm run check:phase3-scope` before every commit to verify that no secret or credential files have been staged.
2. **Logs & PR Reports**:
   - Secrets, tokens, connection strings, API keys, and private URLs must **NEVER** appear in git commit messages, PR descriptions, terminal logs, or screenshot artifacts.
   - Any script output reporting credentials must sanitize or redact sensitive values (e.g., displaying `mongodb+srv://user:***@cluster...`).
3. **Audit & Remediation**:
   - If a secret is accidentally committed to a branch or exposed in a PR, it must be treated as compromised, immediately revoked, rotated, and purged from Git history.
