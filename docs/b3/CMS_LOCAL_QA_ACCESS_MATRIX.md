# CMS Local QA Access Matrix

This document is derived from `lib/auth/permissions.ts`. `PAGE_ACCESS` remains the product authority and is not changed by the local QA harness.

## Local QA accounts

The provisioner creates or refreshes only these reserved local identities:

| Identity | Role | Password environment variable |
| --- | --- | --- |
| `qa-super-admin@localhost.example` | Super Admin | `LOKSWAMI_QA_SUPER_ADMIN_PASSWORD` |
| `qa-admin@localhost.example` | Admin | `LOKSWAMI_QA_ADMIN_PASSWORD` |
| `qa-copy-editor@localhost.example` | Copy Editor | `LOKSWAMI_QA_COPY_EDITOR_PASSWORD` |
| `qa-reporter@localhost.example` | Reporter | `LOKSWAMI_QA_REPORTER_PASSWORD` |

Run from the repository root after configuring a loopback MongoDB database whose name clearly contains `dev`, `local`, `qa`, `test`, or `sandbox`:

```powershell
$env:LOKSWAMI_CMS_QA='true'
$env:LOKSWAMI_CMS_QA_DB_NAME='lokswami_cms_qa'
$env:LOKSWAMI_QA_SUPER_ADMIN_PASSWORD='<local password>'
$env:LOKSWAMI_QA_ADMIN_PASSWORD='<local password>'
$env:LOKSWAMI_QA_COPY_EDITOR_PASSWORD='<local password>'
$env:LOKSWAMI_QA_REPORTER_PASSWORD='<local password>'
npm run cms:qa:provision
```

The command refuses production, remote MongoDB, unnamed or ambiguously named databases, mismatched database confirmation, missing opt-in, missing/short passwords, and collisions with accounts that do not have the exact reserved QA name and login ID. It never prints passwords or hashes. Re-running it is idempotent and restores each reserved account's canonical role, active state, and password. There is no reset command.

## Canonical page matrix

`YES` and `NO` below are direct transcriptions of `PAGE_ACCESS`.

| Page key | Label | Super Admin | Admin | Copy Editor | Reporter |
| --- | --- | :---: | :---: | :---: | :---: |
| `dashboard` | Dashboard | YES | YES | YES | YES |
| `work_queue` | Work Queue | YES | YES | YES | YES |
| `notifications` | Notifications | YES | YES | YES | YES |
| `my_work` | My Work | NO | YES | YES | YES |
| `review_queue` | Review Queue | YES | YES | NO | NO |
| `assignments` | Assignments | YES | YES | NO | NO |
| `content_queue` | Content Queue | YES | YES | NO | NO |
| `push_alerts` | Push Alerts | YES | YES | NO | NO |
| `copy_desk` | Copy Desk | YES | YES | YES | NO |
| `articles` | Articles | YES | YES | YES | NO |
| `article_create` | Create Article | YES | YES | YES | YES |
| `article_edit` | Edit Article | YES | YES | YES | NO |
| `stories` | Stories | YES | YES | YES | YES |
| `story_create` | Create Story | YES | YES | NO | YES |
| `story_edit` | Edit Story | YES | YES | YES | YES |
| `videos` | Videos | YES | YES | YES | NO |
| `video_create` | Create Video | YES | YES | NO | NO |
| `video_edit` | Edit Video | YES | YES | YES | NO |
| `social_posts` | Social Posts | YES | YES | YES | NO |
| `epapers` | E-Papers | YES | YES | YES | NO |
| `epaper_create` | Create E-Paper | YES | YES | NO | NO |
| `epaper_edit` | Edit E-Paper | YES | YES | YES | NO |
| `epaper_page_edit` | Edit E-Paper Page | YES | YES | YES | NO |
| `media` | Media | YES | YES | YES | YES |
| `polls` | Polls | YES | YES | NO | NO |
| `categories` | Categories | YES | YES | NO | NO |
| `contact_messages` | Contact Messages | YES | YES | NO | NO |
| `ai_ops` | AI Ops | YES | YES | NO | NO |
| `settings` | Settings | YES | NO | NO | NO |
| `newsroom_settings` | Newsroom Settings | YES | YES | NO | NO |
| `revenue` | Revenue & Ads Control | YES | NO | NO | NO |
| `team` | Team | YES | YES | NO | NO |
| `users` | Users & Subscribers | YES | YES | NO | NO |
| `analytics` | Analytics | YES | YES | NO | NO |
| `business_value` | Business Value | YES | NO | NO | NO |
| `audit_log` | Audit Log | YES | NO | NO | NO |
| `permission_review` | Permission Review | YES | NO | NO | NO |
| `operations_center` | Operations Center | YES | YES | NO | NO |
| `operations_diagnostics` | Operations Diagnostics | YES | NO | NO | NO |

