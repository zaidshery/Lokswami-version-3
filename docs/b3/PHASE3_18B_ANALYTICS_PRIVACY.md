# Phase 3.18B — Analytics Instrumentation & Privacy Hardening

## 1. Executive Summary & Verification Context

- **Repository**: `zaidshery/Lokswami-version-3`
- **Foundation Base**: `b0599d08f552d8fff94ced6fd535482d48ead47c` (`origin/b3/foundation`)
- **Branch**: `b3/phase3.18b-analytics-privacy`
- **Worktree**: `C:/Dev/Lokswami-phase3.18b-analytics-privacy`
- **Protected Baseline**: Phase 3.18A Web Vitals implementation remains untouched.

Phase 3.18B hardens reader analytics telemetry against privacy leaks by enforcing an explicit anonymous-public boundary, zeroing out IP addresses and raw User-Agents for anonymous public readers, migrating persistent cross-session identifiers from `localStorage` to tab-scoped `sessionStorage`, stripping URL query strings and fragment identifiers from stored page paths, and enforcing strict, typed, and bounded metadata normalization schemas.

---

## 2. Audit Inventory & Findings

### Confirmed Issues Resolved
1. **IP Address Persistence**: Anonymous public telemetry persisted client IP addresses (`x-forwarded-for` or `x-real-ip`).
2. **Raw User-Agent Persistence**: Anonymous public telemetry persisted raw client User-Agent strings.
3. **Cross-Session Storage**: Client telemetry persisted session identity indefinitely across browser restarts using `localStorage`.
4. **Unconstrained Metadata**: Arbitrary keys and nested objects in analytics metadata were accepted without structural bounds.
5. **Query String & Hash Leakage**: The server-side `page` property retained incoming query strings (e.g. `?q=sensitive+query`) and fragments (`#hash`).
6. **Contact Page Double-Counting**: `app/(reader)/main/contact/page.tsx` emitted an explicit `contact_page_view` effect in addition to the canonical `page_view` emitted by `SitePageTracker`.
7. **Swipe Share Metadata Loss**: Valid Shorts/swipe telemetry dropped necessary `platform`, `duration`, and `watchedSeconds` attributes.

### Already-Safe Protected Architecture
- **Phase 3.18A Core Web Vitals**: Metrics (`LCP`, `INP`, `CLS`, `FCP`, `TTFB`) collected via `components/seo/WebVitalsBeacon.tsx`, `lib/analytics/webVitals.ts`, and `app/api/v1/public/analytics/vitals/route.ts` already record empty IP and UA (`ipAddress: ''`, `userAgent: ''`) and handle report sequencing and bfcache restoration safely. These files were strictly protected with zero production modifications.

---

## 3. Explicit Anonymous-Public Classification

To avoid brittle blanket logic such as `source !== 'internal'`, Phase 3.18B explicitly defines the set of verified anonymous public telemetry sources:

```ts
export const ANONYMOUS_PUBLIC_SOURCES = new Set([
  'web',
  'reader_home',
  'article_page',
  'category_page',
  'video_page',
  'epaper_page',
  'contact_page',
  'account_page',
  'reader_page',
  'marketing_page',
  'share_menu',
  'homepage_top',
  'contact_form',
  'engagement_popup',
  'lokswami_video_hub',
  'lokswami_swipe',
]);
```

- Any event ingested through the unauthenticated public endpoint (`/api/analytics/track` via `analyticsService.trackPublicEvent`) is treated as anonymous public telemetry.
- The privacy boundary is strictly server-controlled: caller-supplied `source` values cannot bypass IP/UA blanking, page sanitization, or typed metadata normalization.
- Unknown public sources receive blank IP/UA, sanitized page pathnames, and zero arbitrary/unrestricted metadata.

---

## 4. IP and User-Agent Handling

For all events arriving via the public ingestion path:
- `ipAddress: ''` (strictly empty string)
- `userAgent: ''` (strictly empty string)
- Request headers (such as `x-forwarded-for`, `x-real-ip`, and `user-agent`) are never persisted.
- Internal/administrative telemetry requiring trusted context must use separate authenticated server paths, rather than caller-controlled strings on the public route.

---

## 5. Session Migration & Storage Policy

