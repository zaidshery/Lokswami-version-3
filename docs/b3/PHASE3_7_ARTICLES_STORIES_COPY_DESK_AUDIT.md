# LokSwami B3 — Phase 3.7 Articles, Stories, Copy Desk / Editorial Lifecycle Audit

**Document version:** 1.0.0

**Phase:** 3.7

**Status:** AUDIT COMPLETE — READY FOR IMPLEMENTATION PLANNING

**Audit branch:** `b3/phase3.7-articles-stories-copy-desk`

**Baseline commit:** `1a214a7`

**Integration base:** `b3/foundation`

**Audit date:** 2026-09-25

---

## 1. Executive Summary

Phase 3.7 already has a substantial shared workflow foundation. Articles and Stories use the same twelve editorial statuses, the same transition graph, the same four-role policy helpers, common readiness primitives, common activity presentation, and common workflow notifications. The CMS also has mature queue surfaces and usable editor interfaces.

The maturity is asymmetric. Article persistence is centralized behind `EditorialService`, compare-and-swap (CAS) versions, revision snapshots, autosave controls, and edit leases. Story persistence is implemented directly in two large route handlers, has no version field or CAS contract, no revision history, no lock, and no server autosave distinction. Story also retains an admin-editable `isPublished` compatibility path that can change publication state outside the canonical workflow action path.

Four P0 findings block calling the editorial lifecycle complete:

1. **Reporter Article return/resubmit is unreachable.** `canEditContent()` and `canTransitionContent()` define reporter ownership and resubmission behavior, but `PAGE_ACCESS.article_edit`, `EditorialService.getArticleForNewsroom()`, `fullUpdate()`, `partialUpdate()`, and `applyWorkflowAction()` deny reporters before those content-level checks can operate. A reporter can submit the simplified Article handoff but cannot open it again when the desk requests changes.
2. **Story writes are last-write-wins.** Story edit and workflow routes have no `version`, `expectedVersion`, atomic CAS, or conflict response. Concurrent editors and queue actions can silently overwrite each other in both Mongo and file storage.
3. **Story publication has a server-side workflow bypass.** Admin/super-admin Story `PUT` accepts `isPublished`, and `applyLegacyPublishCompatibility()` directly rewrites workflow state to `published` or `draft`. That bypasses transition legality, publication readiness, fast-publish reason rules, workflow notification generation, and canonical publish activity semantics.
4. **Story has no recoverable editorial history.** It has activity entries, but no content revisions, restore endpoint, edit lock, or server autosave semantics. This is unsafe for copy-desk collaboration and materially below Article behavior.

The recommended Phase 3.7 sequence is: close server invariants and bypasses; make the reporter/copy-desk lifecycle reachable; add Story concurrency and recoverability; consolidate and clarify Copy Desk/queue UX; then close parity, accessibility, and regression coverage.

---

## 2. Audit Scope and Method

This was a static, read-only application audit except for creation of this document. No application source, generated artifact, data file, environment file, credential, user, role, content record, external integration, commit, or remote branch was changed.

Primary evidence:

- Pages and editors under `app/(admin)/admin/articles`, `stories`, `copy-desk`, `work`, `review-queue`, and `content-queue`.
- Article APIs under `app/api/admin/articles`; Story APIs under `app/api/admin/stories`.
- `lib/workflow/*`, `lib/auth/permissions.ts`, `lib/auth/storyEditing.ts`.
- `lib/server/content/editorialService.ts`, Article repositories, file stores, revisions, locks, activity, and notification services.
- `lib/models/Article.ts`, `lib/models/Story.ts`, and workflow schemas.
- Existing Vitest/API/component tests and Phase 3.5/3.6 RBAC documentation.

No workflow state or permission in this report is inferred from product wording alone; matrices below reflect executable code.

---

## 3. Architecture

### 3.1 Shared workflow kernel

`lib/workflow/types.ts` defines the canonical statuses:

`draft`, `submitted`, `assigned`, `in_review`, `copy_edit`, `changes_requested`, `ready_for_approval`, `approved`, `scheduled`, `published`, `rejected`, `archived`.

`lib/workflow/transitions.ts` owns legal state-to-state movement. `lib/workflow/article.ts` maps actions to target statuses and applies metadata such as assignee, reviewer, timestamps, rejection reason, comments, due date, and priority. `lib/workflow/story.ts` deliberately delegates Story action application to the Article workflow function, so the intended state machine is shared.

`lib/auth/permissions.ts` owns page, create, read, edit, delete, assignment, and transition permissions. `lib/workflow/readiness.ts` supplies generic Article/Story/Video publish-readiness checks. Articles additionally use the richer checks in `lib/server/content/newsroomArticleValidation.ts`.

### 3.2 Article write architecture

```text
Article CMS client
  -> /api/admin/articles[/id]
  -> EditorialService
  -> newsroomArticleRepository
  -> Mongo Article or articlesFile fallback
  -> activity + workflow notification + Story-link side effects
```

Key characteristics:

