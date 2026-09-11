# Lokswami

Hindi news PWA built on Next.js 15 with TypeScript, Tailwind CSS, MongoDB, Zustand, and NextAuth session auth.

## Human Overview

This project is the full Lokswami digital news platform.

- Readers can browse Hindi news, videos, stories, and e-paper editions.
- Admin users can sign in and manage articles, categories, stories, videos, and e-paper uploads.
- The app also includes AI-powered summaries and text-to-speech support.
- The codebase is split so reader pages, admin tools, auth flows, and marketing pages stay organized while sharing the same data layer and UI system.

Developer handoff note: this human-readable overview was added for easier onboarding by `ZaidShery`.

## Stack

- Next.js 15 App Router
- TypeScript
- Tailwind CSS
- MongoDB + Mongoose
- NextAuth v5 beta
- Zustand
- Framer Motion

## App Structure

Route groups keep public URLs unchanged:

- `app/(auth)` -> `/login`, `/signin`
- `app/(admin)` -> `/admin`, `/dashboard`, admin CMS pages
- `app/(reader)` -> `/main/*`, `/article/[id]`, section pages
- `app/(marketing)` -> `/`, `/about`, `/advertise`, `/careers`, `/contact`, `/digital-newsroom`

Shared components live at the top level:

- `components/ui`
- `components/layout`
- `components/forms`
- `components/providers`
- `components/auth`

## Authentication

- Single auth system: NextAuth sessions
- Unified sign-in page: `/signin`
- `/login` permanently redirects to `/signin`
- Reader sign-in can use Google OAuth
- Admin sign-in can use env-backed credentials and optionally Google allowlisting
- Middleware protects `/admin/*` plus reader-only routes such as `/main/saved` and `/main/preferences`

## Environment

Copy `.env.local.example` to `.env.local` and set the values you actually use.

Minimum local setup for admin credentials sign-in:

```env
MONGODB_URI=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
ADMIN_LOGIN_ID=admin
ADMIN_PASSWORD_HASH=
```

Add Google OAuth only if you want Google sign-in:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

Also supported:

- `ADMIN_USERNAME` instead of `ADMIN_LOGIN_ID`
- `JWT_SECRET` or `AUTH_SECRET`
- `ADMIN_EMAILS`, `ADMIN_GOOGLE_LOGIN_ENABLED`
- `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_GTM_ID`
- `DIGITALOCEAN_SPACES_ACCESS_KEY`, `DIGITALOCEAN_SPACES_SECRET_KEY`, `DIGITALOCEAN_SPACES_BUCKET`, `DIGITALOCEAN_SPACES_REGION`, `DIGITALOCEAN_SPACES_CDN_BASE_URL`
- `OPENAI_API_KEY`, `OPENAI_MODEL`
- `GEMINI_API_KEY`, `GEMINI_TTS_MODEL`, `GEMINI_TTS_VOICE`
- `OCR_*`
- `NEXT_IMAGE_ALLOWED_HOSTS`

## Local Development

```bash
npm install
npm run seed
npm run dev
```

Open `http://localhost:3000`.

Useful checks:

```bash
npm run lint
npm run typecheck
npm run build:ci
npm run build:hostinger
```

## E-Paper Admin Workflow

Lokswami now supports two admin creation flows at `/admin/epapers/new`:

- `Direct upload`: upload PDF + thumbnail, then optionally upload page images immediately or later.
- `Google Drive / URL import`: paste shared PDF/image URLs. The server downloads those assets and creates the e-paper in the normal admin pipeline.

What the import flow supports:

- absolute `http(s)` URLs
- Google Drive shared file links
- optional page-image URLs, one per line

Current limitation:

- imported editions still use cloud-hosted PDF assets, so server-side `Generate Page Images` is currently unavailable for those editions
- for imported editions, page images should be supplied during import or uploaded later from the e-paper detail page

## E-Paper Readiness

Admin e-paper list and detail pages now show publish readiness:

- `Ready`: no blockers and no review warnings
- `Needs review`: publishable structure exists, but hotspot/text review is still recommended
- `Not ready`: required assets or mappings are missing

Readiness currently checks:

- page-image coverage
- hotspot coverage across pages
- readable story text coverage
- missing thumbnail / missing PDF

## Deployment

Hostinger Node deployment is the supported production path for this repo.

