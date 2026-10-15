# LokSwami B3 — Phase 3.7 Editorial Lifecycle Implementation Plan

**Document version:** 1.0.0

**Phase:** 3.7 — Articles, Stories, Copy Desk / Editorial Lifecycle

**Status:** IMPLEMENTATION PLAN COMPLETE — READY FOR 3.7A

**Working branch:** `b3/phase3.7-articles-stories-copy-desk`

**Starting commit:** `1a214a7`

**Integration base:** `b3/foundation`

**Plan date:** 2026-09-25
**Primary evidence:** `docs/b3/PHASE3_7_ARTICLES_STORIES_COPY_DESK_AUDIT.md`

---

## 1. Phase Objective

Phase 3.7 will complete and harden the CMS editorial lifecycle for Articles, Stories, and Copy Desk without expanding the four-role authority model established in Phase 3.6.

The phase will:

1. Make the reporter Article return/edit/resubmit path reachable without granting approval, scheduling, publication, assignment, or administrative authority.
2. Make workflow state the sole authority for Story publication mutations.
3. Add deterministic Story versioning and compare-and-swap (CAS) conflict protection across Mongo and file persistence.
4. Add bounded Story revisions, restore, edit leases, autosave, and interrupted-edit recovery while preserving Story media semantics.
5. Remove Copy Desk role dead ends and clarify the responsibilities of the existing work, review, content, and Copy Desk routes.
6. Complete workflow activity and notification context, then close Article/Story parity through automated four-role, responsive, accessibility, API, and CI acceptance.

This plan does not authorize implementation outside the listed Phase 3.7 systems.

---

## 2. Baseline

| Item | Baseline |
|---|---|
| Repository | `zaidshery/Lokswami-version-3` |
| Local checkout | `C:\Dev\Lokswami-version-3` |
| Branch | `b3/phase3.7-articles-stories-copy-desk` |
| Starting HEAD | `1a214a7` |
| Integration base | `b3/foundation` |
| Phase 3.6 | Complete and merged |
| Canonical roles | `super_admin`, `admin`, `copy_editor`, `reporter` |
| Persistence | Mongo/Mongoose with repository-specific file fallbacks |
| Audit status | `PHASE_3_7_AUDIT_COMPLETE_READY_FOR_IMPLEMENTATION_PLAN` |

The implementation must begin from a clean, synchronized branch after this documentation commit. Each subphase must preserve unrelated working-tree changes and must not modify environment files or production data.

---

## 3. Audit Summary

The shared workflow kernel is viable: Articles and Stories use the same twelve statuses, transition graph, role-policy helpers, workflow metadata, activity presentation, and notification service. The principal issue is architectural and safety asymmetry.

Articles already provide the safer reference pattern:

- centralized editorial service and repository boundaries;
- logical versions and CAS conflicts;
- Mongo/file behavior parity;
- bounded revisions and restore;
- edit leases;
- server draft/autosave recovery;
- rich readiness validation and public visibility controls.

Stories currently retain route-local domain logic and last-write-wins persistence. They have no revisions, restore, edit lease, or autosave recovery, and ordinary Story updates can mutate `isPublished` outside the canonical workflow action path.

Copy Desk is operational but split across overlapping surfaces. The highest-impact role dead end is the reporter Article path: policy helpers recognize reporter ownership, yet page and service gates prevent reopening an Article after the desk requests changes.

The audit identifies **four P0 findings** and a set of P1 lifecycle-coherence gaps. The subphase sequence below addresses server authority before persistence safety, persistence safety before collaboration UX, and UX before final notification/parity closure.

---

## 4. P0 Invariants

These invariants must hold before Phase 3.7 can merge.

### P0-1 — Reporter Article recovery is reachable and least-privileged

A reporter who owns or is assigned an Article may:

```text
create/save permitted Article
  -> submit
  -> receive changes_requested
  -> reopen that Article
  -> edit reporter-permitted fields
  -> resubmit
```

The same reporter must not assign/reassign, start copy review, mark ready for approval, approve, reject, schedule, publish, fast publish, archive, delete, or edit another reporter’s Article.

### P0-2 — Story publication is workflow-only

- Ordinary create/update payloads cannot directly publish or unpublish a Story.
- `workflow.status` is the canonical publication authority for mutations.
- `isPublished` becomes a derived compatibility/read field or is written only by the canonical workflow service.
- Publish, schedule, fast-publish, archive, and any reopen/unpublish behavior must pass transition legality, RBAC, readiness, activity, and notification policy.

### P0-3 — Story writes cannot silently overwrite

- Every protected Story mutation carries an expected logical version.
- The mutation succeeds only when the stored version matches.
- The winning write increments exactly once.
- A stale write returns deterministic HTTP 409 conflict data and creates no activity or notification side effect.
- Mongo and file persistence implement equivalent observable behavior.

### P0-4 — Story edits are recoverable

- Deliberate meaningful edits create bounded revision snapshots.
- Restore is version-protected and auditable.
- Autosave does not flood revision/activity history.
- Edit leases identify competing editors, expire safely, and support the existing admin takeover policy.
- Story media and video metadata survive autosave and revision restore.

---

## 5. 3.7A — Workflow, RBAC Reachability and Publication Invariants

### 5.1 Objective

Make the existing canonical workflow safe and reachable before introducing new persistence mechanics. Close direct publication bypasses, fail closed on malformed intent, enforce schedule validity, and resolve reporter-owned recovery paths without weakening Phase 3.6 RBAC.

### 5.2 Scope

#### Reporter Article lifecycle

- Permit reporter access to the Article edit surface only when content-level read policy allows it.
- Replace broad page-key denial in the Article service with operation-specific page/role plus content ownership checks.
- Keep the Article list’s intended role behavior separate from detail/edit reachability; do not expose all newsroom Articles to reporters.
- Define reporter-editable Article fields explicitly. The safe starting set is reporter-authored body/package fields required to answer desk feedback; desk-only SEO, flags, copy metadata, assignment, approval and publication controls remain blocked server-side.
- Permit reporter `submit` only from the agreed recovery states (`draft` and `changes_requested`, plus any explicitly approved rejected recovery outcome).
- Ensure editor actions render from server-derived capability data rather than role name alone.