- Central service boundary for create, read, list, full/partial edit, workflow, delete, and revision delegation.
- Mongo/file compatibility through repository functions.
- Logical `version`, `expectedVersion`, atomic CAS, and HTTP 409 conflict contracts.
- Revision snapshots on ordinary edits; autosaves explicitly skip revision creation.
- Separate revision list/restore routes and Article edit-lock route.
- Rich structured body, SEO, editorial evidence, newsroom metadata, media metadata, featured media, breaking audio, and Story-to-Article linking.
- Activity logging for create, edit, workflow, restore, and delete.

### 3.3 Story write architecture

```text
Story CMS client
  -> /api/admin/stories[/id]
  -> route-local normalization, policy, validation and persistence
  -> Mongo Story or storiesFile fallback
  -> activity + workflow notification side effects
```

Key characteristics:

- Create/list logic is embedded in the collection route; edit/workflow/delete logic is embedded in the item route.
- Mongo/file selection is duplicated in both files and checks `process.env.MONGODB_URI` directly before attempting `connectDB()`.
- The shared workflow transition applicator is used for `PATCH` workflow actions.
- Field-level Story permissions distinguish common, link, media, reporter, copy-desk, and admin fields.
- No version, expected-version, CAS, revisions, restore, edit lease, or autosave-specific behavior.
- Story video upload, download, production metadata, reporter package metadata, copy-desk checks, and linked Article status are supported.

### 3.4 Copy Desk and queue architecture

- `/admin/work` is the canonical role-aware workbench, backed by `lib/admin/workQueue.ts` and `WorkQueueWorkbench`.
- `/admin/review-queue` reuses the same workbench with `view=review`, but is restricted to admin/super-admin.
- `/admin/content-queue` reuses it with `view=publishing`, also restricted to admin/super-admin.
- `/admin/copy-desk` is a separate server-rendered queue backed by `getNewsroomControlCenterData()`, restricted to admin/super-admin/copy-editor.
- `DeskWorkflowActions` is reused by the workbench and Copy Desk for assignment, claim/start review, copy edit, change request, ready-for-approval, approval, rejection, scheduling, publication, and optional fast publication.

---

## 4. Article Lifecycle Audit

### 4.1 Routes and surfaces

| Surface | Implementation | Behavior |
|---|---|---|
| `/admin/articles` | `page.tsx`, `ArticlesManagementClient.tsx` | Search/filter/list, workflow lanes and status, management entry point. Reporter page access is denied. |
| `/admin/articles/new` | server page, `ArticleCreatePageClient`, `ReporterArticleCreate` | Admin/copy-editor full newsroom editor; reporter receives a simplified handoff form. |
| `/admin/articles/[id]/edit` | server page, `EditArticlePageClient` | Full editor, server draft, workflow controls, activity, revision restore, edit lock and conflict handling. Reporter page access is denied. |
| Collection API | `app/api/admin/articles/route.ts` | RBAC-filtered list and draft/create/submit/direct-publish creation. |
| Item API | `app/api/admin/articles/[id]/route.ts` | Read, full edit, partial edit/autosave, workflow action, delete, CAS errors. |
| Supporting APIs | `activity`, `lock`, `revisions`, `revision restore`, TTS, translation, assist | Activity/history, collaboration safety, AI assistance, audio and media workflows. |

### 4.2 Strengths

- Centralized domain service and repository separation.
- Mongo and file-store parity is explicit and tested.
- Strong conflict behavior: versioned edits, workflow actions, deletes, and revision restores return 409 rather than silently overwrite.
- Autosave is distinguished from deliberate save: it advances the version but does not create revision noise or edit activity.
- Edit lock supports lease acquire/renew/release, expiry, and admin takeover.
- Revision snapshots include headline, summary, body/document, image, category, author, slug/history, flags, SEO, reporter/copy metadata, editorial data, and media.
- Creation supports loose drafts but gates submit/schedule/publish with richer readiness checks.
- Publishing checks breaking-audio readiness and normal public Article visibility respects publication workflow.
- SEO includes stable slug governance, prior slugs, canonical validation, sitemap control, metadata, alt/caption/credit and author presentation.
- Editor includes draft recovery, server-draft reconciliation, readiness focus links, preview, structured editing, responsive columns and several ARIA live/status patterns.

### 4.3 Gaps

| ID | Priority | Finding |
|---|---|---|
| A-01 | P0 | Reporter Article change-request loop is blocked at page and service page-key gates even though content-level reporter edit/submit permissions exist. |
| A-02 | P1 | `createDraft()` treats any unrecognized non-`draft`/non-`submit` intent as `publish`; malformed API intent should fail closed. |
| A-03 | P1 | Workflow state is committed before activity and notification side effects. An activity/notification failure can surface as an API failure after the authoritative update succeeded, inviting a retry against a newer version. |
| A-04 | P1 | `notifyWorkflowEvent()` supports detailed rejection reason, schedule time and fast-publish comment, but Article workflow calls do not pass those optional values, so notification copy can lose the most useful context. |
| A-05 | P1 | Server scheduling requires a parseable date but does not reject a past timestamp. Client validation is not a sufficient invariant. |
| A-06 | P2 | The edit client is very large and mixes composition, autosave, locks, workflow, revisions, media, preview, SEO and assistance. Decomposition is desirable only after lifecycle behavior is pinned. |

### 4.4 Article maturity

