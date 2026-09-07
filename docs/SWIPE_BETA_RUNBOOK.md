# Lokswami Swipe News 1.0 beta runbook

## Release boundary

Swipe uses the existing Video CMS and the canonical public cursor API at
`/api/v1/public/shorts`. The older `/api/shorts/latest` and
`/api/v1/public/shorts/latest` routes remain aliases. `/main/videos` remains the
general video library, while published Swipe stories use
`/main/shorts/[slug]`.

The September beta supports YouTube and verified HTTPS MP4 assets. Managed HLS,
native apps, recommendations, comments, and automated social publishing are not
part of this release.

## Pre-deployment gate

1. Back up the MongoDB videos collection and `data/videos.json`.
2. Run the migration without writes:

   ```powershell
   npm run migrate:swipe-videos
   ```

3. Review the scanned and changed totals, then apply the same migration once:

   ```powershell
   npm run migrate:swipe-videos:write
   ```

4. Run focused tests, `npm run typecheck`, and `npm run build:ci`.
5. Set `SWIPE_BETA_ENABLED=true` in the runtime environment.

The migration preserves publication state and legacy `videoUrl`, derives
collision-safe Unicode slugs, copies thumbnails to posters, infers the media
provider, and initializes playback, aspect-ratio, and processing fields.

## Editor workflow

In **Admin > Videos**, choose **Create Video** and enable
**Use this video in Shorts mode**. Complete the **Swipe News publishing** section.
Complete the short headline, summary, category, YouTube or MP4 source, poster,
Swipe slug, related published article ID or slug, 9:16 aspect ratio, captions or
transcript when available, and optional Instagram/YouTube links.

MP4 files use the existing direct-upload initialization, signed upload, and
verification endpoints. Publishing is blocked until the slug, poster, verified
ready media, 9:16 format, and an article that is already public can be resolved.
Legacy videos can still be edited without being forced into the new Swipe
readiness contract.

## Qualification checklist

- Load and editorially approve at least 20 vertical stories before exposure.
- Verify direct WhatsApp entry, refresh on the active slug, swipe next/back,
  quick article, full article, share preview, PWA return, and media failure
  recovery.
- Test Android Chrome and iPhone Safari at 360, 390, and 430 px, plus Slow 4G,
  Data Saver, reduced motion, large text, keyboard, screen reader, and rotation.
- Capture three production Lighthouse runs for the Swipe route, Videos library,
  homepage, and an article. Require LCP below 2.5 s, INP below 200 ms, CLS below
  0.1, and no more than one initial player request.
- Confirm cached API latency is ideally below 100 ms and uncached latency below
  700 ms. Confirm zero demo, draft, rejected, future-scheduled, failed-processing,
  unpublished, or known landscape records.
- Verify the service worker never stores MP4, HLS, WebM, MOV, or segment assets.

## Monitoring

Monitor public API latency, Core Web Vitals, error rate, playback failures,
three-second views, 25/50/completion milestones, next/back swipes, quick/full
article opens, and WhatsApp shares. Swipe event metadata contains content IDs,
slugs, provider, and navigation context only; do not add reader personal data.

## Rollback rehearsal

1. Set `SWIPE_BETA_ENABLED=false` and restart the application runtime.
2. Confirm a Swipe slug returns 404 and the Videos library still opens and plays
   legacy links such as `/main/videos?video=ID`.
3. Confirm all three public shorts API routes still respond; rollback disables
   the reader entry point, not the compatible data contract.
4. Re-enable the flag only after the incident condition is corrected and the
   qualification checks pass again.

Do not delete migrated fields or reverse the data migration during entry-point
rollback.