- Use `GitHub Actions` for CI and Hostinger's `Import Git Repository` flow for automatic production deploys from `main`
- See `docs/deployment/HOSTINGER_CICD_SETUP.md` for the exact GitHub + Hostinger setup sequence
- Set `NEXTAUTH_URL` to your final Hostinger domain
- Set `NEXT_PUBLIC_SITE_URL` to that same domain
- Set `NEXT_PUBLIC_GTM_ID` only if you want GTM live in production
- Add `https://<your-domain>/api/auth/callback/google` to the Google OAuth client if Google login is enabled
- Keep `NEXTAUTH_SECRET` at 32+ characters
- Use a persistent MongoDB instance
- Configure DigitalOcean Spaces if production uploads are enabled
  Story video direct uploads also require a bucket CORS rule that allows your app origin, the `PUT`/`GET`/`HEAD` methods, and the `Content-Type` request header.
- `public/uploads/*` and `data/articles.json` are gitignored local/generated data
- Deploy with `npm run build` and `npm start`
- Do not swap production start to `next start` or `node .next/standalone/server.js`, because that bypasses the managed Hostinger release flow
- `npm run build:hostinger` and `npm run start:hostinger` remain as explicit aliases for the same Hostinger flow
- Roll back to the previous prepared Hostinger release with `npm run rollback:hostinger` and then `npm run start:hostinger`
- The Hostinger flow now stages versioned releases in `.hostinger/releases/*`, rebuilds a shared `.hostinger/shared-next-static/` bundle, and keeps an overlap of older hashed `/_next/static/*` assets to prevent post-deploy `ChunkLoadError` and `text/plain` asset 404 crashes
- `npm run test:smoke -- https://your-domain.com` now checks live HTML asset integrity, not just status codes
- See `docs/deployment/HOSTINGER_DEPLOY.md` for the full server checklist

Vercel is also supported for the `zaidshery/Zaid-lokswami` GitHub repo with Git-based CI/CD.

- GitHub Actions handles CI with lint, typecheck, tests, and a CI-safe production build
- Vercel should use `npm run build:vercel` as the build command
- Keep `main` as the production branch in Vercel
- Configure production env vars before the first live deploy: `MONGODB_URI`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `NEXT_PUBLIC_SITE_URL`
- Add DigitalOcean Spaces env vars as well if uploads or e-paper assets are used in production
  If story videos upload directly from the browser, add the deployed app origin to the bucket CORS rules too.
- See `docs/deployment/VERCEL_CICD_SETUP.md` for the full setup and branch-protection checklist

## Project Docs

For the master documentation index, see [`docs/README.md`](docs/README.md).

- [`docs/b3/ROADMAP.md`](docs/b3/ROADMAP.md) for the authoritative B3 Phase 3–8 product roadmap
- [`docs/b3/ARCHITECTURE_FREEZE_V1.md`](docs/b3/ARCHITECTURE_FREEZE_V1.md) for the canonical frozen architecture contract
- [`docs/deployment/HOSTINGER_CICD_SETUP.md`](docs/deployment/HOSTINGER_CICD_SETUP.md) for GitHub Actions + Hostinger auto-deploy setup
- [`docs/deployment/HOSTINGER_DEPLOY.md`](docs/deployment/HOSTINGER_DEPLOY.md) for the production deployment flow
- [`docs/deployment/VERCEL_CICD_SETUP.md`](docs/deployment/VERCEL_CICD_SETUP.md) for GitHub Actions + Vercel CI/CD
- [`docs/deployment/DEPLOY_SMOKE_CHECKLIST.md`](docs/deployment/DEPLOY_SMOKE_CHECKLIST.md) for the post-deploy verification pass
- [`docs/operations/ADMIN_RUNTIME_CHECKLIST.md`](docs/operations/ADMIN_RUNTIME_CHECKLIST.md) for production admin and CMS verification
- [`docs/setup/MONGODB_SETUP.md`](docs/setup/MONGODB_SETUP.md) for MongoDB database setup and indexing
- [`docs/setup/EPAPER_V2_SETUP.md`](docs/setup/EPAPER_V2_SETUP.md) for E-Paper PDF and OCR dependencies setup
- [`docs/setup/QUICK_START.md`](docs/setup/QUICK_START.md) for developer onboarding
- [`docs/archive/legacy-admin/`](docs/archive/legacy-admin/) for historical planning documents and legacy checklists

## Scripts

```bash
npm run dev
npm run build:ci
npm run build:vercel
npm run build
npm run start
npm run package:hostinger-upload
npm run lint
npm run typecheck
npm run test:smoke -- https://your-domain.com
npm run test:admin-runtime -- https://your-domain.com
npm run seed
npm run hash-password
npm run migrate:epapers
```