**Mature but incomplete.** The admin/copy-editor path is production-shaped; the reporter feedback/resubmit path is not reachable, which makes the overall four-role lifecycle incomplete.

---

## 5. Story Lifecycle Audit

### 5.1 Routes and surfaces

| Surface | Implementation | Behavior |
|---|---|---|
| `/admin/stories` | `app/(admin)/admin/stories/page.tsx` | Role-aware list, filtering, workflow status and edit entry. |
| `/admin/stories/new` | large client page | Draft/submit/publish intents, multi-asset media, direct video upload, reporter metadata, preview and responsive UI. |
| `/admin/stories/[id]/edit` | large client page | Role/field-aware editor, workflow controls, activity, linked Article state, media/download and copy-desk metadata. |
| Collection API | `app/api/admin/stories/route.ts` | List/create with Mongo/file branches and reporter sanitization. |
| Item API | `app/api/admin/stories/[id]/route.ts` | Read, workflow PATCH, edit PUT, delete with duplicated Mongo/file branches. |
| Supporting APIs | activity, download, story-video upload, video-production | Story package operations and activity. |

### 5.2 Strengths

- Reporters can create, save, submit, reopen, edit and resubmit their own/assigned Stories in the permitted statuses.
- Copy editors can see the submitted shared queue, claim unassigned work, edit only assigned review work, and update copy-desk fields.
- Field-level server enforcement blocks role-inappropriate Story update fields.
- Story media supports multiple normalized assets, a primary image/video, size/MIME/provider checks, direct upload verification, downloads, and production metadata.
- Reporter and copy-desk metadata are first-class and visible in Copy Desk.
- Shared workflow transitions, activity records and notification events are used for canonical PATCH actions.
- Mongo and file storage have broad behavior parity for create/list/edit/workflow.

### 5.3 Gaps

| ID | Priority | Finding |
|---|---|---|
| S-01 | P0 | No Story version/CAS contract. PUT and PATCH are last-write-wins in Mongo and file modes. |
| S-02 | P0 | Admin/super-admin can change `isPublished` through ordinary PUT. `applyLegacyPublishCompatibility()` directly changes workflow status, bypassing transitions, readiness, notifications and canonical publish activity. |
| S-03 | P0 | No Story revision snapshots, restore endpoint, edit lock, or recoverable server autosave mechanism. |
| S-04 | P1 | Draft creation requires title and thumbnail, so Story drafts cannot be intentionally incomplete. Article draft creation is loose. |
| S-05 | P1 | Create validation and workflow readiness differ: create always requires thumbnail, while generic Story publish readiness accepts thumbnail, media URL, or media assets. |
| S-06 | P1 | Story scheduling records `scheduled` and keeps `isPublished=false`; no Story scheduler or due-time public eligibility mechanism was found. A scheduled Story requires a later explicit publish action. This must either be documented as intentional package behavior or completed. |
| S-07 | P1 | Story workflow notifications omit available rejection/schedule/fast-publish detail parameters, matching the Article gap. |
| S-08 | P1 | The route duplicates normalization, persistence selection, workflow serialization, Mongo/file branches, error handling and policy orchestration; drift has already produced Article/Story safety differences. |
| S-09 | P1 | Story workflow writes also commit before notification/activity side effects finish, exposing partial-success retry ambiguity. |
| S-10 | P2 | Story new/edit pages are monolithic and repeat media, workflow and form interaction logic. Refactor only after server contracts and regression tests are fixed. |

### 5.4 Story maturity

**Functional but not collaboration-safe.** Role-aware authoring and copy-desk packaging work, but concurrency, recoverability and publication invariants are below the required editorial standard.

---

## 6. Copy Desk and Queue Audit

### 6.1 Surface ownership

| Surface | Access | Actual ownership |
|---|---|---|
| `/admin/work?view=review` | all four roles may open `/admin/work`; returned items are role-filtered | Canonical general workbench review view. Includes Article, Story, Video and E-Paper review statuses. |
| `/admin/review-queue` | admin, super-admin | Alias/dedicated shell over the same workbench review view. Copy editors cannot open this named route. |
| `/admin/content-queue` | admin, super-admin | Alias/dedicated shell over the workbench publishing view: approved/scheduled/ready-to-publish work. |
| `/admin/copy-desk` | admin, super-admin, copy-editor | Separate Story-first operational page with reporter package summaries, Story asset downloads, copy checks and `DeskWorkflowActions`. It also includes assigned/in-review/copy-edit Articles. |

### 6.2 Entry and exit

- Work enters the shared review queue at `submitted`.
- An admin may assign it, producing `assigned`.
- A copy editor can claim an unassigned submitted item with `start_review`, which assigns it to that actor and produces `in_review`.
- Assigned copy editors can start review, move to copy edit, request changes, or mark ready for approval.
- `changes_requested` returns ownership action to the creator/reporter; resubmission returns to `submitted`.
- `ready_for_approval` exits Copy Desk to admin approval.
- Admin approval produces `approved`; scheduling/publication then belongs to admin/super-admin.

### 6.3 Problems

