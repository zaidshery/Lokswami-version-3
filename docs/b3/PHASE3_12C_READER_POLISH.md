# Phase 3.12C — final article reader polish and readiness

## Checkpoints and scope

- Existing isolated worktree: `artifacts/phase3-qa/reader`; branch
  `b3/phase3.12-article-reader`. Foundation: `b70657c07d60e96e2dee19cb3947a9b791f3cf0f`.
- A: `2197966f30ac7fcd03d5bef3c98b806000837e7a`.
- B: `b3eba6fadbe7c501234fd12b2d8bc8bde0d2e0db`,
  `feat(reader): improve article audio and related stories`.
- Reviewed the complete B source/test diff before explicitly staging its nine
  intended paths. B excludes analytics, categories, next-env and the cleanup script.
  Neither checkpoint was pushed; the remote reader branch ref is absent.
- C remains unstaged/uncommitted. No PR, merge, deployment or content publication.

Exact B checkpoint manifest:

```text
app/(reader)/main/article/[id]/ArticleDetailClient.tsx
components/article/ArticleAudioPlayer.tsx
components/article/ArticleRelatedStories.tsx
docs/b3/PHASE3_12B_AUDIO_RELATED.md
lib/ai/ttsClient.ts
lib/hooks/useArticleTts.ts
tests/article-audio-player.test.tsx
tests/article-reader-actions.test.tsx
tests/article-related-stories.test.tsx
```

Exact intended C manifest (uncommitted):

```text
app/(reader)/main/article/[id]/ArticleDetailClient.tsx
components/article/ArticleAudioPlayer.tsx
components/article/ArticleReader.module.css
components/article/ArticleReaderHeader.tsx
docs/b3/PHASE3_12C_READER_POLISH.md
lib/ai/ttsClient.ts
tests/article-audio-player.test.tsx
tests/article-reader-actions.test.tsx
tests/article-reader-header.test.tsx
tests/article-tts-client.test.ts
tests/api/public-article-tts-route.test.ts
```

## Decisions and changes

### Sharing and layout

Keep the compact inline header sharing. The current column is centered, bounded
and already includes bookmark/share/E-Paper actions. A second sticky sharing rail
would duplicate controls and constrain the existing reading column without a
useful independent containing block. Mobile has no new persistent toolbar.
ShareMenu, canonical `/a/` share paths, WhatsApp branding and analytics contracts
are unchanged. Its existing menu portal is transient, not a sticky toolbar.

Remove the reader header E-Paper link's decorative pulse: browser measurement
showed its transform shrinking a nominal 44px target to about 40px. No E-Paper
page, publication, CMS or automation behavior changes.

### Loading, images and boundaries

- Summary now has localized polite preparation/success/unavailable status and
  aria-busy, with generic failure text and retry. Old code discarded the error.
  Article replacement aborts pending summary work and clears prior results even
  when the client instance is reused; strengthened tests remove artificial remounts.
- Existing server route resolves/project articles and related candidates before
  rendering. The pre-existing ArticleDetailClient boundary is retained; initial
  article text renders into server HTML. No route/body skeleton or new client
  boundary was needed. Audio and related interactions remain isolated components.
- Hero keeps reserved aspect geometry, containment, alt/caption and priority.
  Responsive sizes now match 24/40/48px container gutters and the 1024px cap.
  Existing storage/URL/variant semantics are untouched. Related thumbnails keep
  fixed dimensions, existing fallback, decorative alt and lazy loading.
- Final build reports article route 14.9 kB / 138 kB first load, versus B's
  14.6 kB / 137 kB. No dependency was added to the client bundle.
- Reading progress is unchanged: passive scroll, one pending rAF, imperative
  transform, observer/load/resize cleanup and no React update per raw scroll.
  Its measured article ends before related content/footer.

### Audio contract and accessibility

- Provider and endpoint implementation remain manual uploaded-asset lookup.
  Client rejects malformed/empty URL responses; valid absolute, relative and
  signed playable URLs remain intact. No generation, eager request or autoplay.
- Added offline client tests for direct URLs, metadata compatibility, invalid
  JSON, missing assets, cancellation; endpoint tests exercise mocked ready manual
  assets and file fallback without connecting to Mongo/storage or generating audio.
