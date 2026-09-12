# LokSwami B3 — Local Real-Content QA Snapshot Harness

## Purpose and trust boundary

This harness copies a small, recent sample from LokSwami's public reader APIs into a local, reusable QA snapshot. The flow is strictly one-way:

```text
lokswami.com public APIs (GET/HEAD only)
  -> .local/content-snapshots/lokswami
  -> normal local seed services/file stores
  -> localhost reader and CMS
```

The application never proxies normal localhost rendering to production, and there is no push or sync-back command. Production CMS login, production database access, and production write methods are outside this workflow.

## Public sources

The bounded importer uses these public endpoints:

- `/api/v1/public/articles` and `/api/v1/public/articles/{slug}`
- `/api/v1/public/breaking`
- `/api/v1/public/videos`
- `/api/v1/public/shorts`
- `/api/v1/public/epapers`
- `/api/v1/public/home-feed` for the current E-Magazine

The source API host is fixed to `lokswami.com`. Downloadable assets are restricted to `lokswami.com`, `lokswami-storage-2026.sgp1.cdn.digitaloceanspaces.com`, and `i.ytimg.com`. The latter two were observed in public reader responses. Arbitrary source URLs are not accepted.

## Safety controls

- `LOKSWAMI_REAL_CONTENT=true` is required before any production read.
- The HTTP client exposes only GET and HEAD.
- Redirects are followed manually and rechecked against the allowlist.
- Concurrency is capped at 3, with bounded timeout and retry settings.
- JSON, images, and PDFs have independent size caps.
- Downloaded media must have an expected MIME type and byte signature.
- Filenames are normalized, URL-hashed, and resolved inside the snapshot root.
- Large video binaries are never downloaded. Public provider URLs remain metadata.
- `LOKSWAMI_DEMO_DATA=true` is independently required for local seed, verify, and reset writes.
- `NODE_ENV=production` always blocks local seed/reset.
- Snapshot and synthetic reset use exact owned IDs only; prefixes, dates, and source-host wildcards do not establish ownership.

## Default sample

| Type | Default | Maximum | Behavior |
| --- | ---: | ---: | --- |
| Articles | 25 | 50 | List plus bounded detail GETs; body HTML preserved verbatim |
| Breaking | 10 | 20 | Linked back to imported public articles |
| Videos | 8 | 20 | Metadata, public player URL, localized thumbnail |
| Shorts | 8 | 20 | Published locally only when a related imported article is exposed |
| E-Papers | 3 | 10 | Published metadata, cover, and bounded PDF download |
| E-Magazines | 1 | 3 | Current public issue from home feed |

The importer does not crawl archive links or recurse through arbitrary pages. A failed item or asset is recorded in `manifest.json`; fake production content is not substituted. If no valid articles are obtained, the pull fails without writing a usable manifest.

At the time this harness was implemented, public Short records did not expose related Article IDs. Those items remain in the manifest as unsupported and are omitted from the reader-visible local Short seed, preserving B3's Short-to-published-Article invariant.

## Commands

PowerShell:

```powershell
$env:LOKSWAMI_REAL_CONTENT = "true"
npm run content:snapshot:pull
npm run content:snapshot:inspect

$env:LOKSWAMI_DEMO_DATA = "true"
npm run demo:seed -- --source=lokswami --scenario=full
npm run demo:verify -- --source=lokswami --scenario=full
```

Bash:

```bash
LOKSWAMI_REAL_CONTENT=true npm run content:snapshot:pull
npm run content:snapshot:inspect

LOKSWAMI_DEMO_DATA=true npm run demo:seed -- --source=lokswami --scenario=full
LOKSWAMI_DEMO_DATA=true npm run demo:verify -- --source=lokswami --scenario=full
```

Controlled limits:

```bash
LOKSWAMI_REAL_CONTENT=true npm run content:snapshot:pull -- \
  --articles=25 --breaking=10 --videos=8 --shorts=8 \
  --epapers=3 --emagazines=1 --concurrency=2 --timeout-ms=12000 --retries=1
```

