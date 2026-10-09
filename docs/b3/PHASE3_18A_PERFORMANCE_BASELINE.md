# Phase 3.18A local performance baseline

Date: 2026-10-09. Source: `b3/phase3.18-performance-uat`, starting at
`fbdfcdfa64c58492f02b90db70b0fb6045068b69`.

## Reproduce

1. Run `npm run build:ci`.
2. Start the resulting build locally on an unused port, for example
   `npx next start -p 3318 -H 127.0.0.1`.
3. Run `node scripts/phase3/phase318a-performance-baseline.cjs`.
   Set `PERF_BASE_URL` if using another port. Pass comma-separated routes as
   the first argument for a focused run. Set `PERF_ARTICLE_PATH` and
   `PERF_SHORTS_PATH` when representative published detail paths exist.
4. For the publication first-load regression, run
   `node scripts/phase3/phase318a-performance-baseline.cjs /main/epaper,/main/e-magazine --assert-publication-initial`.

The Chromium script uses fresh contexts with cache disabled at 390×844 and
1440×900, waits three seconds after DOM content load, and reports HTTP status,
request count, encoded transfer bytes, image/font count, major JS chunks,
navigation TTFB, FCP, final observed LCP candidate, CLS session windows,
long tasks, and page errors. Analytics POSTs are fulfilled locally so the
read-only trace cannot alter the file-store analytics data. This is one
unthrottled local synthetic sample per route, not field p75 or a Lighthouse
score. Missing Mongo and auth secret limited the content and caused server
warnings; repeat on an isolated environment with published data and valid
test configuration.

## Build comparison

| Route | Audit first-load JS | After 3.18A | Result |
| --- | ---: | ---: | --- |
| Shared | 103 kB | 103 kB | Unchanged |
| `/main` | 139 kB | 139 kB | Unchanged |
| `/main/article/[id]` | 145 kB | 145 kB | Unchanged |
| `/main/videos` | 144 kB | 144 kB | Unchanged |
| `/main/epaper` | 206 kB | 206 kB | Unchanged |
| `/main/e-magazine` | 206 kB | 206 kB | Unchanged |

Both builds generated 175 static pages. The final compile took about 2.1
minutes. Next skipped its built-in lint and type validation, which were run
as separate gates. The audit worktree uses a `node_modules` junction and
standalone tracing warned about an `EPERM` symlink copy; verify standalone
packaging in a normal install before deployment.

## Local browser findings

- The pre-fix empty E-Paper archive made one unnecessary
  `/api/v1/public/epapers/latest` request after server rendering. Its
  loading state moved the footer twice. Observed CLS was approximately
  0.135 at 390×844 and 0.204 at 1440×900. After the effect guard change,
  the initial request count was zero and observed CLS was zero in both
  repeated samples. E-Magazine also made zero initial refetches.
- E-Paper and E-Magazine still transferred roughly 315–320 kB of JS in the
  local Chromium sample. Their build first-load JS remains 206 kB. No
  published issue or high-resolution page image was available, so real
  first-page and page-turn performance is unmeasured.
- Homepage samples had no repeated identical GET for its feed. One
  publication fallback request appeared when local server data was
  incomplete. This did not justify changing its resilient fallback logic.
  Homepage results varied across runs; one mobile sample had FCP 2.9 s and
  an LCP candidate at 4.6 s, while another was much faster. These samples
  cannot establish a reliable target pass or fail.
- `/main/videos` and `/signin` returned 200 at both viewports. A local
  Shorts ID without a published slug returned 404; article detail had no
  local published record. These detail routes require representative
  published data for meaningful measurements.
- Above-the-fold homepage cards use sized `next/image` variants, including
  a priority lead image. Publication page imagery uses raw images to
  preserve zoom fidelity. The empty-data trace did not load those pages,
  so no image-delivery change was justified.
- The global stylesheet declares two Noto families and six weights each.
  This local trace observed no font resource transfer, so weight reduction
  remains deferred pending a real network waterfall and Hindi rendering
  check.
- No reader `loading.tsx` was added. The only reproduced loading shift
  was fixed at its request source; a new loading boundary was not justified.

## Metric disposition

The beacon now uses Next's Web Vitals hook, which reports INP and standard
CLS session windows alongside LCP, FCP, and TTFB. It attributes document
metrics to the initial route and does not re-register on SPA pathname
changes. The local trace saw LCP candidates, FCP, TTFB, and CLS, but no
meaningful INP interaction. **Field p75 LCP, INP, and CLS are not measured.**
The targets in `NON_FUNCTIONAL_REQUIREMENTS.md` remain pending. Repeat
on published content and representative mobile devices and networks before
marking any target PASS.
