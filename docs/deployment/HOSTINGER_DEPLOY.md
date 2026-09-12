# Hostinger Deployment

This project is now prepared for a standard Hostinger Node.js deployment.

This is the only documented production deployment target for the repo. Remove any old non-Hostinger production examples from active environment files and OAuth settings.

For the GitHub + Hostinger auto-deploy path, see [`HOSTINGER_CICD_SETUP.md`](./HOSTINGER_CICD_SETUP.md).
That document covers the recommended CI/CD model for this repo: GitHub Actions for CI, Hostinger's GitHub integration for automatic production deploys, and the optional upload-package fallback workflow.

Assumption:
- You are deploying to Hostinger Node hosting or a Hostinger VPS.
- You are not deploying to PHP-only shared hosting.

## Required Runtime

- Node.js 20 or newer
- MongoDB Atlas or another persistent MongoDB
- Writable app directory for `data/` and `storage/uploads/`

## Required Environment Variables

Minimum production env:

```env
MONGODB_URI=
NEXTAUTH_SECRET=
NEXTAUTH_URL=https://your-domain.com
NEXT_PUBLIC_SITE_URL=https://your-domain.com
ADMIN_LOGIN_ID=admin
ADMIN_PASSWORD_HASH=
```

Example for the current production site:

```env
NEXTAUTH_URL=https://lokswami.com
NEXT_PUBLIC_SITE_URL=https://lokswami.com
```

Required if uploads are enabled:

```env
DIGITALOCEAN_SPACES_ACCESS_KEY=
DIGITALOCEAN_SPACES_SECRET_KEY=
DIGITALOCEAN_SPACES_BUCKET=
DIGITALOCEAN_SPACES_REGION=sgp1
DIGITALOCEAN_SPACES_CDN_BASE_URL=https://your-bucket.sgp1.cdn.digitaloceanspaces.com
EPAPER_STORAGE_UPLOADS_BASE_DIR=storage/uploads
EPAPER_FORCE_STORAGE=1
```

The same DigitalOcean Spaces variables power story videos, story images, thumbnails, and e-paper assets.

If story videos upload directly from the browser, the Spaces bucket also needs a CORS rule for your app origin.

Minimum rule to allow direct story video uploads:

```xml
<CORSConfiguration>
  <CORSRule>
    <AllowedOrigin>http://localhost:3000</AllowedOrigin>
    <AllowedOrigin>https://your-domain.com</AllowedOrigin>
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <AllowedHeader>Content-Type</AllowedHeader>
    <AllowedHeader>*</AllowedHeader>
    <ExposeHeader>ETag</ExposeHeader>
    <MaxAgeSeconds>3000</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>
```

Replace the origins with your real dev and production domains. Without this, reporter story video uploads will fail in the browser before the file reaches Spaces.


Optional if you use Google login:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
ADMIN_EMAILS=
```

Optional AI / OCR:

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
OCR_SPACE_API_KEY=
OCR_SPACE_LANGUAGE=hin
GEMINI_API_KEY=
GEMINI_TTS_MODEL=gemini-2.5-flash-preview-tts
GEMINI_TTS_VOICE=Sulafat
```

Optional leadership report delivery:

```env
LEADERSHIP_REPORT_CRON_SECRET=
LEADERSHIP_REPORT_FROM_EMAIL=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
```

Optional Hostinger release state override:

```env
HOSTINGER_STATE_DIR=
```

## Google OAuth Production Redirect

If Google login is enabled, add these in Google Cloud Console:

- Authorized JavaScript origin: `https://your-domain.com`
- Authorized redirect URI: `https://your-domain.com/api/auth/callback/google`

If you are using the current production domain, that means:

- Authorized JavaScript origin: `https://lokswami.com`
- Authorized redirect URI: `https://lokswami.com/api/auth/callback/google`

## Build And Start Commands

Use these commands on the server:

```bash
npm ci
npm run build
npm start
```

Do not replace the start command with `next start` or `node .next/standalone/server.js`.
Those paths bypass the managed Hostinger release overlap and can bring back stale-chunk 404s after deploys.

Equivalent explicit Hostinger aliases still work:

```bash
npm run build:hostinger
npm run start:hostinger
```

Recommended release flow:

1. Update production env values in Hostinger.
2. Run `npm run verify:prod-env`.
3. Run `npm ci`.
4. Run `npm run build`.
5. Restart with `npm start` or the Hostinger app restart control.
6. Run the live deploy verification before calling the deploy complete.
7. Run the signed-in manual checks before calling admin healthy.

Rollback command:

```bash
npm run rollback:hostinger
npm run start:hostinger
```

That marks the previous prepared release as pending and then promotes it on restart.

What `build:hostinger` does:

- builds the Next.js app into `.next`
- snapshots the new `.next/static` output
- prepares a versioned standalone release under `.hostinger/releases/<build-id>`
- copies `public/` into that prepared release
- merges a short overlap window of older hashed `/_next/static/*` assets into the new release so stale HTML can still resolve its chunks during rollout
- rebuilds a shared `.hostinger/shared-next-static` bundle so any managed release can answer recent hashed asset requests
- records the prepared release in `.hostinger/release-state.json`

