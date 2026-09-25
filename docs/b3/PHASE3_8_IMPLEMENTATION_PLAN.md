# Phase 3.8 Implementation Plan: Video, Media, Social, and Push

Plan date: 2026-09-25

Repository: `C:\Dev\Lokswami-version-3`

Branch: `b3/phase3.8-video-media-social-push`

Starting commit: `2186680`

Integration base: `b3/foundation` at `2186680`

Primary evidence: `docs/b3/PHASE3_8_VIDEO_MEDIA_SOCIAL_PUSH_AUDIT.md`

Status: planning/documentation only. This document does not authorize application changes, staging mutations, provider calls, social sends, push sends, or production activity.

## 1. Phase objective

Phase 3.8 will make Lokswami's existing media and outbound-distribution paths safe, durable, and honest before expanding their capabilities. The phase will:

1. close the Story download SSRF and unbounded-buffering P0;
2. establish a small canonical asset boundary and server-owned upload trust model;
3. make Story/Video upload, master-export, replacement, and cleanup lifecycles coherent;
4. prevent duplicate social sends through a durable logical-delivery identity and atomic claim;
5. revalidate canonical Article/Story state immediately before every external social attempt;
6. create a provider-neutral, disabled-by-default Push foundation without pretending a provider currently exists;
7. close operator, accessibility, observability, abuse-control, and parity gaps; and
8. prove the result with security, concurrency, provider-contract, four-role, responsive, accessibility, build, and full-CI gates.

The phase must preserve existing Article/Story/Video publication semantics, MongoDB/file-store editorial compatibility, reader visual language, and reader sharing. It must not introduce an unplanned transcoding platform, direct social-network APIs, or a broad general-purpose URL proxy.

## 2. Baseline

### Git baseline

- Starting branch: `b3/phase3.8-video-media-social-push`
- Starting HEAD: `2186680`
- Starting remote sync: `0 0`
- Integration base: `origin/b3/foundation` at `2186680`
- Intended planning changes: the Phase 3.8 audit and this implementation plan only

### Repository baseline

- Next.js 15 App Router, TypeScript, React, MongoDB/Mongoose, and file-store fallbacks.
- Reported suite baseline: 272 test files and 1,717 tests.
- DigitalOcean Spaces is the implemented object store; metadata has Mongo/file fallback, object bytes do not.
- Standalone Video, Story media, Story video production, and Media records are separate concepts.
- Social outbound modes are `manual`, `n8n`, and `generic_webhook`; no direct platform API is canonical.
- Reader/device push delivery does not exist. `/admin/push-alerts` is a manual copy-preparation surface.

### Planning invariants

- New public paths that depend on Mongo availability continue using the repository's build-safe availability seam.
- New domain behavior must support or explicitly fail closed in file-store mode; it must not silently weaken guarantees.
- No routine CI test may contact Spaces, n8n, a social platform, or a push provider.
- Staging outbound integrations remain disabled unless a later, explicit acceptance run authorizes an isolated staging-only test.

## 3. Audit summary

The audit found a fragmented but recoverable architecture. Article image processing is the strongest existing media path. General storage signing and workflow publication filtering are useful foundations. The primary weaknesses are at trust transitions: arbitrary URLs become server fetches, browser-returned metadata becomes authoritative, uploaded objects are not lifecycle-managed, and SocialPost status is treated as sufficient authority for an external side effect.

### P0 findings

1. Story asset download can server-fetch an insufficiently constrained stored URL and buffers the complete response.
2. Social dispatch has no durable atomic claim or idempotency guarantee.
3. Social dispatch does not revalidate current canonical source publication/eligibility immediately before sending.

### P1 themes

- client-forged upload metadata and weak content verification;
- orphaned objects and unsafe future deletion semantics;
- inconsistent provider identifiers and duplicated storage implementations;
- unverified Story master exports and incomplete production controls;
- main-reader caption/transcript gaps and optional accessibility metadata;
- no upload/dispatch rate limits or quotas;
- social regeneration, failure, retry, acknowledgement, and provider-contract weaknesses;
- incomplete production provider validation and operational visibility.

### Push truth

Push preparation exists; push delivery does not. Phase 3.8D will establish safe domain contracts, disabled/manual behavior, and testable fake adapters. A real provider, real subscriptions, service-worker delivery handlers, and a Send Push action remain deferred until product, privacy, and provider decisions are approved.

## 4. P0 merge blockers

Phase 3.8 must not merge while any item below remains open.

| Blocker | Required closure | Owning subphase | Proof |
|---|---|---|---|
| Story download SSRF | Normal download resolves an authorized content asset ID to a server-owned provider/key; arbitrary stored URLs are never fetched | 3.8A | protocol/localhost/private IPv4/private IPv6/redirect/DNS and legacy URL tests |
| Unbounded download buffering | Stream from the storage adapter through a hard byte limiter and timeout; reject oversized declared and actual bodies | 3.8A | Content-Length, chunked oversize, timeout, memory-safe streaming tests |
| Duplicate social dispatch | Create a durable logical delivery, unique constraint, and atomic claim before provider invocation | 3.8C | two-writer race invokes the fake provider exactly once |
| Stale/unpublished source dispatch | Reload and validate current source, actor authority, publication, withdrawal/archive state, and media immediately before provider invocation | 3.8C | enqueue-then-unpublish/archive/withdraw tests show zero provider calls |

The download issue remains one audit finding with two mandatory closure properties. A code path that removes SSRF but still buffers an unbounded trusted object does not close the P0.

## 5. P1 mapping

No audit P1 may disappear silently.

| P1 theme | Disposition |
|---|---|
| Upload receipts bound to actor/content | 3.8A |
| Magic-byte/container validation | 3.8A; deeper codec probing limited to lightweight metadata in 3.8B |
| Upload/download limits, quotas, rate limiting | 3.8A domain limits; 3.8E consolidated operational tuning |
| Story provider identifier mismatch | 3.8A migration-compatible normalization |
| Client-authoritative Media/Story metadata | 3.8A canonical asset resolution |
| Reference-aware delete/replace/orphan cleanup | 3.8A policy and primitives; 3.8B content integration |
| Verified master export | 3.8B |
| Story production state graph/concurrency/UI | 3.8B and final UX proof in 3.8E |
| Video captions/transcript delivery | 3.8B and accessibility proof in 3.8E |
| Article image alt/rights publication policy | 3.8B policy and server validation; 3.8E UX/regression |
| Misleading Media video upload affordance | 3.8B |
| Social regeneration clobbers delivered records | 3.8C |
| Social attempt history/retry/reconciliation | 3.8C |
| Social HMAC/versioned provider contract | 3.8C |
| Social partial outcome representation | 3.8C |
| Production social config validation | 3.8C; surfaced in 3.8E diagnostics |
| Upload/social/push abuse controls | 3.8A, 3.8C, 3.8D; consistency review in 3.8E |
| Operational/audit gaps and unsafe provider errors | 3.8C/3.8D domain records; 3.8E dashboards/redaction review |

Optional Media search/tags/deduplication, advanced previews, distribution analytics, and advanced Push segmentation remain P2 unless required to make a P0/P1 workflow usable.

## 6. Architecture principles

### 6.1 Server-owned identity, derived delivery facts

Content will reference an asset ID. The server resolves provider, logical store, object key, MIME, size, and delivery URL. Clients may submit an upload receipt or asset ID, but never authoritative provider/key/trusted URL facts.