| ID | Priority | Finding |
|---|---|---|
| C-01 | P0 | Copy Desk can request Article changes, but Article reporters cannot reopen/resubmit the returned item. |
| C-02 | P1 | Copy Desk, work-review view and `/admin/review-queue` overlap. The named “Review Queue” excludes the copy-editor role while `/admin/work?view=review` is available, producing confusing navigation and ownership. |
| C-03 | P1 | Copy Desk copy says “stories” in several places although the queue can contain Articles. |
| C-04 | P1 | The shared workbench exposes broader content types/statuses than Copy Desk, while Copy Desk exposes richer Story package/checklist details. Users must switch surfaces to get a complete view. |
| C-05 | P1 | Queue actions use Article version but Story actions cannot pass one, visually hiding the Story concurrency deficit. |
| C-06 | P2 | `/admin/review-queue` and `/admin/content-queue` are thin aliases. Retain only if the dedicated navigation labels provide measurable value; otherwise consolidate navigation while preserving URLs as redirects. |

---

## 7. Canonical Workflow Matrix

### 7.1 Transition graph and requirements

“Admin” below means both `admin` and `super_admin`. Role permission is combined with the transition graph; content ownership requirements are shown explicitly.

| From | To / action | Allowed roles | Ownership / required input | Validation and side effects |
|---|---|---|---|---|
| `draft` | `submitted` / submit | Admin; reporter owner/assignee; copy-editor explicit owner | Readiness; reporter/copy ownership | Activity; notification action has no configured event copy for submit. |
| `draft` | `scheduled` / schedule | Admin | `scheduledFor`; publication readiness | Activity; scheduled notification; Article due-time reader eligibility exists. |
| `draft` | `published` / publish | Admin | Publication readiness; breaking Article audio | Activity; published notification; public fields updated. |
| any non-published/non-archived state | `published` / fast publish | Admin | Urgent priority or breaking flag; reason >=10 characters; readiness | Approval/publish timestamps; audited comment; activity; fast-publish notification. |
| `draft` | `archived` / archive | Admin | None | Activity. |
| `submitted` | `assigned` / assign | Admin | Valid active assignee; assignment resolution requires Mongo-backed users | Activity; assignee notification; displaced-assignee notification on reassignment. |
| `submitted` | `in_review` / start review | Admin; copy editor only if unassigned | Copy editor claim self-assigns | Activity; creator notification. |
| `submitted` | `changes_requested` / request changes | Admin | Rejection/change reason | Activity; creator/assignee notification. |
| `submitted` | `rejected` / reject | Admin | Rejection reason | Activity; creator/assignee notification. |
| `assigned` | `assigned` / reassign | Admin | Valid active assignee | Activity; new and displaced assignee notifications. |
| `assigned` | `in_review` / start review | Admin; assigned copy editor | Copy editor must be assignee | Activity; creator notification. |
| `assigned` | `changes_requested` / request changes | Admin; assigned copy editor | Reason | Activity; creator/assignee notification. |
| `assigned` | `rejected` / reject | Admin | Reason | Activity; notification. |
| `in_review` | `assigned` / reassign | Admin | Valid assignee | Activity; notification. |
| `in_review` | `copy_edit` / move to copy edit | Admin; assigned copy editor | Copy editor must be assignee | Activity; no dedicated notification event copy. |
| `in_review` | `ready_for_approval` / mark ready | Admin; assigned copy editor | Copy editor must be assignee | Activity; active admins notified. |
| `in_review` | `changes_requested` / request changes | Admin; assigned copy editor | Reason | Activity; notification. |
| `in_review` | `rejected` / reject | Admin | Reason | Activity; notification. |
| `copy_edit` | `assigned` / reassign | Admin | Valid assignee | Activity; notification. |
| `copy_edit` | `ready_for_approval` / mark ready | Admin; assigned copy editor | Copy editor must be assignee | Activity; admins notified. |
| `copy_edit` | `changes_requested` / request changes | Admin; assigned copy editor | Reason | Activity; notification. |
| `copy_edit` | `rejected` / reject | Admin | Reason | Activity; notification. |
| `changes_requested` | `submitted` / submit | Admin; reporter owner/assignee; copy-editor explicit owner | Readiness | Activity; no submit event notification. |
| `changes_requested` | `archived` / archive | Admin | None | Activity. |
| `ready_for_approval` | `assigned` / reassign | Admin | Valid assignee | Activity; notification. |
| `ready_for_approval` | `approved` / approve | Admin | None beyond transition | Activity; creator/assignee notification. |
| `ready_for_approval` | `changes_requested` / request changes | Admin | Reason | Activity; notification. |
| `ready_for_approval` | `rejected` / reject | Admin | Reason | Activity; notification. |
| `approved` | `scheduled` / schedule | Admin | `scheduledFor`; readiness | Activity; notification. |
| `approved` | `published` / publish | Admin | Readiness; breaking Article audio | Activity; notification; public state. |
| `scheduled` | `published` / publish | Admin | Readiness; breaking Article audio | Activity; notification. |
| `scheduled` | `draft` | Admin | Transition exists, but there is no named UI action mapped to this target | Potential stale/unreachable transition. |
| `published` | `archived` / archive | Admin | None | Activity. |
| `published` | `draft` | Admin | Transition exists, but no named action maps to draft | Potential stale/unreachable transition. |
| `rejected` | `draft` | Admin | Transition exists, but no named action maps to draft | Potential stale/unreachable transition. |
| `rejected` | `submitted` / submit | Admin | Readiness | Activity. Reporter is not allowed because reporter-editable statuses omit `rejected`. |