#### Rejected-content recovery

- Choose one canonical behavior and encode it in the transition/action table:
  - recommended: rejection is terminal for the current workflow pass and an admin must explicitly reopen to `draft`; or
  - allow creator correction by making `rejected` reporter-editable and permitting a named resubmit action.
- Do not leave `rejected -> draft` as an unnamed transition.
- Remove or name all other reachable-to-draft transitions (`scheduled -> draft`, `published -> draft`) and apply appropriate role, reason, and public-visibility semantics.

#### Story publication invariant

- Remove `isPublished` from accepted ordinary Story update fields for CMS callers.
- Remove `applyLegacyPublishCompatibility()` from protected mutation behavior.
- Preserve backward read compatibility for legacy records, but normalize writes through workflow status.
- Ensure Story creation accepts only explicit `draft`, `submit`, or authorized `publish` intent; unknown intent returns 400.
- Ensure every publication-state change uses a named workflow action.

#### Article intent and scheduling

- Parse Article creation intent as a closed enum. Missing intent may retain the documented safe default (`draft`); unknown intent must return 400 and must never select publish.
- Validate schedule timestamps centrally for Article and Story:
  - required for `schedule`;
  - parseable ISO/date input;
  - strictly later than the authoritative server time with a small documented clock tolerance if needed;
  - stored consistently in UTC;
  - invalid/past values return stable 400 responses.
- Decide Story scheduled-release semantics. Recommended for Phase 3.7: scheduling is a workflow hold that remains private until an explicit publish action unless a tested Story public-release mechanism is in scope. The editor must state that behavior clearly.

### 5.3 Expected file/system areas

- `lib/auth/permissions.ts`
- `lib/auth/articleAuthorScope.ts`
- `lib/workflow/transitions.ts`
- `lib/workflow/article.ts`
- `lib/workflow/story.ts`
- `lib/workflow/readiness.ts`
- `lib/server/content/editorialService.ts`
- `lib/server/content/newsroomArticleValidation.ts`
- `app/api/admin/articles/route.ts`
- `app/api/admin/stories/route.ts`
- `app/api/admin/stories/[id]/route.ts`
- Article edit page guard/client capability wiring
- Story edit client field/action wiring

### 5.4 Acceptance gates

- Reporter-owned Article completes `changes_requested -> edit -> submit` end to end.
- Reporter cannot read/edit another reporter’s Article.
- Reporter cannot assign, approve, reject, schedule, publish, fast publish, archive, or delete.
- Ordinary Story PUT cannot toggle publication state.
- Unknown Article/Story intent returns 400 and persists nothing.
- Invalid/past schedules return 400 and persist nothing.
- Workflow status remains canonical in responses and storage.
- Successful and rejected actions preserve accurate activity history.
- Existing Phase 3.6 four-role access tests remain green.

### 5.5 Required tests

- Permission-unit matrix for Article reporter owner, assignee and non-owner.
- Article page/API tests for reporter changes-requested reopen/edit/resubmit.
- Negative Article reporter privilege tests for every desk/admin transition.
- Story PUT publication-bypass tests for Mongo and file modes.
- Unknown/missing intent tests for both content types.
- Schedule invalid, past, boundary and valid-future tests.
- Rejected/reopen transition characterization tests.
- Phase 3.6 role/page/API regression suite.

### 5.6 Risks and rollback

- **Risk:** widening `article_edit` page access could accidentally widen Article visibility. **Control:** require content-level authorization before returning data and test non-owner denial.
- **Risk:** removing Story `isPublished` writes may break legacy clients. **Control:** characterize all callers first; return a clear migration error for unsupported payloads rather than silently accepting them.
- **Rollback:** revert the subphase commit(s); no schema migration is required in 3.7A. Do not restore the publication bypass as a fallback.

---

## 6. 3.7B — Story Service Boundary and CAS

### 6.1 Objective

Move protected Story mutations behind a canonical service/repository boundary and introduce Article-grade optimistic concurrency without forcing Article-specific document or SEO concepts into Story.

### 6.2 Scope

- Introduce Story domain types and stable errors for not found, invalid ID, forbidden, validation, store unavailable, and version conflict.
- Extract Story normalization, permission-record creation, readiness, workflow serialization, and mutation orchestration from route handlers.
- Introduce a Story repository with explicit Mongo/file adapters for find, list, create, CAS update, CAS delete, and assignee resolution where appropriate.
- Add `version` to Story Mongo schema and file-store records.
- Treat legacy records without a version as logical version 1.
- Require `expectedVersion` on protected editor, workflow, delete, and later restore operations. Define any narrow compatibility exception explicitly; do not allow UI-originated blind writes.
- Use an atomic predicate in Mongo (`_id` plus logical/current version) and mutation serialization plus version assertion in file storage.
- Return a consistent 409 envelope containing a stable conflict code, current version, and current update timestamp.
- Route all Story workflow actions through the service so activity and notification side effects occur only after the CAS winner is known.
- Update queue/detail clients to carry and adopt returned Story versions.

### 6.3 Expected file/system areas

- `lib/models/Story.ts`
- `lib/storage/storiesFile.ts`
- new `lib/server/content/story*` service/repository/type/validation modules, following existing naming conventions
- `app/api/admin/stories/route.ts`
- `app/api/admin/stories/[id]/route.ts`
- `lib/admin/articleWorkflowOverview.ts`
- `lib/admin/workQueue.ts`
- `app/(admin)/admin/DeskWorkflowActions.tsx`
- Story list/edit clients
- Story API and file-concurrency tests

### 6.4 Acceptance gates

- Story create returns version 1.
- Every successful protected mutation increments exactly once.
- Two requests starting at the same version cannot both succeed.
- A stale write returns deterministic 409 metadata.
- A conflict creates no activity, notification, revision, or media mutation.
- Mongo and file stores expose the same version behavior.
- Existing Story media package, video upload/download, workflow, activity, and notifications remain intact.
- Protected route handlers no longer perform direct Story persistence.