### 6.2 Small additive asset boundary

Evolve the existing Media domain into a canonical asset registry rather than introducing a universal polymorphic content model. Article, Story, and Video keep their domain models. Per-use metadata such as alt text, caption, focal point, and editorial role stays on the content reference where context matters.

### 6.3 Dual-read, single-safe-write migration

Legacy URL fields remain readable during migration. New writes persist asset IDs and server-derived compatibility fields. Unsafe external legacy URLs are not proxied; they return a deterministic migration-required error or are handled by a narrowly configured trusted-host migration path.

### 6.4 Fail closed at irreversible boundaries

- Unknown/untrusted asset -> no server fetch.
- Missing provider configuration -> manual/disabled.
- File-store mode without distributed atomic guarantees -> no live outbound dispatch.
- Unknown provider outcome -> reconciliation required, not blind automatic retry.
- Source no longer eligible -> blocked/cancelled delivery, zero provider calls.

### 6.5 External side effects follow durable state

Create and atomically claim a delivery before invoking a provider. Persist attempt identity and payload fingerprint. Do not make the external call and then try to invent its identity.

### 6.6 No fictional processing

Manual editing and progressive MP4 remain valid explicit states. HLS/transcoding fields must not imply an implemented pipeline. Future processing is separated from Phase 3.8 readiness.

### 6.7 Mongo/file parity with honest limits

Editorial asset metadata and state should retain file fallback where practical. Distributed exactly-once outbound claims require MongoDB; file mode remains manual/disabled for real provider sends. Tests must prove this fail-closed behavior.

## 7. 3.8A — Media/storage security and canonical asset boundaries

### Objective

Close the download P0, remove client authority over trusted storage facts, and establish the minimum asset/upload/cleanup primitives required by later subphases.

### A1. Canonical asset record

Extend the current Media domain, while retaining the persisted model name if that minimizes migration risk, with additive canonical fields:

- asset ID (`_id`);
- schema version;
- lifecycle status: `pending`, `verified`, `attached`, `quarantined`, `delete_pending`, `deleted`, or `failed`;
- provider from a server-owned enum;
- logical store/bucket alias, never a credential or raw secret;
- object key;
- media kind (`image`, `video`, `document`, `caption`, or supported existing kind);
- canonical MIME and byte size;
- original/display filename and safe extension;
- optional width, height, duration, aspect ratio, format/container where verified;
- existing Article image variants where applicable;
- created-by actor reference and timestamps;
- initial owner scope/content intent;
- verification timestamp and failure category;
- cleanup eligibility/tombstone timestamps.

Add a unique provider/logical-store/object-key constraint in Mongo. The file repository must reject duplicate keys during its serialized write. Do not store access keys, signed URLs, webhook secrets, or long-lived provider tokens.

Content models retain domain-specific fields. New references add `assetId`; compatibility URLs/keys are derived server-side during the transition. Per-use `alt`, `caption`, `credit`, license, focal point, ordering, and editorial role remain on Article/Story/Video reference structures.

### A2. Upload session and receipt

Introduce a short-lived server-owned upload session for direct uploads with:

- session ID and non-secret receipt ID;
- actor identity/role;
- intended owner type and owner/draft token;
- purpose/media kind;
- server-generated object key;
- expected MIME, extension, and maximum/declared size;
- state: `initiated`, `uploading`, `uploaded`, `verified`, `attached`, `expired`, `failed`, `cleanup_pending`, `cleaned`;
- expiry and timestamps;
- single-use attach marker.

The init route authorizes the content action before signing. Completion accepts the session/receipt ID, not an arbitrary key. It loads the server-owned key, checks provider object metadata, validates actual bytes as feasible, creates/updates the canonical asset, and returns an asset ID/receipt. Attach consumes that receipt for the same actor/content scope.

For a new Story without an ID, use a cryptographically random draft token owned by the current actor; creation atomically/compensatingly binds its assets to the new Story. Do not use a user-controlled slug as ownership.

### A3. Upload validation

- Keep server-side purpose-specific size limits; apply quota before issuing a signed target and verify size after upload.
- Require extension and canonical MIME to agree; browser MIME alone is advisory.
- Decode JPG/PNG/WEBP through Sharp for image validity and dimensions.
- Reject SVG for newsroom uploads in this phase.
- Validate PDF header/trailer within bounded reads for existing permitted PDF purposes.
- Validate MP4's ISO base media `ftyp` structure with a bounded parser; reject a renamed arbitrary file. Full codec support validation belongs to 3.8B if a lightweight library is justified.
- Validate caption uploads as bounded UTF-8 WebVTT beginning with a valid `WEBVTT` header.
- Generate keys and extensions server-side from canonical type; normalize display filenames separately.
- Preserve randomized names and prevent overwrite.
- Delete/quarantine a direct-upload object that fails post-upload validation.

### A4. Story download P0 design

Normal flow:

`authorized Story + requested asset role -> content assetId -> canonical verified asset -> provider adapter getStream(objectKey) -> bounded response stream`

Rules:

1. Perform Story/content authorization before resolving the object.
2. Verify that the asset is attached to the requested Story and role.
3. Resolve provider and key only from the canonical asset record.
4. Validate the key against the provider's exact namespace grammar and reject traversal/foreign prefixes.
5. Use the provider SDK/signing adapter rather than fetching the public URL.
6. Obtain provider metadata first when available and reject an oversized `Content-Length` before streaming.
7. Wrap the response in an actual byte-counting transform that aborts above the configured limit even when length is absent or false.
8. Apply connect/header/body timeout and abort propagation.
9. Validate canonical MIME against the requested asset kind.
10. Build `Content-Disposition` from a normalized display filename; never echo CR/LF or path segments.
11. Return deterministic codes such as `ASSET_NOT_ATTACHED`, `ASSET_UNVERIFIED`, `ASSET_TOO_LARGE`, `ASSET_TYPE_UNSUPPORTED`, and `LEGACY_ASSET_MIGRATION_REQUIRED`.

Legacy policy:

- Never fetch an arbitrary legacy URL.
- Recognize a URL as internal only by exact HTTPS origin derived from server configuration, default port, no credentials, normalized path, and successful conversion to a valid provider object key.
- Once converted to a key, use the provider adapter; do not proxy the URL.
- Reject redirects because the adapter addresses the object directly.
- External/unknown legacy hosts return `LEGACY_ASSET_MIGRATION_REQUIRED`; the UI may link the operator to a migration/re-upload action but the server must not act as a proxy.
- If a temporary migration tool ever needs network fetch, it must be a separate admin-only/offline tool with exact allowlists, protocol/port checks, redirect revalidation, DNS A/AAAA private/reserved blocking, connect pinning, time/byte limits, and dedicated tests. It is not part of the normal download route.

This design satisfies protocol, trusted-host, redirect, DNS/private-network, timeout, declared-size, streamed-size, content-type, filename, authorization, and ownership requirements while removing arbitrary HTTP fetch from the primary path.

### A5. Delete, replace, and orphan safety

