# Phase 3.8 Video, Media, Social, and Push Audit

Audit date: 2026-09-25

Repository: `C:\Dev\Lokswami-version-3`

Branch: `b3/phase3.8-video-media-social-push`

Starting commit: `2186680`
Integration base: `origin/b3/foundation` at `2186680`

This is a repository-truth audit. It does not implement Phase 3.8, call storage or outbound providers, inspect runtime secrets, or mutate application data.

## 1. Executive summary

The current system is not one unified media platform. It is four adjacent implementations:

1. a lightweight Media metadata index backed by MongoDB or `data/media.json`;
2. standalone `Video` content with newsroom workflow and public feeds;
3. Story-owned media plus a metadata-only video-production state;
4. SocialPost records handed to a generic webhook, with Push Alerts limited to a copy-preparation screen.

DigitalOcean Spaces is the only implemented media object store. Metadata persistence has MongoDB/file-store parity, but object storage has no local fallback. Article image optimization is real and uses Sharp. Video transcoding, rendition generation, HLS production, codec probing, and master-export processing are not implemented.

The audit found three P0 release gates:

- `GET /api/admin/stories/[id]/download` can server-fetch a user-controlled Story thumbnail/media URL and buffers the entire response. This is an authenticated SSRF boundary and an availability risk.
- Social webhook dispatch has no atomic claim or idempotency key. Concurrent requests and timeout/response-persistence ambiguity can duplicate external posts.
- Social dispatch checks the SocialPost status but does not re-check current Story/Article publication state. Draft or no-longer-approved content can be distributed externally after metadata is advanced manually.

Material P1 findings include client-trusted media records, extension/MIME-only upload checks, orphaned public objects, inconsistent Story video provider identifiers, manual/unverified master-export URLs, broken caption delivery in the main Videos reader, missing publication enforcement for image accessibility metadata, no upload/dispatch rate limits, and regeneration that resets existing social records to draft.

Push is safely absent rather than partially live: there is no provider, subscription/token model, service-worker push handler, send API, retry model, or delivery record. `/admin/push-alerts` prepares and copies text for an external channel. Browser `Notification` usage in `DailyEpaperAlert` is foreground/local behavior, not reader push.

### Audit disposition

Phase 3.8 implementation should not enable social automation or reader push until the P0 gates and corresponding concurrency/security tests are complete. Media/storage security should precede feature expansion because Story downloads and upload lifecycle are shared foundations.

## 2. Architecture inventory

### Primary surfaces

| Concern | Admin UI | API/server boundary | Model/persistence | Public surface |
|---|---|---|---|---|
| Standalone video | `app/(admin)/admin/videos/page.tsx`, `new/page.tsx`, `[id]/edit/page.tsx` | `app/api/admin/videos/**`, `lib/server/video/**` | `lib/models/Video.ts`, `lib/storage/videosFile.ts` | `/main/videos`, Swipe routes, `lib/server/publicVideos.ts` |
| Media index/upload | `app/(admin)/admin/media/page.tsx` | `/api/admin/media`, `/api/admin/media/[id]`, `/api/admin/upload`, `lib/server/media/**` | `lib/models/Media.ts`, `data/media.json` fallback | Reused mainly by Article authoring |
| Story media | Story new/edit pages | `/api/admin/stories/**`, `/api/admin/uploads/story-video/{init,complete}` | Story top-level fields and `mediaAssets[]` in `lib/models/Story.ts` | Story becomes Article through the existing workflow |
| Story video production | Story list action/status | `/api/admin/stories/[id]/video-production` | Embedded `videoProduction` on Story | Feeds social draft generation; no direct reader surface |
| Social outbound | `app/(admin)/admin/social-posts/page.tsx` | `/api/admin/social-posts/**`, `lib/server/distribution/**`, `lib/server/socialAutomation.ts` | `lib/models/SocialPost.ts`, file fallback | Webhook handoff only |
| Push preparation | `/admin/push-alerts` | No send API | No push delivery/subscription model | Clipboard handoff only |
| Reader sharing | `components/ui/ShareMenu.tsx` and reader integrations | Browser share/copy/link behavior | None | Separate from CMS outbound publishing |
| Internal notifications | Notification bell/pages and workflow event services | Admin notification APIs/jobs | `WorkflowNotification` and related stores | Newsroom-only; not reader/device push |

### Provider boundaries

- `lib/utils/digitalOceanSpaces.ts` implements signing, public URL construction, buffer upload, browser upload targets, and deletion.
- `lib/server/media/spacesAdapter.ts` wraps the general Spaces implementation.
- `lib/storage/storyVideoUpload.ts` independently implements Story MP4 signing, verification, and signed download. It does not use `SpacesAdapter`.
- `lib/server/socialAutomation.ts` performs the only outbound social call, to n8n or a generic webhook.
- No Facebook, Instagram, or YouTube platform SDK/API client is present. Platform names are payload routing labels for the downstream webhook.
- No web-push, Firebase/FCM, APNs, or VAPID provider exists.

## 3. Video system

### Standalone Video model

`lib/models/Video.ts` represents standalone content. Core fields are title, description, thumbnail, `videoUrl`, duration, category, Short flag/rank, views, dates, and editorial workflow. Newer fields add slug, Article link, poster, `mediaProvider` (`youtube` or `spaces-mp4`), playback/HLS URLs, aspect ratio, caption URL, transcript, processing status, and external Instagram/YouTube URLs.

Missing asset facts include object key, byte size, dimensions, codec/container inspection, rendition inventory, ownership/reference identity, checksum, and storage lifecycle state. `processingStatus` is editor-supplied metadata, not the output of a processor.

`lib/server/video/videoEditorialService.ts`, `videoEditorialPolicy.ts`, and `videoRepository.ts` correctly centralize most Video workflow, permissions, Mongo/file persistence, public filtering, and activity/notification behavior. Public eligibility requires published workflow, a due schedule/date, and ready processing status. Public Mongo paths use the build-sensitive availability seam.

### Create/edit and playback

- Creation accepts YouTube or HTTPS MP4. Direct MP4 upload reuses the Story direct-upload endpoints.
- Thumbnails use `/api/admin/upload` with purpose `video-thumbnail`; PDF is accepted even though it cannot function as a normal poster in many reader contexts.
- Edit accepts arbitrary trimmed values for poster, playback, HLS, captions, transcript, and social URLs; only the legacy `videoUrl` gets meaningful URL validation.
- No server confirms that a related Article is published, despite CMS copy calling it a “Related published article.” Swipe readiness checks only that an Article identifier is present.
- Deletion removes the Video record but does not remove its uploaded object or thumbnail.