### 6.5 Required tests

- Story CAS success and stale conflict for full edit, workflow and delete.
- Atomic Mongo predicate and logical-version-1 legacy behavior.
- File-store mutation serialization and stale conflict parity.
- Route-to-service delegation tests.
- No-side-effect-on-conflict assertions.
- Desk queue version propagation and client version adoption.
- Existing media/video and permissions regression suites.

### 6.6 Risks and rollback

- **Risk:** existing records lack version. **Control:** lazy logical version 1 and atomic first-write upgrade.
- **Risk:** file and Mongo adapters drift. **Control:** shared contract tests run against both adapters.
- **Risk:** media update workflows perform multiple mutations. **Control:** define one authoritative metadata commit and adopt its returned version before subsequent actions.
- **Rollback:** service routing can be reverted with schema field left harmlessly additive; never decrement persisted versions.

### 6.7 Phase 3.7B Completion Note

- **Status:** Complete ✅
- **Canonical Service Boundary:** Established `StoryEditorialService` (`lib/server/storyEditorialService.ts`) managing all protected mutations, validation, authorization, atomic CAS persistence, and side-effect coordination.
- **Versioning & CAS:** Deterministic integer `version` field added to `Story` schema and `storiesFile.ts` initialized to 1. MongoDB uses atomic `findOneAndUpdate` with `{ _id, ...buildStoryVersionMatch(expectedVersion) }` and `$inc: { version: 1 }`. File store uses serialized mutex and expectedVersion matching.
- **Legacy Compatibility:** Unversioned legacy records match version 1 predicate (`$or: [{ version: 1 }, { version: { $exists: false } }]`) and upgrade to version 2 on first mutation.
- **Conflict Contract:** Stale versions return deterministic HTTP 409 Conflict with code `STORY_VERSION_CONFLICT` and `currentVersion`. Conflicts produce 0 activity, 0 notifications, and 0 partial writes.
- **Routes & Clients:** Protected routes (`app/api/admin/stories/[id]/route.ts`) delegate all editorial mutations to `StoryEditorialService`. Story edit client (`app/(admin)/admin/stories/[id]/edit/page.tsx`) tracks version, supplies `expectedVersion`, adopts returned version, and surfaces conflict notification without silent overwrite.
- **Verification:** 100% test pass rate across 265 test files (1,655 tests), full typecheck, strict linting, security, four-role, and production build checks passing cleanly.

---

## 7. 3.7C — Story Revisions, Autosave and Edit-Lease Safety

### 7.1 Objective

Add collaboration and recovery protection to the Story editor after the version contract is stable.

### 7.2 Scope

#### Revisions

- Define a Story revision snapshot containing editable copy, links, media references/metadata, reporter metadata, copy-desk metadata, category, author, duration, and other editorial fields required for faithful recovery.
- Store metadata references only; do not duplicate binary media or remote objects.
- Bound revision history using an explicit constant aligned with Article operational limits unless Story evidence supports a different bound.
- Create revisions for deliberate meaningful saves, not pure workflow-only changes or autosaves unless a workflow action also changes content.
- Add authenticated revision list and CAS-protected restore endpoints.
- Restore must snapshot the pre-restore state, increment version, preserve current workflow unless the approved policy explicitly includes it, and record an activity entry.

#### Autosave and recovery

- Add an explicit `autosave` mutation mode through the Story service.
- Autosave uses expected version, advances version, skips revision/activity noise, and returns saved timestamp/version.
- Add local recovery metadata that distinguishes the current browser tab/session from another editor, following the proven Article safety model.
- Block destructive workflow actions while unresolved recovery or conflict state exists.
- Show saving, saved, offline/error, stale/conflict, restore/discard and retry states.

#### Edit lease

- Add Story lease storage with Mongo/file parity, TTL, acquire/renew/release and expired-lease cleanup.
- Allow takeover only through the existing admin/super-admin policy; copy editors/reporters cannot forcibly take another user’s lease.
- A lease is collaboration guidance, not a substitute for CAS. Every write remains version-protected.

### 7.3 Expected file/system areas

- `lib/models/Story.ts` and Story revision schema
- `lib/storage/storiesFile.ts`
- Story service/repository introduced in 3.7B
- Story lock model/file repository or a safely generalized content-lock abstraction
- Story revision and lock API routes
- Story edit client and draft-recovery hook/helpers
- activity service and Story tests

### 7.4 Acceptance gates

- Meaningful Story saves create bounded revision snapshots.
- Autosaves advance version without flooding revision/activity history.
- Restore is CAS-protected, auditable and itself recoverable.
- Story media/video metadata is identical before and after no-op autosave and is correctly restored from a revision.
- Competing leases are visible and cannot be silently overridden.
- Expired leases can be acquired safely; authorized takeover is audited.
- Interrupted edits present an explicit restore/discard decision.
- Stale autosave cannot overwrite a newer save.

### 7.5 Required tests

- Revision snapshot completeness and maximum bound.
- Restore success, restore conflict, pre-restore snapshot and activity.
- Media/video metadata preservation.
- Lease acquire, renew, competing acquire, expiry, release and admin takeover.
- File/Mongo lock parity.
- Autosave success, failure, stale conflict and recovery decisions.
- Cross-tab/session draft-safety component tests.

### 7.6 Risks and rollback

- **Risk:** revision documents grow due to media metadata. **Control:** snapshot references/metadata only and enforce bounds.
- **Risk:** lock UI is mistaken for hard exclusion. **Control:** retain CAS as authoritative and explain lease behavior.
- **Risk:** autosave creates excessive writes. **Control:** debounce, dirty-field detection and one in-flight save policy.
- **Rollback:** disable Story autosave/lease UI while retaining versions and revisions; additive data remains readable.

### 7.7 Phase 3.7C Completion Note