### Storage Hierarchy
1. **Primary**: `window.sessionStorage` scoped strictly to the current browser tab.
2. **Fallback**: In-memory module variable if `sessionStorage` is inaccessible (e.g., private browsing mode with strict partitioning or disabled web storage).
3. **No Persistent Identity**: Zero persistent cookies, zero device fingerprinting, and zero storage in `localStorage`.

### Migration Semantics
When initializing client telemetry:
- If a valid session ID matching `^sess_[a-z0-9_\-]{8,120}$` exists in legacy `localStorage`:
  1. The ID is copied into the `inMemorySessionId` fallback.
  2. The ID is copied into `sessionStorage` for the active tab (if storage writes succeed). Even if `sessionStorage.setItem` throws (e.g. quota limits or strict sandbox restrictions), the in-memory fallback maintains the same migrated ID across subsequent calls so the active session is never split.
  3. The legacy `lokswami_analytics_session_id` key is deleted from `localStorage`.
- If `sessionStorage` already contains a valid session ID, any legacy `localStorage` key is deleted immediately.
- If the legacy value is malformed or invalid, it is immediately removed and a fresh session ID is generated.
- After initialization, no analytics identity remains stored in `localStorage`.

---

## 6. Page Sanitization & Query Redaction

Incoming page paths in telemetry payloads are normalized server-side using `sanitizeAnalyticsPage(rawPage)`:
- Pathnames are extracted using URL parser relative to `https://lokswami.com`.
- Any query string (`?q=...`, `?utm_source=...`) is stripped.
- Any hash fragment (`#section`, `#results`) is stripped.
- Example: `/main/search?q=private+query#results` &rarr; stored as `/main/search`.
- Client-side dispatch (`trackClientEvent`) also runs `sanitizeClientPage` before network transport as defense-in-depth.

---

## 7. Typed Event-Specific Metadata Normalization

Arbitrary metadata dictionaries are rejected. Every retained field is type-checked, bounded, and mapped per event/source schema:

| Family | Allowed Fields | Types & Bounds | Downstream Consumer / Justification |
| :--- | :--- | :--- | :--- |
| **Page Views** | `pageType`, `section`, `deviceCategory`, `viewportBucket`, `pathnameDepth`, `referrerCategory`, `referrerHost`, `utmSource`, `utmMedium`, `utmCampaign`, `browserTimeZone`, `browserLanguage`, `countryCode` | Enums, bounded strings (&le;160 chars), bounded integer (0-20) | `lib/admin/audienceAnalytics.ts` metrics aggregation |
| **Share Events** | `platform`, `contentType`, `contentId`, `placement` | Trimmed strings (&le;64 chars) | Content sharing reports and social outreach attribution |
| **Shorts / Swipe** | `videoId`, `videoSlug`, `mediaProvider`, `fromVideoId`, `toVideoId`, `articleId`, `articleSlug`, `platform`, `duration`, `watchedSeconds` | Trimmed strings (&le;120 chars), non-negative finite numbers (&le;86400s) | Video consumption duration and drop-off analytics |
| **Video Hub** | `videoId`, `videoSlug`, `contentType`, `mediaProvider`, `duration`, `watchedSeconds` | Trimmed strings (&le;120 chars), finite non-negative numbers | Video Hub playback and engagement analytics |
| **Contact Form** | `fields` (on `contact_validation_fail`), `status`, `reason` (on `contact_submit_fail`), `ticketId` (on `contact_submit_success`) | String array (&le;10 items, &le;32 chars each), HTTP status code (100-599), ticket ID string (&le;64 chars) | Form error diagnostics and support desk conversion funnel |
| **Engagement Popup** | `status`, `reason` | HTTP status code (100-599), trimmed string (&le;100 chars) | Lead capture reliability diagnostics |

- **Dropped Metadata**: Unused dimensions without active consumers (`videoTitle`, `utmTerm`, `utmContent`) and all nested arbitrary objects or unknown keys are strictly stripped.

---

## 8. Specific Telemetry Funnel Verification

### Contact Page
- Removed redundant `contact_page_view` effect from `app/(reader)/main/contact/page.tsx`.
- Canonical page view is tracked exactly once by `SitePageTracker` when viewing `/main/contact`.
- Contact funnel events (`contact_form_start`, `contact_validation_fail`, `contact_submit_fail`, `contact_submit_success`) remain fully functional with verified bounds.

### Share Events
- Events `share_click` and `share_complete` are preserved with minimum required metadata (`platform`, `contentType`, `contentId`, `placement`).
- `share_click` denotes user intent to initiate share; external recipient delivery is not asserted.