### Duplicated representations

Video exists in at least three forms:

- standalone `Video` documents;
- Story top-level media plus `mediaAssets[]`;
- Story `videoProduction.masterExportUrl` metadata used for social delivery.

They have different provider strings, validation, lifecycle, and metadata. The Media model is not a canonical parent for any of them.

### Maturity

Editorial workflow and public filtering are mature enough to preserve drafts/schedules. Asset processing and lifecycle are prototype-level. YouTube and progressive public MP4 are the real delivery paths; other fields mostly express an intended future architecture.

## 4. Media/storage architecture

### DigitalOcean Spaces

The shared upload configuration expects these variable names (values were not inspected):

- `DIGITALOCEAN_SPACES_ACCESS_KEY`
- `DIGITALOCEAN_SPACES_SECRET_KEY`
- `DIGITALOCEAN_SPACES_BUCKET`
- `DIGITALOCEAN_SPACES_REGION`
- optional `DIGITALOCEAN_SPACES_CDN_BASE_URL`
- browser-upload CORS names used by deployment validation

General uploads explicitly set public-read ACL and return a CDN/public URL. Object keys use controlled folder prefixes, sanitized base names, timestamps/random values, and do not directly accept a caller-supplied path. Duplicate filenames therefore do not overwrite one another.

Story video keys use `stories/videos/YYYY/MM/DD/` plus a generated name. A ten-minute signed PUT is returned to the browser. Completion issues HEAD and checks reported size/content type. The uploader does not set public-read in the Story-specific signing path, while the code still constructs a public CDN URL; this assumes bucket/CDN policy supplies readability.

### Persistence and fallback

Media, Video, Story, and SocialPost metadata have MongoDB/file-store implementations. Uploaded bytes do not: missing Spaces configuration fails the upload at runtime. The “fallback” therefore protects CMS metadata operations, not object delivery.

### Download

Story video downloads can create a signed GET from a known Story media key. All thumbnails and non-matching provider media instead use server-side `fetch()` against the stored URL. The route buffers the complete upstream response before returning a private, no-store attachment.

### Storage maturity

Storage signing and randomized keys are implemented. Canonical asset ownership, reference tracking, transactional writes, quarantine/scanning, object cleanup, and provider-neutral lifecycle are not.

## 5. Upload pipeline

### Generic image/thumbnail upload

Flow:

`File input -> POST /api/admin/upload -> MediaService.processUpload -> SpacesAdapter -> DigitalOcean Spaces -> URL/metadata response -> editor state`

Rules from `lib/server/media/mediaService.ts`:

| Purpose | Limit | Allowed by code | Folder |
|---|---:|---|---|
| `image` | 5 MB | JPG/JPEG/PNG/WEBP by MIME **or** extension | `lokswami/images` |
| `story-thumbnail` | 10 MB | same image set | `lokswami/stories/thumbnails` |
| `video-thumbnail` | 10 MB | image set or PDF | `lokswami/videos/thumbnails` |
| `epaper-thumbnail` | 10 MB | image set | E-paper folder |
| `epaper-paper` | 25 MB | PDF | E-paper folder |

The route buffers the full multipart file in server memory. Article optimization uses Sharp to normalize/rotate and writes WebP primary, AVIF, 16:9, 4:3, and 1:1 objects. Non-optimized uploads do not decode or inspect bytes.

### Story/standalone direct MP4 upload

Flow:

`File selection -> POST init -> signed browser PUT -> POST complete -> HEAD verification -> returned Story asset metadata -> later Story/Video save`

Rules:

- non-empty `.mp4`, up to 1.9 GB;
- client MIME must be blank or `video/mp4`;
- generated key under the Story video namespace;
- XHR exposes progress;
- no cancellation handle is exposed by the editor;
- no upload-session record binds key, actor, Story, expiry, or later persistence;
- completion can verify any namespace-conforming key and is not tied to the init caller;
- no byte signature, codec, duration, dimension, malware, or playable-container validation.

### Media-index registration

After an Article image upload, authoring may POST the returned facts to `/api/admin/media`. That second write is independent; failures can be ignored by the editor. `/api/admin/media` also accepts caller-supplied filename, URL, size, and type without proof that `/api/admin/upload` produced them.

### Master export

There is no dedicated master-export upload flow. `videoProduction.masterExportUrl` is an arbitrary string accepted by PATCH. In the current UI, Story list actions can start production and generate social drafts, but no editor UI was found for updating production notes/status/master export. The API is therefore ahead of the user workflow and relies on manual/external tooling.

### Upload findings

- **P1 — spoofing/invalid objects:** generic checks accept a matching MIME or filename extension; Story MP4 checks metadata only. There is no magic-byte/container validation.
- **P1 — quota/abuse:** any authenticated staff session can mint 1.9 GB Story upload targets; there is no per-role ownership check, upload-session quota, or rate limit.
- **P1 — orphaning:** object creation precedes content persistence, with no compensating deletion after save failure, cancel, replacement, or abandoned navigation.
- **P1 — metadata injection:** Media and Story persistence trust client-returned URL/key/provider/MIME/size values instead of consuming a server-owned upload receipt.
- **P2 — ergonomics:** progress exists for direct video but not generic uploads; no cancel/resume; the Media page accepts `video/*` while calling default `image` purpose, so its advertised video upload is a dead end.

## 6. Security

### P0: Story download SSRF and unbounded buffering

`app/api/admin/stories/[id]/download/route.ts` calls `fetch(downloadSource.url)` for the stored thumbnail and for media outside the exact Story provider/key path. Story creation/update accepts arbitrary strings for these URLs. Reporters can create Stories and download permitted assets for their own records; other authorized users have broader access.

There is no scheme/host allowlist, DNS/IP validation, redirect policy, private-network denial, or canonical object lookup. Content type is checked only after the request is made. An authorized attacker can make the server issue GET requests to internal endpoints; image, video, PDF, empty-content-type, or octet-stream responses can be returned as downloads. The route then calls `arrayBuffer()` with no upstream byte cap and can buffer a nominally 1.9 GB asset.

Required gate: accept only server-owned asset identity/key, or enforce a hardened egress validator plus streaming and byte limits. Add private-IP, redirect, DNS-rebinding, content-length, and oversized/chunked-response tests.

### Trust-boundary findings

