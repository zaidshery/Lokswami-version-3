# Reconstructed R09: public GET and telemetry verification

The original R09 audit text is unavailable. The owner authorized investigation of the recovered GET/telemetry reference on 11 October 2026. This report documents the inspected public content and engagement paths; it does not claim an audit of all GET handlers or recovery of the original criteria.

## Reviewed contract

Public article and publication reads must not increment engagement counts or persist audience events merely because a reader, crawler or prefetch requests content. Explicit audience events use the analytics POST route. Existing security request logs and operational/asset caches are separate mechanisms.

- `app/api/articles/[id]/route.ts` delegates to `publicArticleService.getLegacyArticleByIdOrSlug` and returns publication-filtered, cacheable data.
- Article latest-feed and public article service/repository paths read existing view fields without incrementing them.
- `app/api/epapers/route.ts`, latest-feed and edition detail delegate to public read methods in `epaperService` / `epaperRepository`. The inspected public methods use read queries or file reads; mutation services remain separate.
- `app/api/analytics/track/route.ts` exports POST for explicit events. Existing analytics privacy tests exercise validation, sanitization and persistence. Video telemetry coverage requires confirmed continuous playback and excludes seeks, hidden playback and unconfirmed provider progress.

## Recorded validation

Node 20 / UTC: 8 suites, 97 tests passed.

```sh
npx vitest run tests/api/public-articles-routes.test.ts tests/api/public-epapers-fallback-routes.test.ts tests/public-articles-service.test.ts tests/api/analytics-track-privacy.test.ts tests/api/swipe-analytics-privacy.test.ts tests/analytics-track-client-privacy.test.ts tests/video-watch-telemetry.test.ts tests/web-vitals-persistence.test.ts
```

The suites include unpublished-content exclusion, public caching/fallback contracts, privacy-safe analytics ingestion and client metadata, playback confirmation, and web-vital persistence. R03 CI on head `727e382eb296740863f2de52d7c928091ed4daf2` passed the full suite, lint, typecheck, dependency floor and build.

No current engagement-write defect was reproduced in the inspected GET paths, so this verification proposes no runtime change. This result is bounded to the identified paths and automated contracts. Real provider playback, representative publication content, deployed cache behavior and field web-vital measurements remain acceptance gates. Closure against an unknown original R09 specification cannot be asserted.
