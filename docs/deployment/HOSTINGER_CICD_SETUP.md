# Hostinger CI/CD Setup

This repo should use:

- `GitHub Actions` for CI
- `Hostinger Node.js Web App` GitHub integration for automatic production deploys

That is the correct default for this project. Hostinger already supports pulling from GitHub, installing dependencies, running the build command, and restarting the Node app after each push to the connected branch.

## Repo State

The repo is now set up with:

- `.github/workflows/ci.yml` for lint, typecheck, tests, and CI-safe build verification
- `.github/workflows/deploy-hostinger.yml` for packaging the exact main commit after successful main push CI; manual dispatch requires that successful CI run ID
- `package.json` `engines.node = 24.x` so Hostinger can detect the intended runtime
- `npm run build` and `npm start` mapped to the repo's Hostinger-safe release flow

## Recommended Production Flow

1. Push changes to a feature branch.
2. Open a pull request.
3. Let GitHub Actions `CI` pass.
4. Merge into `main`.
5. Let Hostinger pull `main`, install dependencies, run `npm run build`, and restart automatically.

If you allow direct pushes to `main`, Hostinger will still redeploy, but you lose the CI gate. Protect `main`.

## Hostinger hPanel Steps

Use the following settings, verifying the current hPanel controls before deployment:

1. Open `Websites` -> `Add website` -> `Node.js Web App`.
2. Choose `Import Git Repository`.
3. Use the existing Hostinger GitHub connection for `zaidshery/Lokswami-version-3`.
4. Select the repository and connect the `main` branch.
5. Confirm the runtime settings:
   - Node.js version: `24`
   - Package manager: `npm`
   - Build command: `npm run build`
   - Start command: `npm start`
6. Add the production environment variables in Hostinger hPanel.
7. Click `Deploy`.
8. After the first deploy, confirm later merges to `main` trigger automatic redeploys in the Deployments panel.

Hostinger's managed Node.js flow is the part that performs the automatic production deployment. GitHub Actions does not replace the hPanel GitHub connection for this hosting type.

## Required Hostinger Environment Variables

Minimum production env:

```env
MONGODB_URI=
NEXTAUTH_SECRET=
NEXTAUTH_URL=https://your-domain.com
NEXT_PUBLIC_SITE_URL=https://your-domain.com
ADMIN_LOGIN_ID=admin
ADMIN_PASSWORD_HASH=
EPAPER_FORCE_STORAGE=1
```

Add these if production uploads and public media are enabled:

```env
DIGITALOCEAN_SPACES_ACCESS_KEY=
DIGITALOCEAN_SPACES_SECRET_KEY=
DIGITALOCEAN_SPACES_BUCKET=
DIGITALOCEAN_SPACES_REGION=sgp1
DIGITALOCEAN_SPACES_CDN_BASE_URL=https://your-bucket.sgp1.cdn.digitaloceanspaces.com
EPAPER_STORAGE_UPLOADS_BASE_DIR=storage/uploads
```

Keep `NEXTAUTH_URL` and `NEXT_PUBLIC_SITE_URL` on the same final origin.

## GitHub Settings

Set branch protection on `main`:

1. `Settings` -> `Branches`
2. Require pull requests before merging
3. Require status checks to pass before merging
4. Require the `build` check from GitHub Actions, an up-to-date branch, one independent approving review, and resolved conversations; enforce the policy for administrators and disallow force pushes/deletion.

On 19 October 2026 these protections were applied to both `main` and `b3/foundation`. Only `zaidshery` was listed as a collaborator. GitHub does not allow a PR author to approve their own PR; merge requires an eligible independent reviewer or an explicitly agreed sole-maintainer policy. Do not bypass the gate to make a deployment succeed.

This is what makes the CI/CD flow reliable instead of just automatic.

## Optional GitHub Production Env Validation

If you want GitHub Actions to validate a production-like env snapshot before publishing the Hostinger upload artifact:

1. Create a GitHub `production` environment.
2. Add the same production secrets there that Hostinger uses.
3. Add a repository variable named `HOSTINGER_VALIDATE_ENV` with the value `true`.

Then `.github/workflows/deploy-hostinger.yml` will run `npm run verify:prod-env` before building the upload package.

## ZIP Fallback

If you need a manual upload instead of Git-based deploy:

- run `npm run package:hostinger-upload`
- or download the `lokswami-hostinger-upload` artifact from the `Hostinger Release Package` workflow

The local command now requires a clean committed Git checkout and uses `git archive` with the committed `.gitattributes`. It excludes local env files, runtime data and review artifacts. The accompanying `release-evidence.json` records the source commit, archive SHA-256, runtime and CI run. It is a source archive, so the host still needs to build it; it is not the CI-built standalone artifact. A ZIP without Git metadata cannot by itself establish the build-time Git identity used by `/api/version`; prefer the Git-connected deployment for certified releases.

Package jobs accept only successful main-branch push CI from this repository for the exact checked-out SHA. Pull-request/fork workflow runs cannot enter the packaging job. The workflow never uploads to Hostinger or restarts production.

That ZIP fallback is for manual recovery or first-time setup. It is not the primary automatic deployment path.

## Post-Deploy Checks

After each production deploy:

1. Open the homepage.
2. Check `/api/health`.
3. Test admin sign-in.
4. Test a media upload flow if Spaces is enabled.
5. Run `npm run test:smoke -- https://your-domain.com`.

See [`HOSTINGER_DEPLOY.md`](./HOSTINGER_DEPLOY.md) and [`DEPLOY_SMOKE_CHECKLIST.md`](./DEPLOY_SMOKE_CHECKLIST.md) for the fuller operational checklist.