- `/api/admin/media` accepts arbitrary public URLs and claimed metadata. It is a metadata-registration endpoint, not proof of an upload.
- Story `mediaAssets[]` normalization copies URL, key, provider, MIME, and size from the request. Validation only checks aggregate counts/bytes, whose configured maxima are currently infinite.
- Creation and update do not cryptographically or transactionally bind `story-video/complete` to later persistence.
- Story upload completion is not actor/Story bound.
- Video update accepts arbitrary auxiliary delivery URLs.
- Social and production master media URLs are arbitrary strings and become outbound webhook payloads.

### Positive controls

- General object keys are generated and sanitized; raw filenames are not used as unrestricted paths.
- SVG is not allowed by the generic image purpose.
- Mutating admin routes use `withAdminMutation`, which enforces same-origin writes and records request IDs/audit events after identity registration.
- Server-side role checks exist for destructive Media/Video and social dispatch actions.
- Public Video repositories filter workflow publication state and due schedules.

### Other gaps

- No malware scan/quarantine exists.
- Signed Story upload URLs last ten minutes and are returned to the authenticated browser, but there is no one-use receipt/revocation.
- Public-read media makes URL possession sufficient for access; no policy distinguishes drafts from published assets.
- Object HEAD verification trusts provider metadata and does not verify playable content.

## 7. Media lifecycle

Deletion is record-oriented, not asset-oriented.

| Event | Current behavior | Risk |
|---|---|---|
| Delete Media record | Removes Mongo/file metadata only | Object remains public; orphan |
| Remove/replace Article image | Article reference changes | Old optimized primary and variants remain |
| Remove/replace Story asset | Story reference changes | Old object remains |
| Replace Video thumbnail/video | Metadata changes | Old objects remain |
| Delete Story/Article/Video | Content record is removed/archived per its service | Referenced objects are not lifecycle-managed |
| Multipart/optimized upload partially fails | Earlier objects may already exist | Multi-object orphan |
| Direct PUT completes, content save fails | No upload-session cleanup | Large orphan |
| DB metadata write fails after object upload | No compensating delete | Orphan |

There is no reference count, soft-delete asset record, background garbage collector, last-reference protection, duplicate checksum, or orphan report. Consequently:

- **ORPHAN RISK: high.** This is the dominant current failure mode.
- **BROKEN REFERENCE RISK: medium.** An operator can remove a Media index record without checking Article references, although this does not delete the object; external/manual object deletion can break all consumers.
- **DOUBLE-DELETE RISK: low today.** Application media deletion does not delete objects. It becomes relevant once cleanup is added without idempotent tombstones.
- **SHARED-ASSET DELETE RISK: latent/high for future cleanup.** References are not indexed, so blindly coupling record deletion to object deletion would break reused Article media.

## 8. Story video production

`Story.videoProduction` contains status, assignee, editor notes, master-export URL, thumbnail URL, and update time. Status values are `not_started`, `editing`, `qa_review`, `ready_to_publish`, and `published`.

The POST/PATCH API:

- allows super admin, admin, and copy editor;
- requires a Story whose editorial workflow is approved, scheduled, or published;
- applies the general Story read boundary;
- starts at `editing` and assigns the current actor if unassigned;
- lets a caller directly set any normalized production status, notes, URL, thumbnail, and assignee;
- writes MongoDB or file-store metadata.

What is real:

- persisted production state and assignment;
- approved-Story gate;
- server-side RBAC;
- tests for starting/updating;
- Story-list status display and social draft eligibility.

What is metadata-only/manual:

- no state transition graph or compare-and-swap/version check;
- no master-export upload/verification;
- no processing job, rendition, QA artifact, checksum, or delivery proof;
- no dedicated production activity stream or workflow notification;
- no complete CMS editor for master export/status/notes was found;
- an arbitrary URL can be marked ready/published and used by social automation.

Story assets themselves duplicate the top-level thumbnail/media fields and `mediaAssets[]`. An important P1 functional defect is the provider identifier split: upload/create uses `do-spaces` from `lib/storage/storyVideoUpload.ts`, while `lib/server/storyEditorialService.ts` validates updates against `digitalocean_spaces`. A Story created with an uploaded video can later fail an otherwise valid media update.

## 9. Article media

Article media is more developed than Story media:

- featured image string;
- SEO image alt, caption, credit, and Open Graph image;
- editorial image-license value;
- normalized source Media ID, focal point, dimensions, format, and variants;
- Tiptap/ArticleDocument inline images with source URL, alt, caption, credit, and focal data;
- optimized responsive variants for the newer creation path;
- Media library selection/reuse in authoring.

Reader rendering uses the Article title as featured-image alt fallback and renders caption/credit. Social/SEO can reuse the Open Graph or featured image.

Gaps:

- publication readiness requires a featured image but not meaningful alt, caption, credit, source, or license;
- Media records do not carry reusable alt/caption/credit/license facts, so selection cannot preserve them;
- old and new editor paths have inconsistent optimization/metadata behavior;
- inline/featured removal and replacement do not clean objects;
- no first-class gallery asset model was found beyond document content;
- Story media has none of Article's accessibility/editorial metadata, so conversion/reuse loses information.

Safe future reuse should center on a canonical asset identity with per-use presentation metadata. Alt text often depends on context and should not be treated as a universally reusable asset fact.

## 10. Accessibility metadata

### Images

Article supports but does not enforce alt, caption, credit, and license. Reader fallback prevents an empty accessible name on the main image but cannot guarantee an accurate description. Story media only stores technical facts. The Media index has no accessibility, rights, or photographer/source fields.

Decorative image handling is inconsistent but not wholly absent: inactive Swipe posters use `alt=""` and `aria-hidden`; editorial thumbnails generally use title/filename fallback. Publication can bypass the metadata that editors are encouraged to provide.

### Video

The Video model and CMS store caption URL and transcript. Actual delivery is inconsistent:

- `components/swipe/SwipeVideoCard.tsx` renders a default Hindi `<track>` when its item includes `captionUrl`.
- the main `/main/videos` mapping drops caption, transcript, HLS, playback, and poster fields from the public payload;
- `components/ui/VideoPlayer.tsx` has a captions setting and manipulates `textTracks`, but renders no `<track>` and has no caption URL prop;
- transcript text is not rendered in the public Videos/Swipe experience;
- caption URL is not validated as VTT, same-origin/CDN-owned, or reachable.

Native MP4 playback exposes browser controls, keyboard support, volume, and fullscreen. Custom overlay buttons have accessible names. YouTube iframes have titles. Swipe YouTube uses `controls=0`, increasing reliance on custom controls. Autoplay paths are muted or fall back to muted; this aligns with browser autoplay rules. Poster text alternatives are derived from surrounding titles rather than stored independently.