On Hostinger Git deployments, the scripts now default that managed `.hostinger` state directory to a persistent path outside `.builds/source/repository/` so static overlap can survive fresh repository checkouts between deploys.

What `start:hostinger` does now:

- promotes the most recently prepared release to current only when the process starts
- starts the promoted release behind a small proxy that serves `/_next/static/*` and `/__next_static__/*` from the shared overlap-aware bundle
- prunes older release directories after promotion
- keeps a wider default overlap of older hashed `/_next/static/*` assets so stale tabs can recover after deploys

This avoids the old failure mode where an in-place build deleted the currently running `.next/standalone/.next/static` files before the new release was fully live, and it also keeps mixed-release requests from turning chunk misses into `text/plain` 404s when Hostinger briefly routes HTML and asset requests to different release generations.

Important for Hostinger auto-deploy:

- the repo default `build` script now performs the Hostinger release preparation step
- the repo default `start` script now launches the Hostinger release wrapper
- this keeps Hostinger's "Build and output settings: Default" path compatible with this repo

## Hostinger hPanel Node App

Recommended settings:

- Application root: project root
- Build command: `npm run build`
- Start command: `npm start`
- Node version: `20` or newer

After deploy, verify:

- homepage loads
- `/api/health` returns `status: ok`
- admin login works
- guest access to admin pages and admin APIs is blocked
- uploads work
- Google sign-in works if enabled
- article, e-paper, breaking news, and AI listen features generate Gemini audio
- `npm run test:tts-smoke -- https://your-domain.com` passes
- leadership report schedules can run from `/admin/analytics`
- the due-run endpoint works with the configured cron secret

## Hostinger VPS

Typical flow:

```bash
npm ci
npm run build
PORT=3000 npm start
```

Then reverse proxy with Nginx to your domain.

## Writable Paths

This app writes runtime data to:

- `data/`
- `storage/uploads/`

Recommended for Hostinger GitHub deploys:

- set `EPAPER_FORCE_STORAGE=1`
- this keeps e-paper assets and breaking-news audio out of `public/uploads`, which is not durable across versioned release deploys

If Hostinger restricts writes inside the app root, set:

```env
EPAPER_STORAGE_UPLOADS_BASE_DIR=/absolute/path/to/writable/storage/uploads
```

## Important Notes

- Do not rely on local JSON data as your primary production database.
- Use MongoDB in production.
- If production uploads are important, configure DigitalOcean Spaces.
- If story videos upload directly from the browser, add the app origin to the Spaces bucket CORS rules.
- Keep `NEXTAUTH_URL` and `NEXT_PUBLIC_SITE_URL` on the same final domain.
- Regenerate `NEXTAUTH_SECRET` only if you are okay invalidating sessions.
- Do not delete `.hostinger/` between deploys. It stores the active release plus recent static snapshots for safe chunk overlap.
- Do not delete `.hostinger/shared-next-static/`. The startup proxy uses it as the shared asset surface for both `/_next/static/*` and `/__next_static__/*`.
- If you need to tune overlap or release retention, set `HOSTINGER_STATIC_OVERLAP_RELEASES` and `HOSTINGER_RELEASE_RETENTION`.
- If your Hostinger setup needs a different persistent writable location, set `HOSTINGER_STATE_DIR`. Relative values resolve from the project root.

## Quick Smoke Test

Before deployment or restart:

1. Run `npm run verify:prod-env`

After deployment:

1. Run `npm run verify:deploy -- https://your-domain.com`
2. Complete the manual checks in [`DEPLOY_SMOKE_CHECKLIST.md`](./DEPLOY_SMOKE_CHECKLIST.md) and [`ADMIN_RUNTIME_CHECKLIST.md`](../operations/ADMIN_RUNTIME_CHECKLIST.md)

`verify:deploy` runs all three:

- `npm run test:smoke -- https://your-domain.com`
- `npm run test:tts-smoke -- https://your-domain.com`
- `npm run test:admin-runtime -- https://your-domain.com`

The smoke script now validates HTML asset integrity for `/signin`, `/main`, and `/main/epaper` by parsing the live HTML and checking that every referenced JS/CSS file under `/_next/static/*` returns `200` with the correct content type.

## Leadership Report Cron

If you want daily, weekly, or monthly leadership briefings to run automatically:

1. Set:
   - `LEADERSHIP_REPORT_CRON_SECRET`
   - `LEADERSHIP_REPORT_FROM_EMAIL` if using email delivery
   - `RESEND_API_KEY` and `RESEND_FROM_EMAIL` if using email delivery
2. Configure schedules in `/admin/analytics`
3. Add a Hostinger cron command like:

```bash
wget -qO- "https://your-domain.com/api/admin/analytics/briefing-schedules/run-due?secret=YOUR_SECRET"
```

Recommended cron frequency:

- every `15 minutes`

Full setup guide:

- [`LEADERSHIP_REPORTS_HOSTINGER.md`](./LEADERSHIP_REPORTS_HOSTINGER.md)