- Centralize asset deletion in a Media lifecycle service.
- Before delete, query supported content repositories for active references; do not trust a mutable client reference count.
- A referenced asset cannot be deleted. Replacement attaches the new verified asset first, commits content, then marks the old unreferenced asset cleanup-eligible.
- Provider delete is idempotent: missing object is treated as already deleted, while authorization/reference errors remain failures.
- Persist `delete_pending` before provider deletion and `deleted` after success so retries are safe.
- Expired upload sessions and unattached verified assets become cleanup candidates after a configured grace period.
- Multi-variant Article image creation records every produced key; partial failure schedules all created variants for cleanup.
- Cleanup processes only explicit canonical records/sessions, never a bucket-wide guessed prefix.
- First rollout runs orphan cleanup in report-only mode. Deletion enablement is a separate configuration gate.
- Content deletion/archive does not synchronously destroy shared assets. It removes/retire links, then deferred cleanup proves zero references.

### A6. Authorization and abuse controls

- Use existing content permission helpers to authorize purpose and intended owner.
- Reporters may upload only assets for content/purposes already allowed by policy.
- Completion/attach/delete/replace checks actor, role, content access, and session ownership server-side.
- Reuse the canonical rate-limit utility where possible. Define per-user concurrent sessions, init frequency, daily bytes, and download concurrency/bytes with configuration-safe defaults.
- Apply CSRF/same-origin wrappers to all mutations.
- Record actor, asset, owner, size, result, request ID, and failure category without signed URLs or credentials.

### Likely files/systems

- `lib/models/Media.ts` and a proposed upload-session model;
- `lib/server/media/**`, including `spacesAdapter.ts` and repositories;
- `lib/utils/digitalOceanSpaces.ts` behind the adapter;
- `lib/storage/storyVideoUpload.ts` migrated/delegated rather than independently trusted;
- `/api/admin/upload`, `/api/admin/uploads/story-video/**`, `/api/admin/media/**`;
- `/api/admin/stories/[id]/download`;
- Story/Article/Video mappers and file stores for additive asset IDs;
- rate-limit, audit, and safe-stream helpers.

### Tests

- SSRF protocol rejection, localhost names, IPv4/IPv6 loopback, RFC1918/ULA/link-local/reserved addresses, decimal/octal/IPv4-mapped forms, DNS rebinding fixture, redirect escape, and credential/port URL cases;
- exact trusted-origin-to-key conversion and traversal rejection;
- oversized declared length, missing/false length with oversized streamed body, timeout, abort, and safe filename;
- MIME/extension/signature mismatch, unsafe SVG, malformed PDF/MP4/VTT;
- cross-user/session/Story receipt replay and expired/single-use receipt;
- purpose/RBAC matrix and same-origin guard;
- replace-before-detach, referenced delete refusal, partial variant rollback, idempotent delete, orphan grace period, report-only cleanup;
- Mongo/file metadata parity with fake storage adapters only.

### Acceptance gates

- Arbitrary Story URLs produce no network request.
- Private/internal/redirect targets cannot be reached by any retained legacy path.
- Download memory is bounded independently of provider metadata.
- Every new persisted trusted object comes from a server-owned verified asset.
- Object keys/provider/URLs cannot be selected or forged by the client.
- Unauthorized attach/replace/delete is impossible in API tests.
- Shared references prevent deletion; orphan cleanup is deterministic and idempotent.
- Article/Story/Video paths can adopt the boundary without a universal content rewrite.
- Routine tests require no real object storage.

### Rollback

Schema changes are additive. Legacy reads stay available, but unrestricted URL fetch never returns. If asset backfill causes an incident, disable new attachment/cleanup and retain `LEGACY_ASSET_MIGRATION_REQUIRED`; do not restore the vulnerable proxy. Provider deletion stays report-only until its safety gates pass.

## 8. 3.8B — Video production and upload lifecycle

### Objective

Build coherent Story and standalone Video workflows on 3.8A's verified assets, without claiming that Lokswami has automatic transcoding.

### B1. Field classification

| Classification | Fields/concepts | Owner |
|---|---|---|
| Shared media concept | asset ID, provider/key, verified MIME/size, filename, dimensions, duration/container, variants, lifecycle | Media domain |
| Standalone Video concept | title, description, category, slug, Article relation, views/rank, Short flag, editorial workflow, public delivery choice | Video domain |
| Story production concept | production status, assigned editor, notes, source assets, verified master asset, QA timestamps/actor | Story domain |
| Article-specific | featured/inline role, alt, caption, credit, license, focal point, SEO/OG selection | Article domain |
| Different by design | YouTube external source versus Spaces asset; Story source package versus final master; Article image versus Video poster | Remain separate |

Do not merge Story, Video, and Article into one schema. Add asset references and server derivation at their seams.

### B2. Video upload lifecycle

Use 3.8A upload sessions and explicit states:

`pending -> uploading -> uploaded -> verified -> attached -> ready`

Failure states are `failed` and `cleanup_pending`; `manual_processing` describes an attached source awaiting an external editor. Existing `processing` remains compatible but must be mapped to an owned state rather than manually implying HLS creation.

For standalone Video:

- Video create attaches a verified video asset or a validated YouTube source.
- Direct MP4 facts are derived from the asset; caller-entered size/provider/URL cannot override them.
- Store a canonical source/playback asset ID; derive legacy `videoUrl`/`playbackUrl` during transition.
- External YouTube remains a different source kind with canonical URL/video-ID validation.
- Poster and caption are separate verified assets.
- Delete/replacement uses Media lifecycle rules.

For Story:

- `mediaAssets[]` gains `assetId`; top-level legacy fields are derived from selected primary assets.
- Resolve the `do-spaces` versus `digitalocean_spaces` mismatch through one canonical provider enum and read-time aliases.
- New writes use only the canonical value; backfill tests protect old records.
- Asset ordering and primary selection remain Story concepts.

### B3. Verified master export

- Only super admin, admin, or a copy editor with current Story access/assignment may attach a master.
- A master must be a 3.8A verified video asset whose upload session is scoped to that Story or explicitly transferred by an authorized server operation.
- The attach service verifies current object existence, MIME/container, byte size, actor, Story ownership, and session state.
- Persist `masterAssetId`, verified technical facts, attached-by actor, and attached-at timestamp. Keep `masterExportUrl` as server-derived compatibility output.
- Reject arbitrary master URLs on new writes. Legacy URL-only master exports remain visible as unverified and cannot make a new social delivery eligible.
- `ready_to_publish` requires a verified master and successful QA transition.

### B4. Production transition graph

Planned transitions:

- `not_started -> editing`
- `editing -> qa_review | failed/manual_processing`
- `qa_review -> editing | ready_to_publish`
- `ready_to_publish -> editing | published`
- `published -> editing` only through an explicit revision/reopen action

Use the repository's existing names and add only the minimum failure/manual state if schema review confirms it is required. Validate transitions in a Story production service, not directly in the route. Require an expected `updatedAt`/version for PATCH to prevent lost updates. Record actor, from/to state, reason/notes, master asset, and request ID in activity history and relevant workflow notification.

### B5. Processing truth

Implemented in Phase 3.8B:

- bounded MP4 container/metadata probing if a small, safe library is selected;
- verification state, manual-processing state, technical metadata, and error category;
- YouTube validation and poster derivation already supported;
- progressive MP4 playback and existing public publication filters.

Manual workflow:

- editing/transcoding outside Lokswami;
- uploading the resulting verified master;
- human QA and readiness transition.

Deferred future processing:

- FFmpeg workers, codec conversion, compression, frame extraction, audio normalization, HLS/DASH, adaptive bitrate, and automated rendition ladders.

No HLS URL should be generated or marked ready unless a later owning processor exists. Existing legacy HLS fields remain read-compatible.

### B6. Media page resolution