P1 gate: preserve caption/transcript fields through public mapping, render a valid track/transcript, and test keyboard/screen-reader state. Automated caption generation remains out of scope.

## 11. Video processing and delivery

### Capability classification

| Capability | Status | Evidence/behavior |
|---|---|---|
| FFmpeg/ffprobe | NOT PRESENT | No runtime implementation/dependency path found |
| Transcoding/compression | NOT PRESENT | Uploaded MP4 is delivered as uploaded |
| Video thumbnail extraction | NOT PRESENT | Thumbnail is upload/manual/YouTube-derived |
| Poster generation | PARTIAL | YouTube URL derivation only; no MP4 frame extraction |
| Aspect conversion | NOT PRESENT | Aspect is editor-selected metadata |
| Codec/duration/dimension probing | NOT PRESENT | Values are caller supplied |
| HLS | STUB | `hlsUrl` field and reader preference exist; no producer or JS compatibility layer |
| DASH | NOT PRESENT | No manifest model/player path found |
| Adaptive bitrate | NOT PRESENT | No rendition ladder |
| Audio normalization | NOT PRESENT | No media pipeline |
| Processing status | MANUAL | CMS writes ready/processing/failed; no worker owns transitions |
| Article image optimization | IMPLEMENTED | Sharp normalization and multiple renditions |

### Delivery behavior

- Standalone reader uses YouTube iframe or HTML5 video from HLS/playback/legacy URL.
- Direct Spaces MP4 is progressive and public; there is no application range proxy. Range/cache behavior therefore depends on Spaces/CDN/origin headers.
- Public latest-video JSON is cached for five minutes with stale-while-revalidate.
- Service worker deliberately excludes MP4, HLS manifests, and segments from runtime cache.
- Main Video player uses native controls and `object-contain`; responsive containers switch 16:9/9:16.
- Swipe active cards preload `auto`; adjacent cards can preload metadata. This can be expensive on constrained mobile networks, partially mitigated by the separate Data Saver setting.
- No production CDN benchmark or live header test was performed.

## 12. Social provider inventory

### CMS outbound publishing

| Provider label | Status | Actual implementation |
|---|---|---|
| `manual` | DISABLED/MANUAL | Default; dispatch throws and UI explains manual mode |
| `n8n` | PARTIAL | Authenticated super-admin action POSTs one generic JSON payload to configured webhook |
| `generic_webhook` | PARTIAL | Same transport and result parser |
| YouTube | DOWNSTREAM LABEL | One SocialPost platform value; no direct API/client |
| Facebook | DOWNSTREAM LABEL | Same |
| Instagram | DOWNSTREAM LABEL | Same |
| X/Twitter, LinkedIn, WhatsApp, Telegram | NOT PRESENT for CMS outbound | Reader share links or unrelated modules must not be confused with publishing |

Payload includes actor identity, source IDs, platform, caption, hashtags, thumbnail/video URLs, schedule timestamp, origin, and generation time. It does not include canonical public Story/Article URLs despite earlier documentation expectations.

The optional `X-Lokswami-Signature` header contains the shared secret itself; it is not an HMAC over the payload. Transport security therefore depends on HTTPS and the downstream secret comparison.

### Reader sharing

`components/ui/ShareMenu.tsx` implements browser/native share, copy, and channel URLs. It does not create SocialPost records or call the CMS webhook. No coupling change is recommended in this phase.

## 13. Social workflow

Actual flow:

`approved/scheduled/published Story + linked Article exists + videoProduction ready/published with master URL`

`-> admin/super admin generates three drafts (YouTube/Facebook/Instagram)`

`-> admin/super admin changes each status/content through PATCH (the current page mainly exposes status actions, not full caption/media editing)`

`-> super admin manually dispatches an approved/scheduled/failed record`

`-> webhook 2xx -> record becomes publishing`

`-> operator/downstream process later PATCHes published/failed and external facts`

Article/Story publication does not automatically generate or dispatch social records. Scheduling is only a timestamp/status; no worker dispatches due posts. Cancellation has no explicit state/action. Retrying a failed post uses the same dispatch action.

The UI shows platform/status/error and automation mode, with role-aware controls. It does not provide a full editable preview, rendered image/video preview, scheduler, cancel flow, per-attempt history, provider response detail, or confirmation immediately before external dispatch.

### P0 publication bypass

`canGenerateSocialDrafts` confirms that a linked Article record exists, but not that the Article is published/due or that the Story remains publishable. Dispatch later checks only SocialPost status. An admin can prepare/approve metadata and a super admin can externally distribute a draft or subsequently unpublished Article's copy/media.

Required gate: at dispatch time, reload source Story/Article, enforce current canonical publication/readiness policy, snapshot the approved payload, and fail closed if the source changed or became private.

## 14. Social idempotency and failure behavior

### P0 duplicate-send window

`SocialDistributionService.dispatch()` reads a record, calls the webhook, and only then updates it to `publishing`. There is no atomic `approved|scheduled|failed -> dispatching` claim, unique delivery/attempt ID, idempotency key, outbox, lock, or provider dedupe key. Two requests can both observe an eligible state and both send.

Ambiguous outcomes are also unsafe:

- webhook succeeds but client times out -> record is marked failed -> retry can duplicate;
- webhook succeeds but DB/file update fails -> external effect exists without durable success -> retry can duplicate;
- response persistence fails inside the catch path -> even the failure state may be absent;
- the downstream webhook can retry platform calls without any Lokswami delivery identity.

### Representable states

The model represents draft, approved, scheduled, publishing, published, and failed per platform. Independent platform records can show mixed outcomes, but there is no aggregate PARTIAL state. There is no explicit dispatching claim, retrying state, attempt entity, next-attempt time, dead-letter state, or acknowledgement callback.

Webhook 2xx means only “automation accepted/responded,” not “provider published.” External IDs/URLs and `published` are manually mutable. There is no callback route or signature verification for provider completion.

### Regeneration hazard

Draft generation upserts by `(sourceStoryId, platform)` and `$set`s status back to draft, clears the last error, and replaces content. Regenerating can clobber a scheduled, publishing, or published record while retaining some prior delivery fields. This is P1 and must be made state-aware.

### Required durability model

Before live automation: immutable approved payload snapshot, unique delivery and attempt IDs, atomic claim, outbound idempotency header/key, attempt history, provider acknowledgement semantics, bounded retries/backoff, and reconciliation for unknown outcomes.

