# Phase 3.12B — article audio and related stories

## Checkpoint and boundaries

Existing worktree: `C:\Dev\Lokswami-version-3\artifacts\phase3-qa\reader`.
Branch: `b3/phase3.12-article-reader`. Foundation: `b70657c07d60e96e2dee19cb3947a9b791f3cf0f`.
Approved 3.12A checkpoint: `2197966f30ac7fcd03d5bef3c98b806000837e7a`,
`feat(reader): redesign article reading experience`. Reviewed all tracked/untracked
implementation and tests before committing; 15 files / 132 tests passed again.
The worktree was clean after that commit. The shared date change is an additive
export: old parsing/formatting functions and callers are unchanged. Progress is
SSR-safe and cleans up passive scroll/resize, image load, observer and rAF work.

The checkpoint is not pushed. 3.12B stays unstaged and uncommitted. No homepage,
Phase 3.11, CMS/auth, e-paper/e-magazine reader or automation, schema, worker,
deployment, production configuration or content changes.

## Audio audit

- Existing client: article detail held Listen request/cache state, the playback
  hook, compact controls in a combined AI-tools toolbar, plus a floating player.
  Pause/resume/stop and percentage progress already existed. Pause labels in the
  toolbar did not clearly distinguish resume; preparation used mostly a spinner.
- `requestArticleTtsAudio` POSTs `/api/articles/[id]/tts`. This is manual uploaded
  audio lookup, **not automatic paid generation**. It builds full article text,
  finds a ready `article_full` manual TTS asset via Mongo and returns its URL;
  file fallback reports no uploaded asset. No reader sign-in check in this route.
  This task does not alter that endpoint, its assets, provider or persistence.
- `useArticleTts` plays URL audio via HTMLAudioElement. If unavailable/failing,
  the existing Web Speech fallback strips markup, chunks text and selects voices
  by language. Content detection prefers Hindi/English; supported voice matching
  includes the existing Indian language constants. The endpoint does not accept
  a language/voice override; old local selection bookkeeping did not configure
  the manual recording. No unsupported settings are presented in the new card.
- Cached manual URL was local component memory; new player retains it for replay
  during the current article. No eager lookup, generation, playback or autoplay.
  Hook knows media duration-based percentage and speech completed-chunk percentage;
  no seeking or stable speech duration API is exposed. Progress is non-seekable.
- AI summary is an independent, explicit `/api/ai/summary` request. Preserve it.
- No dedicated Listen request/playback analytics event exists in these components,
  helper or endpoint. Existing read/share/bookmark analytics remain unchanged.
- Old cleanup effects had two exhaustive-deps warnings because their callback
  depended on the whole changing hook return object. New isolated player depends
  on stable stop/cancellation callbacks. No ESLint suppression was added.

## Related audit

- Server page calls `listRelatedPublicArticles` with limit 20 and projects public
  data. Existing service/repository applies published/due filtering in Mongo and
  file paths. Related builder excludes current ID/destination, deduplicates href,
  sorts by existing publication order, puts same-category stories first and then
  backfills from other public stories. No ranking/recommendation service change.
- All up-to-20 candidates already arrive with SSR data. Four are initially rendered
  and four more revealed per click, without another fetch. Preserve that behavior.
- Old horizontal NewsCard clamps mobile headlines to one line and includes shared
  E-Paper/share metadata actions. There is no article-click analytics event in that
  card. New article-specific presentation reuses ReaderImage/fallback, image variant,
  canonical path/category/date helpers, and uses one two-column desktop/tablet grid
  with single-column mobile cards, three-line headlines, category and real date.
  No invented primary-next ranking or duplicate lists. Empty section is omitted.

## Implementation

`ArticleAudioPlayer` is one compact inline player after hero/caption, before body.
It has localized idle/preparing/playing/paused/completed/error status, pause/resume,
restart/stop, cached replay and a real non-seekable progress element. Controls are
buttons with visible focus, 44px targets and meaningful names; status is polite,
atomic, and does not announce percentage updates. Optional browser-voice disclosure
is truthful; raw server errors never reach readers.

Requests use AbortSignal, a 15-second preparation timeout, an immediate repeated-click
guard and generation invalidation on navigation/unmount. Playback hook guards late
media and speech callbacks and play/resume promises by session ID; actual speech
failures end cleanly rather than falsely completing. Backend/provider and public
reader metadata remain unchanged. The floating duplicate is replaced by the single
inline player. Existing 3.12A header/hero/body/progress boundaries are preserved.