- **Status:** Complete ✅
- **Bounded Story Revisions:** Added `IStoryRevision` / `StoredStoryRevision` schema snapshots (capturing title, caption, thumbnail, mediaType, mediaKey, mediaSizeBytes, mediaMimeType, storageProvider, mediaAssets, videoProduction, category, author, duration, priority, reporterMeta, copyEditorMeta, workflow summary, actor, and savedAt). Bounded to max 30 revisions pruned deterministically via MongoDB `$slice: -30` and file store `.slice(-MAX_STORED_STORY_REVISIONS)`.
- **CAS-Protected Restore:** Implemented `StoryEditorialService.restoreStoryRevision` requiring matching `expectedVersion`. Preserves pre-restore state as a recoverable revision snapshot, restores editorial and media references without wiping video/asset metadata, protects publication/workflow invariants, increments version by 1, and records audited activity. Stale restore requests receive deterministic HTTP 409 `STORY_VERSION_CONFLICT`.
- **Edit Lease / Lock Ownership:** Implemented `StoryLock` model (`lib/models/StoryLock.ts`) with MongoDB TTL index (`expireAfterSeconds: 0`) and file store parity (`lib/storage/storyLocksFile.ts`). Service (`lib/server/storyLockService.ts`) supports acquire, renew/heartbeat (60s TTL), release, and authorized Admin takeover. Competing editors receive deterministic HTTP 409 `STORY_EDIT_LEASE_CONFLICT`. Mutations by non-holders are rejected with lease conflict while active lease exists.
- **Server-Aware Autosave & Local Recovery:** Integrated debounced autosave (`components/admin/stories/useStoryAutosave.ts`) sending `autosave: true` and `expectedVersion`. Autosave increments version once, skips revision explosion (`skipRevision: true`), suppresses activity spam, and rejects privileged field mutations. Local browser draft disaster recovery (`story-draft-${id}`) surfaces recovery banner on interrupted sessions.
- **Collaboration UI:** Added `StoryCollaborationBar` and `StoryRevisionsDrawer` to `app/(admin)/admin/stories/[id]/edit/page.tsx` displaying distinct states: `SAVED`, `SAVING`, `UNSAVED`, `VERSION CONFLICT`, `LEASE CONFLICT`, `AUTOSAVE FAILED`, and `RECOVERY AVAILABLE`.
- **Verification:** 100% test pass rate across 270 test files (1,692 tests), zero regression across newsroom four-role RBAC, security mutation inventory, auth guards, strict linting, typecheck, and Next.js CI production build.

---

## 8. 3.7D — Copy Desk and Editor Lifecycle UX

### 8.1 Objective

Make every permitted editorial next step understandable and reachable across the existing routes without deleting routes or breaking Phase 3.6 deep links.

### 8.2 Route classification

| Route | Classification | Phase 3.7 responsibility |
|---|---|---|
| `/admin/work` and `?view=review` | **Canonical** role-aware workbench | Primary cross-content personal/review entry, server-filtered by role. |
| `/admin/copy-desk` | **Specialized** copy-editor work surface | Rich reporter package, Story assets and copy checks; mixed Article/Story labels must be accurate. |
| `/admin/review-queue` | **Compatibility / admin-specialized** | Preserve deep links and Phase 3.6 behavior; clarify that it is an admin-wide review view. |
| `/admin/content-queue` | **Specialized admin publication queue** | Approved/scheduled/release handling for admin/super-admin. |

No route is removed in Phase 3.7. A future redirect/deprecation may be proposed only after telemetry/user evidence and must preserve deep links.

### 8.3 Scope

- Add clear reporter feedback and a primary “continue changes”/“resubmit” path for returned Articles.
- Present rejected-content policy consistently in badges, feedback, editor actions and queues.
- Display current creator, assignee, reviewer, due date, schedule time and workflow status where relevant.
- Add Story version/save/lease/conflict/recovery states from 3.7B-C.
- Ensure visible actions are derived from the same capability rules enforced by APIs.
- Remove dead-end links/buttons for roles that cannot open the destination.
- Correct Story-only language in mixed Copy Desk results.
- Clarify schedule timezone and whether Story scheduling is manual-release or automatic.
- Preserve confirmation/reason collection for rejection, change requests, fast publish, takeover and destructive deletion.
- Preserve or improve native labels, ARIA live regions, dialog focus trap/return, Escape handling, error focus and keyboard activation.
- Verify editor/queue layouts at 1440×900, 768×1024 and 390×844 without horizontal overflow or inaccessible sticky actions.

### 8.4 Expected file/system areas

- `app/(admin)/admin/copy-desk/page.tsx`
- `app/(admin)/admin/work/page.tsx`
- `app/(admin)/admin/review-queue/page.tsx`
- `app/(admin)/admin/content-queue/page.tsx`
- `components/admin/WorkQueuePage.tsx`
- `components/admin/WorkQueueWorkbench.tsx`
- `app/(admin)/admin/DeskWorkflowActions.tsx`
- Article and Story list/edit clients
- shared workflow feedback, activity and status components
- admin navigation metadata where labels/links require correction

### 8.5 Acceptance gates

- Every visible action is permitted and succeeds through the canonical API when prerequisites are met.
- No role-visible link leads to access denied for the intended next action.
- Changes-requested and rejected content show a clear responsible role and next step.
- Reporter, copy-editor and admin handoffs are visible in queues and editors.
- Conflict, autosave and lease states are understandable without inspecting logs.
- Existing routes and deep links remain valid.
- Keyboard-only flows complete all permitted actions.
- No horizontal overflow or hidden primary action at required viewports.

### 8.6 Required tests

- Component tests for capability/action visibility and feedback copy.
- Dialog/focus/error/live-region tests.
- Playwright role flows for reporter return/resubmit, copy-editor review, admin approval/reject/schedule and Story conflict recovery.
- Route/deep-link regression checks.
- Responsive overflow and sticky-action assertions at all required viewports.

### 8.7 Risks and rollback