- Added stalled media-preparation timeout/late-settlement coverage alongside
  existing lookup timeout, navigation/unmount, cancellation and actual-hook tests.
  Cache is component memory for the current article; no object URLs are created.
- Native non-seekable audio progress now has explicit red/neutral light/dark tracks.
  Percentage updates are outside the polite status region.
- Author dialog now focuses its localized 44px Close button, contains Tab and
  Shift+Tab, restores connected trigger focus, and uses H2 beneath the reader H1.
- Scoped reduced-motion rule disables reader animations/transitions, including
  rich content/related interactions; explicit dialog/spinner handling is retained.
  No global theme tokens or motion rules changed.

## Request-abort investigation

The B logs contain `aborted` / `ECONNRESET` during interrupted navigation. On the
copied C runtime, raw loopback sockets sent incomplete POST bodies to unchanged
analytics and summary routes, then disconnected **without loading an article or
starting audio**. The same error/code was logged (as unhandledRejection in this
probe); a subsequent article request still returned 200. Next's installed response
pipe also has explicit disconnect/abort handling. This supports expected transport
cancellation, independently of the new reader/audio lifecycle. It does not establish
the exact original request from the short B logs. No blanket suppression or unrelated
server/framework change was made. The noisy framework logging remains a limitation.
See sibling `../reader-c-qa/http-regression.json` and temporary server logs.

## Verification

- Final focused suite: **26 files / 214 tests passed**. Reader SSR, header, progress,
  actions, audio, hook/client, share menu/WhatsApp, related, rich content, routing,
  visibility, reader boundaries/metadata, SEO and applicable accessibility tests.
- Final full `test:ci`: **341 files passed / 1 failed; 2,472 tests passed / 1 failed**
  (342 files / 2,473 tests total). Sole failure: `phase3-scope-checker.test.ts`
  expects a clean whole-worktree scope result; preserved unrelated
  `data/analytics-events.json` makes that subprocess exit 1. No assertion weakened.
- Initial full attempt also had 14 PDF failures because the Windows renderer
  expects PDFium at `process.cwd()/node_modules/@hyzyla/pdfium/dist`. Copied the
  already-installed local package into the ignored worktree dependency path;
  all PDF tests then passed. No package/lockfile/source change or download.
- Full test:ci stops before auth scripts on its failing assertion. Ran both
  separately: auth guards **7 cases passed**; synthetic admin credentials passed.
- TypeScript passed. Changed-file lint **0 errors / 0 warnings**; lint:strict passed.
- Security **9 files / 73 tests**; governance **4 / 17**; four-role newsroom **6 / 28**:
  passed. Dependency security advisory-range check passed (not a live registry audit).
- `git diff --check` passed. Full scope command fails only on preserved analytics.
  Existing scope rules applied separately to the exact intended phase paths pass;
  that narrower result does not replace the failing whole-worktree gate.
- Final `npm run build:ci` passed. Offline Mongo-unset warnings and existing Vite
  config-loader/JSDOM navigation notices are documented, not hidden.
- No environment contract changed; production-env/deployment/remote-storage checks
  were not needed or run. GitHub PR readiness/remote CI/review cannot be checked
  before an authorized push and PR; neither was performed.

## Initial browser acceptance (before the requested layout follow-up)

Task-owned copied standalone build uses loopback 3013, its own 14 synthetic records,
local generated WAV, no Mongo, no worker and no remote storage/provider credentials.
Other task's 3012 preview/data/environment are preserved. Browser evidence lives in
sibling `../reader-c-qa/`; raw fixtures are disposable local data.

Checks include the ten widths 320/355/375/390/430/768/1024/1280/1440/1920 in Hindi
and English, light/dark; wrapping, typography, hero, rich quote/list/image, metadata,
body width, related columns, lazy images and article-only midpoint/end progress.
Keyboard audit covers share menu and focus return, author dialog, safe Summary
failure, Load More 4/8/11 and reduced motion. Sampled computed text contrasts exceed
WCAG AA thresholds in both themes. This is a focused DOM/keyboard/contrast audit,
not an axe/full WCAG certification or a real screen-reader session.