Allowed/denied totals across the 39 page keys:

| Role | Allowed | Denied |
| --- | ---: | ---: |
| Super Admin | 38 | 1 |
| Admin | 33 | 6 |
| Copy Editor | 17 | 22 |
| Reporter | 9 | 30 |

The Super Admin exception is `my_work`, which is intentionally absent from that role in the current frozen map.

## Route inventory

| Route | Page key / policy | Direct page enforcement | Sidebar |
| --- | --- | --- | --- |
| `/admin` | `dashboard` | Server redirect | Shown |
| `/admin/work` | `work_queue` | `WorkQueuePage` server guard | Shown |
| `/admin/notifications` | `notifications` | Server redirect | Not listed |
| `/admin/my-work` | `my_work` | `WorkQueuePage` server guard | Not listed |
| `/admin/review-queue` | `review_queue` | `WorkQueuePage` server guard | Not listed |
| `/admin/assignments` | `assignments` | `WorkQueuePage` server guard | Not listed |
| `/admin/content-queue` | `content_queue` | `WorkQueuePage` server guard | Not listed |
| `/admin/push-alerts` | `push_alerts` | Server redirect | Shown when allowed |
| `/admin/copy-desk` | `copy_desk` | Server redirect | Shown when allowed |
| `/admin/articles` | `articles` | Server redirect | Shown when allowed |
| `/admin/articles/new` | `article_create` | Server redirect | Sidebar entry is Reporter-only |
| `/admin/articles/[id]/edit` | `article_edit` | Server redirect | Detail route |
| `/admin/stories` | `stories` plus content scope | Client/API policy only | Shown when allowed |
| `/admin/stories/new` | `story_create` / `canCreateContent` | API policy only | Detail route |
| `/admin/stories/[id]/edit` | `story_edit` plus ownership/assignment | API policy only | Detail route |
| `/admin/videos` | `videos` plus content scope | API policy only | Shown when allowed |
| `/admin/videos/new` | `video_create` / `canCreateContent` | API policy only | Detail route |
| `/admin/videos/[id]/edit` | `video_edit` plus content scope | API policy only | Detail route |
| `/admin/social-posts` | `social_posts` | Client denial plus API policy | Shown when allowed |
| `/admin/epapers` and `/admin/emagazines` | `epapers` | Domain/API policy only | Both shown when allowed |
| `/admin/epapers/new` and `/admin/emagazines/new` | `epaper_create` | Domain/API policy only | Detail route |
| `/admin/epapers/[id]` and `/admin/emagazines/[id]` | `epaper_edit` | Domain/API policy only | Detail route |
| `/admin/epapers/[id]/page/[pageNumber]` and E-Magazine equivalent | `epaper_page_edit` | Domain/API policy only | Detail route |
| `/admin/media` | `media` plus record/action policy | API policy only | Shown to all four roles |
| `/admin/polls` | `polls` | Server redirect | Shown when allowed |
| `/admin/categories` | `categories` | Mutation API policy; direct page guard gap | Shown when allowed |
| `/admin/contact-messages` | `contact_messages` | API policy only | Shown when allowed |
| `/admin/ai` | `ai_ops` | Service/API policy only | Shown when allowed |
| `/admin/settings` | `settings` | Server redirect | Shown when allowed |
| `/admin/settings/newsroom` | `newsroom_settings` | Server redirect | Shown when allowed |
| `/admin/settings/elections` | `newsroom_settings` | API policy only | Shown as Elections when allowed |
| `/admin/revenue` | `revenue` | Server redirect | Shown when allowed |
| `/admin/team` | `team` | Server redirect | Shown when allowed |
| `/admin/users` | `users` | Server redirect | Shown when allowed |
| `/admin/analytics` | `analytics` | Server redirect | Shown when allowed |
| `/admin/analytics/business-value` | `business_value` | Parent server layout redirect | Shown when allowed |
| `/admin/audit-log` | `audit_log` | Server redirect | Shown when allowed |
| `/admin/permission-review` | `permission_review` | Server redirect | Shown when allowed |
| `/admin/operations` | `operations_center` | Server redirect | Shown when allowed |
| `/admin/api-docs` | `operations_center` | Server redirect | Not listed |
| `/admin/operations-diagnostics` | `operations_diagnostics` | Server redirect | Shown when allowed |