Preferred Phase 3.8B choice: remove/disable the misleading `video/*` selection from the generic Media page and add role-aware links to Standalone Video creation and Story production. The Media page's generic multipart route is unsuitable for 1.9 GB video and would duplicate the direct-upload workflow. Reconsider library video upload only after canonical upload sessions and ownership destinations are explicit.

### B7. Accessibility/editorial metadata policy

- Article publish requires a non-empty, meaningful featured-image alt or an explicit decorative flag where semantically valid. Caption/credit/source/license requirements are configurable editorial policy, with at least a deliberate “not supplied” state rather than silent absence.
- Story media references support caption, credit/source, license, and image alt so conversion to Article does not lose metadata. Requirements can remain readiness warnings until the Article publication boundary.
- Standalone Video supports a verified WebVTT caption asset and transcript text/reference. Publication UI clearly shows caption/transcript state; mandatory captions may be a policy warning initially unless product policy makes them blocking.
- Main Videos public mapping preserves poster/playback/caption/transcript fields. `VideoPlayer` renders `<track>` and the page renders an accessible transcript disclosure/region when present.
- Preserve native controls, accessible names, focus-visible behavior, muted autoplay behavior, and keyboard operation. Do not add AI transcription.

### Likely files/systems

- `lib/models/Story.ts`, `lib/models/Video.ts`, file stores and mappers;
- `lib/content/storyMedia.ts`, `lib/content/videoPublication.ts`;
- `lib/server/storyEditorialService.ts`, `lib/server/video/**`;
- Story production API and Story list/editor UI;
- Video create/edit pages, public Video types/mappers, `VideoPlayer`, Swipe components;
- Article readiness/SEO media modules and shared asset picker;
- Media page affordances and asset lifecycle service.

### Tests and gates

- deterministic upload/attach/fail/replace/remove states;
- no orphan after attach persistence failure where compensation is possible; otherwise durable cleanup_pending state;
- forged/cross-Story master rejected;
- transition table and optimistic concurrency conflicts;
- four-role master/production matrix;
- provider alias/backfill and Mongo/file parity;
- Story media/order/legacy fields preserved;
- Video public fields/captions/transcript preserved;
- generic Media video dead control removed and correct links visible;
- Article/Story/Video accessibility policy tests;
- explicit tests proving no transcoding/HLS job is implied.

### Rollback

Use additive `assetId` and master fields. Keep older URL-only records readable and visibly unverified. Roll back new UI/service entry points without deleting assets or production history. Never roll back by accepting arbitrary authoritative master URLs.

## 9. 3.8C — Social publishing, source authorization, and idempotency

### Objective

Close both social P0s and turn webhook handoff into a durable, per-target distribution workflow compatible with manual, n8n, and generic webhook modes.

### C1. Separate editorial package from delivery

Keep `SocialPost` as the editable per-platform editorial package. Add a persistent `SocialDelivery` (and embedded or separate attempts) for an approved immutable payload snapshot.

Minimum delivery fields:

- delivery ID;
- SocialPost ID;
- source content type and canonical source IDs;
- source publication/revision identity and captured version;
- provider mode and target/platform;
- normalized immutable payload snapshot or safe references;
- payload fingerprint and idempotency key;
- state: `pending`, `dispatching`, `succeeded`, `retryable_failed`, `failed`, `blocked`, or `cancelled`;
- requested/approved actor and timestamps;
- claimed timestamp, claim lease/version, attempt count;
- completed timestamp;
- provider execution/external reference where safe;
- failure category and sanitized message;
- reconciliation-required marker for unknown outcomes;
- standard created/updated timestamps.

Never persist provider secrets, authorization headers, signed webhook URLs, or full sensitive subscription tokens.

Use a unique index on the logical identity, proposed as:

`source type + source ID + source publication/revision ID + target + payload fingerprint + delivery purpose`

A deliberate changed/corrected payload creates a new fingerprint/revision and therefore a new logical delivery. Repeated clicks on the same approved snapshot resolve to the existing delivery.

### C2. Atomic claim

Mongo flow:

1. upsert/find the logical delivery under its unique constraint;
2. atomically claim only `pending` or eligible `retryable_failed` using `findOneAndUpdate` with status/version/lease predicates;
3. persist `dispatching`, claim ID, claimant, attempt number, and time before the provider call;
4. callers that lose the claim return `already_in_progress` or the terminal existing result without calling the provider;
5. send the delivery ID/idempotency key to the adapter;
6. persist the terminal result using the claim/version so a stale worker cannot overwrite a newer reconciliation.

An in-memory mutex is prohibited. File-store mode cannot provide cross-process atomicity; real n8n/generic dispatch therefore fails closed outside Mongo. File mode continues to support manual draft/preparation and deterministic unit tests.

### C3. Unknown outcomes and exactly-once boundary

Application concurrency must produce one adapter invocation. End-to-end exactly-once publication additionally requires the downstream webhook/provider to honor the same idempotency key.

- Include `Idempotency-Key` (delivery ID/fingerprint) in the webhook contract.
- A timeout after request transmission is `reconciliation_required`, not immediately retryable.
- Do not automatically retry an unknown outcome when the downstream cannot query/dedupe.
- A repeated manual reconciliation/retry uses the same logical delivery/idempotency key.
- Success persisted before the browser response means a disconnected client can later retrieve the succeeded state.
- Provider success followed by local persistence failure is recovered by the same key/query/callback contract; tests inject this failure.

### C4. Dispatch-time source revalidation

After the claim and immediately before the adapter call:

1. reload current user/role or re-authorize the current authenticated actor;
2. reload the canonical Story and linked Article through domain services;
3. require both to exist;
4. require the Article to be currently published and due, not archived/withdrawn/deleted;
5. require the Story workflow/media-production state required by policy;
6. require the approved payload's source revision to match, or explicitly block as stale;
7. require the verified master/poster assets to remain attached, readable, and eligible;
8. require the target/provider to remain enabled and authorized.

Failure marks the delivery `blocked` or `cancelled` with a safe reason and makes zero provider calls. Retry repeats all checks; enqueue-time validation is never treated as sufficient.

### C5. Regeneration and approval

- Generating drafts must not reset a `dispatching`, `succeeded`, or published SocialPost/delivery.
- A content change creates a new editable package revision or updates only an undispatched draft.
- Approval freezes the payload snapshot used to create the logical delivery.
- Scheduling remains metadata until a safe due-job path is explicitly implemented. If scheduling is implemented, the job uses the same atomic claim and source revalidation.
- Cancel is allowed only before success and is recorded with actor/time/reason.

### C6. Provider adapters and webhook contract

Support only:

- manual adapter: never sends, returns disabled/manual state;
- n8n webhook adapter;
- generic webhook adapter;
- fake adapter for tests.

Rules:

- configuration is server-owned; no user-supplied destination URL;
- missing/invalid configuration fails closed;
- production webhook scheme must be HTTPS;
- validate destination URL and reject credentials/fragments; do not log it because query/path may contain secret material;
- bounded connect/response timeout and bounded response bytes;
- JSON request/response contract has a version;
- sign timestamp + delivery ID + raw body with HMAC when a shared secret is configured; do not send the raw secret as a “signature”;
- redact headers, URL, secrets, provider payload, and actor PII from unsafe error logs;
- classify errors as configuration, authorization, timeout_unknown, throttled, provider_rejected, malformed_response, and persistence/reconciliation;
- persist only allowlisted response fields and bounded sanitized messages.

