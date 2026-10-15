# Hostinger CI/CD Setup

This repo should use:

- `GitHub Actions` for CI
- `Hostinger Node.js Web App` GitHub integration for automatic production deploys

That is the correct default for this project. Hostinger already supports pulling from GitHub, installing dependencies, running the build command, and restarting the Node app after each push to the connected branch.

## Repo State

The repo is now set up with:

- `.github/workflows/ci.yml` for lint, typecheck, tests, and CI-safe build verification
- `.github/workflows/deploy-hostinger.yml` for creating a clean Hostinger upload artifact on `main` or by manual dispatch
- `package.json` `engines.node = 20.x` so Hostinger can detect the intended runtime
- `npm run build` and `npm start` mapped to the repo's Hostinger-safe release flow

## Recommended Production Flow

1. Push changes to a feature branch.
2. Open a pull request.
3. Let GitHub Actions `CI` pass.
4. Merge into `main`.
5. Let Hostinger pull `main`, install dependencies, run `npm run build`, and restart automatically.

If you allow direct pushes to `main`, Hostinger will still redeploy, but you lose the CI gate. Protect `main`.

## Hostinger hPanel Steps

Use these exact settings in Hostinger on June 10, 2026:

1. Open `Websites` -> `Add website` -> `Node.js Web App`.
2. Choose `Import Git Repository`.
3. Authorize Hostinger to access the GitHub account that owns `zaidshery/Zaid-lokswami`.
4. Select the repository and connect the `main` branch.
5. Confirm the runtime settings:
   - Node.js version: `20`
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
4. Select the `CI` workflow check

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

That ZIP fallback is for manual recovery or first-time setup. It is not the primary automatic deployment path.

## Post-Deploy Checks

After each production deploy:

1. Open the homepage.
2. Check `/api/health`.
3. Test admin sign-in.
4. Test a media upload flow if Spaces is enabled.
5. Run `npm run test:smoke -- https://your-domain.com`.

See [`HOSTINGER_DEPLOY.md`](./HOSTINGER_DEPLOY.md) and [`DEPLOY_SMOKE_CHECKLIST.md`](./DEPLOY_SMOKE_CHECKLIST.md) for the fuller operational checklist.
