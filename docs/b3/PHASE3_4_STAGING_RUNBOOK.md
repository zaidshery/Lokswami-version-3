# LokSwami B3 Phase 3.4 — Isolated Preview/Staging Operator Runbook

**Document version:** 1.0.0
**Phase:** 3.4 (CMS Audit + Staging / Preview Foundation)
**Target Architecture:** `Local Development` → `Preview / Staging` → `Production`
**Security Baseline:** Strict isolation between Staging and Production

---

## 1. Overview & Non-Negotiable Safety Invariants

This runbook guides operators through the provisioning and configuration of an isolated Vercel Preview/Staging environment for LokSwami Version 3.

> [!CAUTION]
> **Strict Isolation Invariants:**
> - Never deploy staging to the live domain (`https://lokswami.com` or `https://www.lokswami.com`).
> - Never point staging at the production MongoDB cluster or production database.
> - Never reuse production DigitalOcean Spaces media buckets.
> - Never enter production Resend credentials, email addresses, or webhook secrets.
> - Never enable automated outbound social or n8n webhooks in staging.
> - Never reuse production session secrets (`NEXTAUTH_SECRET`, `JWT_SECRET`).
> - Never configure production Google Tag Manager or Google Analytics container IDs.

---

## 2. Vercel Preview / Staging Deployment Setup

### Step 2.1 — Connect Repository
1. Log in to the non-production Vercel team/account.
2. Import project from GitHub: `zaidshery/Lokswami-version-3`.
3. Set **Framework Preset**: `Next.js`.
4. Ensure Root Directory is set to `./` (repository root).

### Step 2.2 — Branch & Environment Scoping
1. Under **Settings → Environments**:
   - Scope all staging environment variables to **Preview** only.
   - Do **NOT** set these variables in the **Production** environment.
2. Under **Settings → Git**:
   - Verify that pull requests from `b3/*` feature branches automatically trigger **Preview Deployments**.
   - Do **NOT** configure automatic promotion of preview deployments to production domains.
3. Configure a stable Preview alias if supported (e.g. `staging.lokswami.com` or `lokswami-preview.vercel.app`).

### Step 2.3 — Add Staging Environment Variables
Populate environment variables in Vercel under **Settings → Environment Variables (Preview)** using `.env.staging.example` as the canonical reference:

| Variable | Staging Setting / Value Pattern | Purpose |
|---|---|---|
| `LOKSWAMI_ENV` | `staging` | Enforces staging runtime profile |
| `NEXTAUTH_URL` | `https://<preview-domain>` | Base URL for auth callbacks |
| `NEXT_PUBLIC_SITE_URL` | `https://<preview-domain>` | Reader & canonical URL root |
| `MONGODB_URI` | `mongodb+srv://.../lokswami_staging?...` | Dedicated staging database |
| `NEXTAUTH_SECRET` | 32+ random characters | Staging session encryption |
| `JWT_SECRET` | 32+ random characters | Staging JWT signing |
| `DIGITALOCEAN_SPACES_BUCKET` | `lokswami-staging-media` | Dedicated staging bucket |
| `DIGITALOCEAN_SPACES_REGION` | e.g. `sgp1` | Spaces datacenter region |
| `DIGITALOCEAN_SPACES_ACCESS_KEY`| Staging key ID | Spaces read/write credentials |
| `DIGITALOCEAN_SPACES_SECRET_KEY`| Staging secret key | Spaces secret |
| `DIGITALOCEAN_SPACES_CDN_BASE_URL` | `https://<staging-bucket>.<region>.cdn.digitaloceanspaces.com` | Staging CDN endpoint |
| `DIGITALOCEAN_SPACES_CORS_ORIGINS`| `http://localhost:3000,https://<preview-domain>` | CORS origins |
| `SOCIAL_AUTOMATION_PROVIDER` | `manual` | Disables automated social posts |
| `EPAPER_FORCE_STORAGE` | `1` | Protects immutable deploy output |

---

## 3. MongoDB Atlas Isolated Database Setup

### Step 3.1 — Create Staging Database
1. In MongoDB Atlas, select your non-production project or staging cluster.
2. Create a dedicated database named **`lokswami_staging`** (or clearly containing `staging`, `preview`, or `test`).
   > [!IMPORTANT]
   > The database name **MUST** be explicitly identifiable in the connection URI:
   > `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/lokswami_staging?retryWrites=true&w=majority`
   > The validator will reject connection URIs missing the database name or pointing to `lokswami` without a non-production suffix.

### Step 3.2 — Database User & Access Control
1. Create a dedicated database user (e.g. `lokswami_staging_app`).
2. Grant **Read and Write** access restricted **only** to the `lokswami_staging` database.
3. Configure Atlas Network Access (IP Access List):
   - Add Vercel deployment egress IPs or allow access from anywhere (`0.0.0.0/0`) with strong user password.

### Step 3.3 — Fixtures & Seed Data
1. Do **NOT** clone production databases or copy production subscriber/user PII.
2. Initialize staging data using fixtures or sanitized synthetic records:
   ```bash
   npm run seed
   # or demo fixture provision:
   npm run demo:seed
   ```
3. Verify that `briefing_schedules` or notification queues in staging do not contain production webhook destination URLs.

---

## 4. DigitalOcean Spaces Isolated Media Setup

### Step 4.1 — Create Staging Bucket
1. In DigitalOcean Control Panel, navigate to **Spaces Object Storage**.
2. Create a new Space with a non-production name:
   - Example: `lokswami-staging-media` or `lokswami-staging`.