### C7. Partial failure and retry

Each target/platform has its own `SocialDelivery`; aggregate UI derives partial success rather than storing one ambiguous boolean. One succeeded target is never resent because another failed.

Retries are explicit, role-authorized, bounded, and backoff-aware. Suggested policy is a small configured maximum with no infinite loop. `failed` is terminal unless an authorized operator creates a corrected delivery. `retryable_failed` can be claimed again with the same idempotency key. Unknown outcomes require reconciliation first.

### C8. RBAC and UI contract

- Copy editor: read/preview only unless existing policy is deliberately changed in a separate RBAC decision.
- Admin/super admin: generate/edit/approve according to current policy.
- Super admin: dispatch/retry/cancel external automation.
- The server independently enforces every action.
- UI disables repeat clicks but server idempotency is authoritative.
- Confirmation shows source state, payload snapshot, target, provider mode, media, and whether the action is new, already in progress, or already sent.

### Likely files/systems

- `lib/models/SocialPost.ts`, new SocialDelivery schema/model and file representation;
- `lib/server/distribution/**`, content query/source eligibility service;
- `lib/server/socialAutomation.ts` split behind adapter interfaces;
- `/api/admin/social-posts/**` plus explicit delivery/status/retry routes;
- social admin page/components;
- deployment environment validators and diagnostics;
- audit logging/redaction and rate limiting.

### Tests and gates

- two simultaneous claims -> exactly one fake-provider invocation;
- duplicate pending/in-flight/succeeded requests return existing state;
- failed retry uses same identity; bounded retry enforced;
- timeout after provider acceptance enters reconciliation-required state;
- provider success plus persistence failure can reconcile without duplicate;
- source missing/unpublished/scheduled-not-due/archived/withdrawn/changed after enqueue -> zero calls;
- invalid/missing media -> zero calls;
- one target success/another fail remains isolated and renders partial outcome;
- four-role RBAC, target isolation, regeneration safety;
- manual/n8n/generic/fake configuration and fail-closed file mode;
- HTTPS/config/HMAC/version/idempotency/timeout/bounded-response contract;
- logs and stored errors contain no secret/header/full webhook URL.

### Rollback

Provider kill switch returns all adapters to manual/disabled without deleting delivery history. Successful external posts are not deleted as a software rollback. Pending records remain inspectable/cancellable. Existing SocialPost data stays readable; old dispatch route can be disabled once the new service is active, never restored as an unsafe bypass.

## 10. 3.8D — Push delivery foundation and delivery safety

### Objective and actual scope

Deliver an honest, disabled-by-default Push domain foundation. Do not select or integrate a real provider in Phase 3.8 without a separate approved product/privacy/provider decision.

Phase 3.8D includes:

- explicit `manual`/`disabled` provider state;
- provider-neutral interfaces and a fake adapter for tests;
- durable prepared Push message and delivery state models compatible with later implementation;
- source publication revalidation and idempotency patterns shared conceptually with Social;
- all-opted-in as the only planned initial audience concept, but no real subscription enrollment yet;
- honest admin copy/preview/approval/cancel/status UX with no Send Push button;
- configuration/diagnostic gates proving no external delivery can occur.

Deferred pending provider/consent approval:

- real provider SDK/API;
- real endpoint/token/subscription persistence;
- browser subscription endpoint and VAPID/FCM credentials;
- service-worker `push`/`notificationclick` delivery handlers;
- external dispatch/retry;
- segmentation beyond all opted-in subscribers.

### D1. Prepared message and delivery contract

Define domain types/models sufficient for migration:

- prepared message ID, source type/ID/revision, title/body, validated internal deep link, optional canonical image asset, author/approver, timestamps, state;
- delivery ID, message ID, audience key/version, provider mode, payload fingerprint/idempotency key, state, request/claim/completion fields, attempt count, safe failure category, timestamps;
- provider adapter interface supporting `disabled` and fake results.

The disabled adapter never returns success and never performs network I/O. Creating/approving a prepared message is not a delivery.

### D2. Future subscription contract

Document and reserve, but do not persist real tokens until approved:

- opaque subscription ID;
- provider/platform;
- encrypted/protected endpoint or token reference;
- optional account association;
- consent source/time/version and opt-in state;
- created/updated/last-success timestamps;
- failure count and disabled/revoked timestamps;
- no full token/endpoint in logs, admin tables, audit payloads, or error messages.

Consent withdrawal must disable delivery immediately and provider invalid-token results must revoke the subscription. Account deletion/retention policy must be defined before live enablement.

### D3. Audience and payload safety

- Initial future audience: all currently opted-in active subscriptions only.
- No location, behavior, AI scoring, or inferred-interest targeting.
- Preview must show audience definition and computed count before any later live send.
- Deep links must be same-origin canonical reader paths for a currently published source; reject arbitrary schemes/hosts.
- Images must be canonical verified assets safe for public delivery.
- Avoid sensitive lock-screen content and keep payload fields bounded.

### D4. Future live-send gates

If a later approved change enables real push, it must reuse durable delivery identity, Mongo atomic claim, source revalidation, per-delivery state, bounded retry, invalid-token handling, safe logs, RBAC, rate limiting, and fake-adapter CI. Missing config remains disabled/manual. File mode cannot live-dispatch.

### Likely files/systems

- `/admin/push-alerts` page/client and newsroom candidate service;
- proposed Push message/delivery domain types, repositories, and disabled/fake adapters;
- permissions, audit, diagnostics, deployment validators;
- no real service-worker push change until provider/subscription scope is separately approved.

### Tests and gates

- copy/prepare/approve/cancel state and server RBAC;
- source missing/unpublished/archived/withdrawn blocks approval/delivery preparation;
- deep-link and image validation;
- logical-delivery dedupe in fake mode;
- disabled/missing config creates zero network calls;
- UI contains no fake Send Push action and clearly states manual/disabled status;
- no token/endpoint fields appear in logs/serialized public admin payloads;
- future provider contract tests are mandatory before live enablement.

### Rollback

Disable the Push domain UI/adapter while preserving prepared messages and consent-related records. Source content is never mutated. No successful external notification requires reversal because this subphase does not enable a real provider.

## 11. 3.8E — UX, observability, parity, accessibility, and final QA

### Objective

Close remaining P1 operator and assurance gaps after domain behavior is stable, then prove Phase 3.8 is merge-ready.

### E1. Media UX

- labeled file inputs and purpose/type/size guidance;
- upload progress with semantic progressbar/value text, cancel where technically supported, retry, and deterministic failure state;
- verified/unverified/quarantined/cleanup-pending indicators;
- ownership and active reference summary;
- safe replace/remove/delete confirmation explaining impact;
- no direct video affordance in generic Media unless it uses the canonical destination-bound flow;
- limited orphan/cleanup status useful to administrators, without exposing provider paths unnecessarily;
- errors/success in focusable or live regions.

### E2. Video/Story production UX

- coherent source upload -> manual processing -> master upload -> QA -> ready flow;
- verified master details and unverified legacy warning;
- state transition controls constrained by role/current state;
- conflict/reload handling for optimistic concurrency;
- processing truth, errors, and cleanup state;
- poster/caption/transcript status and accessible preview/player controls;
- no HLS/transcoding claims when absent.

### E3. Social UX

