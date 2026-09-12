# MongoDB and Auth Setup Guide

## Overview

Lokswami uses MongoDB for persisted content and NextAuth for authentication. Local setup usually starts from `.env.local.example`, then adds a MongoDB Atlas connection and whichever sign-in methods you want to enable.

## Required Local Values

For a basic local admin setup, configure:

```env
MONGODB_URI=mongodb+srv://lokswami_user:YOUR_PASSWORD@cluster-name.mongodb.net/lokswami?retryWrites=true&w=majority
NEXTAUTH_SECRET=replace-with-a-long-random-secret
NEXTAUTH_URL=http://localhost:3000
ADMIN_LOGIN_ID=admin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD_HASH=replace-with-bcrypt-hash
```

Also supported:

- `ADMIN_USERNAME` instead of `ADMIN_LOGIN_ID`
- `JWT_SECRET` or `AUTH_SECRET` as secret aliases
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for Google sign-in
- `ADMIN_GOOGLE_LOGIN_ENABLED=true` and `ADMIN_EMAILS=...` for allowlisted admin Google access

## 1. Create a MongoDB Atlas Cluster

1. Create a project in MongoDB Atlas.
2. Create a cluster. The free M0 tier is enough for local testing.
3. Wait until the cluster is ready.

## 2. Create a Database User

1. Open Atlas `Database Access`.
2. Create a database user for this app.
3. Save the username and password somewhere secure.

## 3. Allow Network Access

1. Open Atlas `Network Access`.
2. Add your current IP for local development.
3. Avoid `0.0.0.0/0` outside quick experiments.

## 4. Create `.env.local`

Copy `.env.local.example` to `.env.local`, then fill in:

- `MONGODB_URI`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `ADMIN_LOGIN_ID` or `ADMIN_USERNAME`
- `ADMIN_PASSWORD_HASH`

If you want Google sign-in too, also add:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `ADMIN_EMAILS`
- `ADMIN_GOOGLE_LOGIN_ENABLED=true` for admin Google login

## 5. Generate an Admin Password Hash

Run:

```bash
npm run hash-password
```

Use the generated bcrypt hash as `ADMIN_PASSWORD_HASH`.

The plain-text password is whatever you typed into the hash script. The app never stores that plain password in the repo.

## 6. Install Dependencies and Seed Data

```bash
npm install
npm run seed
```

Seeding recreates the main sample content collections used by the app.

## 7. Start the App

```bash
npm run dev
```

Then open `http://localhost:3000/signin`.

`/login` is only a redirect and forwards to `/signin`.

## Sign-In Behavior

### Reader Sign-In

- Uses Google when OAuth is configured.
- Lands on the shared `/signin` page.

### Admin Sign-In

- Credentials-based admin sign-in is enabled when `ADMIN_LOGIN_ID` or `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH` are set.
- Admin Google sign-in is optional and depends on `ADMIN_GOOGLE_LOGIN_ENABLED` and `ADMIN_EMAILS`.
- Successful admin sessions are stored as NextAuth session cookies.

## API Notes

- Auth entrypoint: `/api/auth/[...nextauth]`
- Admin content APIs: `/api/admin/articles`, `/api/admin/categories`, `/api/admin/stories`, `/api/admin/videos`, `/api/admin/epapers`, and related routes
- Admin e-paper import API: `/api/admin/epapers/import`
- Admin APIs expect an authenticated NextAuth session cookie
- There is no `/api/admin/login` bearer-token endpoint in the current codebase

## Admin E-Paper Automation

Lokswami now has two admin e-paper creation paths at `/admin/epapers/new`:

- direct file upload
- Google Drive / URL import

The import flow:

- accepts shared `http(s)` PDF and image URLs
- supports Google Drive shared file links
- downloads those assets server-side and stores them through the normal e-paper upload pipeline

Because imported PDFs are stored as cloud-hosted assets, the current `Generate Page Images` endpoint still cannot auto-render page images for those imported editions. For imports, upload page images manually or provide page-image URLs during import.

## Publish Readiness

Admin e-paper list/detail pages now show readiness status before publishing:

- `Ready`
- `Needs review`
- `Not ready`

Readiness is based on:

- page images present
- hotspot coverage
- readable text/excerpt coverage
- required PDF/thumbnail availability

## Troubleshooting

### `querySrv ETIMEOUT` or MongoDB connection timeout

Usually means Atlas could not be reached.

Check:

- Atlas IP access rules
- The `MONGODB_URI` hostname
- Local DNS and firewall settings

### `MONGODB_URI is not set`

Create `.env.local` from `.env.local.example` and set the connection string.

### `Invalid admin ID or password`

Check:

- `ADMIN_LOGIN_ID` or `ADMIN_USERNAME`
- `ADMIN_PASSWORD_HASH`
- That the password hash was generated from the password you are actually typing

### `no_admin_access`

This usually means a Google-authenticated user is not allowlisted for admin access.

Add the email to `ADMIN_EMAILS`.

### `MongoDB unavailable for admin dashboard, using file store`

The app could not reach MongoDB and fell back to local file-backed dashboard data for that request path.

This is useful for resilience during development, but it means your MongoDB setup is still not healthy.

### `Remote download failed` during e-paper import

Check:

- that the Google Drive or remote file is shared correctly
- that the asset URL is a real file link, not a private preview-only page
- that your local server/network can reach the remote host

### E-paper shows `Not ready` or `Needs review`

Open the admin e-paper detail page and review:

- missing page images
- pages without hotspots
- stories that still have no readable text or excerpt

## Production Notes

- Use a persistent MongoDB deployment
- Rotate auth secrets before production
- Restrict Atlas network access
- Configure Google OAuth callback URLs for your production domain
- Keep `.env.local` and any production secrets out of version control