3. Select region matching deployment proximity (e.g., `sgp1`).
4. Keep file listing **Restricted** (private).

### Step 4.2 — CDN & CORS Configuration
1. Enable DigitalOcean Spaces CDN for `lokswami-staging-media`.
2. Under **Settings → CORS Configurations**, add rules:
   - **Allowed Origins:** `http://localhost:3000`, `https://<preview-domain>`, `https://staging.lokswami.com`
   - **Allowed Methods:** `GET`, `PUT`, `POST`, `DELETE`, `HEAD`
   - **Allowed Headers:** `*`
   - **Max Age:** `3600` seconds
3. Confirm that production `https://lokswami.com` is **NOT** included in the staging bucket CORS origins.

### Step 4.3 — Staging Access Keys
1. Under **API → Spaces Keys**, generate a new key pair:
   - Name: `lokswami-staging-media-key`
2. Restrict permissions if bucket-level policies are used.
3. Set `DIGITALOCEAN_SPACES_ACCESS_KEY` and `DIGITALOCEAN_SPACES_SECRET_KEY` in Vercel Preview environment settings.

---

## 5. Google OAuth Configuration (Optional)

If Google sign-in is tested in the Preview/Staging environment:

### Step 5.1 — Google Cloud Console
1. In Google Cloud Console, navigate to **APIs & Services → Credentials**.
2. Prefer creating a separate OAuth 2.0 Client ID for Staging (e.g. `LokSwami Staging Client`).
3. If using an existing multi-origin client, add separate staging entries:
   - **Authorized JavaScript origins:**
     - `https://<preview-domain>`
     - `https://staging.lokswami.com`
   - **Authorized redirect URIs:**
     - `https://<preview-domain>/api/auth/callback/google`
     - `https://staging.lokswami.com/api/auth/callback/google`
4. Never delete or overwrite the production callback URIs.
5. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in Vercel Preview.
   - `GOOGLE_CLIENT_ID` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` must match.

---

## 6. Outbound Integrations — Fail-Closed Staging Configuration

The following outbound services **MUST REMAIN OFF** in staging:

| Service | Environment Variables to Keep Empty | Safety Rationale |
|---|---|---|
| **Resend / Email** | `RESEND_API_KEY`<br>`RESEND_FROM_EMAIL`<br>`CONTACT_ACK_FROM_EMAIL`<br>`LEADERSHIP_REPORT_FROM_EMAIL` | Prevents test editorial flows from sending real emails to real contacts or leadership |
| **Social Automation** | `SOCIAL_AUTOMATION_WEBHOOK_URL`<br>`N8N_SOCIAL_WEBHOOK_URL`<br>`SOCIAL_AUTOMATION_SHARED_SECRET` | Prevents test articles from publishing to public social media accounts |
| **Cron Triggers** | `LEADERSHIP_REPORT_CRON_SECRET`<br>`ADMIN_CRON_SECRET`<br>`CRON_SECRET` | Prevents cron schedulers from triggering external webhook dispatches |
| **Analytics (GA4 / GTM)** | `NEXT_PUBLIC_GTM_ID`<br>`NEXT_PUBLIC_GA4_MEASUREMENT_ID` | Prevents staging test traffic from contaminating live audience analytics |
| **Paid AI APIs** | `GEMINI_API_KEY`<br>`OCR_CUSTOM_API_KEY` | Prevents accidental consumption of paid billing quotas during routine QA |

---

## 7. Verification Procedures

### Step 7.1 — Local Staging Configuration Check
Run the repository validator before deploying:
```bash
npm run verify:staging -- --env-only
```
Expected output:
```text
=== LokSwami B3 Phase 3.4 — Staging Environment & Smoke Verification ===

1. Validating staging environment configuration...
Staging environment validation passed.
PASS: Staging environment configuration is safe (fail-closed guards verified).
Staging environment check completed (--env-only requested).
```

### Step 7.2 — Live Preview Smoke Check
After deploying to Vercel Preview, execute:
```bash
npm run verify:staging -- https://<preview-domain>
```
The script will perform:
1. Origin safety verification (rejection if production domain detected).
2. Live HTTP response probe on staging root (`/`).
3. Reader route probe (`/main`).
4. Admin login route reachable (`/login` or `/signin`).
5. Protected admin guest boundary probe (`/admin` must redirect unauthenticated guests).
6. Public health endpoint probe (`/api/v1/public/health`).
7. Confirmation that outbound integrations remain disabled.

### Step 7.3 — Manual CMS Editorial Smoke QA (Authenticated)
Once live probes pass:
1. Log in to `/admin` with a staging admin account.
2. Verify CMS shell loads without errors.
3. Test article creation with a synthetic article titled `[STAGING TEST] Smoke Verification`.
4. Upload a test image; verify it is saved into `lokswami-staging-media` Spaces bucket.
5. Inspect browser network devtools:
   - Confirm media asset URL hostname is the staging Spaces bucket CDN.
   - Confirm zero requests are sent to `lokswami.com`, `api.resend.com`, or external webhook endpoints.
6. Delete the test article and media asset.

---

## 8. Operator Acceptance Checklist Sign-Off

When external provisioning is complete, record the details in `docs/b3/PHASE3_4_CMS_STAGING_AUDIT.md`:
- [ ] Vercel Preview URL: `https://...`
- [ ] Staging Atlas Cluster: `...`
- [ ] Staging Spaces Bucket: `...`
- [ ] Validator execution output attached to PR #17.
- [ ] Confirmed zero production data or external services touched.