## Validation and evidence

- Final focused Vitest: **19 files / 158 tests passed**. Includes all 3.12A
  regression suites, new real-hook audio state tests and related presentation
  tests, plus manual audio/analytics boundary tests. No prior assertions weakened.
- `npm run typecheck`: passed. Changed-file ESLint with `--max-warnings=0`:
  passed, **zero errors / zero warnings**. Both old parent Listen effect warnings
  are gone; the shared hook's old dependency suppression was also removed.
- `npm run build:ci`: passed. Output: ignored `artifacts/phase3-qa/build-ci-b.log`.
  `git diff --check`: passed. No deployment or production credentials required.
- Hindi and English: all ten widths passed (320, 355, 375, 390, 430, 768, 1024,
  1280, 1440, 1920), including idle audio controls, 44px targets, three-line related
  headlines, single-column mobile/two-column tablet and desktop cards, no overflow,
  header/body/hero/metadata preservation, no eager article-audio request and
  article-only progress at 50% midway / 100% before related content and footer.
- Real browser media: both languages passed keyboard start, delayed loading,
  play/progress, pause/resume, restart, completion, replay and stop. Only the HTTP
  lookup response was replaced with an offline fixture; HTMLAudioElement played a
  locally generated WAV with actual media events. No playback-hook state was mocked.
  This verifies player UX, not a production uploaded asset/provider integration.
- Actual file-store missing-audio response exercised existing browser speech
  fallback. A separate Chrome session with speech disabled verified safe localized
  unavailable/retry UI in both languages. No raw server errors exposed.
- Browser related cases passed four/eight/eleven items, real canonical link
  navigation, empty omission and partial results. Light/dark were inspected.
  No browser page/hydration errors. Existing shared install/location prompts were
  dismissed only in the dedicated QA profile. Earlier QA attempts needed hydration
  waits/keyboard activation; network-idle waiting stalled and was replaced by
  bounded control readiness. No source workaround or weakened assertion.
- The copied standalone preview logged request-abort/ECONNRESET messages during
  interrupted navigation. These were confined to temporary server logs; browser
  error checks were empty. The existing Vite native-config warning also remains.
- Evidence is in sibling `../reader-b-qa/`: `matrix-hi.json`, `matrix-en.json`,
  `audio-states.json` (English), `audio-states-hi.json`, `related-cases.json` and
  light/dark audio/related screenshots.

## Concurrent preview and cleanup

Another task created QA files and started port 3012 during this run. The user
confirmed its ownership and instructed preservation. Its data, environment,
generated `next-env.d.ts` and analytics changes were not restored or removed.
They are not Phase 3.12B source changes. The primary checkout's four protected
files still match the original hashes.

Browser QA instead used a **separate copied standalone build** on loopback port
3013 with its own data/environment/public waveform, no Mongo and no worker.
The dedicated browsers and verified preview process tree were stopped; port 3013
is closed. The copied runtime, environment and fixture data were removed, with
screenshots/results retained. No other task's server was stopped or restarted.

HEAD remains the approved 3.12A checkpoint; all 3.12B files remain unstaged.
No push, PR, merge, deployment or production/content publication.

### Final focused command

```sh
npm test -- --run tests/article-audio-player.test.tsx tests/article-related-stories.test.tsx tests/article-page-ssr.test.tsx tests/article-reader-actions.test.tsx tests/article-reading-progress.test.tsx tests/article-reader-header.test.tsx tests/article-share.test.ts tests/article-seo.test.ts tests/article-url-governance.test.ts tests/article-redirect-governance.test.tsx tests/public-articles-service.test.ts tests/public-articles-client.test.ts tests/server-articles-publication.test.ts tests/use-article-tts.test.ts tests/article-document.test.ts tests/rich-text-editor-formatting.test.ts tests/seo-schema-and-sitemaps.test.ts tests/phase2-analytics-media-tts-boundaries.test.ts tests/tts-manual-assets.test.ts
```

## Deferred P2

Optional sticky sharing, seek support only if the playback contract is expanded,
broader loading/performance polish and formal assistive-technology auditing.