### 7.2 State-machine inconsistencies

- The transition graph contains three transitions with no corresponding action: `scheduled -> draft`, `published -> draft`, and `rejected -> draft`.
- `rejected -> submitted` exists, but reporter edit/transition policy only treats `draft` and `changes_requested` as reporter-editable, so rejected reporter work cannot be corrected/resubmitted by its creator.
- Admin permission is intentionally broad, but transition legality still normally gates actions. Story `isPublished` PUT bypasses that legality.
- `submit` and `move_to_copy_edit` have no notification event mapping, despite being meaningful handoffs.
- Fast publish intentionally bypasses the ordinary transition graph, but still requires admin role, urgency/breaking condition, readiness, and an audited reason.

---

## 8. Four-Role Matrix

| Capability | super_admin | admin | copy_editor | reporter |
|---|---|---|---|---|
| List Articles page/API | Yes | Yes | Yes, visibility filtered | **No** |
| Create Article | Full | Full | Full | Simplified submit-only handoff |
| Edit Article page/API | Yes | Yes | Own draft or assigned review work | **No due page/service gate**, despite lower-level owner policy |
| List Stories | Yes | Yes | Submitted shared queue, own/assigned | Own/assigned |
| Create Story | Yes | Yes | No | Yes |
| Edit Story | All fields | All fields | Common/link/copy fields while assigned; own draft common fields | Common/media/reporter fields while own/assigned draft or changes requested |
| Assign/reassign | Yes | Yes | No | No |
| Claim unassigned submitted | Yes through broad admin action | Yes | Yes | No |
| Copy-edit actions | Yes | Yes | Assigned item only | No |
| Approve/reject | Yes | Yes | No | No |
| Schedule/publish | Yes | Yes | No | No |
| Fast publish | Yes | Yes | No | No |
| Delete Article/Story | Yes | Yes | No | No |
| Copy Desk page | Yes | Yes | Yes | No |
| Named Review Queue | Yes | Yes | No | No |
| Content Queue | Yes | Yes | No | No |

RBAC conclusions:

- Server-side checks exist for the primary paths; enforcement is not merely client-side.
- Article reporter policy is internally inconsistent: content helpers allow reporter ownership workflows, but page/API page-key checks block them.
- Story field restrictions are enforced server-side, but the admin `isPublished` field is an intentional compatibility seam that is unsafe for the canonical workflow.
- UI action visibility in `DeskWorkflowActions` broadly mirrors server permissions, but must never substitute for server validation.

---

## 9. Article vs Story Parity Matrix

| Capability | Classification | Evidence / difference |
|---|---|---|
| Create | PASS | Both have role-aware creation and Mongo/file persistence. |
| Edit | PARTIAL | Both edit; Article reporter loop is blocked; Story lacks CAS/recovery. |
| Draft save | PARTIAL | Article supports loose/server drafts; Story requires title + thumbnail even for draft. |
| Submit | PARTIAL | Shared transition; Article reporter can initially submit but cannot later resubmit. |
| Assign/reassign | PASS | Shared permission/action semantics; Mongo-backed active assignee required. |
| Start review | PASS | Shared transitions and copy-editor claim behavior. |
| Copy edit | PASS | Shared status/actions; Story exposes richer dedicated copy metadata. |
| Request changes | PARTIAL | Action exists for both; Article reporter cannot act on returned work. |
| Ready for approval | PASS | Shared action and admin notification target. |
| Approve | PASS | Admin/super-admin for both. |
| Reject | PARTIAL | Both reject; rejected creator recovery is not role-complete. |
| Schedule | PARTIAL | Both store schedule; Article readers honor due scheduled content, Story has no automatic release mechanism. |
| Publish | PARTIAL | Canonical action exists; Story PUT has a bypass. |
| Fast publish | PASS | Shared validator and action; both lack detailed notification arguments. |
| Preview | PASS | Both editors provide preview experiences. |
| Activity | PASS | Both have dedicated activity storage/routes and workflow actor/status metadata. |
| Notifications | PARTIAL | Shared events work; submit/copy-edit absent and detailed reason/time arguments are not forwarded. |
| Autosave | MISSING (Story) | Article server autosave + recovery; no Story equivalent. |
| Revision history | MISSING (Story) | Article snapshots/list/restore; Story none. |
| Concurrency | MISSING (Story) | Article CAS and lock; Story last-write-wins. |
| Media | DIFFERENT BY DESIGN | Article has featured/rich media and audio; Story is an asset package with image/video upload/download. |
| SEO | DIFFERENT BY DESIGN | Public Articles require full SEO/slug governance; Story packages have links but no equivalent public SEO surface. |
| Validation | PARTIAL | Shared concepts, divergent draft and publish requirements; Story bypass exists. |
| Loading/error states | PARTIAL | Both provide feedback, but partial-success side effects and Story conflicts are not represented safely. |
| Accessibility | PARTIAL | Labels, live regions, keyboard-capable native controls and queue focus handling exist; large conditional editors need focused keyboard/focus regression checks. |
| Responsive behavior | PASS/PARTIAL | Both use mobile-first grids and responsive action layouts; full tablet/mobile workflow QA is not currently evidenced end-to-end. |

