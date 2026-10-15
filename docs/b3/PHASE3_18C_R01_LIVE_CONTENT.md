# Phase 3.18C R01 — reader content authority

R01 is P1: four ordinary public reader surfaces could present repository mock
headlines as live journalism. At foundation
`6f163d42a8c0ae0f75677eb52f1029faa41a761b`, the client helper appended mocks
to successful live results and substituted mocks on empty/error results.
Each caller also initialized reader state with mock articles.

## Correction: Option A

Normal readers consume only API-provided content or honest empty results.
The existing helper URL, payload handling, normalization, live deduplication,
export signature, and category matching remain compatible. Repository mocks
and the separately guarded local demo harness remain available for explicit
fixtures. Publication predicates, public services, Mongo/file selection, CMS
workflow, and article detail resolution are unchanged.

Production files and affected routes:

- `lib/content/liveArticles.ts`: removes mock merging and empty/error substitution.
- `app/(reader)/main/search/SearchClient.tsx` — `/main/search`: empty initial
  arrays; existing query/category/sort/accessibility behavior retained.
- `app/(reader)/main/category/[slug]/CategoryPageClient.tsx` —
  `/main/category/<slug>`: mapped initial data only; honest existing empty state.
- `app/(reader)/main/ftaftaf/page.tsx` — `/main/ftaftaf`: empty initialization,
  bilingual empty copy, no count/swipe/navigation controls or intercepted arrow
  keys with zero stories; first-ten behavior retained.
- `app/(reader)/main/digital-newsroom/page.tsx` — `/main/digital-newsroom`:
  empty initialization; existing lead, rails, counts, and empty UI retained.

Category fetch decisions use usable mapped initial articles. Empty raw input
and non-empty raw input mapping to nothing both attempt the category v1 API.
If v1 raw items also map to nothing, the legitimate legacy authoritative helper
is still attempted. A usable mapped initial feed avoids unnecessary fetching.

Earlier audit assumptions about demo isolation were incomplete: publication
services were guarded, but clients could append mock records downstream. The
historical Phase 3.16 audit is preserved unchanged.

## Synthetic regression coverage

- New `tests/live-articles-authority.test.ts`: live-only output, deduplication,
  empty/error/malformed/unmappable cases, mixed valid/invalid rows, environment modes.
- New `tests/search-live-content-authority.test.tsx`: pending/empty results,
  mock-only queries, genuine filtering/sorting/links, polite bilingual status.
- Updated `tests/category-page-client-v1.test.tsx`: mapped-data decisions,
  authoritative legacy fallback, category filtering, and pending/empty mock absence.
- New `tests/ftaftaf-live-content-authority.test.tsx`: bilingual zero state,
  safe controls/keyboard behavior, genuine links, and one/partial/over-ten feeds.
- New `tests/digital-newsroom-live-content-authority.test.tsx`: pending/empty
  counts, genuine lead/rails/categories/order, no mock backfill.
- Updated `tests/article-url-governance.test.ts`: a repository-only numeric
  token remains missing in a controlled authoritative store.

All focused tests use in-memory fixtures and mocked fetch/service/browser APIs;
jsdom component tests do not launch a browser or application server.

## Local validation

Dependencies were installed using only `npm ci --ignore-scripts`; package and
lockfile hashes remain unchanged. No dependency lifecycle scripts were executed.

Runtime: Node v20.20.2, npm 10.8.2.

| Authorized gate | Result |
| --- | --- |
| Focused R01 tests, including article URL governance | 6 files, 72 tests passed |
| Existing authority regressions | 8 files, 121 tests passed |
| Unchanged Phase 3.18B privacy regressions | 10 files, 107 tests passed |
| Typecheck | Passed |
| `lint:strict` | Passed |
| Explicit ESLint on all five production and six test files | Passed, no output |
| `test:governance`, including its typecheck | 4 files, 17 tests passed |
| Diff whitespace and runtime mock-import checks | Passed; no runtime mock references |

Focused command:

```powershell
npx vitest run tests/live-articles-authority.test.ts tests/search-live-content-authority.test.tsx tests/category-page-client-v1.test.tsx tests/ftaftaf-live-content-authority.test.tsx tests/digital-newsroom-live-content-authority.test.tsx tests/article-url-governance.test.ts
```

The initial focused run exposed array parameterization mistakes in two new
Category tests. The initial typecheck exposed a missing required views field
in the new Ftaftaf fixture, also preventing the first governance attempt.
Both test-only mistakes were corrected; the final focused, typecheck, and
governance runs passed. No existing authority/privacy test was edited.
Vite configuration notices and jsdom media play/pause notices were non-failing.

SHA256 verification before/after installation and at final review:

- `package.json`: `5BAB58ACAE183596F00181411FECDE20FD5F28FFC40C501AEB46AD223D83FC5B`
- `package-lock.json`: `565C4E885EF7D099F5B5FB09FAC40D06C90E777311948ACCF3CBB4F9ECAE700D`

Category A-E evidence is in the updated category test: empty and unusable
initial items fetch v1; unusable v1 items invoke the legacy helper; empty legacy
output keeps the existing empty UI; usable initial items avoid fetching.
Ftaftaf zero-item tests assert no 1/0, Swipe Up, or previous/next buttons and
verify ArrowDown is not intercepted. One, three, and twelve-item inputs prove
authoritative-only output with the existing ten-item cap.

The implementation is local and uncommitted. The baseline remains detached and
clean at the authorized foundation; the implementation worktree has only the
five approved production edits, six approved test files, and this document.

## Limitations and remaining gates

Browser validation, build validation, full CI, and independent review remain
for separate authorization. No production deployment behavior was observed.
No app server, browser, Playwright, CMS/Mongo/staging/production access or
mutation, seeding, credentials, commit, push, PR, merge, or deployment occurred.
Other R findings and later phases remain outside this patch.
