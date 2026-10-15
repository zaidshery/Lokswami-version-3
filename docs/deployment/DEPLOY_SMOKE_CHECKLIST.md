# Deploy Smoke Checklist

Run this after every production deploy before calling the release complete.

## Automated Checks

Run:

```bash
npm run test:smoke -- https://your-domain.com
npm run test:tts-smoke -- https://your-domain.com
```

Or run the combined deploy verification:

```bash
npm run verify:deploy -- https://your-domain.com
```

Current production example:

```bash
npm run test:smoke -- https://lokswami.com
npm run test:tts-smoke -- https://lokswami.com
```

Combined example:

```bash
npm run verify:deploy -- https://lokswami.com
```

The automated smoke script checks:

- `/api/health` returns `status=ok` and `db=connected`
- `/signin`, `/main`, and `/main/epaper` return `200` HTML
- every JS/CSS file referenced by those pages under `/_next/static/*` returns `200`
- every referenced JS/CSS file returns the expected content type instead of a plain-text 404 or error page
- guest access to `/admin` redirects to `/signin?redirect=%2Fadmin`
- `/api/epapers/latest?limit=1` returns at least one item
- the latest public e-paper PDF route returns a redirect URL

The TTS smoke script checks:

- the top live breaking item exposes a playable `ttsAudioUrl` when breaking items exist
- the latest public article can return playable TTS output
- the latest public e-paper story can return playable TTS output

If the script fails, stop and fix the deploy before moving on.

If the failure mentions a route pointing at a missing `/_next/static/*` file, treat it as a release mismatch and redeploy before letting users back in. That is the signature of stale HTML pointing at deleted hashed assets.

## Manual Checks

Complete these in a real browser session:

1. Open `/signin` and sign in with the expected admin method.
2. Confirm `/admin` loads without redirect loops or auth errors.
3. Open `/admin/articles` and `/admin/epapers` and confirm list data loads.
4. Perform one small upload through the CMS.
5. Confirm the uploaded asset is saved and visible where expected.
6. Open `/main/epaper` and confirm the latest edition still opens for readers.
7. Test the breaking-news speaker on `/main`.
8. Test article listen on one live article.
9. Test e-paper story listen on one live story.

## Admin Runtime Follow-Up

After this checklist passes, run:

```bash
npm run test:admin-runtime -- https://your-domain.com
```

Or run:

```bash
npm run verify:deploy -- https://your-domain.com
```

Then complete the signed-in checks in [`ADMIN_RUNTIME_CHECKLIST.md`](../operations/ADMIN_RUNTIME_CHECKLIST.md).

`verify:deploy` now runs the generic smoke checks, the TTS smoke checks, and the admin guest-boundary checks together.

## Upload Recommendation

For the required upload smoke test, prefer one of these:

- upload a small article image from `/admin/articles/new`
- upload a small e-paper thumbnail from `/admin/epapers/new`

If the deploy changed e-paper storage, DigitalOcean Spaces config, or file permissions, test an e-paper upload specifically.

## Release Rule

Do not mark a deploy healthy until:

- the automated smoke script passes
- the TTS smoke script passes
- admin login works
- one CMS upload succeeds