## 15. Push infrastructure

### Reader/device push status: NOT PRESENT

No provider adapter, subscription endpoint, `PushSubscription`, FCM token, VAPID key path, topic model, send endpoint, provider response, delivery record, or push-specific test suite was found.

`public/sw.js` handles install, activate, caching, and fetch only. It has no `push` or `notificationclick` listener.

`User.pushEnabled`, `notificationsEnabled`, and popup state are booleans without a device/subscription identity or consent history. They cannot deliver a notification.

`DailyEpaperAlert` requests browser permission and calls `new Notification()` while the page is visible. This is a local foreground notification, not server-originated web push.

### Admin Push Alerts status: MANUAL

`/admin/push-alerts` is restricted to super admin/admin and derives candidate copy from newsroom control-center data. The client selects a candidate, edits a headline, previews it, copies text, and links to the Story/Article editor. It explicitly instructs the user to deliver through an external channel. No state is saved and no message is sent.

This is a useful preparation surface but its name can overstate capability. It should remain visibly labeled “manual/copy only” until a safe delivery system exists.

## 16. Push audience, retry, and idempotency

Current support:

| Concern | Status |
|---|---|
| All users | Not implemented |
| Topic/category/location/language | Not implemented |
| Device/platform | Not implemented |
| Individual user | Not implemented |
| Opt-in/opt-out lifecycle | Permission UI and booleans only; no subscription lifecycle |
| Invalid token cleanup | Not implemented |
| Delivery/content/provider message ID | Not implemented |
| Retry/backoff/dead letter | Not implemented |
| Duplicate-delivery prevention | Not implemented |

There is no current duplicate-send risk because there is no send path. The P0 count for existing push is therefore zero. Introducing a provider without consent evidence, audience preview/count, immutable delivery identity, atomic state transitions, invalid-token handling, and rate/volume safety would create a P0.

Privacy implications for a future phase include storing device endpoints/keys, associating devices with or without accounts, purpose-specific consent, retention/removal, and avoiding sensitive content in lock-screen payloads.

## 17. Publication coupling

| Source/event | Social effect | Push effect | Can external system publish source content? |
|---|---|---|---|
| Article publish | None automatically | Candidate may later appear in manual alert desk | No |
| Story approve/publish | Enables production start; no automatic social record | Indirect candidate data only | No |
| Video-production ready + master URL | Enables manual social draft generation | None | No |
| Social approve/schedule | Makes record eligible for super-admin webhook dispatch | None | Does not mutate Article/Story |
| Webhook/provider result | Manually updates SocialPost only | None | No source mutation path found |

The good boundary is that social/push cannot publish an Article or Story. The unsafe boundary is the inverse: external distribution does not revalidate the source's canonical published/due state, so unapproved/private content can escape without changing its internal workflow.

## 18. RBAC matrix

The table reflects server authorization, not merely button visibility.

| Action | super_admin | admin | copy_editor | reporter | Enforcement notes |
|---|---|---|---|---|---|
| View Media | Allow | Allow | Allow | Allow, own records only | `canViewPage('media')`; repository scopes reporter by email |
| Generic image upload | Allow | Allow | Allow | Allow | Auth required; reporter limited to image/story-thumbnail purposes |
| E-paper/video thumbnail purpose | Allow | Allow | Allow | Deny | Purpose restriction in `MediaService`; copy editor can upload even without Video create |
| Create Media metadata record | Allow | Allow | Allow | Allow, visible as own | Client metadata trusted |
| Delete Media record | Allow | Allow | Deny | Deny | Server `canDeleteContent`; does not delete object |
| Replace media in owned/editable content | Per content edit | Per content edit | Per assigned/shared workflow | Own/editable content | No central asset replacement authorization |
| View standalone Videos | Allow | Allow | Allow | Deny | Page and API content-read rules |
| Create/publish/delete standalone Video | Allow | Allow | Deny | Deny | Server content permissions |
| Edit standalone Video | Allow | Allow | Conditional workflow/assignment | Deny | Server content edit policy |
| Mint/complete direct Story MP4 upload | Allow | Allow | Allow | Allow | Auth only; no Story ownership/role binding |
| Download Story asset | Broad allowed Stories | Broad allowed Stories | Assigned/shared-queue rules | Own/allowed Stories | Server `getCanDownloadStoryAssets` |
| Start/update Story video production | Allow | Allow | Allow | Deny | Ready Story plus read permission; no transition policy |
| Set master export | Allow | Allow | Allow | Deny | Same PATCH; arbitrary URL |
| View social preview/list | Allow | Allow | Read only | Deny | Server list role check |
| Generate social drafts | Allow | Allow | Deny | Deny | Server route check |
| Edit/approve/schedule/mark social | Allow | Allow | Deny | Deny | Server PATCH check |
| Dispatch/retry social webhook | Allow | Deny | Deny | Deny | `canDispatchSocialPosts`; failed status is retryable |
| View push preparation | Allow | Allow | Deny | Deny | Server page redirect |
| Dispatch/retry push | N/A | N/A | N/A | N/A | No endpoint exists |
| Provider/settings access | General settings rules | General settings rules | Restricted | Restricted | No social/push credential editor exists |

### Enforcement gaps

- Direct Story uploads are not scoped to a Story that the actor may edit.
- Upload completion is not bound to the actor who initialized it.
- Story production allows direct status jumps and unverified external master URLs.
- Social source publication/readiness is not re-authorized at dispatch.
- Media metadata creation proves neither object ownership nor upload provenance.

## 19. Provider configuration

### Social

Recognized names are:

- `SOCIAL_AUTOMATION_PROVIDER`
- `N8N_SOCIAL_WEBHOOK_URL`
- `SOCIAL_AUTOMATION_WEBHOOK_URL`
- `SOCIAL_AUTOMATION_SHARED_SECRET`
- `SOCIAL_AUTOMATION_TIMEOUT_MS`
- site-origin variables used only to populate the payload

Unknown/missing provider normalizes to `manual`, which is fail-closed. n8n/generic mode remains disabled when its URL is empty. Runtime dispatch reports a 400 before outbound work when disabled. Staging validation requires manual mode and empty outbound webhook/secret variables. No admin UI edits these values.

Dangerous assumptions:

- production environment validation does not appear to validate social automation safety/configuration;
- webhook URL scheme/host is not validated at runtime;
- the shared secret is transmitted directly as a header, not used for an HMAC;
- URL plus provider selection is sufficient to enable outbound dispatch;
- there is no startup health check for downstream contract/version.

