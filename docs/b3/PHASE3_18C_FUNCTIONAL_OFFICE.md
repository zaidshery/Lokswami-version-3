# Office functional acceptance continuation

Base candidate: `763d40b858814574da57281cfe606718945f7431`, build `42_hNJkv0Zktf4CsH1j0_`.

The September monthly PDF and processed 32-page QA issue are reused. New English copy, a single demonstration hotspot, and controlled video/caption fixtures are explicitly QA content. No source-story mapping, page proofreading, original R08 recovery, production editorial signoff or production access is part of this run. Historical archive/cleanup evidence is reused without rerunning unchanged acceptance.

The base candidate published the QA monthly issue through supported controls and delivered the exact 10,279,913-byte PDF with SHA-256 `6d93e0fdcf90631e01a9d6d542af37046d5273cbb753f39c88292b2dfc9b48e5`. English reader and populated monthly light/dark checks exposed insufficient contrast for the thumbnail-strip heading in dark mode. The heading now uses the existing zinc-400 dark token.

Fresh-load layout-shift attribution identified the footer visible below the 40vh route-loading fallback and then moving out of the viewport when populated content streamed in. The fallback now reserves a full viewport of reading space. Font-swap movements and device/network LCP remain separate measured diagnostics.

The controlled QA MP4 plays from the verified provider. The standard reader has no caption track; this remains a functional gap. Swipe's existing caption track failed with the browser's cross-origin safety error. Captioned Swipe media now uses anonymous CORS mode so the existing remote WebVTT track can load when provider CORS permits it. No caption UI or standard-player feature is introduced.

A supported draft revision of that monthly issue reached ready-to-publish but publication returned HTTP 409 because the previous current revision still occupied the partial unique issue index. The repository now retires that same family's previous current revision before promotion. Transactional failures roll back retirement; the standalone path serializes the family handoff with the existing lock helper and compensates ordinary failed/stale promotions by restoring the exact prior ID/version. Queries retain UUID/legacy family casting, publication CAS and scope uniqueness. No index, permission or workflow transition changes.

The standalone handoff remains multiple writes. Process termination between retirement and promotion, compensation failure, and cross-process operation without configured distributed locking are not certified crash-safe by this correction. Replica-set transaction behavior needs independent runtime acceptance. Do not treat unit coverage or the office standalone success as those guarantees.

Automatically captured original failures, subsequent runs, lab conditions, screenshots, resource identities and validation/build provenance are retained under the original checkout's ignored `artifacts/phase3-qa/phase318c-office-20261013/functional-acceptance-20261014/`. The final report there distinguishes current results, reused evidence, manual NOT RUN checks and post-launch field monitoring.