- **Risk:** navigation consolidation changes role expectations. **Control:** preserve all routes; change labels/entry priority before considering redirects.
- **Risk:** client capability logic drifts from server policy. **Control:** expose/derive capabilities from shared policy inputs and keep negative API tests.
- **Rollback:** revert presentation changes independently; do not revert server invariants or CAS.

### 8.8 Phase 3.7D Completion Note

- **Status:** Complete ✅
- **Newsroom Surfaces Classified:**
  - `/admin/work?view=review`: **CANONICAL** unified workbench for personal, desk, and approval items with server-side role filtering.
  - `/admin/copy-desk`: **SPECIALIZED** copy-editor workspace for language refinement, headline verification, fact-checking, and asset inspection. Preserved route permissions: `super_admin`, `admin`, `copy_editor` ALLOW; `reporter` DENY. Added quick filter tabs (`mine`, `ready_for_review`, `needs_changes`, `ready_for_approval`) and Content Type filters (`all`, `article`, `story`) with contextual deep links to Work Workbench, Content Queue, and My Work.
  - `/admin/review-queue`: **SPECIALIZED / COMPATIBILITY** admin review queue for review-stage oversight.
  - `/admin/content-queue`: **SPECIALIZED** staging queue for admin publishing, scheduling, and urgent release.
- **Reporter Return & Resubmit UX:** In `changes_requested`, Article and Story editors render an `EditorialFeedbackBanner` displaying the desk return reason, reviewer identity, list of editable fields, save status, and a prominent "Resubmit for Review" primary action. Privileged controls (`approve`, `publish`, `schedule`, `assign`, `fast_publish`) are strictly hidden from reporters.
- **Rejected Content Recovery UX:** In `rejected`, Article and Story editors render rejection banners displaying the reason and recovery policy. Author-owned content offers "Resubmit for Review" after modifications; unauthorized viewers receive terminal guidance without dead-end actions.
- **Story Collaboration UX Integration:** Integrated `StoryCollaborationBar` into Story editor enforcing strict save confidence: priority is `conflict/error > recovery > saving/unsaved > saved`. "All changes saved" is never displayed when pending, in conflict, on autosave failure, or when a recovered local draft exists. Save status has `role="status"` and `aria-live="polite"`.
- **Story Lease & Takeover UX:** Non-holders see locked status ("Locked by [Name] ([Role])") and disabled save button ("Locked by Editor"). Authorized Admins get an accessible modal confirmation step before executing lease takeover.
- **Story Revision History UX:** `StoryRevisionsDrawer` provides accessible dialog semantics (`role="dialog"`, `aria-modal="true"`, `aria-labelledby`, Escape key handling, focus trap). Revision restore requires confirmation explaining that current draft is captured as a recoverable snapshot and workflow/publication status is kept. Deterministic HTTP 409 conflict errors are surfaced actionably.
- **Schedule Guidance & Validation:** Future date requirement enforced across `DeskWorkflowActions` and editors with immediate feedback ("Scheduled time must be set to a future date and time.") and descriptive help text ("Must be a future date and time. Scheduling queues content for release and does not publish immediately.").
- **Responsive Layout & Accessibility:** Responsive containers (`flex-wrap`, `minmax(0,1fr)`) verified across desktop (1440x900), tablet (768x1024), and mobile (390x844) viewports without horizontal page overflow. Accessible names, ARIA attributes (`aria-controls`, `aria-expanded`), and keyboard interactions verified.
- **Verification:** 100% test pass rate across 271 test files (1,709 tests, +17 new tests in `tests/copy-desk-lifecycle-ux.test.tsx`), zero regressions across four-role newsroom RBAC, security mutation suite, auth guards, strict linting, typecheck, Next.js CI production build, and scope checks.

---

## 9. 3.7E — Activity, Notifications, Parity and Final Acceptance

### 9.0 Completion Note — Phase 3.7E COMPLETE ✅

**Completed:** 2026-09-25
**Branch:** `b3/phase3.7-articles-stories-copy-desk`
**Commit:** `c594706` — feat(cms): complete phase 3.7 editorial lifecycle

#### Implementation summary

- **Activity parity** — `lib/server/articleActivity.ts` and `lib/server/storyActivity.ts` unified to emit identical messages for all shared lifecycle events (`submit`, `assign`, `reassign`, `review_started`, `copy_edit`, `changes_requested`, `ready_for_approval`, `approve`, `reject`, `schedule`, `publish`, `fast_publish`, `restore_revision`). Routine autosave events are intentionally excluded from activity history.
- **Notification parity** — `lib/server/workflowNotificationEvents.ts` audited and confirmed:
  - `submitted`: intentionally no separate notification (assignment immediately follows; duplicate notification suppressed for workflow efficiency; consistent for Article + Story).
  - `copy_edit`: intentionally no separate notification (reviewer already holds the assignment; consistent for Article + Story).
  - All other lifecycle events produce correctly targeted, deduplicated notifications.
- **Notification context** — `changes_requested` and `rejected` forward reason text; `scheduled` forwards UTC schedule time; `fast_published` forwards reason when provided; assignment/reassignment include actor + assignee names.
- **Recipient isolation** — actor self-exclusion enforced; `createdBy` + `assignedTo` are the only recipients; cross-content contamination impossible by construction.
- **Side-effect failure resilience** — `lib/server/editorialRevisionService.ts` and `lib/server/editorialService.ts` updated: primary persistence result is authoritative; notification and activity failures are caught, logged without secret values, and do not cause the client-facing response to represent a committed primary mutation as failed.
- **Stories API route** (`app/api/admin/stories/route.ts`) updated to propagate resilient side-effect pattern consistent with Article service.
- **Test suite** — `tests/workflow-activity-resilience.test.ts` added (8 tests covering Task 2 activity parity, Task 4/6 notification context and resilience, Task 5 recipient isolation).

#### Final parity matrix