### Storage

Spaces requires all four core settings or upload calls fail. CDN URL can be derived, which is operationally convenient but preserves the Story upload public-read assumption. Staging validation requires a clearly non-production bucket marker and checks configured CDN/CORS origins.

### Push

No provider configuration or feature flag exists. Existing manual UI cannot send, so missing config fails closed by absence.

## 20. Observability

### Present

- `withAdminMutation` attaches request IDs, enforces same-origin writes, and stores actor/method/endpoint/status/duration plus sanitized JSON request data.
- Video has workflow activity/notifications for its editorial operations.
- SocialPost stores current status, last error, provider, dispatch timestamp, execution ID/URL, external ID/URL, and update times.
- UI exposes current social error/status and whether automation is enabled.
- Story/Video records retain update timestamps and assignments.

### Missing

- no upload session/attempt record, byte progress history, abandoned upload report, or cleanup event;
- Media deletion records no object disposition/reference check;
- Story video production has no dedicated activity history or notifications;
- social has no immutable attempt history, request/idempotency key, response status/body digest, acknowledgement event, retry count, or next retry;
- push has no delivery observability because it has no delivery system;
- no cross-system correlation ties content revision, asset receipt, social approval snapshot, and provider attempt together.

### Logging/privacy risks

Audit sanitization redacts keys containing password/token/secret/key/authorization/cookie/credential and truncates data. Social captions, hashtags, URLs, Story production notes, and actor identity are not secrets and can legitimately enter audit records, but retention/access should match editorial-data policy.

Webhook failure text up to 2,000 characters is persisted in `lastError`. The configured webhook URL and shared secret are redacted, but an arbitrary downstream response may still include PII, provider payload fragments, or other credentials not matching those exact strings. Provider responses should be allowlisted/structured before persistence.

Upload routes log caught error objects/stacks server-side and return some raw `Error.message` values. This is useful operationally but should be normalized at provider boundaries.

## 21. Abuse and rate limits

No route-specific limiter was found for generic uploads, signed video init/complete, Story production changes, Media record creation, social generation/dispatch, or future push broadcasts.

Existing protections:

- authenticated admin session;
- same-origin mutation checks;
- role checks on high-authority actions;
- generic file-size ceilings;
- signed Story upload expiry;
- social super-admin dispatch restriction and bounded HTTP timeout.

Gaps:

- a staff account can repeatedly mint large upload targets and consume storage/provider bandwidth;
- generic multipart upload buffers up to the purpose limit per request in application memory;
- Story download buffers unbounded upstream bodies;
- no concurrent-upload, daily-byte, per-user, per-IP, or provider quota guard;
- no social dispatch lock/rate ceiling or circuit breaker;
- no CSRF issue was found on wrapped mutations, but missing rate/idempotency controls still allow accidental double action from same-origin clients.

P1: add server-owned upload sessions with actor/content quotas, bounded streaming, and endpoint rate limits. P0 social atomic claim/idempotency must land before a live provider is enabled.

## 22. UX, accessibility, and responsive behavior

This section is based on component/static inspection and safe component tests; authenticated browser/device QA was not run.

### Media

- The page is a simple upload-and-grid index with delete actions.
- Its file input advertises image/video, but the request omits purpose and defaults to image; selected video upload fails.
- No upload progress/cancel, search field, filters, tags, ownership/reference display, reuse history, dedupe, orphan status, or deletion impact warning exists.
- Delete is immediate and lacks a danger confirmation.
- Error/loading states exist, but status text is not consistently announced with `role="alert"`/`aria-live`.

### Video

- New Video provides direct-upload progress, YouTube preview, thumbnail preview, draft/submit/publish actions, and role-aware publishing help.
- Upload cannot be cancelled; leaving after PUT can orphan the file. Save errors after upload do not explain cleanup.
- Direct MP4 preview/technical validation is weak; editor-entered duration/aspect/processing status can diverge from the file.
- Edit and create experiences are not symmetric; auxiliary URL fields lack inline validation.
- Main reader responsive containers support landscape/portrait layouts, but caption control is nonfunctional on the detail path and transcript is absent.

### Story production

- Story list clearly shows production status/assignee and can start production.
- The repository has no complete UI for editing production status, notes, assignment, or master export, leaving a dead-end state for ordinary operators.

### Social

- Filters, platform/status badges, loading/error states, automation banner, refresh, and role-specific actions are present.
- No rich caption/media editor, rendered preview, scheduling form, cancellation, dispatch confirmation, attempt history, or provider-level delivery proof.
- “Send to automation” is also the failed retry action, but does not communicate duplicate-risk/unknown-outcome semantics.
- Dynamic success/error status lacks a consistently verified live region.

### Push

- Two-column layout collapses until `xl`, so static responsive behavior is reasonable at 1440, 768, and 390 widths.
- Candidate buttons and textarea are keyboard-operable; copy feedback is visual but not an announced live region.
- The screen clearly mentions an external channel, but title/marketing copy can still imply an integrated push system.

### Viewport assessment

| Viewport | Static assessment |
|---|---|
| 1440x900 | Collection/editor grids use multi-column layouts; sticky preview panels should fit. Long URLs and status metadata need overflow verification. |
| 768x1024 | Responsive grids collapse; forms remain usable. Dense Video editor and social cards need real keyboard/zoom QA. |
| 390x844 | Flex wrapping and single columns are present. Large video controls, progress text, long filenames/URLs, virtual keyboard, and focus return require browser tests. |

## 23. Test coverage

### Existing coverage

The repository has useful unit/API/component tests for:

- Media service role scoping, field validation, deletion authorization, purpose/type/size checks, and mocked Spaces upload (`media-domain-service`, `admin-upload-route`);
- DigitalOcean signing/public URL behavior without live calls (`digitalocean-spaces-direct-upload`);
- Story media derivation and current unlimited aggregate policy (`story-media`);
- Story video selection limits and mocked init/complete verification;
- Story download authentication/content-read permissions and signed video requests;
- Story video-production start/update;
- Video CRUD/workflow/RBAC/file-Mongo parity, public publication filters, Swipe eligibility, feed pagination, live YouTube helpers, reader components, metadata/sitemap, and service-worker video exclusion;
- Article media URL compatibility and selected responsive media rendering;
- Social draft readiness/content, webhook config/payload/redaction, route RBAC/status behavior, mocked dispatch/retry, and action visibility;
- staging environment safeguards that force social manual mode;
- internal newsroom notifications (separate from reader push).

### Critical missing tests