All `/admin/*` pages also inherit the group layout's authenticated, active, canonical-admin-role check. That broad check is not a substitute for each page key's direct route guard.

## Current mismatches and nuances

- Several client pages rely on API/domain authorization and do not reject a denied direct page request before rendering. This affects Stories, Videos, E-Paper/E-Magazine, Contact Messages, AI Ops, Elections, and Categories. Browser QA must test direct URLs, not only hidden navigation.
- Categories POST and DELETE enforce the canonical `categories` management policy. The authenticated GET remains available because the separately allowed Article Create workflow uses it to populate category choices. The direct `/admin/categories` page itself has no dedicated server guard, so a denied role can render its read-only shell/list if navigated directly; this is flagged rather than changing the frozen RBAC contract in this harness task.
- The sidebar uses `PAGE_ACCESS`, but `Article Create` adds a Reporter-only visibility filter even though all four roles are allowed by `PAGE_ACCESS`. Admin, Copy Editor, and Super Admin can reach creation through the Articles workflow/direct URL.
- Notifications, My Work, Review Queue, Assignments, and Content Queue have real routes and page keys but no dedicated sidebar entries. They are reached through workflow surfaces.
- E-Magazine routes intentionally reuse the E-Paper page keys and components; there are no separate E-Magazine keys in `PAGE_ACCESS`.
- `/admin/api-docs` reuses `operations_center`; Elections reuses `newsroom_settings`.
- The AI Ops page key allows Admin and Super Admin. The TTS service intentionally gives Copy Editors read access to relevant audio assets through their Articles/E-Papers permissions, while cleanup/revalidation remains Admin/Super Admin and TTS settings remains Super Admin-only.

## Manual role QA

- Super Admin: `/admin`, `/admin/settings`, `/admin/audit-log`, `/admin/permission-review`; confirm `/admin/my-work` is denied by the frozen map.
- Admin: `/admin/review-queue`, `/admin/analytics`, `/admin/operations`; confirm `/admin/settings` and `/admin/audit-log` redirect.
- Copy Editor: `/admin/copy-desk`, `/admin/articles`, an assigned `/admin/articles/[id]/edit`, and assigned E-Paper edit/page routes; confirm `/admin/videos/new` and `/admin/settings` are denied at the effective server/API boundary.
- Reporter: `/admin/my-work`, `/admin/articles/new`, `/admin/stories`, `/admin/stories/new`, `/admin/media`; confirm `/admin/review-queue`, `/admin/articles`, `/admin/videos/new`, and `/admin/settings` are denied.

For every denied case, verify both the sidebar state and direct navigation. A page that renders a shell but receives `403` from its API is a route-guard gap, even when the underlying data or mutation remains protected.