- source eligibility and revision/staleness badge;
- approved immutable payload preview with media and target;
- provider/manual status;
- confirmation before first external dispatch;
- clear `already sent`, `in progress`, `blocked`, `unknown/reconciliation required`, `retryable failed`, and partial states;
- disable repeated click while preserving server authority;
- explicit retry/cancel with attempt history and safe failure category;
- status announcements and focus management after actions.

### E4. Push UX

- preserve candidate selection and copy preparation;
- show `Manual / delivery provider not configured` prominently;
- preview source, deep link, optional image, and future audience definition;
- allow preparation/approval/cancel only if implemented by 3.8D;
- no Send Push button, delivery success claim, or subscriber count until backed by real state.

### E5. Observability

Provide role-appropriate views and structured logs for:

- upload session/asset IDs, state, bytes, actor, owner, request ID, timestamps;
- validation/cleanup attempts and safe failure category;
- Story production transitions/master asset/revision;
- Social delivery/attempt/claim/idempotency key hash or non-secret ID, target, source revision, actor, timestamps, outcome;
- Push prepared message/delivery provider mode and state;
- rate-limit/quota rejection counts.

Never log credentials, signed URLs, raw provider authorization, full webhook URLs, raw subscription endpoints/tokens, or unbounded provider bodies. Apply allowlisted structured provider errors and retention/access policy.

### E6. Abuse-control consistency

- Reuse canonical rate-limit infrastructure instead of local Maps where suitable.
- Define limits by risk: upload init/concurrency/bytes, download concurrency/bytes, social generation/dispatch/retry, and Push preparation/future broadcast.
- Return deterministic 429/retry-after behavior.
- Make provider quota/circuit status observable to super admin without revealing credentials.
- Test that rate limiting cannot change a succeeded idempotent result into a resend.

### E7. Parity and final verification

- Mongo/file parity for editorial Media/Video/Story/Social draft/prepared Push metadata.
- Explicit fail-closed tests for live Social/Push dispatch in file mode.
- Four-role server/API/UI matrix.
- Legacy record compatibility and migration tests.
- No unexpected generated/data files.
- Full security/auth/scope/secret/build/test gates.

### Rollback

UI and diagnostics are consumers of domain state. They can be feature-disabled without mutating delivery/asset state. Do not roll back by rewriting terminal delivery history or deleting assets.

## 12. Dependency graph

```text
3.8A  Media trust/security foundation
  |
  v
3.8B  Video lifecycle on verified asset boundaries
  |
  v
3.8C  Social delivery on verified media + canonical source state
  |
  v
3.8D  Push foundation using the same delivery-safety patterns
  |
  v
3.8E  UX, observability, parity, accessibility, and final QA
```

3.8C must not precede 3.8A/B because outbound payloads currently accept unverified master/media URLs. Idempotent delivery of an untrusted asset is still unsafe. 3.8D follows 3.8C so source-revalidation and delivery-identity patterns are proven once before Push adopts them. 3.8E follows stable domain state so UI labels and observability represent real guarantees rather than compensating for undefined behavior.

Within each subphase, focused tests and typecheck precede the next subphase. No P0 work may be deferred behind UX polish.

## 13. Expected files and systems

The list is directional, not permission to implement outside the active subphase.

| Area | Existing likely changes | Potential additive files/systems |
|---|---|---|
| Asset registry | `lib/models/Media.ts`, `lib/server/media/**`, Media file repository/types | upload-session model/repository, validation/stream/lifecycle helpers |
| Storage | `spacesAdapter.ts`, `digitalOceanSpaces.ts`, `storyVideoUpload.ts` | canonical provider/key resolver and bounded download stream |
| APIs | admin upload/media, Story upload/download, Story/Video routes | session attach/cleanup/status endpoints as required |
| Content schemas | Story, Video, Article media reference types/file stores | additive asset IDs/schema versions/migration helpers |
| Video workflow | Story production route/UI, Video services/editors/player/public mappers | production activity/service and verified master attachment |
| Social | SocialPost model/store, distribution service/repository, socialAutomation, admin routes/page | SocialDelivery model/store, attempt/claim/provider adapters |
| Push | Push Alerts page/client, permissions/diagnostics | prepared-message/delivery types/store, disabled/fake adapter |
| Platform safety | audit logger, rate limiter, environment validators | provider-contract schemas, structured failure taxonomy |
| Tests | existing focused Media/Story/Video/Social suites | SSRF, streaming, lifecycle, concurrency, provider-contract, Push foundation, a11y/responsive suites |

All hand-authored changes should follow repository boundaries and avoid parallel direct model/storage logic in routes.

## 14. Data and schema implications

### Media/asset migration

- Add canonical fields and schema version to existing Media records or introduce a migration-compatible asset collection after an implementation spike.
- Prefer evolving Media because it already has Mongo/file repositories and editor reuse, but do not overload it with content editorial workflow.
- Add asset IDs to Article/Story/Video references while retaining legacy URLs for reads.
- Backfill only URLs that can be deterministically mapped to the configured trusted storage origin/key.
- Mark unknown external legacy assets `legacy_external`/unverified; do not fetch them automatically.
- Normalize provider aliases on read; write one canonical enum.

### Upload sessions

- Expiring sessions need TTL/index support in Mongo and explicit expiry cleanup in file mode.
- Session records are operational metadata, not public media.
- Unique session/receipt IDs and single-use attach state prevent replay.

### References and deletion

- Content documents hold asset IDs.
- Delete checks query canonical content repositories for references instead of trusting a counter.
- If performance later requires an index, add it as a derived optimization with reconciliation; it cannot be the only safety proof initially.

### Social delivery

- Preserve SocialPost as the editorial record.
- Add SocialDelivery unique logical key/index and versioned claim fields.
- Attempt history may be bounded embedded records or a separate collection; choose based on expected volume, but never overwrite the only evidence of an ambiguous send.
- File representation supports viewing/preparation but real outbound claim is disabled.

### Push foundation

- Prepared messages/delivery records are additive and provider-neutral.
- Do not add real subscription/token records until provider, encryption, retention, consent, and account-deletion rules are approved.

### Migration method

- additive schemas first;
- dual-read, safe-write;
- deterministic dry-run report;
- bounded batch backfill with resume cursor and counts;
- no automatic remote fetch;
- reconciliation report for unmapped records;
- legacy field removal deferred beyond Phase 3.8.

## 15. Provider safety model

### Storage

- Provider chosen only by server configuration and canonical asset record.
- Exact logical-store/object-key validation.
- Signed URLs are short-lived transport artifacts, never canonical identifiers or logged fields.
- Fake adapter covers routine tests; staging provider tests, if later authorized, use unique `[QA 3.8*]` fixtures and recorded cleanup.

### Social webhooks

- Manual is the default/fallback.
- Missing/invalid URL or secret policy disables dispatch without runtime crash.
- HTTPS required outside local/test.
- Destination is configured server-side only.
- Versioned payload, stable idempotency key, timestamped HMAC, timeout, bounded response, allowlisted result fields, and redacted logs.
- No direct Facebook/Instagram/X/YouTube API is added.

### Push

- Only disabled/manual and fake adapters in the planned Phase 3.8D scope.
- A later real adapter must pass the same config, idempotency, source authorization, bounded retry, privacy, and contract gates before a send endpoint/UI is enabled.

### Kill switches

Storage deletion, social automation, and future Push dispatch have independent server-side enablement. Disabling a provider preserves state/history and prevents new side effects.

## 16. Staging strategy

Phase 3.8 remains staging-first, but routine validation is local and mocked.