---

## 10. Editor UX Findings

### Strengths

- Article editor has strong field grouping, structured compose tools, inspector tabs, readiness links that focus blocked fields, preview, draft status, autosave/recovery feedback, workflow visibility and responsive layouts.
- Story editor separates media package, core copy, reporter details and copy-desk details by role; upload progress and previews are visible.
- Workflow feedback explains current state and next expected action.
- Queue drawer includes dialog semantics, focus return/escape behavior and readable readiness checks.
- Destructive deletion is limited to admin roles; workflow reason panels make changes/rejection explicit.

### Phase 3.7 UX problems

- Reporter Article handoff has no usable “changes requested” continuation experience.
- Save state confidence is asymmetric: Article exposes server draft/version/recovery; Story only reports request success/failure.
- Story users receive no concurrency warning, lock identity, conflict comparison, or recovery choice.
- Copy Desk naming is Story-centric for mixed Article/Story results.
- Review navigation has three overlapping entry points with different role gates and detail density.
- Rejection and changes-requested are distinct statuses but the correction path is unclear, particularly for `rejected`.
- Schedule inputs do not consistently explain timezone or enforce a future time at the server boundary.
- Fast publish is appropriately separated visually, but notification recipients may not receive its reason.
- Large editors need explicit keyboard traversal, focus-on-error, sticky action behavior and small-screen tests rather than further visual redesign.

---

## 11. Validation and Publish Readiness

| Operation | Article | Story |
|---|---|---|
| Draft create | Length/format validation; core fields may be incomplete | Requires title and thumbnail; media metadata checks |
| Submit | Rich Article-assist readiness: headline, summary/body/byline/image/slug and newsroom/editorial checks | Workflow PATCH uses generic readiness: title, category and at least one media source; create still requires thumbnail |
| Approve | No new content-readiness validation | No new content-readiness validation |
| Schedule | Rich readiness; `scheduledFor` required but future time not server-enforced | Generic readiness; `scheduledFor` required but future time not server-enforced |
| Publish | Rich readiness; breaking Article requires reusable audio | Generic title/category/media readiness |
| Fast publish | Publish readiness plus admin + urgency/breaking + >=10-character reason | Generic readiness plus admin + urgency + >=10-character reason |

Key gaps:

- Approval can mark content approved without re-running readiness; enforcement occurs later at schedule/publish.
- Story ordinary PUT publication bypasses all publish-readiness checks.
- Article full update requires core fields, while partial/autosave supports incomplete changes; this is coherent but must remain test-pinned.
- Story draft validation is stricter than its workflow model and prevents progressive draft authoring.
- Required Story fields are duplicated between create route validation, media validation, generic readiness and client checks.
- Unknown Article create intent fails open to publish for authorized desk roles.

---

## 12. Autosave, Revisions and Concurrency

### Article

- `version` exists in Mongo and file records; legacy records resolve to logical version 1.
- Full edits, partial edits, workflow actions, deletes and revision restores participate in CAS.
- Ordinary edits create bounded revision snapshots; autosaves skip snapshots and activity noise.
- Editor server-draft recovery distinguishes the current tab from another editing session and blocks workflow until recovery is resolved.
- Edit locks exist in Mongo and file storage with TTL renewal, release, expiry cleanup and admin takeover.

### Story

- No version field in model/file type.
- Mongo uses `findByIdAndUpdate`; file updates overwrite by ID. Neither asserts the previously read state.
- No revision array, revision service, list/restore route, edit lock or autosave marker.
- Activity history is an audit trail of actions, not a recoverable content history.

### Required Phase 3.7 work

Add a Story version/CAS contract first, then bounded revision snapshots and restore, then edit lease/autosave UX. Reuse Article semantics where content-shape differences allow, without forcing Article SEO/document fields into Story snapshots.

---

## 13. Activity and Notifications

### Current integration

- Article and Story creation records creator, intent, initial status and priority.
- Workflow actions record actor, from/to status, assignee, priority, due/schedule time, rejection reason and comment metadata.
- Article deliberate edits and Story saves record activity; Article autosave intentionally does not.
- Restore/delete and legacy publication activity recovery exist for Articles; Story activity recovery derives status but not content versions.
- Workflow notifications cover assign/reassign, review started, changes requested, ready for approval, approved, rejected, scheduled, published and fast-published.
- Assignment targets the assignee; review start targets creator; changes target creator/assignee; ready-for-approval targets active admins; later events target creator/assignee. The actor is excluded.

### Gaps

- No notification event for submit or move-to-copy-edit.
- Article and Story callers do not forward `rejectionReason`, `scheduledFor`, or `comment`, even though the notification service can render them.
- Notification/activity failures after persistence can cause an error response for an already-completed transition.
- Side effects are sequential but not outboxed/retriable; Phase 3.7 should at minimum make API success reflect authoritative persistence and make notification failure observable/retryable.
- Rejection reason is recorded, but rejected reporter recovery permissions are incomplete.

---

## 14. Test Coverage

### Existing strengths