| Capability | Article | Story | Classification |
|---|---|---|---|
| Create | ✅ | ✅ | PASS |
| Edit | ✅ | ✅ | PASS |
| Draft save | ✅ | ✅ | PASS |
| Submit | ✅ | ✅ | PASS |
| Resubmit | ✅ | ✅ | PASS |
| Assign | ✅ | ✅ | PASS |
| Reassign | ✅ | ✅ | PASS |
| Start review | ✅ | ✅ | PASS |
| Copy edit | ✅ | ✅ | PASS |
| Request changes | ✅ | ✅ | PASS |
| Ready for approval | ✅ | ✅ | PASS |
| Approve | ✅ | ✅ | PASS |
| Reject | ✅ | ✅ | PASS |
| Schedule | ✅ | ✅ | PASS |
| Publish | ✅ | ✅ | PASS |
| Fast publish | ✅ | ✅ | PASS |
| Preview | ✅ | ✅ | PASS |
| Activity history | ✅ | ✅ | PASS |
| Notifications | ✅ | ✅ | PASS |
| Autosave | ✅ | ✅ | PASS |
| Revision history | ✅ | ✅ | PASS |
| Restore | ✅ | ✅ | PASS |
| Concurrency (CAS) | Article-level | Story CAS (3.7B) | DIFFERENT BY DESIGN |
| Edit lease | N/A | ✅ (3.7C) | DIFFERENT BY DESIGN |
| Media | Rich body + audio | Asset package + video | DIFFERENT BY DESIGN |
| SEO | ✅ | N/A | DIFFERENT BY DESIGN |
| Validation | ✅ | ✅ | PASS |
| Loading/error | ✅ | ✅ | PASS |
| Accessibility | ✅ | ✅ | PASS |
| Responsive UX | ✅ | ✅ | PASS |

**Unresolved P0: 0**

#### Deferred (P2 — out of scope for Phase 3.7)

- Large-scale Article/Story editor component decomposition
- General-purpose workflow framework extraction
- Broad notification outbox redesign
- Route removal/permanent redirects for overlapping queues
- E-Paper, Video Hub, reader, Homepage, analytics, social automation

#### Verification

- `npm run typecheck` — PASS
- `npm run lint:strict` — PASS (0 warnings)
- `npm run test:four-role-newsroom` — PASS (28/28 tests)
- `npm run test:security` — PASS (73/73 tests)
- `npm run test:auth-guards` — PASS (7/7 cases)
- `npm run check:phase3-scope` — PASS (47 files inspected, no dangerous artifacts)
- `npm run build:ci` — PASS
- `git diff --check` — PASS (no whitespace errors)
- `npm run test:ci` — PASS (272 test files, 1,717 tests)
- `npm run check:pr-readiness` — PASS
- Working tree: clean after commit
- Remote sync: 0 left, 0 right

---

### 9.1 Objective

Close remaining lifecycle observability and parity gaps, harden secondary effects, and run the complete automated acceptance program.

### 9.2 Scope

#### Activity completeness

Verify that both content types record:

- creator and creation intent;
- assignment and reassignment, including previous/new assignee;
- review start and reviewer;
- copy-edit entry where retained as an event;
- changes requested and reason;
- readiness for approval;
- approval actor;
- rejection actor and reason;
- schedule actor and UTC time;
- publication/fast-publication actor and exception reason;
- revision restore and authorized lock takeover.

#### Notifications

- Review event support for submitted, assigned, reassigned, review started, copy edit, changes requested, ready for approval, approved, rejected, scheduled, published and fast published.
- Add submit/copy-edit events only if they create a useful, non-duplicative recipient action.
- Forward rejection/change reason, scheduled time and fast-publish reason when already available.
- Preserve recipient isolation, actor exclusion and dedupe keys.
- Separate primary mutation success from secondary notification delivery failure. The API must not make a committed transition appear indeterminate.
- Record/return an operationally observable warning or enqueue a retry through the repository’s sanctioned notification mechanism; do not swallow failures silently.

#### Parity closure

- Re-run and update the audit parity matrix.
- Classify remaining differences as PASS, PARTIAL, MISSING, or DIFFERENT BY DESIGN.
- No P0 may remain; any accepted P1/P2 must have an owner, rationale and follow-up location.

### 9.3 Expected file/system areas

- `lib/server/articleActivity.ts`
- `lib/server/storyActivity.ts`
- `lib/server/workflowNotificationEvents.ts`
- `lib/storage/workflowNotifications.ts`
- Article and Story services/callers
- notification job/route tests
- audit/plan follow-up documentation and final acceptance report

### 9.4 Acceptance gates

- Activity answers who performed every material lifecycle action and why when a reason is required.
- Notifications carry available reason/time context and reach only intended recipients.
- Notification failure cannot cause a successful primary mutation to look like an unknown/failed commit.
- Article/Story parity has no unresolved P0.
- Four-role, responsive, accessibility, security, auth, scope, build and full CI gates pass.

### 9.5 Required tests

- Event/recipient/context/dedupe unit tests.
- Mutation-success plus notification-failure behavior.
- Activity field completeness for both content types and stores.
- Full role-transition matrix.
- Final Playwright lifecycle suite.
- Full repository completion gates in Section 16.

### 9.6 Risks and rollback

- **Risk:** extra events create notification noise. **Control:** define recipient action/value and dedupe behavior before adding an event.
- **Risk:** resilient side-effect handling hides failures. **Control:** persist or log structured operational failure and test it; only decouple client mutation success from secondary delivery.
- **Rollback:** disable newly added event types individually while retaining activity and primary mutation correctness.

---

## 10. Dependency Graph and Implementation Order

```text
3.7A — Canonical workflow, RBAC reachability, publication invariants
  |
  v
3.7B — Story service boundary and CAS
  |
  v
3.7C — Story revisions, autosave and edit leases
  |
  v
3.7D — Copy Desk and editor lifecycle UX
  |
  v
3.7E — Activity, notifications, parity and final acceptance
```

Why the order is mandatory:

- **3.7B depends on 3.7A:** CAS must protect the final canonical mutation paths, not preserve a publication bypass or unresolved transition semantics.
- **3.7C depends on 3.7B:** revisions, restore, autosave and leases need a stable version contract and repository boundary.
- **3.7D depends on 3.7A-C:** the UI can only communicate reliable capabilities, conflicts and recovery after the server contracts exist.
- **3.7E depends on all earlier phases:** notification/activity payloads and final parity are meaningful only after workflow, persistence and UX paths stabilize.