### Routine CI/local

- fake storage/provider adapters only;
- no real Spaces mutation;
- no n8n/social/push call;
- no credentials required beyond existing safe test fixtures;
- no publication, email, OCR, TTS, or cron side effects.

### Future isolated staging acceptance

Only after explicit authorization:

- run against a staging-only bucket/provider/project;
- prove deployment validation rejects production-like endpoints/buckets;
- create uniquely named `[QA 3.8A]`, `[QA 3.8C]`, or `[QA 3.8D]` fixtures;
- record content IDs, asset IDs, object keys, and delivery IDs before mutation;
- clean only recorded fixtures through the same safe lifecycle service;
- preserve unrelated data;
- never print credentials, signed URLs, token endpoints, or webhook secrets;
- retain manual/disabled social and Push defaults unless the specific isolated acceptance explicitly enables a fake/staging endpoint.

No staging mutation is part of this planning task.

## 17. Test strategy

### Unit/service

- asset MIME/extension/signature validation and canonical key grammar;
- upload session state/replay/expiry/ownership;
- provider alias normalization and legacy URL-to-key conversion;
- bounded stream, filename, content-type, deletion/reference/orphan rules;
- Story production transitions/master verification/concurrency;
- Video/Article/Story accessibility policy;
- Social source eligibility, fingerprint/idempotency, atomic-claim predicates, retry classification;
- webhook HMAC/config/response parsing;
- Push disabled/fake adapter, deep link, audience definition.

### API

- upload init/complete/attach/status;
- media create/list/delete/replace and legacy rejection;
- Story download and master export attach;
- Story production transitions;
- Social generate/approve/dispatch/status/retry/cancel;
- Push prepare/approve/cancel/status, with no live dispatch route enabled;
- four-role and same-origin checks for every mutation.

### Integration

- fake Spaces upload -> verify -> attach -> replace -> cleanup;
- Article/Story/Video round trips in Mongo-like and file repositories;
- Social approval -> delivery creation -> two-writer claim -> fake adapter -> persisted outcome;
- source state changes between queue and dispatch;
- partial target outcomes;
- disabled Push end-to-end produces no network call.

### Component/browser

- Media upload/progress/failure/retry/confirmation/status;
- Story production/master verification/conflict;
- Video caption/transcript/player state;
- Social payload preview, in-progress/already-sent/blocked/partial/retry;
- Push manual/disabled preview with no Send button;
- role-specific controls and error/live-region behavior.

### Final regression order

1. focused unit/service tests;
2. focused API/component tests;
3. security and concurrency suites;
4. four-role/auth guards;
5. responsive Playwright checks;
6. `npm run typecheck`;
7. `npm run lint:strict` or canonical lint gate;
8. `npm run build:ci`;
9. `npm run verify:prod-env` if environment requirements changed;
10. full `npm run test:ci`;
11. generated/unexpected artifact and Git review.

## 18. Security test strategy

### SSRF matrix

- `http`, `file`, `ftp`, `data`, credentialed URLs, fragments, non-default ports;
- `localhost`, subdomain tricks, trailing dot, mixed case, Unicode/punycode confusion;
- IPv4 loopback/private/link-local/multicast/reserved, integer/octal/hex forms;
- IPv6 loopback/ULA/link-local/IPv4-mapped addresses;
- DNS returning private addresses and simulated rebinding;
- redirects from trusted to untrusted/private and redirect loops;
- trusted exact origin that maps to valid key versus path traversal/encoded traversal;
- assert zero fetch for rejected normal Story downloads.

### Body/resource matrix

- missing, small, exact-limit, and oversized Content-Length;
- chunked body exceeding limit;
- falsely small Content-Length with larger actual stream;
- slow headers/body and abort propagation;
- invalid/ambiguous MIME, signature mismatch, polyglot candidates, unsafe SVG, malformed MP4/PDF/VTT;
- CR/LF/path injection in filenames and object keys.

### Authorization matrix

- guest and all four staff roles;
- own, assigned, shared queue, unrelated, archived, deleted content;
- cross-user upload receipt, cross-Story master, reused/expired receipt;
- delete/replace referenced/shared/unowned assets;
- Social/Push source revalidation and current actor authority.

### Provider/config/logging

- missing/partial/invalid configuration;
- production non-HTTPS webhook;
- URL containing secret-like query/path is never logged;
- HMAC timestamp/body/idempotency validation;
- oversized/malformed provider response;
- audit/provider errors contain no secrets, auth headers, signed URLs, tokens, or unbounded body.

## 19. Concurrency and idempotency strategy

### Media

- Single-use attach uses atomic state/version update.
- Replacement uses attach-new/content-save/detach-old ordering.
- Delete claims `delete_pending`; repeated workers converge on `deleted`.
- Cleanup uses a lease/version and idempotent provider delete.
- File repository operations use existing serialized/atomic-write patterns, with tests for competing local operations.

### Story production

- PATCH includes expected version/update timestamp.
- Conflicting transition returns 409 and current state; no last-write-wins status jump.
- Master attach receipt is consumed once.

### Social

- Database unique logical key deduplicates creation.
- Conditional atomic claim prevents two adapter calls.
- Claim has bounded lease for worker crash detection, but lease expiry with unknown provider outcome enters reconciliation rather than blind resend.
- Terminal success is immutable for the logical delivery.
- Retry uses same delivery/idempotency key and increments bounded attempt count.
- File mode live dispatch disabled because process-local locks cannot provide the guarantee.

### Push

- Foundation mirrors logical identity/claim types in fake mode.
- A real provider cannot be enabled until duplicate pending/in-flight/completed and provider-token invalidation tests pass.

## 20. Accessibility and responsive strategy

### Accessibility

- Every file input has a programmatic label, accepted-type/size instructions, and associated error.
- Upload progress exposes determinate/indeterminate semantics and completion/failure announcements.
- Dialogs trap/restore focus, close by keyboard where safe, and name destructive consequences.
- Status transitions use restrained `aria-live` regions; repeated polling does not create announcement spam.
- All action icons have accessible names and visible focus.
- Video uses native controls where possible; caption toggle maps to an actual track; transcript is keyboard/screen-reader accessible.
- Disabled/manual provider state is conveyed in text, not color alone.
- In-progress/already-sent/blocked results remain understandable without timing or animation.

### Responsive matrix

Test at exactly:

- 1440x900: multi-column editors, sticky panels, previews, long delivery IDs/status history;
- 768x1024: collapsed grids, dialogs, upload progress, Story production controls, partial-delivery cards;
- 390x844: filenames/URLs, virtual keyboard, file input, confirmation dialogs, action wrapping, player controls, live regions, focus return.

Include keyboard-only flows, 200% zoom where practical, reduced motion, long Hindi/English copy, provider/error strings, and no horizontal clipping of primary actions.

## 21. Observability strategy

### Correlation

Use stable non-secret IDs across:

`request ID -> upload session -> asset -> content/revision -> delivery -> attempt`

### State/history

- append or preserve meaningful lifecycle transitions rather than only the latest error;
- actor, source/content, target, provider mode, attempt count, timestamps, safe failure category;
- asset cleanup and delivery reconciliation queues visible to authorized operators;
- terminal success and deletion tombstones retained per policy.

### Metrics/alerts