### Shorts & Swipe Feed
- Events from `lokswami_swipe` preserve `platform`, `duration`, and `watchedSeconds`.
- IP and UA remain strictly blank.
- Swipe sessions generate freshly isolated session IDs to prevent cross-session tracking.

---

## 9. Verification & Quality Gates

### Focused Unit & Integration Tests
- **Domain Service Tests** (`tests/analytics-domain-service.test.ts`): 15/15 passed
  - Bounded metadata validation, blank IP/UA enforcement, query stripping, internal source preservation, swipe duration/platform retention.
- **Client Session Tests** (`tests/analytics-track-client-privacy.test.ts`): 6/6 passed
  - `sessionStorage` persistence, `localStorage` migration, `localStorage` purge, malformed key handling, in-memory fallback.
- **Site Page Tracker Tests** (`tests/site-page-tracker.test.tsx`): 6/6 passed
  - Initial render single emission, SPA transition single emission, rerender idempotency, StrictMode resilience, hash/query immunity, excluded paths.
- **Contact Telemetry Tests** (`tests/contact-page-telemetry.test.tsx`): 5/5 passed
  - Absence of redundant `contact_page_view`, form start emission, validation failure with bounded fields array, submit success and fail emissions.
- **API Route Tests** (`tests/api/analytics-track-privacy.test.ts`, `tests/api/swipe-analytics-privacy.test.ts`): 4/4 passed
  - HTTP POST requests to `/api/analytics/track` confirm blank IP/UA, stripped page paths, rejected invalid payloads.
- **Protected Web Vitals Tests** (`tests/web-vitals-*.test.ts*`): 28/28 passed unchanged.
- **Audience & Share Tests** (`tests/share-menu.test.tsx`, `tests/swipe-feed.test.tsx`, `tests/audience-analytics.test.ts`): 40/40 passed.

### Quality Gate Results
- **`npm run typecheck`**: PASS (exit code 0, 0 errors)
- **`npm run lint:strict`**: PASS (exit code 0, 0 warnings across all guarded paths)
- **`npm run test:security`**: PASS (9 test files, 73 tests passed)
- **`npm run test:governance`**: PASS (4 test files, 17 tests passed)
- **`npm run test:auth-guards`**: PASS (7 cases passed)
- **`npm run test:admin-credentials`**: PASS (synthetic regression cases passed)
- **`npm run check:phase3-scope`**: PASS (no dangerous artifacts or unexpected files)
- **`git diff --check`**: PASS (clean whitespace and newlines)
- **`npm run test:ci`**: PASS (399 test files, 3,290 tests passed, 0 failures)
- **`npm run build:ci`**: PASS (compiled successfully, 175/175 static pages generated)

### Browser Validation via Network Interception (Playwright)
Using Mechanism A (intercepting `**/api/analytics/track` in the browser layer and fulfilling with synthetic 201 responses to avoid persistent file or database writes):
1. **Initial `/main` Navigation**: Intercepted canonical `page_view` with `source: 'reader_home'`, `sessionStorage` populated, `localStorage` completely empty.
2. **Hash-Only Navigation** (`#trending`): Exactly 0 additional page view events emitted.
3. **Query-Only Navigation** (`?utm_source=...`): Exactly 0 additional page view events emitted.
4. **SPA Transition** (`/main/search`): Exactly 1 new `page_view` emitted for `/main/search`.
5. **Browser Back**: Emitted 1 `page_view` returning to `/main`.
6. **Legacy Migration**: Pre-existing `localStorage` key migrated cleanly to `sessionStorage` and removed from `localStorage`.

---

## 10. Scope Boundaries & Explicit Non-Claims

- **Protected Production Files**: Unmodified (`WebVitalsBeacon.tsx`, `webVitals.ts`, `app/api/v1/public/analytics/vitals/route.ts`).
- **Dependencies**: Zero changes to `package.json` or `package-lock.json`.
- **Database Safety**: Zero live, staging, or production Mongo mutations. No test telemetry written to `data/analytics-events.json`.
- **Deferred Work**: Future optimization, batching, and analytics dashboard enhancements deferred to subsequent phases (3.18C/D/E and 3.19).
- **Compliance Disclaimer**: This implementation enforces technical privacy safeguards (blank IP/UA, session isolation, query redaction). It does not constitute legal, GDPR, ePrivacy, or WCAG compliance certification.