| Area | Missing tests |
|---|---|
| Security | Story download SSRF/private IP/redirect/DNS-rebinding/size/stream limits; forged Media/Story metadata; object-key actor ownership |
| Upload | Magic bytes/container validity; partial multi-rendition rollback; abandoned direct PUT cleanup; upload quota/rate limit; cancellation |
| Lifecycle | Reference-aware deletion, replacement cleanup, shared asset preservation, idempotent garbage collection |
| Video | Real MP4 metadata contract; provider-string parity; caption/transcript delivery; HLS compatibility/fallback; deletion cleanup |
| Social | Concurrent dispatch claim; identical retry idempotency; timeout-after-success; DB failure after webhook; callback/reconciliation; draft regeneration of published records; source unpublish between approval and dispatch |
| Push | All provider/subscription/audience/consent/delivery tests are absent because implementation is absent |
| UI/a11y | Media video-input mismatch, delete confirmation, live regions, focus handling, caption toggle, transcript, 390/768/1440 browser checks |
| Provider contract | Versioned webhook request/response schema, HMAC verification, bounded/error-safe provider responses |

No test run in this audit contacted a live provider. Tests chosen for validation are listed near the end of this document.

## 24. Legacy and duplication

- `lib/utils/digitalOceanSpaces.ts` plus `SpacesAdapter` form the closest canonical storage service, but `lib/storage/storyVideoUpload.ts` duplicates signing/config/key logic.
- Story uses both top-level media fields and `mediaAssets[]`; updates derive one from the other but legacy states remain possible.
- Story upload provider is `do-spaces`; Story editorial update expects `digitalocean_spaces`; standalone Video uses `spaces-mp4` as a delivery/provider concept.
- Standalone Video's `videoUrl` and newer `playbackUrl`/`hlsUrl`/`posterUrl` overlap.
- Media library records and Article normalized media metadata are separate and only loosely connected by `sourceMediaId`.
- Social platform records all use one generic webhook instead of provider adapters. This is not three integrations.
- “Notifications” refers to internal workflow notifications, local foreground browser notifications, and a manual Push Alerts desk; only the first is a durable delivery system.
- Story production API capability exceeds its CMS UI.
- HLS and processing states are schema/UI intentions without an owning processing service.
- No direct provider call from React components was found; outbound social remains server-side.

## 25. Prioritized findings

### P0 — must fix before Phase 3.8 merge/live enablement

1. **Authenticated SSRF and unbounded response buffering in Story asset download.** User-controlled stored URLs are server-fetched without egress validation, then fully buffered.
2. **Social duplicate dispatch.** No atomic claim/idempotency key/outbox allows concurrent and ambiguous retries to send more than once.
3. **Unapproved/private external distribution.** Social dispatch does not reload and enforce current canonical Story/Article publication readiness.

Push has no existing P0 because it has no send path. Any first send implementation must make consent, audience preview, immutable delivery ID, idempotency, and bounded retry acceptance gates rather than follow-up hardening.

### P1 — should fix in Phase 3.8

- Bind upload init/complete/save with server-owned, actor/content-scoped upload receipts.
- Add magic-byte/container validation and server-owned technical metadata.
- Add upload/download limits, streaming, rate limits, and quotas.
- Resolve Story provider identifier mismatch.
- Validate and own master-export media; enforce production transition graph and optimistic concurrency.
- Create reference-aware deletion/replacement/orphan lifecycle for all asset types.
- Stop accepting arbitrary Media/Story technical metadata as authoritative.
- Prevent social regeneration from resetting delivered/in-flight records.
- Add social attempt history, source/payload revision, structured errors, acknowledgements, retry/backoff/reconciliation, and HMAC contract.
- Make Video captions/transcript actually available in main reader and validate caption assets.
- Enforce or explicitly waive Article image alt/rights metadata at publication.
- Repair Media page's false video-upload affordance and add destructive confirmations.
- Complete Story production CMS controls or remove unreachable actions until safe.
- Add production social config validation and operational diagnostics without exposing secret values.

### P2 — useful/deferable

- Canonical Media browsing/search/tags/ownership/reference UX.
- Checksums and duplicate detection.
- Rich social media preview, provider-specific validation, and aggregate partial-state dashboard.
- More complete technical metadata and asset analytics.
- Upload pause/resume where provider support warrants it.
- Fine-grained push segmentation after a safe all-user pilot model exists.
- Broader media accessibility and responsive browser testing as part of final QA.

### Out of scope

- E-Paper feature changes or reader work;
- Homepage 2.0 and Article Reader 2.0 redesign;
- reader Share/OG/deep-link redesign;
- Video Hub/Shorts reader redesign beyond defects required for Phase 3.8 safety/accessibility;
- mobile app;
- broad analytics/accessibility redesign;
- production migration/cutover;
- AI caption/transcript generation.

## 26. Proposed Phase 3.8 implementation plan

### 3.8A — Media/storage security and canonical boundaries

**Objective:** remove the unsafe fetch/trust boundary and establish one server-owned asset identity before adding lifecycle features.

**Scope:**

- replace arbitrary Story download URLs with canonical asset keys/receipts or hardened allowlisted egress;
- stream downloads with byte/time/redirect bounds;
- create actor/content-scoped upload sessions and verified receipts;
- consolidate Story direct signing behind the media storage adapter;
- normalize provider identifiers;
- add file-signature/container validation and technical metadata capture;
- add upload/download rate/byte quotas;
- define canonical Media asset versus per-use metadata.

**Likely systems:** `lib/server/media/**`, `lib/storage/storyVideoUpload.ts`, Story download/upload routes, Story/Media models and file stores, admin upload route, security/rate-limit utilities.

**Dependencies:** migration-compatible provider normalization; public URL policy; decision on existing externally hosted media.

**Tests:** SSRF/private-network/redirect/DNS cases, streaming limits, receipt replay/cross-user/cross-Story tests, spoofed content, quota, Mongo/file parity.

**Acceptance gates:** all P0 download paths closed; no caller-authoritative URL/key/provider persistence; no live provider call in CI; legacy safe assets remain readable.

**Risks/rollback:** legacy arbitrary URLs may need read-only migration handling. Roll back behind a strict legacy allowlist, never by restoring unrestricted fetch.

### 3.8B — Video production/upload lifecycle

**Objective:** make Video and Story production states reflect verified assets and manage object lifecycle.

**Scope:**