- Workflow graph and requirements: `newsroom-workflow-transitions.test.ts`, `fast-publish-workflow.test.ts`, `workflow-readiness.test.ts`, `workflow-feedback.test.ts`.
- Article API, CAS, readiness, revisions and compatibility: `tests/api/admin-article-*.test.ts`, `article-model-revisions.test.ts`, `articles-file-concurrency.test.ts`, `article-workflow-cas-clients.test.ts`.
- Article locks/draft recovery: `article-locks-api.test.ts`, `article-locks-file.test.ts`, `article-edit-draft-safety.test.ts`, `use-article-server-draft.test.tsx`.
- Story route/permissions/media/video: `admin-story-route.test.ts`, `admin-story-video-*.test.ts`, `story-editing-permissions.test.ts`, `story-media.test.ts`.
- Queue/actions/accessibility: `work-queue-*`, `admin-work-queue-refinement`, `queue-integration-workflow`, `desk-workflow-actions-accessibility`, workflow badge/timeline tests.
- Notifications: event, storage, bell and admin notification route tests.
- Public Article publication filtering and scheduled eligibility have dedicated tests.

### Highest-risk missing regression coverage

1. Reporter-owned Article `changes_requested -> edit -> submit` end-to-end page/API path.
2. Reporter and copy-editor behavior for `rejected`, including the intended recovery decision.
3. Story simultaneous PUT/PATCH conflicts in both Mongo and file stores.
4. Story ordinary PUT cannot publish/unpublish outside canonical workflow.
5. Story draft can save incomplete content under the agreed draft contract.
6. Story revision creation, restore, bounded history and CAS after implementation.
7. Story lock/autosave recovery and cross-tab/session behavior after implementation.
8. Past/invalid scheduling rejection at the server for both content types.
9. Notification payloads include rejection reason, schedule time and fast-publish reason.
10. Persisted transition remains a success when notification delivery fails, with failure captured for retry/operations.
11. Copy-editor navigation parity among Copy Desk, Work review, and named Review Queue.
12. Focus-on-error, keyboard-only workflow panels and narrow viewport editor actions for both editors.

---

## 15. Duplication and Legacy Findings

- Story collection/item routes duplicate domain service, repository, fallback, normalization, serialization and errors that Articles centralize.
- `applyLegacyPublishCompatibility()` is a direct publication bypass and should be removed from CMS mutation behavior or isolated behind a narrowly tested migration adapter.
- `isPublished` and `workflow.status` remain dual Story authorities. Response mapping favors workflow, while PUT can rewrite workflow from the boolean.
- Article readiness is split across assist/readiness modules and route normalization; Story readiness is split across create validation, media validation and generic readiness.
- Three review-oriented CMS surfaces duplicate queue concepts.
- Transition graph entries to `draft` have no corresponding action and appear legacy/unreachable.
- Article route retains E-Paper compatibility branching. It is outside Phase 3.7 unless a change to Article routing would break it.
- Direct route-level Mongoose/file logic for Story is an abstraction inconsistency and the primary source of parity drift.

---

## 16. Prioritized Findings

### P0 — must fix in Phase 3.7

- A-01/C-01: Make reporter Article changes-requested edit/resubmit reachable and consistently guarded.
- S-01: Add Story version/CAS and conflict contracts for edit, workflow and delete.
- S-02: Eliminate ordinary Story `isPublished` workflow bypass.
- S-03: Add Story recoverable revisions and collaboration protection appropriate to its editor.

### P1 — should fix in Phase 3.7

- Fail closed on unknown create/workflow intent.
- Align Story draft and publish validation; centralize server validation.
- Decide and enforce Story scheduling semantics.
- Reject past schedules on the server.
- Complete notification event/context coverage and handle side-effect failure honestly.
- Resolve rejected-content recovery semantics for reporters/copy editors.
- Consolidate queue ownership/navigation and make mixed content labels accurate.
- Extract Story editorial service/repository boundaries with Mongo/file parity.
- Add focused keyboard, focus, error and responsive regression coverage.

### P2 — useful but defer

- Decompose the very large Article and Story client editors after behavior is pinned.
- Broader design-system polish beyond workflow clarity/accessibility.
- Queue URL consolidation if keeping aliases is operationally useful.
- General notification outbox architecture beyond the minimum reliable retry/observability needed for Phase 3.7.

### Out of scope

- E-Paper/E-Magazine lifecycle or production redesign.
- Reader/homepage redesign.
- Video editor redesign except shared workflow regressions caused by Phase 3.7 changes.
- Social, email, push, OCR, TTS, n8n or live automation execution.
- Analytics redesign.
- Production data migration, production credentials, production publication or live integrations.

---

## 17. Proposed Phase 3.7 Subphases

### 3.7A — Canonical workflow and server invariants

**Scope**

- Resolve reporter Article page/service mismatch and rejected-content recovery policy.
- Remove Story direct publication bypass.
- Fail closed on unknown intent/action inputs.
- Enforce future schedule timestamps.
- Pin the canonical transition/action matrix.

**Affected systems/files**

- `lib/auth/permissions.ts`
- Article page guards and `EditorialService`
- Story item/collection routes or extracted policy/service
- `lib/workflow/transitions.ts`, validation helpers

**Acceptance criteria**

