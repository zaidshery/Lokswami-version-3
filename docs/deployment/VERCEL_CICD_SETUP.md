# Vercel CI/CD Setup

This repo now uses a split deployment model:

- `GitHub Actions` for CI
- `Vercel` for preview and production deployments

## CI

The GitHub Actions workflow lives in `.github/workflows/ci.yml`.

It runs:

- `npm run lint`
- `npm run typecheck`
- `npm run test:ci`
- `npm run build:ci`

`build:ci` is intentionally different from the Hostinger build flow.
It verifies a production Next.js build without running Hostinger release preparation.

Relevant scripts:

```bash
npm run build:ci
npm run build:vercel
npm run build:hostinger
```

## Vercel Project Settings

When importing `zaidshery/Zaid-lokswami` into Vercel, use:

- Framework Preset: `Next.js`
- Root Directory: `.`
- Install Command: `npm ci`
- Build Command: `npm run build:vercel`
- Production Branch: `main`

`build:vercel` currently points to the same CI-safe production build as `build:ci`.

If you already have an older Vercel project named `zaid-lokswami-2`, reconnect its Git repository to `zaidshery/Zaid-lokswami` or create a fresh Vercel project from the canonical repo.

## Required Production Environment Variables

Set these before the first production deploy:

```env
MONGODB_URI=
NEXTAUTH_SECRET=
NEXTAUTH_URL=https://your-domain.vercel.app
NEXT_PUBLIC_SITE_URL=https://your-domain.vercel.app
```

Add these if your production environment uses them:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXT_PUBLIC_GOOGLE_CLIENT_ID=

DIGITALOCEAN_SPACES_ACCESS_KEY=
DIGITALOCEAN_SPACES_SECRET_KEY=
DIGITALOCEAN_SPACES_BUCKET=
DIGITALOCEAN_SPACES_REGION=sgp1
DIGITALOCEAN_SPACES_CDN_BASE_URL=https://your-bucket.sgp1.cdn.digitaloceanspaces.com

ADMIN_LOGIN_ID=
ADMIN_PASSWORD_HASH=
```

If you attach a custom domain, update both:

- `NEXTAUTH_URL`
- `NEXT_PUBLIC_SITE_URL`

They must stay on the same origin.

## Branch Protection

In GitHub:

1. Go to `Settings` -> `Branches`
2. Add a protection rule for `main`
3. Enable `Require a pull request before merging`
4. Enable `Require status checks to pass before merging`
5. Select the CI check for this workflow
6. Optionally enable `Require branches to be up to date before merging`

## Recommended Flow

1. Create a feature branch
2. Push the branch to GitHub
3. Let GitHub Actions run CI
4. Let Vercel create a preview deployment
5. Review the preview URL
6. Merge into `main`
7. Let Vercel deploy production from `main`

## Notes

- Hostinger and Vercel use different build entry points on purpose
- `npm run build` remains the Hostinger release build
- `npm run build:vercel` is the correct Vercel build command
- `npm run build:ci` is the correct GitHub Actions build verification command