An intentional refresh is the same safe bounded pull and replaces the local manifest/cache entries deterministically:

```bash
LOKSWAMI_REAL_CONTENT=true npm run content:snapshot:refresh
```

## Snapshot contents and provenance

The default root is `.local/content-snapshots/lokswami/` and is gitignored. `manifest.json` records:

- schema version, source host, capture time, endpoints, limits, and read/write methods;
- public source ID/slug/URL and deterministic local ID;
- article title, summary, body, category, author, tags, and timestamps;
- video/Short provider metadata and public playback URL;
- E-Paper/E-Magazine city/date/page/PDF metadata;
- each asset's source URL, local path, MIME type, size, SHA-256, or failure;
- unsupported relationships and pull errors.

The production public IDs are not reused as local Mongo identities. A stable SHA-256 derivation of content type plus public identifier produces each 24-hex local ID. Provenance remains in the manifest instead of expanding the production Article schema.

The downloaded archive is intentionally not committed. CI exercises parser, mapping, and safety behavior with small sanitized response fixtures and never contacts production.

## Local seed scenarios

Use `--source=lokswami` with the familiar scenarios:

- `full` / `real-full`: every supported record in the bounded snapshot.
- `shell` / `real-shell`: reader shell with a compact real-content selection.
- `homepage` / `real-homepage`: homepage-sized real selection.
- `article` / `real-article`: real Article typography and body content.
- `video` / `real-video`: real videos and only valid linked Shorts.
- `epaper` / `real-epaper`: recent real E-Papers and the public E-Magazine.
- `breaking-short` and `breaking-long`: shortest/longest real linked breaking title.

Use `--breaking=none` to compose the no-Breaking shell case without changing the source snapshot:

```bash
LOKSWAMI_DEMO_DATA=true npm run demo:seed -- \
  --source=lokswami --scenario=shell --breaking=none
```

The legacy synthetic source remains available for the small edge-case stress pack. Synthetic content is not blended into the normal real snapshot scenario; consequently a normal real `full` plan is 100% real for supported records.

## Media behavior

Article images, video/Short thumbnails, E-Paper covers/PDFs, and E-Magazine covers/PDFs are copied from the snapshot cache into a gitignored local public QA directory during seed. Reader rendering therefore does not repeatedly hotlink production media.

Provider-hosted video playback remains an explicit external dependency; only its metadata and poster are localized. Video files are not copied.

When public Breaking audio is unavailable, the local seed creates a small deterministic silent WAV as a manual QA substitute and records correct manual metadata for the real headline. It does not synthesize speech. Automatic Breaking TTS remains disabled.

## Store capability boundaries

- File mode supports public Articles, videos, valid Shorts, and published E-Paper records.
- File mode does not invent E-Magazine or Mongo `releasedSnapshot` semantics; those are reported as skipped.
- Mongo mode uses the existing repositories/models and the normal published state.
- A configured Mongo connection failure aborts; it never silently falls back to files.

## Reset

Reset the selected source with the same local write gate:

```bash
LOKSWAMI_DEMO_DATA=true npm run demo:reset -- --source=lokswami
```

Only local IDs listed in the snapshot manifest are removed. Unrelated content—including unrelated records whose slug happens to begin with `demo-`—survives.

## Local reader checklist

After seed, run `npm run dev` and inspect Home, Article, Video, Shorts, E-Paper, E-Magazine, and Search at 360, 375, 390, 412, 430, 768, 1024, and 1440+ widths. Exercise Breaking absent, shortest real Breaking, longest real Breaking, long Hindi Article titles, desktop/mobile navigation, drawer, search, bottom navigation, and all media routes.

For local staff account provisioning and the frozen role-by-panel contract, see [CMS_LOCAL_QA_ACCESS_MATRIX.md](./CMS_LOCAL_QA_ACCESS_MATRIX.md).