- Reporter can open and resubmit an owned/assigned Article only in approved editable states.
- No ordinary Story edit can change publication state.
- Every state transition is reachable through a named action or removed/documented.
- Invalid intent and past schedule fail with stable 4xx responses.

**Tests**

- Four-role Article/Story API matrix; reporter return loop; Story bypass regression; transition table; schedule boundary.

**Dependencies/risks**

- Must preserve Phase 3.6 page/API RBAC and legacy Article/E-Paper compatibility.

### 3.7B — Story service boundary and concurrency

**Scope**

- Extract Story editorial service/repository seams.
- Add logical version and atomic CAS for Mongo/file edit, workflow and delete.
- Return Article-compatible 409 conflict metadata.

**Affected systems/files**

- Story model/file store/routes
- New Story service/repository/type/validation modules
- Story list/edit clients and shared desk actions

**Acceptance criteria**

- Every Story mutation advances one version atomically.
- Stale Mongo and file mutations fail without content/activity/notification changes.
- Queue actions send expected Story version.

**Tests**

- Mongo/file CAS, legacy version 1, simultaneous save/action/delete, client conflict messaging.

**Dependencies/risks**

- 3.7A canonical action contract; careful compatibility for existing Story records without version.

### 3.7C — Story revisions, autosave and edit lease

**Scope**

- Add bounded Story snapshots and restore.
- Add explicit server autosave behavior and recovery.
- Add Story edit lease with admin takeover consistent with Article policy.

**Affected systems/files**

- Story model/file store/service/APIs/editor
- Shared or Story-specific revision/lock helpers

**Acceptance criteria**

- Deliberate saves create recoverable snapshots; autosaves do not flood history.
- Restore is CAS-protected and itself preserves the pre-restore state.
- Concurrent editors see lock identity/expiry and cannot silently overwrite.

**Tests**

- Snapshot completeness/bounds, restore CAS, lock TTL/takeover, cross-tab recovery, Mongo/file parity.

**Dependencies/risks**

- Requires 3.7B version contract. Story media snapshot size must remain metadata-only.

### 3.7D — Copy Desk and editor lifecycle UX

**Scope**

- Make reporter/copy-editor return paths explicit.
- Reconcile Copy Desk, Work review and Review Queue ownership/navigation.
- Align mixed-content labels, action hierarchy, validation focus, schedule/timezone help and conflict recovery.

**Affected systems/files**

- Copy Desk page, WorkQueueWorkbench, DeskWorkflowActions
- Article/Story list and edit clients
- navigation and workflow feedback components

**Acceptance criteria**

- Each role has one obvious primary work entry and can reach every permitted next action.
- Mixed queues label Articles and Stories accurately.
- Error/conflict/recovery states are keyboard accessible and usable at phone/tablet widths.

**Tests**

- Role navigation, action visibility, focus/escape/error behavior, responsive Playwright checks.

**Dependencies/risks**

- Requires stable 3.7A-C APIs; avoid unrelated CMS visual redesign.

### 3.7E — Activity, notification and parity closure

**Scope**

- Forward workflow context to notifications; decide submit/copy-edit events.
- Make post-persistence side-effect failure observable and safely retryable.
- Close validation parity and final regression matrix.

**Affected systems/files**

- workflow notification service/callers/storage/jobs
- Article/Story activity services
- readiness validators and focused tests/docs

**Acceptance criteria**

- Required recipients receive actor-appropriate events with reasons/times where applicable.
- A successful authoritative transition is never misreported as an unqualified failed mutation solely because a secondary notification failed.
- Article/Story parity matrix has no unresolved P0 and every intentional difference is documented/tested.

**Tests**

- Event recipient/dedupe/context tests, notification-failure behavior, full role-transition matrix, focused UI/API regression suites, typecheck and production build.

**Dependencies/risks**

- Requires canonical transition and concurrency contracts from 3.7A-B.

---

## 18. Phase 3.7 Completion Acceptance Criteria

Phase 3.7 is complete only when:

1. All four roles can complete every permitted Article/Story lifecycle path without a page/API mismatch.
2. Reporter-owned changes-requested content has a tested edit/resubmit path.
3. No endpoint can publish, unpublish, schedule, approve or reject outside the canonical action and validation policy.
4. Article and Story edit/workflow/delete mutations have conflict protection in Mongo and file modes.
5. Story has bounded, restorable history and collaboration-safe edit recovery.
6. Activity captures creator, assignment/reassignment, reviewer, changes, approval, rejection reason, schedule and publication actor.
7. Workflow notifications have tested recipients, dedupe and relevant context.
8. Copy Desk and queue navigation has clear ownership and no role dead ends.
9. Draft, submit, approval, schedule, publish and fast-publish validation is server-authoritative and documented.
10. Focused Vitest coverage, typecheck, relevant browser checks and `npm run build:ci` pass with no application-source regression.

---

## 19. Audit Conclusion

Articles provide the stronger implementation baseline and should be reused selectively for Story concurrency and recoverability. The shared workflow model is viable; the primary work is to make its permissions reachable, remove bypasses, and give Story mutations the same safety properties as Article mutations.

The repository is ready for a Phase 3.7 implementation plan in the proposed order. No implementation was performed by this audit.