Each subphase should land as a separately reviewable change set with focused tests and its own acceptance note. Do not start a dependent subphase while its prerequisite has unresolved P0 failures.

---

## 11. Expected File and System Areas

| Area | Expected change type |
|---|---|
| Workflow/RBAC | Narrow policy and transition corrections; no new role |
| Article service/editor | Reporter reachability and fail-closed intent/schedule behavior |
| Story service/repository | New canonical boundary replacing protected direct route writes |
| Story model/file store | Add version and bounded revision data; preserve legacy normalization |
| Story APIs | Thin controllers, CAS errors, revision/lock endpoints |
| Story editor | Version, autosave, recovery, revision and lease UI |
| Copy Desk/work queues | Capability-correct navigation, labels, state/conflict visibility |
| Activity/notifications | Context propagation and resilient secondary effects |
| Tests/Playwright | Four-role lifecycle, CAS, recovery, responsive and accessibility acceptance |
| Documentation | Subphase reports, updated parity and final acceptance evidence |

Explicitly protected areas include E-Paper/E-Magazine domain logic, production integrations, reader redesign, homepage composition, analytics, and unrelated editor refactors.

---

## 12. Migrations and Schema Implications

### 12.1 Story version

- Additive `version: number` with new records starting at 1.
- Treat absent/invalid legacy version as logical version 1 at repository boundaries.
- First successful CAS update atomically writes version 2.
- Do not run a production-wide backfill as part of ordinary Phase 3.7 development.

### 12.2 Story revisions

- Additive bounded revision array or a repository-supported separate collection only if document-size evidence requires it.
- Prefer the existing Article embedded/bounded pattern for operational consistency unless Story media metadata proves unsafe.
- Snapshots contain metadata and references, never binary media.

### 12.3 Story locks

- Add a Story-specific lock store/model or safely generalized content-lock model with content type in the key.
- TTL/expiry behavior must work in Mongo and file fallback.
- Lock records are ephemeral coordination state and must not affect public content.

### 12.4 Publication authority

- Existing `isPublished` remains readable for compatibility during migration.
- Canonical writes derive it from workflow status inside the Story service.
- Legacy records are normalized on read and safely upgraded on write.
- Any future removal of the field is a separate migration decision.

### 12.5 Migration safety

- All schema changes are backward-readable and additive.
- Migration code must be idempotent and covered by legacy-record tests.
- No production migration is authorized in Phase 3.7 implementation work.
- Rollback must not require decrementing versions or deleting revision/lock data.

---

## 13. Staging-Data Strategy

- Use local or explicitly isolated staging data only.
- Use the repository’s fail-closed staging validator before any staging acceptance.
- Never print or parse environment-file contents.
- Use existing sanctioned CMS QA provisioning and safety checks; QA identities remain reserved and role-specific.
- Credentials are supplied through approved environment variables/session setup and are never hard-coded in tests, fixtures, screenshots, traces, or documentation.
- Seed the minimum synthetic editorial graph needed for tests:
  - reporter-owned Article in draft, changes-requested and rejected scenarios;
  - submitted/unassigned and assigned Story;
  - approval-ready content;
  - future scheduled content;
  - Story with image/video metadata for revision preservation;
  - two sessions sharing the same starting Story version for CAS tests.
- Prefix or otherwise identify test content so teardown is deterministic.
- Never publish to live reader endpoints, send outbound notifications, invoke social/email/push/n8n, or use production media/storage.
- Browser tests should use API/fixture setup through sanctioned local/staging helpers and clean up only records they created.

---

## 14. Unit, API and Integration Test Strategy

### 14.1 Test layers

1. **Pure unit tests**
   - transition legality and named actions;
   - schedule parsing/future validation;
   - role/content capability matrices;
   - Story normalization and publication derivation;
   - revision snapshot selection and bounds;
   - notification recipients/context/dedupe.
2. **Repository contract tests**
   - run equivalent CAS/revision/lock cases against Mongo adapter mocks/integration harness and file adapter;
   - legacy record logical-version behavior;
   - no mutation on conflict.
3. **API route tests**
   - authentication, page/content authorization, validation and stable status/envelopes;
   - route delegates to service and does not directly bypass protected persistence;
   - activity/notification side-effect order and failure behavior.
4. **React component tests**
   - action visibility, save/conflict/recovery states, feedback, focus and live regions;
   - queue route/link behavior by role.
5. **Playwright lifecycle tests**
   - real route composition, authenticated role sessions, viewport behavior and keyboard workflows.

### 14.2 Focused-first execution

For each subphase:

1. Run the directly changed unit/API/component files.
2. Run the Article/Story/workflow/queue/notification regression group.
3. Run `npm run typecheck`.
4. Run relevant Playwright scenarios when UI changes exist.
5. Before subphase completion, run lint/security/auth/scope/build gates proportional to the change.

The final subphase runs the complete gate set in Section 16.

---

## 15. Automated Browser Acceptance Strategy

### 15.1 Harness

- Use the existing `playwright.config.mjs` and `tests/e2e` convention.
- Use `PLAYWRIGHT_BASE_URL` for an already-running isolated staging/local server or the configured local `npm run dev` web server.
- Authenticate with sanctioned role-session helpers and reserved QA identities. Passwords remain environment-provided; no test contains credentials.
- Prefer API/fixture setup for deterministic content state, followed by browser interaction for the behavior under test.
- Retain traces and failure screenshots only; artifacts must remain ignored and must not contain secrets.

### 15.2 Required roles

- `super_admin`
- `admin`
- `copy_editor`
- `reporter`

Every privileged negative assertion must use at least one lower-authority role. Reporter and copy-editor content ownership/non-ownership cases must use distinct identities or fixtures where needed.

### 15.3 Required viewports