Actual HTMLAudioElement plays a local waveform; only the lookup HTTP response is
adapted. Both languages exercise preparation/play/progress/pause/resume/restart/
completion/replay/stop. Missing manual audio uses the actual browser speech fallback.
Production uploaded asset playback is covered by offline endpoint/client contracts,
not real production integration.

HTTP acceptance confirms published 200, draft/future/missing 404, ID-to-slug and
legacy 308 redirects, SSR body, canonical metadata, OG/Twitter and NewsArticle/
Breadcrumb structured data with publication/modification timestamps. Related cases
also cover canonical navigation, empty omission and partial results.

Existing install/location prompts were dismissed only in the dedicated browser
profile. Browser automation initially clicked controls outside the viewport or before
state settlement. Final checks scroll pointer targets into view and use actual keyboard
activation with unchanged result assertions; no source workaround for the harness.

## Readiness and next step

**C is ready for user code/UI review; whole-worktree PR-readiness is blocked by the
preserved analytics scope failure.** Keep analytics/next-env excluded. The original
primary analytics/categories/next-env/cleanup-script hashes remain unchanged.

After review, proposed C commit: `fix(reader): polish article accessibility and loading`.
Stage only the eleven intended C paths, resolve the unrelated scope condition through
its owner, rerun complete CI/scope on the clean intended patch, then obtain authorization
for push/PR against `b3/foundation`. No merge/deployment authorization is implied.

## Initial acceptance and cleanup (before reopening the preview)

All **40 final-build responsive combinations passed**. Both language keyboard/
contrast/reduced-motion audits passed; real waveform playback and actual missing-
upload 404 to browser speech fallback passed. Related 4/8/11, canonical navigation,
empty and partial browser cases passed. Final browser errors output is empty.

Stopped the dedicated reader312c browser and verified launcher/Node server child.
Port 3013 is closed. Removed only the checked sibling `reader-c-qa/runtime` tree,
including its environment and 14 disposable fixture records. Evidence/scripts
remain in ignored QA artifacts. Other task's preview/data/environment are untouched.
Existing local PDFium copy remains in ignored worktree node_modules for repeatable
validation; package/lockfile unchanged. Generated isolated next-env remains unstaged
(no semantic diff after build); primary protected files retain their original hashes.

HEAD is still B; index is empty. Phase 3.11/Homepage, CMS/auth, schemas, automation,
workers and production are untouched. No secrets printed/committed, push, PR, merge
or deployment. The only unresolved validation gate is the unrelated preserved
analytics scope assertion; this run does not claim full CI/PR readiness.

## User-requested header and controls follow-up

- Reduced the headline maximum from 48px to 42px, tightened header padding and
  summary spacing, and retained localized title/category/byline/date semantics.
- Save, Share and E-Paper now sit at the right of the author row. Publication,
  update and reading-time metadata form a compact wrapping line below it.
  Narrow screens retain wrapping and the existing 44px interactive targets.
- Summary now sits immediately to the right of Listen in the same controls row.
  Summary status/results appear inside that card when needed. Summary remains
  independent of audio availability and requests; playback logic is unchanged.
- Focused validation: 7 files / 59 tests passed, typecheck passed, changed-file
  ESLint passed with zero warnings, build:ci passed, and diff whitespace passed.
  Added regression assertions for the shared author/action row and adjacent,
  independently usable Listen/Summary controls.
- Fresh browser visual validation was not performed: browser access to port 3013
  was previously denied. The initial responsive/browser results above precede
  these layout changes and do not validate this new layout.
- The app's command policy rejected the requested restart of the old port 3013
  preview with the reason "blocked by policy". That process remains unchanged.
  Created a fresh copied standalone runtime at sibling
  `reader-layout-qa/runtime`, serving loopback port 3014 with copied disposable
  fixtures, no MongoDB, worker disabled and no remote provider credentials.
  The new article URL returns HTTP 200 and is left running for manual review:
  `http://localhost:3014/main/article/reader-qa-en`.
- Other task's port 3012/data/environment remain untouched. All C and follow-up
  changes remain unstaged/uncommitted; HEAD remains B. No push, PR or deployment.