- verified master-export upload/attachment;
- production transition rules, actor history, optimistic concurrency, and notifications;
- source/master/poster/caption/transcript technical metadata;
- cleanup for abandoned, replaced, failed, archived, and deleted assets;
- reference checks/tombstones and orphan reporting;
- functional main-reader captions/transcripts;
- align create/edit/Media UX and remove misleading upload affordances.

**Likely systems:** Story/Video models and services, Story production route/UI, Video editors/player/mappers, Media repository, cleanup job/service, Article media seams.

**Dependencies:** 3.8A asset ID/receipt and deletion policy.

**Tests:** transition table, concurrent update, master receipt ownership, replacement/delete/reference safety, caption reader component/a11y, 390/768/1440 Playwright coverage.

**Acceptance gates:** status cannot advance without required verified artifact; replacement does not orphan or break shared assets; reader caption toggle works; file/Mongo parity retained.

**Risks/rollback:** premature deletion of shared legacy URLs is the main risk. Begin with tombstones/deferred cleanup and a dry-run orphan report.

### 3.8C — Social workflow and idempotency

**Objective:** make outbound social an auditable, once-per-approved-revision delivery workflow.

**Scope:**

- immutable approved payload snapshot tied to source revision;
- revalidation of current Article/Story publication at dispatch;
- atomic dispatch claim and unique delivery/attempt IDs;
- outbound idempotency header/key and versioned/HMAC-signed contract;
- structured result/attempt history, acknowledgement/reconciliation, bounded retry/backoff/dead letter;
- state-aware regeneration; scheduling/cancel semantics;
- caption/media preview/edit and confirmation UI.

**Likely systems:** SocialPost model/file store, distribution repository/service, social automation adapter, admin/API routes/page, publication query service, audit/observability.

**Dependencies:** 3.8A canonical media and 3.8B verified master export; downstream automation contract supports idempotency.

**Tests:** parallel dispatch, timeout after downstream success, persistence failure, source unpublish/change, per-platform partial outcome, regeneration, callback signature/replay, provider-contract fixtures.

**Acceptance gates:** duplicate sends are prevented/reconciled; private content cannot dispatch; every attempt has actor/content/payload/provider correlation; manual mode stays default until gates pass.

**Risks/rollback:** downstream idempotency compatibility. Retain manual export and a kill switch; disabling automation must not discard queued records.

### 3.8D — Push workflow and delivery safety

**Objective:** introduce reader push only as a consented, observable, idempotent delivery system.

**Scope:**

- provider abstraction and disabled-by-default feature flag;
- subscription/device storage with opt-in/out and invalid-token cleanup;
- service-worker `push`/`notificationclick` handlers;
- approved published-content payload/deep-link/image validation;
- audience definition/count/preview, immutable delivery ID, atomic attempts, idempotency, bounded retries, dead letter;
- admin preview/confirmation/history; migrate existing copy desk without pretending it sends.

**Likely systems:** new push domain model/repository/service/API, service worker, User/subscription boundary, Push Alerts UI, deployment validators, consent/privacy documentation.

**Dependencies:** publication revalidation pattern from 3.8C; provider and privacy decisions; HTTPS/service-worker deployment readiness.

**Tests:** permission/subscription lifecycle, duplicate registration, audience enforcement, source unpublish, idempotent retry, invalid token, service-worker events, payload privacy, RBAC/rate limit.

**Acceptance gates:** disabled unless fully configured; no send without durable consent and published source; dry-run audience preview; one delivery identity across retries; emergency kill switch.

**Risks/rollback:** consent and notification fatigue. Roll back by disabling enqueue/send while retaining opt-outs and delivery history; do not delete subscriptions blindly.

### 3.8E — UX, observability, parity, and final QA

**Objective:** close operator dead ends and prove Mongo/file, role, accessibility, responsive, and deployment behavior.

**Scope:**

- unified status/error/attempt surfaces;
- live regions, labels, focus, confirmations, keyboard and responsive QA;
- Media search/reference/orphan views appropriate to the implemented lifecycle;
- dashboards/alerts for failed cleanup, processing, social, and push;
- log retention/redaction review;
- staging manual-mode and production readiness gates;
- full regression/build and rollback runbooks.

**Likely systems:** admin Media/Video/Stories/Social/Push components, audit/diagnostics, deployment validators, docs/tests.

**Dependencies:** 3.8A-D domain states must be stable.

**Tests:** focused component/a11y tests, Playwright at 1440x900, 768x1024, and 390x844, role matrix, Mongo/file parity, failure injection, full typecheck/lint/build CI.

**Acceptance gates:** no dead-end action; errors and state transitions are announced and recoverable; provider status is truthful; all P0/P1 acceptance tests pass; staging cannot send outbound traffic unintentionally.

**Risks/rollback:** UI can mask domain regressions. Keep domain APIs independently testable and retain provider kill switches/manual workflows.

## 27. Risks and open questions

1. Are all existing Story thumbnail/media URLs owned by the configured Spaces/CDN domains, or must a migration preserve selected external hosts?
2. Is the Story bucket/CDN globally public by policy? The direct-upload signer does not set public-read but returns a public URL.
3. Which system should own the canonical asset record: the current Media model, a new asset model, or content-scoped receipts promoted into Media?
4. What retention period is acceptable for abandoned 1.9 GB uploads and archived-content assets?
5. Can the downstream n8n/generic webhook accept a stable idempotency key, HMAC, callback/reconciliation query, and versioned contract?
6. Who is authorized to approve the final outbound payload, separately from editing source content?
7. Should a SocialPost remain immutable after first dispatch, with corrections creating a new delivery revision?
8. Is direct platform publishing actually required, or is a durable automation handoff the intended product boundary?
9. Which push provider and consent model meet the product/privacy requirements, including anonymous devices and account deletion?
10. Should file-store mode support new delivery attempt data in production, or only local/degraded editorial metadata?
11. What is the canonical language model for captions and future push audience selection?
12. Should PDF remain permitted as a Video thumbnail, given reader poster behavior?

## Validation record

Pre-flight evidence before creating this document:

- branch: `b3/phase3.8-video-media-social-push`
- HEAD: `2186680`
- remote sync (`origin/...HEAD`): `0 0`
- `origin/b3/foundation`: `2186680`
- working tree: clean

Safe validation performed after documentation:

- focused Vitest selection: 19 files, 107 tests passed;
- `npm run typecheck`: passed;
- `npm run lint:strict`: passed;
- no live storage, social, push, TTS, OCR, email, cron, publication, or deletion operation is authorized or required.

Final repository expectation: this Markdown file is the only working-tree difference; nothing is staged, committed, or pushed.