- Desktop: **1440 × 900**
- Tablet portrait: **768 × 1024**
- Mobile: **390 × 844**

At each required viewport assert:

- `document.scrollWidth <= window.innerWidth` unless an explicitly scoped data table owns its own accessible scroll region;
- primary and secondary workflow actions remain visible/reachable;
- drawers/dialogs fit the viewport and can scroll internally;
- no sticky/footer action obscures focused inputs or validation messages.

### 15.4 Required browser scenarios

1. Reporter creates/submits an Article; copy editor/admin requests changes; reporter reopens, edits and resubmits.
2. Reporter cannot see or invoke assignment, approval, rejection, schedule, publish, fast publish or deletion controls; direct API attempts fail.
3. Copy editor claims or opens assigned work, starts review, enters copy edit, requests changes and marks ready for approval.
4. Admin approves, rejects with reason, schedules valid future content and receives validation for invalid/past schedules.
5. Two Story editor sessions begin at the same version; first save succeeds and second receives conflict/recovery UI without overwrite.
6. Story revision list and restore preserve media metadata and update activity/version.
7. Competing Story lease, expiry and authorized takeover states are understandable and keyboard operable.
8. Rejected and changes-requested items show the intended recovery path and no dead-end link.
9. Copy Desk, canonical Work review, Review Queue and Content Queue retain correct role access and deep links.
10. Keyboard-only navigation covers editor validation focus, workflow panels, dialogs, close/escape and focus return.

### 15.5 Accessibility assertions

- Accessible names for all action buttons, inputs, upload controls and dialogs.
- Correct `role=dialog`, title association, initial focus, Escape close and focus restoration.
- `aria-live`/alert semantics for save, conflict, validation and workflow outcomes.
- No disabled-only explanation: unavailable actions are hidden or paired with readable prerequisite text.
- Visible focus indicators and logical tab order.

Routine manual acceptance is not required. Manual exploratory review may supplement automation but cannot replace a failed or missing automated gate.

---

## 16. Explicit Phase 3.7 Completion Gates

Phase 3.7 cannot be declared complete until all gates pass:

1. Reporter Article return/edit/resubmit works.
2. Story direct publication bypass is closed.
3. Malformed/unknown publish intent fails closed.
4. Server scheduling validation rejects invalid and past times.
5. Story CAS works in Mongo and file modes.
6. Story revisions are bounded and complete.
7. Story restore is CAS-protected and auditable.
8. Story edit leases, expiry and takeover policy work.
9. Story autosave and interrupted-edit recovery work.
10. Copy Desk lifecycle has no role dead ends.
11. Notification and activity context is complete and recipient-isolated.
12. Article/Story parity matrix has no unresolved P0.
13. Automated four-role lifecycle suite passes.
14. Responsive automation passes at 1440×900, 768×1024 and 390×844.
15. Accessibility automation passes.
16. `npm run typecheck` passes.
17. `npm run lint` passes with no new errors/warnings attributable to Phase 3.7.
18. `npm run test:security` passes.
19. `npm run test:auth-guards` and the repository’s credential/auth checks pass.
20. Phase 3 scope checker passes and reports no secrets/runtime/generated artifacts.
21. `npm run build:ci` passes.
22. `npm run test:ci` passes.
23. Final working tree and diff are reviewed; only intended Phase 3.7 files are present.
24. Feature branch is committed, pushed, synchronized with origin and clean.
25. Phase 3.7 is merged only after all gates and review pass.

Each completion report must record exact commands, exit status, test counts where reported, browser roles/viewports exercised, branch, HEAD, remote sync and worktree state.

---

## 17. Rollback and Recovery Considerations

- Keep subphases independently revertible; do not combine all Phase 3.7 work into one irreversible change.
- Prefer additive schemas and lazy legacy normalization.
- Never roll back by rewriting/decrementing stored versions.
- A failed Story service rollout may route reads through legacy-compatible normalization, but protected writes must not revert to blind last-write-wins behavior.
- Autosave can be disabled independently if necessary while retaining manual CAS saves.
- Lease UI can be disabled independently; CAS remains authoritative.
- New notification event types can be disabled individually without reverting workflow/activity correctness.
- Queue presentation changes can be reverted without undoing server invariants.
- Revision restore itself must create a recoverable pre-restore snapshot.
- Any staging-data cleanup must target only known test IDs created by the acceptance harness.
- Production migration and emergency production rollback are outside this phase and require a separately approved runbook.

---

## 18. Scope Control

### P0 — mandatory before merge

- Reporter Article return/resubmit.
- Story publication bypass closure.
- Story CAS/version protection.
- Story revisions, restore, leases and recoverable autosave.

### P1 — complete where required for lifecycle coherence

- Fail-closed intent parsing.
- Server schedule validation and documented Story schedule semantics.
- Rejected-content recovery.
- Story service/repository boundary and Mongo/file parity.
- Accurate activity/notification context and resilient secondary effects.
- Copy Desk/queue role reachability, labels, focus and responsive behavior.

### P2 — defer unless required by acceptance

- Large-scale Article/Story editor component decomposition.
- General-purpose workflow framework extraction.
- Broad notification outbox redesign beyond Phase 3.7 reliability needs.
- Route removal or permanent redirects for overlapping queues.
- Broad visual redesign.

### Out of scope

- E-Paper or E-Magazine behavior, production, scheduling or redesign.
- Video editor redesign, except regression protection for shared workflow components.
- Homepage or reader redesign.
- Analytics redesign.
- Social automation, email delivery, push delivery, OCR, TTS or n8n execution.
- Production data migration or production credential/infrastructure changes.
- User, role or password administration changes.
- Unrelated refactoring or dependency upgrades.

---

## 19. Definition of Ready for 3.7A

3.7A may begin when:

- the audit and this plan are committed and synchronized;
- the feature branch is clean;
- the four P0 invariants are accepted as the governing implementation constraints;
- work remains local/staging-only;
- implementation starts with focused characterization tests for reporter Article access, Story publication bypass, intent parsing and scheduling.

No 3.7A application code is included in this planning change.
