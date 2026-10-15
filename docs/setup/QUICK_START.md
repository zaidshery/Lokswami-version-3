# Lokswami Quick Start

For the September 5 repository, live deployment, architecture, and CMS review,
see [Project 360 review](docs/PROJECT_360_REVIEW_2026_09_05.md).
Regenerate the source inventory with `npm run audit:structure`.

## 5-Minute Setup

1. Copy `.env.local.example` to `.env.local`.
2. Set the values you actually need in `.env.local`.
3. Install dependencies, optionally seed sample data, then start the app.

```bash
npm install
npm run seed
npm run dev
```

Open `http://localhost:3000/signin`.

`/login` is still available, but it permanently redirects to `/signin`.

## Minimum Local Auth Setup

Set these values for local admin sign-in:

```env
MONGODB_URI=mongodb+srv://...
NEXTAUTH_SECRET=replace-with-a-long-random-secret
NEXTAUTH_URL=http://localhost:3000
ADMIN_LOGIN_ID=admin
ADMIN_PASSWORD_HASH=replace-with-bcrypt-hash
```

Notes:

- `ADMIN_USERNAME` is also supported if you prefer that name over `ADMIN_LOGIN_ID`.
- Generate a bcrypt hash with `npm run hash-password`.
- Google OAuth is optional for local development. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` only if you want Google sign-in.
- Google Tag Manager is optional. Set `NEXT_PUBLIC_GTM_ID=GTM-XXXXXXX` to install the GTM container on every page.

## Current Auth Model

- Auth is handled by NextAuth at `/api/auth/[...nextauth]`.
- Reader sign-in supports the registered reader credentials flow in this checkout, and Google when OAuth is configured. This local account work is not part of the currently deployed commit.
- Admin sign-in uses the NextAuth credentials provider when `ADMIN_LOGIN_ID` or `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH` are set.
- Admin Google sign-in is optional and requires `ADMIN_GOOGLE_LOGIN_ENABLED=true` plus an allowlist in `ADMIN_EMAILS`.
- Admin APIs rely on the authenticated session cookie. There is no `/api/admin/login` token endpoint.

## Important Files

| File | Purpose |
|------|---------|
| `lib/auth.ts` | NextAuth configuration and callbacks |
| `lib/auth/adminCredentials.ts` | Env-driven admin credentials login |
| `app/api/auth/[...nextauth]/route.ts` | NextAuth route handler |
| `middleware.ts` | Route protection for admin and signed-in reader pages |
| `lib/db/mongoose.ts` | MongoDB connection |
| `.env.local.example` | Full local environment template |
| `app/(admin)/admin/epapers/new/page.tsx` | Admin e-paper direct upload and Drive/URL import UI |
| `app/api/admin/epapers/import/route.ts` | Remote / Google Drive e-paper import route |
| `lib/utils/epaperAdminReadiness.ts` | Admin publish-readiness calculation |

## Useful Commands

```bash
npm run dev
npm run lint
npm run typecheck
npm run build
npm run test:auth-guards
npm run hash-password
npm run seed
```

## E-Paper Admin Flow

The admin e-paper workflow now supports both:

- direct upload from `/admin/epapers/new`
- Google Drive / URL import from the same screen

Drive / URL import accepts:

- a shared PDF URL
- a shared thumbnail URL
- optional page-image URLs, one per line

After creation:

1. Open the e-paper detail page.
2. Check the new readiness panel.
3. Upload missing page images if needed.
4. Map hotspots page by page.
5. Review warnings about unreadable text before publishing.

Important limitation:

- `Generate Page Images` currently works only when the PDF is stored in local e-paper storage and server conversion is enabled.
- imported cloud-hosted PDFs still need manual page-image upload or page-image URLs during import.

## Smoke Checks

Check the target environment with `npm run verify:deploy -- https://lokswami.com`.
The command checks runtime health, JS/CSS assets, public article HTML and SEO,
then CMS guest boundaries. Expected authentication behavior:

- `GET /signin` returns `200`
- `GET /login` redirects to `/signin`
- `GET /admin` redirects guests to `/signin?redirect=%2Fadmin`
- `GET /main/saved` redirects guests to `/signin?redirect=%2Fmain%2Fsaved`

On Windows PowerShell, use `npm.cmd` if the `npm.ps1` execution policy blocks npm.
Use Node 20.x to match production. Run focused tests, `npm run typecheck`,
`npm run lint`, and `npm run build:ci` before releasing changes.

## Common Errors

| Error | Likely cause | Fix |
|------|--------------|-----|
| `MONGODB_URI is not set` | Missing local env config | Copy `.env.local.example` to `.env.local` and set `MONGODB_URI` |
| `Invalid admin ID or password` | Login ID does not match env or hash is wrong | Verify `ADMIN_LOGIN_ID` or `ADMIN_USERNAME`, then regenerate `ADMIN_PASSWORD_HASH` |
| `no_admin_access` | Google account is authenticated but not allowlisted for admin | Add the email to `ADMIN_EMAILS` |
| `querySrv ETIMEOUT` | Atlas cluster not reachable from your machine/network | Check Atlas IP access, DNS, and the connection string |
| `Remote download failed` during e-paper import | Shared Drive/URL asset is not publicly reachable from the server | Verify the link, sharing permission, and file size |
| E-paper shows `Not ready` | Page images, hotspots, or readable story text are still missing | Open the e-paper detail page and complete the listed blockers |

## Security Checklist

- Use a strong `NEXTAUTH_SECRET`, `JWT_SECRET`, or `AUTH_SECRET`
- Use a unique admin password and store only its bcrypt hash
- Keep `.env.local` out of git
- Restrict MongoDB Atlas network access before production
- Configure Google OAuth callback URLs before enabling Google sign-in in production