- upload validation failure, abandoned bytes, cleanup backlog/failure;
- download rejection/timeout/byte-limit events;
- production items stuck by state/age;
- social pending/dispatching age, unknown outcomes, retry exhaustion, partial target success;
- Push remains disabled/manual and reports that truth;
- rate-limit/quota rejection counts.

### Redaction

Allowlist stored provider response fields. Hash or use already non-secret idempotency/delivery IDs. Never record credential values, full webhook URLs, signed URLs, provider request headers, raw subscription endpoints, or unlimited editorial/provider bodies.

## 22. Rollback strategy

### 3.8A

- Additive schema and dual reads.
- Feature-disable new upload/cleanup attachment while preserving asset/session records.
- Legacy unsafe URL fetch stays closed; unmigrated items fail with a deterministic remediation state.
- Keep physical deletion report-only until proven.

### 3.8B

- Older URL-only Story/Video records remain readable and marked unverified.
- Disable new state controls without deleting masters/assets/history.
- Preserve provider alias mapping.

### 3.8C

- Switch adapters to manual/disabled.
- Preserve pending, terminal, and ambiguous delivery records.
- Never attempt to “roll back” by deleting an external post automatically.
- Do not restore the legacy send-before-persist route.

### 3.8D

- Disable Push preparation/foundation features without altering source content.
- No real provider is enabled, so no external rollback is required.

### 3.8E

- Feature-disable presentation/diagnostics only; domain state remains authoritative.
- Do not rewrite delivery or asset states to match an older UI.

## 23. Completion gates

Phase 3.8 is complete only when every applicable item is evidenced:

1. Story download SSRF is closed.
2. Remote/trusted-object download size is bounded by declared and actual bytes and streams with bounded memory.
3. Upload trust is server-enforced.
4. Storage provider/object-key trust boundary is safe.
5. Delete/replace authorization and reference safety are enforced.
6. Media orphan lifecycle is implemented, covered, and deletion rollout is safe.
7. Video upload workflow is coherent and deterministic.
8. Misleading Media video upload affordance is removed or uses the canonical flow.
9. Master export is server-verified and Story-owned.
10. Story video-production transitions/UI are coherent.
11. Social source state is revalidated immediately before dispatch.
12. Social logical delivery and atomic claim work.
13. Duplicate Social send is prevented for concurrent/retried logical requests.
14. Social per-target failure and partial outcome are represented.
15. Social retries are bounded, explicit, authorized, revalidated, and idempotent.
16. Provider configuration fails closed.
17. Webhook destination, HTTPS, timeout, response bound, signing, and redaction are hardened.
18. Push implementation status is honest and documented.
19. Any implemented Push delivery is idempotent and safe; under this plan no real provider is enabled.
20. No fake Send Push UX exists.
21. RBAC is server-enforced across four roles.
22. Appropriate upload/download/dispatch/retry abuse controls pass.
23. Operational state and failure categories are safely observable.
24. No credentials, signed URLs, secret webhook URLs, or subscription tokens are logged.
25. Media accessibility gaps are addressed according to the approved Article/Story/Video policy.
26. 1440x900 responsive pass succeeds.
27. 768x1024 responsive pass succeeds.
28. 390x844 responsive pass succeeds.
29. Keyboard/focus/live-region/video-control accessibility pass succeeds.
30. Targeted SSRF/upload/provider security tests pass.
31. Media and delivery concurrency tests pass.
32. Versioned mocked provider-contract tests pass.
33. Four-role regression matrix passes.
34. Security suite passes.
35. Auth guards and same-origin mutation tests pass.
36. Phase 3 scope/secret check passes.
37. Typecheck passes.
38. Lint passes.
39. `build:ci` passes.
40. Full `test:ci` passes against the then-current baseline.
41. Generated/unexpected artifacts equal zero.
42. Unresolved P0 count equals zero.
43. Feature branch is clean and pushed.
44. Phase 3.8 merges only through a separate controlled merge and post-merge verification.

## 24. Deferred and P2 items

- rich Media library tagging/taxonomy and advanced search;
- checksum-based/global visual deduplication beyond safety needs;
- upload pause/resume;
- automated video transcoding, FFmpeg workers, HLS/DASH, adaptive bitrate, audio normalization, and frame extraction;
- direct social-network APIs;
- elaborate provider-specific preview simulators and distribution analytics;
- real Push provider/subscription/service-worker delivery until approved;
- Push segmentation beyond all opted-in subscribers;
- behavioral/location/AI audience selection;
- major editor component decomposition or broad design cleanup;
- removal of legacy URL fields after migration confidence.

Deferred items must not be smuggled into a subphase unless they become necessary to close a documented safety/acceptance gate and scope is explicitly reviewed.

## 25. Out of scope

- E-Paper feature or reader changes;
- Homepage 2.0;
- Article Reader 2.0 redesign;
- Deep Links/Share/OG redesign;
- Video Hub/Shorts reader redesign beyond Phase 3.8 safety/accessibility defects;
- E-Paper reader;
- mobile app;
- AI transcription/caption generation;
- broad analytics redesign;
- production migration or cutover;
- direct Facebook, Instagram, X, LinkedIn, or YouTube publishing APIs.

## 26. Risks and open questions

### Decisions required before 3.8A implementation

1. Confirm whether the existing Media model will be evolved into the canonical asset registry or a new collection is justified by migration constraints.
2. Inventory trusted storage URL shapes without reading credentials and define deterministic URL-to-key mappings.
3. Decide maximum download sizes per asset kind and operational upload quotas.
4. Decide the legacy external-asset remediation experience; normal server proxying is not an option.
5. Confirm the retention/grace period for unattached uploads, cleanup tombstones, and archived assets.

### Decisions required before 3.8B

6. Approve the Article/Story/Video alt/caption/credit/license publication policy.
7. Select a bounded MP4 metadata parser, or explicitly restrict verification to container signature/provider metadata.
8. Confirm whether PDF Video thumbnails are legacy-only and should be rejected for new writes.
9. Define who can reopen a published production package and whether a new production revision is required.

### Decisions required before 3.8C live enablement

10. Confirm whether n8n/generic downstream can honor idempotency keys, versioned payloads, HMAC, and reconciliation/callback semantics.
11. Define external-distribution approval authority and whether source revision changes invalidate approval automatically.
12. Decide retry ceilings/backoff and operator handling for unknown provider outcomes.
13. Confirm that live outbound dispatch may require MongoDB and remains disabled in file mode.

### Decisions required before real Push work

14. Select the provider only through a separate product/engineering/privacy decision.
15. Define consent text/version, anonymous versus account-linked subscription behavior, encryption/storage, retention, revocation, and account deletion.
16. Confirm the first audience is all opted-in subscribers and approve lock-screen content policy.

### Delivery risks

- Legacy externally hosted assets may need manual migration and temporarily lose download convenience; fail-closed security takes priority.
- Reference-aware cleanup can damage shared content if enabled before asset IDs/backfill are complete; start report-only.
- Exactly-once external effect cannot be guaranteed without downstream idempotency/reconciliation; unknown outcomes must not be blindly retried.
- Adding state without completing operator UX can create new dead ends; each subphase includes its minimum usable UI and 3.8E validates the full journey.
- File fallback cannot safely emulate distributed provider claims; documenting and enforcing that limit is preferable to a false guarantee.

### Planning completion record

This plan preserves the locked dependency order and maps every audit P0/P1 into an implementation subphase or explicit deferment. It authorizes no Phase 3.8 application implementation by itself. Implementation begins only through a separately approved 3.8A task.
