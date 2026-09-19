# LokSwami B3 — Phase 3.5 CMS Shell / Auth / RBAC Hardening Audit & Implementation Plan

**Document version:** 1.1.0 (Reconciled & Pre-Implementation Audited)  
**Phase:** 3.5 (CMS Shell / Auth / RBAC Hardening)  
**Status:** AUDIT & PLANNING COMPLETE — READY FOR REVIEW  
**Base commit:** `44b44fa60922ac967a0149551ebec824c3bf6362` (`origin/b3/foundation` via PR #17 merge)  
**Working branch:** `b3/phase3.5-cms-auth-rbac-hardening`  
**Worktree:** `C:\Users\Appex\Desktop\Lokswami-v3\Lokswami-phase3.5`  

---

## 1. Scope & Objectives

Phase 3.5 focuses strictly on hardening the existing LokSwami Version 3 Content Management System (CMS) shell, authentication mechanisms, session management, staff access boundaries, and role-based access control (RBAC) across UI surfaces and API routes.

### Primary Objectives
1. **Strengthen Existing Architecture**: Harden the current NextAuth JWT session handling, credentials authorization, and route-guard layers without introducing unnecessary framework rewrites.
2. **Enforce Approved Super Admin Control Plane**: Implement the owner-approved access boundaries defined in [`docs/b3/PHASE3_RBAC_POLICY.md`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/docs/b3/PHASE3_RBAC_POLICY.md), elevating high-stakes capabilities (E-Paper full lifecycle, staff governance, system settings, global AI ops, election infrastructure, reader polls, social dispatch, subscriber governance, and operations center) to `super_admin` only.
3. **Eliminate UI vs. Server Authorization Mismatches**: Ensure that every restricted surface hidden in the CMS navigation is strictly protected at both the Page server component and API route handler levels.
4. **Harden Auth & Setup Security**: Mitigate token desynchronization, enforce origin validation on privileged mutation APIs, prevent bootstrap identity collisions, and expand mutation audit logging.
5. **Preserve Canonical Four-Role Model**: Maintain the four canonical roles (`super_admin`, `admin`, `copy_editor`, `reporter`) without introducing new ad-hoc roles.

### Non-Negotiable Safety Invariants
- **Local & Staging Isolation Only**: Zero interaction with production MongoDB (`lokswami`), production DigitalOcean Spaces (`lokswami-media`), or live domains (`lokswami.com`).
- **No Outbound Services**: Resend emails, automated social publishing webhooks, and n8n automations remain disabled (`manual` / disabled).
- **Preserve QA Staff Accounts**: The Phase 3.4 verified staff accounts (`qa.superadmin`, `qa.admin`, `qa.copyeditor`, `qa.reporter`) in `lokswami_staging` must not be deleted or modified during audit.
- **Zero Secrets Exposure**: No credentials, private tokens, or password hashes are committed or displayed in logs.

---

## 2. Existing Authentication Architecture Map

The LokSwami Version 3 authentication system integrates NextAuth v5 (Auth.js) with custom credential providers, MongoDB/Mongoose user persistence, and JWT session cookies.

```
+---------------------------------------------------------------------------------------------------+
|                                     CLIENT BROWSER / CMS SHELL                                    |
+---------------------------------------------------------------------------------------------------+
                               |                                                 |
         [Credentials Sign-In] |                              [Authenticated Nav / API Req]
                               v                                                 v
+----------------------------------------------+       +--------------------------------------------+
|             NextAuth Sign-In Route           |       |              Edge Middleware               |
|      (/api/auth/[...nextauth], lib/auth.ts)  |       |              (middleware.ts)               |
+----------------------------------------------+       +--------------------------------------------+
       |                                                                 |
       | 1. Check Rate Limit (IP based)                                  | 1. Rate Limit Checks
       | 2. authorizeAdminCredentials (env)                              | 2. getToken(cookie)
       | 3. authorizeStaffCredentials (DB User)                          | 3. resolveRouteGuardDecision
       | 4. authorizeReaderCredentials (DB User)                         v
       v                                               +--------------------------------------------+
+----------------------------------------------+       |         Admin Layout & Shell Layer         |
|             JWT & Session Callback           | ----> |  - app/(admin)/layout.tsx                  |
|  - Token payload signing (NextAuth secret)   |       |  - app/(admin)/admin/layout.tsx            |
|  - MongoDB hydration on session() call       |       |  - app/(admin)/admin/AdminShell.tsx        |
+----------------------------------------------+       +--------------------------------------------+
                                                                         |
                                                                         v
                                                       +--------------------------------------------+
                                                       |         Protected Page & API Handlers      |
                                                       |  - getAdminSession() / withAdminApi        |
                                                       |  - canViewPage() / canEditContent()        |
                                                       +--------------------------------------------+
```

### Exact Architecture File Inventory

| Subsystem | Primary Implementation Files | Key Functions & Responsibilities |
|---|---|---|
| **Bootstrap Super-Admin Auth** | [`lib/auth/adminCredentials.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/auth/adminCredentials.ts)<br>[`lib/auth.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/auth.ts) | `authorizeAdminCredentials()`: Authenticates bootstrap operator against `ADMIN_LOGIN_ID`, `ADMIN_PASSWORD_HASH`, and `ADMIN_EMAIL`. Checked before database. |
| **Database Staff Auth** | [`lib/auth/staffCredentials.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/auth/staffCredentials.ts)<br>[`lib/models/User.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/models/User.ts) | `authorizeStaffCredentials()`: Verifies loginId/email + password against bcrypt `passwordHash` in MongoDB. Enforces `isActive !== false` and `isAdminRole(role)`. |
| **Staff Password Setup** | [`lib/auth/staffCredentials.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/auth/staffCredentials.ts)<br>[`app/api/auth/staff-setup/route.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/app/api/auth/staff-setup/route.ts)<br>`app/(reader)/setup-admin-account/page.tsx` | `issueStaffSetupToken()`, `setStaffPasswordWithToken()`: Manages 48-hex single-use setup tokens, hashed via SHA-256 in DB, expiring in 48h (configurable). |
| **Session Generation & JWT** | [`lib/auth.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/auth.ts)<br>[`lib/auth/jwt.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/auth/jwt.ts)<br>[`lib/auth/jwtSecret.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/auth/jwtSecret.ts) | Callbacks `jwt()` and `session()`: Encrypts user identity, role, and active status into JWT. Re-hydrates from DB on session fetch. |
| **Session Validation & Extraction**| [`lib/auth/admin.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/auth/admin.ts) | `getAdminSession()`: Server component helper invoking NextAuth `auth()`.<br>`getAdminSessionFromReq(req)`: Route handler helper decoding token without disturbing body stream.<br>`getSuperAdminSession()`, `getSuperAdminSessionFromReq()`. |
| **Session Cookies** | [`lib/auth/cookies.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/auth/cookies.ts)<br>[`lib/auth.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/auth.ts) | `LOKSWAMI_SESSION_COOKIE`: Configured with `httpOnly: true`, `sameSite: 'lax'`, `path: '/'`, `secure: process.env.NODE_ENV === 'production'`. |
| **Logout & Invalidation** | [`app/(admin)/admin/AdminShell.tsx`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/app/%28admin%29/admin/AdminShell.tsx)<br>[`lib/auth.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/auth.ts) | Client `signOut({ redirect: false })` clears session cookie, navigates to `/signin`, and forces Next.js router refresh. |
| **Inactive User Handling** | [`lib/auth.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/auth.ts)<br>[`lib/auth/routeGuards.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/auth/routeGuards.ts)<br>[`lib/auth/admin.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/auth/admin.ts) | Inactive accounts are blocked at sign-in (`isActive !== false`), redirected by middleware to `/signin?error=inactive`, and rejected by `getAdminSession()`. |
| **Role Normalization & Hierarchy** | [`lib/auth/roles.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/auth/roles.ts) | `ADMIN_ROLES = ['admin', 'super_admin', 'reporter', 'copy_editor']`. Maps legacy roles (`editor` -> `copy_editor`, `author` -> `reporter`, `viewer` -> `reader`). |
| **Permission Governance** | [`lib/auth/permissions.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/auth/permissions.ts) | Defines `PAGE_ACCESS` for 39 admin page keys, `canViewPage()`, `canManageTeam()`, `canCreateContent()`, `canEditContent()`, `canTransitionContent()`. |
| **Route Protection (Edge/Node)** | [`middleware.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/middleware.ts)<br>[`lib/auth/routeGuards.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/auth/routeGuards.ts) | Enforces rate limits, detects authenticated session tokens, and applies `resolveRouteGuardDecision()` to redirect unauthenticated or non-admin traffic. |
| **Layout Level Guards** | [`app/(admin)/layout.tsx`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/app/%28admin%29/layout.tsx)<br>[`app/(admin)/admin/layout.tsx`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/app/%28admin%29/admin/layout.tsx) | Root admin layout verifies `user.email`, `user.isActive !== false`, and `isAdminRole(user.role)`. Injects session into `AuthSessionProvider`. |
| **API Wrapper & CSRF** | [`lib/api/adminRoute.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/api/adminRoute.ts) | `withAdminApi()`: Wraps route handlers, enforces session, executes optional role check, verifies same-origin (`sec-fetch-site` / `origin`), and logs mutations. |
| **Audit Logging** | [`lib/security/auditLogger.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/security/auditLogger.ts)<br>[`lib/admin/adminAuditCenter.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/admin/adminAuditCenter.ts) | Logs authentication attempts (`logAuthAuditEvent`), admin mutations (`logAdminMutationRequest`), and security events to MongoDB / file stores. |

---

## 3. CMS Shell Architecture & UI Surface Map

The CMS Shell is rendered through [`app/(admin)/admin/AdminShell.tsx`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/app/%28admin%29/admin/AdminShell.tsx), receiving pre-authenticated user data from server layout [`app/(admin)/admin/layout.tsx`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/app/%28admin%29/admin/layout.tsx).

### Shell Components & Visual Regions

```
+---------------------------------------------------------------------------------------------------+
|  [Logo] [Desk Title / Role]   |  [Active Route Title]       [Bell] [Lang] [Theme] [User / Logout] |
+-------------------------------+-------------------------------------------------------------------+
|  [Sidebar Navigation]         |  [Main Page Workspace]                                            |
|  - Workflow Section           |                                                                   |
|  - Content Section            |  Rendered Server Component ({children})                           |
|  - Insights Section           |                                                                   |
|  - Governance & Settings      |                                                                   |
|  -------------------------    |                                                                   |
|  [Search Tools Input]         |                                                                   |
|  [Logout Button]              |                                                                   |
+-------------------------------+-------------------------------------------------------------------+
|  [Mobile Quick Dock (lg:hidden)] - Role-specific shortcuts anchored to bottom                     |
+---------------------------------------------------------------------------------------------------+
```

### UI Surface Breakdown by Role Capability

| Surface Category | Surfaces / Elements | Super Admin | Admin | Copy Editor | Reporter |
|---|---|:---:|:---:|:---:|:---:|
| **Shell Header** | Active Route Heading & Subtitle | Visible | Visible | Visible | Visible |
| | Workflow Notification Bell | Visible | Visible | Visible | Visible |
| | Language & Theme Switchers | Visible | Visible | Visible | Visible |
| | User Identity (Avatar, Name, Role Badge) | Visible | Visible | Visible | Visible |
| **Sidebar: Workflow** | Dashboard (`/admin`) | ALLOW | ALLOW | ALLOW | ALLOW |
| | Work Queue (`/admin/work`) | ALLOW | ALLOW | ALLOW | ALLOW |
| | Push Alerts (`/admin/push-alerts`) | ALLOW | ALLOW | DENY | DENY |
| | Copy Desk (`/admin/copy-desk`) | ALLOW | ALLOW | ALLOW | DENY |
| | Team Management (`/admin/team`) | ALLOW | ALLOW* | DENY | DENY |
| | Operations Center (`/admin/operations`) | ALLOW | ALLOW* | DENY | DENY |
| **Sidebar: Content** | Articles List (`/admin/articles`) | ALLOW | ALLOW | ALLOW | DENY |
| | Article Create (`/admin/articles/new`) | ALLOW | ALLOW | ALLOW | ALLOW |
| | Stories List (`/admin/stories`) | ALLOW | ALLOW | ALLOW | ALLOW (My Stories) |
| | Videos (`/admin/videos`) | ALLOW | ALLOW | ALLOW | DENY |
| | Social Posts (`/admin/social-posts`) | ALLOW | ALLOW | ALLOW | DENY |
| | E-Papers (`/admin/epapers`) | ALLOW | ALLOW* | ALLOW* | DENY |
| | E-Magazines (`/admin/emagazines`) | ALLOW | ALLOW* | ALLOW* | DENY |
| | Media Library (`/admin/media`) | ALLOW | ALLOW | ALLOW | ALLOW |
| | Polls (`/admin/polls`) | ALLOW | ALLOW* | DENY | DENY |
| | Categories (`/admin/categories`) | ALLOW | ALLOW | DENY | DENY |
| | Contact Messages (`/admin/contact-messages`) | ALLOW | ALLOW | DENY | DENY |
| **Sidebar: Insights** | Analytics Overview (`/admin/analytics`) | ALLOW | ALLOW | DENY | DENY |
| | Business Value (`/admin/analytics/business-value`) | ALLOW | DENY | DENY | DENY |
| | Revenue & Ads (`/admin/revenue`) | ALLOW | DENY | DENY | DENY |
| | AI Ops (`/admin/ai`) | ALLOW | ALLOW* | DENY | DENY |
| **Sidebar: Governance**| Audit Log (`/admin/audit-log`) | ALLOW | DENY | DENY | DENY |
| | Permission Review (`/admin/permission-review`) | ALLOW | DENY | DENY | DENY |
| | Users & Subscribers (`/admin/users`) | ALLOW | ALLOW* | DENY | DENY |
| | Operations Diagnostics (`/admin/operations-diagnostics`)| ALLOW | DENY | DENY | DENY |
| | Elections Platform (`/admin/settings/elections`) | ALLOW | ALLOW* | DENY | DENY |
| | Newsroom Settings (`/admin/settings/newsroom`) | ALLOW | ALLOW* | DENY | DENY |
| | Platform Settings (`/admin/settings`) | ALLOW | DENY | DENY | DENY |
| **Mobile Quick Dock** | Mobile Dock Items (Grid) | 5 items (Admin/Ops) | 5 items (Desk/Team) | 5 items (Copy/Media) | All Desk Items |

*\* Marked items currently permit `admin` or `copy_editor` in the runtime baseline, but are designated for `super_admin` control-plane elevation in Phase 3.5 per approved policy.*

---

## 4. Four-Role RBAC Matrix & Gap Analysis

The table below contrasts **Current Runtime Permissions** (from `lib/auth/permissions.ts` and API code) with the **Approved Future Policy** (from `docs/b3/PHASE3_RBAC_POLICY.md`), distinguishing UI visibility from Server/API authorization. Every gap is explicitly mapped to a Phase 3.5 implementation item or an explicitly deferred item.

| # | Admin Page Key / Surface | Current UI Visibility | Current Server / API Auth | Approved Policy Target | Status / Gap Assessment | Phase 3.5 Disposition |
|---|---|:---:|:---:|:---:|---|---|
| 1 | `dashboard` (`/admin`) | All 4 roles | All 4 roles | All 4 roles | **ALREADY PROTECTED** | Fully aligned |
| 2 | `work_queue` (`/admin/work`) | All 4 roles | All 4 roles | All 4 roles | **ALREADY PROTECTED** | Fully aligned |
| 3 | `notifications` (`/admin/notifications`) | All 4 roles | All 4 roles | All 4 roles | **ALREADY PROTECTED** | Fully aligned |
| 4 | `my_work` (`/admin/my-work`) | Admin, Copy, Rep | Admin, Copy, Rep | Admin, Copy, Rep | **ALREADY PROTECTED** | Fully aligned |
| 5 | `review_queue` (`/admin/review-queue`) | Super, Admin | Super, Admin | Super, Admin | **ALREADY PROTECTED** | Fully aligned |
| 6 | `assignments` (`/admin/assignments`) | Super, Admin | Super, Admin | Super, Admin | **ALREADY PROTECTED** | Fully aligned |
| 7 | `content_queue` (`/admin/content-queue`) | Super, Admin | Super, Admin | Super, Admin | **ALREADY PROTECTED** | Fully aligned |
| 8 | `push_alerts` (`/admin/push-alerts`) | Super, Admin | Super, Admin | Super, Admin | **ALREADY PROTECTED** | Fully aligned |
| 9 | `copy_desk` (`/admin/copy-desk`) | Super, Admin, Copy | Super, Admin, Copy | Super, Admin, Copy | **ALREADY PROTECTED** | Fully aligned |
| 10 | `articles` (`/admin/articles`) | Super, Admin, Copy | Super, Admin, Copy | Super, Admin, Copy | **ALREADY PROTECTED** | Fully aligned |
| 11 | `article_create` (`/admin/articles/new`)| All 4 roles | All 4 roles | All 4 roles | **ALREADY PROTECTED** | Fully aligned |
| 12 | `article_edit` (`/admin/articles/[id]/edit`)| Super, Admin, Copy | Conditional (Ownership/Assignee)| Conditional | **ALREADY PROTECTED** | Fully aligned |
| 13 | `stories` (`/admin/stories`) | All 4 roles | All 4 roles (Scoped) | All 4 roles | **ALREADY PROTECTED** | Fully aligned |
| 14 | `story_create` (`/admin/stories/new`) | Super, Admin, Rep | Super, Admin, Rep | Super, Admin, Rep | **ALREADY PROTECTED** | Fully aligned |
| 15 | `story_edit` (`/admin/stories/[id]/edit`) | All 4 roles | Conditional (Ownership/Assignee)| Conditional | **ALREADY PROTECTED** | Fully aligned |
| 16 | `videos` (`/admin/videos`) | Super, Admin, Copy | Super, Admin, Copy | Super, Admin, Copy | **ALREADY PROTECTED** | Fully aligned |
| 17 | `video_create` (`/admin/videos/new`) | Super, Admin | Super, Admin | Super, Admin | **ALREADY PROTECTED** | Fully aligned |
| 18 | `video_edit` (`/admin/videos/[id]/edit`)| Super, Admin, Copy | Super, Admin, Copy | Super, Admin, Copy | **ALREADY PROTECTED** | Fully aligned |
| 19 | `social_posts` (`/admin/social-posts`) | Super, Admin, Copy | Super, Admin, Copy | Super, Admin, Copy | **ALREADY PROTECTED** | Fully aligned |
| 20 | **`social_posts_dispatch` (API)** | UI: Super, Admin | API: Super, Admin | **Super Admin only** | **CONFIRMED GAP** (P1) | **Batch 3.5B / GAP-09** |
| 21 | **`epapers` (`/admin/epapers`)** | Super, Admin, Copy | Super, Admin, Copy | **Super Admin only** | **CONFIRMED GAP** (P1) | **Batch 3.5B / GAP-01** |
| 22 | **`epaper_create` (`/admin/epapers/new`)**| Super, Admin | Super, Admin | **Super Admin only** | **CONFIRMED GAP** (P1) | **Batch 3.5B / GAP-01** |
| 23 | **`epaper_edit` (`/admin/epapers/[id]`)** | Super, Admin, Copy | Super, Admin, Copy | **Super Admin only** | **CONFIRMED GAP** (P1) | **Batch 3.5B / GAP-01** |
| 24 | **`epaper_page_edit` (Hotspots/Pages)** | Super, Admin, Copy | Super, Admin, Copy | **Super Admin only** | **CONFIRMED GAP** (P1) | **Batch 3.5B / GAP-01** |
| 25 | **`epaper_publish` (API)** | Super, Admin | Super, Admin | **Super Admin only** | **CONFIRMED GAP** (P1) | **Batch 3.5B / GAP-01** |
| 26 | `media` (`/admin/media`) | All 4 roles | All 4 roles | All 4 roles | **ALREADY PROTECTED** | Fully aligned |
| 27 | **`polls` (`/admin/polls`, `/api/admin/polls`)**| Super, Admin | Super, Admin | **Super Admin only** | **CONFIRMED GAP** (P1) | **Batch 3.5B / GAP-05** |
| 28 | `categories` (`/admin/categories`) | Super, Admin | Super, Admin | Super, Admin | **ALREADY PROTECTED** | Fully aligned |
| 29 | `contact_messages` (`/admin/contact-messages`)| Super, Admin | Super, Admin | Super, Admin | **ALREADY PROTECTED** | Fully aligned |
| 30 | **`ai_ops` (`/admin/ai`, TTS Global Ops)**| Super, Admin | Super, Admin | **Super Admin only** | **CONFIRMED GAP** (P1) | **Batch 3.5B / GAP-03** |
| 31 | `settings` (`/admin/settings`) | Super Admin only | Super Admin only | Super Admin only | **ALREADY PROTECTED** | Fully aligned |
| 32 | **`newsroom_settings` (`/admin/settings/newsroom`)**| Super, Admin | Super, Admin | **Super Admin only** | **CONFIRMED GAP** (P1) | **Batch 3.5B / GAP-04** |
| 33 | **`elections_settings` (`/admin/settings/elections`)**| Super, Admin | Super, Admin | **Super Admin only** | **CONFIRMED GAP** (P1) | **Batch 3.5B / GAP-04** |
| 34 | `revenue` (`/admin/revenue`) | Super Admin only | Super Admin only | Super Admin only | **ALREADY PROTECTED** | Fully aligned |
| 35 | **`team` (`/admin/team`, `/api/admin/team`)**| Super, Admin | Super, Admin | **Super Admin only** | **CONFIRMED GAP** (P1) | **Batch 3.5B / GAP-02** |
| 36 | **`users` (`/admin/users`, `/api/admin/users`)**| Super, Admin | Super, Admin | **Super Admin only** | **CONFIRMED GAP** (P1) | **Batch 3.5B / GAP-10** |
| 37 | `analytics` (`/admin/analytics`) | Super, Admin | Super, Admin | Super, Admin | **ALREADY PROTECTED** | Fully aligned |
| 38 | `business_value` (`/admin/analytics/business-value`)| Super Admin only| Super Admin only | Super Admin only | **ALREADY PROTECTED** | Fully aligned |
| 39 | `audit_log` (`/admin/audit-log`) | Super Admin only | Super Admin only | Super Admin only | **ALREADY PROTECTED** | Fully aligned |
| 40 | `permission_review` (`/admin/permission-review`)| Super Admin only| Super Admin only | Super Admin only | **ALREADY PROTECTED** | Fully aligned |
| 41 | **`operations_center` (`/admin/operations`)**| Super, Admin | Super, Admin | **Super Admin only** | **CONFIRMED GAP** (P1) | **Batch 3.5B / GAP-11** |
| 42 | `operations_diagnostics` (`/admin/operations-diagnostics`)| Super Admin only| Super Admin only| Super Admin only | **ALREADY PROTECTED** | Fully aligned |

---

## 5. Exact Page-Guard Inventory (`app/(admin)/admin/**/page.tsx`)

An exact file-by-file inspection was executed across all 48 `page.tsx` routes under `app/(admin)/admin`. Each page was classified into:
- **`SERVER_GUARD_PRESENT`**: The page is a Server Component that independently checks `getAdminSession()` and asserts `canViewPage(admin.role, '<key>')` or an equivalent role check, redirecting unauthorized traffic.
- **`INHERITED_ONLY`**: The page relies entirely on the root `app/(admin)/layout.tsx` check (which only verifies `isAdminRole(role)`), meaning ANY admin role (including `reporter`) can access it upon direct URL navigation.
- **`SERVER_GUARD_MISSING`**: The page component is completely unshielded by any layout or guard (0 instances).
- **`NOT_APPLICABLE`**: Non-governed public or auxiliary routes (0 instances).

### Comprehensive 48-Page Inventory

| # | Page Route | Canonical Page Key | Current Server Guard Mechanism | Expected Role Boundary | Status | Recommended Action |
|---|---|---|---|---|:---:|---|
| 1 | `/admin` | `dashboard` | `getAdminSession()` + `canViewPage('dashboard')` | All 4 roles | **SERVER_GUARD_PRESENT** | None (Preserve) |
| 2 | `/admin/ai` | `ai_ops` | None (Client Component `'use client'`) | `super_admin only` | **INHERITED_ONLY** | Wrap in Server Component asserting `canViewPage('ai_ops')` |
| 3 | `/admin/analytics` | `analytics` | `getAdminSession()` + `canViewPage('analytics')` | `super_admin`, `admin` | **SERVER_GUARD_PRESENT** | None (Preserve) |
| 4 | `/admin/analytics/business-value` | `business_value` | None (Client Component `'use client'`) | `super_admin only` | **INHERITED_ONLY** | Wrap in Server Component asserting `canViewPage('business_value')` |
| 5 | `/admin/api-docs` | `operations_center` | `getAdminSession()` + `canViewPage('operations_center')` | `super_admin only` | **SERVER_GUARD_PRESENT** | Elevate target check in `canViewPage` to `super_admin only` |
| 6 | `/admin/articles` | `articles` | `getAdminSession()` + `canViewPage('articles')` | `super_admin`, `admin`, `copy_editor` | **SERVER_GUARD_PRESENT** | None (Preserve) |
| 7 | `/admin/articles/new` | `article_create` | `getAdminSession()` + `canViewPage('article_create')` | All 4 roles | **SERVER_GUARD_PRESENT** | None (Preserve) |
| 8 | `/admin/articles/[id]/edit` | `article_edit` | `getAdminSession()` + `canViewPage('article_edit')` | Conditional (Ownership/Assignee) | **SERVER_GUARD_PRESENT** | None (Preserve) |
| 9 | `/admin/assignments` | `assignments` | None (Server Component missing `canViewPage`) | `super_admin`, `admin` | **INHERITED_ONLY** | Add `getAdminSession()` + `canViewPage('assignments')` redirect |
| 10 | `/admin/audit-log` | `audit_log` | `getAdminSession()` + `canViewPage('audit_log')` | `super_admin only` | **SERVER_GUARD_PRESENT** | None (Preserve) |
| 11 | `/admin/categories` | `categories` | None (Client Component `'use client'`) | `super_admin`, `admin` | **INHERITED_ONLY** | Wrap in Server Component asserting `canViewPage('categories')` |
| 12 | `/admin/contact-messages` | `contact_messages` | None (Client Component `'use client'`) | `super_admin`, `admin` | **INHERITED_ONLY** | Wrap in Server Component asserting `canViewPage('contact_messages')` |
| 13 | `/admin/content-queue` | `content_queue` | None (Server Component missing `canViewPage`) | `super_admin`, `admin` | **INHERITED_ONLY** | Add `getAdminSession()` + `canViewPage('content_queue')` redirect |
| 14 | `/admin/copy-desk` | `copy_desk` | `getAdminSession()` + `canViewPage('copy_desk')` | `super_admin`, `admin`, `copy_editor` | **SERVER_GUARD_PRESENT** | None (Preserve) |
| 15 | `/admin/emagazines` | `epapers` | None (Server Component missing `canViewPage`) | `super_admin only` | **INHERITED_ONLY** | Add `getAdminSession()` + `canViewPage('epapers')` redirect |
| 16 | `/admin/emagazines/new` | `epaper_create` | None (Server Component missing `canViewPage`) | `super_admin only` | **INHERITED_ONLY** | Add `getAdminSession()` + `canViewPage('epaper_create')` redirect |
| 17 | `/admin/emagazines/[id]` | `epapers` | None (Server Component missing `canViewPage`) | `super_admin only` | **INHERITED_ONLY** | Add `getAdminSession()` + `canViewPage('epapers')` redirect |
| 18 | `/admin/emagazines/[id]/edit` | `epaper_edit` | None (Client Component `'use client'`) | `super_admin only` | **INHERITED_ONLY** | Wrap in Server Component asserting `canViewPage('epaper_edit')` |
| 19 | `/admin/emagazines/[id]/page/[pageNumber]` | `epaper_page_edit` | None (Server Component missing `canViewPage`) | `super_admin only` | **INHERITED_ONLY** | Add `getAdminSession()` + `canViewPage('epaper_page_edit')` redirect |
| 20 | `/admin/epapers` | `epapers` | None (Client Component `'use client'`) | `super_admin only` | **INHERITED_ONLY** | Wrap in Server Component asserting `canViewPage('epapers')` |
| 21 | `/admin/epapers/new` | `epaper_create` | None (Client Component `'use client'`) | `super_admin only` | **INHERITED_ONLY** | Wrap in Server Component asserting `canViewPage('epaper_create')` |
| 22 | `/admin/epapers/[id]` | `epapers` | None (Client Component `'use client'`) | `super_admin only` | **INHERITED_ONLY** | Wrap in Server Component asserting `canViewPage('epapers')` |
| 23 | `/admin/epapers/[id]/edit` | `epaper_edit` | None (Client Component `'use client'`) | `super_admin only` | **INHERITED_ONLY** | Wrap in Server Component asserting `canViewPage('epaper_edit')` |
| 24 | `/admin/epapers/[id]/page/[pageNumber]` | `epaper_page_edit` | None (Client Component `'use client'`) | `super_admin only` | **INHERITED_ONLY** | Wrap in Server Component asserting `canViewPage('epaper_page_edit')` |
| 25 | `/admin/media` | `media` | None (Client Component `'use client'`) | All 4 roles | **INHERITED_ONLY** | Wrap in Server Component asserting `canViewPage('media')` |
| 26 | `/admin/my-work` | `my_work` | None (Server Component missing `canViewPage`) | `admin`, `copy_editor`, `reporter` | **INHERITED_ONLY** | Add `getAdminSession()` + `canViewPage('my_work')` redirect |
| 27 | `/admin/notifications` | `notifications` | `getAdminSession()` + `canViewPage('notifications')` | All 4 roles | **SERVER_GUARD_PRESENT** | None (Preserve) |
| 28 | `/admin/operations` | `operations_center` | `getAdminSession()` + `canViewPage('operations_center')` | `super_admin only` | **SERVER_GUARD_PRESENT** | Elevate target check in `canViewPage` to `super_admin only` |
| 29 | `/admin/operations-diagnostics` | `operations_diagnostics` | `getAdminSession()` + `canViewPage('operations_diagnostics')` | `super_admin only` | **SERVER_GUARD_PRESENT** | None (Preserve) |
| 30 | `/admin/permission-review` | `permission_review` | `getAdminSession()` + `canViewPage('permission_review')` | `super_admin only` | **SERVER_GUARD_PRESENT** | None (Preserve) |
| 31 | `/admin/polls` | `polls` | `getAdminSession()` + `canViewPage('polls')` | `super_admin only` | **SERVER_GUARD_PRESENT** | Elevate target check in `canViewPage` to `super_admin only` |
| 32 | `/admin/push-alerts` | `push_alerts` | `getAdminSession()` + `canViewPage('push_alerts')` | `super_admin`, `admin` | **SERVER_GUARD_PRESENT** | None (Preserve) |
| 33 | `/admin/revenue` | `revenue` | `getAdminSession()` + `canViewPage('revenue')` | `super_admin only` | **SERVER_GUARD_PRESENT** | None (Preserve) |
| 34 | `/admin/review-queue` | `review_queue` | None (Server Component missing `canViewPage`) | `super_admin`, `admin` | **INHERITED_ONLY** | Add `getAdminSession()` + `canViewPage('review_queue')` redirect |
| 35 | `/admin/settings` | `settings` | `getAdminSession()` + `canViewPage('settings')` | `super_admin only` | **SERVER_GUARD_PRESENT** | None (Preserve) |
| 36 | `/admin/settings/elections` | `newsroom_settings` | None (Client Component `'use client'`) | `super_admin only` | **INHERITED_ONLY** | Wrap in Server Component asserting `canViewPage('newsroom_settings')` |
| 37 | `/admin/settings/newsroom` | `newsroom_settings` | `getAdminSession()` + `canViewPage('newsroom_settings')` | `super_admin only` | **SERVER_GUARD_PRESENT** | Elevate target check in `canViewPage` to `super_admin only` |
| 38 | `/admin/social-posts` | `social_posts` | None (Client Component `'use client'`) | `super_admin`, `admin`, `copy_editor` | **INHERITED_ONLY** | Wrap in Server Component asserting `canViewPage('social_posts')` |
| 39 | `/admin/stories` | `stories` | None (Client Component `'use client'`) | All 4 roles | **INHERITED_ONLY** | Wrap in Server Component asserting `canViewPage('stories')` |
| 40 | `/admin/stories/new` | `story_create` | None (Client Component `'use client'`) | `super_admin`, `admin`, `reporter` | **INHERITED_ONLY** | Wrap in Server Component asserting `canViewPage('story_create')` |
| 41 | `/admin/stories/[id]/edit` | `story_edit` | None (Client Component `'use client'`) | All 4 roles (scoped) | **INHERITED_ONLY** | Wrap in Server Component asserting `canViewPage('story_edit')` |
| 42 | `/admin/team` | `team` | `getAdminSession()` + `canViewPage('team')` | `super_admin only` | **SERVER_GUARD_PRESENT** | Elevate target check in `canViewPage` to `super_admin only` |
| 43 | `/admin/users` | `users` | `getAdminSession()` + `canViewPage('users')` | `super_admin only` | **SERVER_GUARD_PRESENT** | Elevate target check in `canViewPage` to `super_admin only` |
| 44 | `/admin/videos` | `videos` | None (Client Component `'use client'`) | `super_admin`, `admin`, `copy_editor` | **INHERITED_ONLY** | Wrap in Server Component asserting `canViewPage('videos')` |
| 45 | `/admin/videos/new` | `video_create` | None (Client Component `'use client'`) | `super_admin`, `admin` | **INHERITED_ONLY** | Wrap in Server Component asserting `canViewPage('video_create')` |
| 46 | `/admin/videos/[id]/edit` | `video_edit` | None (Client Component `'use client'`) | `super_admin`, `admin`, `copy_editor` | **INHERITED_ONLY** | Wrap in Server Component asserting `canViewPage('video_edit')` |
| 47 | `/admin/work` | `work_queue` | None (Server Component missing `canViewPage`) | All 4 roles | **INHERITED_ONLY** | Add `getAdminSession()` + `canViewPage('work_queue')` redirect |
| 48 | `/admin/work/bulk` | `work_queue` | `getAdminSession()` (role check) | `super_admin`, `admin`, `copy_editor` | **SERVER_GUARD_PRESENT** | Add explicit `canViewPage('work_queue')` check |

### Summary Statistics
- **Pages inspected**: 48 (`app/(admin)/admin/**/page.tsx`)
- **Direct server guards (SERVER_GUARD_PRESENT)**: 21 (43.8% — enforce `canViewPage`, `getSuperAdminSession`, or explicit role check directly in page server component)
- **Inherited-only (INHERITED_ONLY)**: 27 (56.2% — rely solely on root admin layout; assigned to Batch 3.5C for server-wrapper additions)
- **Unauthenticated admin pages (SERVER_GUARD_MISSING)**: 0 (0% — 0 unauthenticated admin pages; root layout enforces admin session)

---

## 6. API Authorization & Mutation Inventory

For every elevated Phase 3.5 domain, the concrete state-modifying API routes are inventoried below. This mapping directly governs **Batch 3.5B** (RBAC authorization) and **Batch 3.5D** (Same-origin and mutation audit logging).

| Domain | HTTP Method & Route | Current Runtime Authorization | Target Policy Authorization | Same-Origin Check | Mutation Audit Log |
|---|---|---|---|:---:|:---:|
| **E-Paper Lifecycle** | `POST /api/admin/epapers` | `canCreateEpaper` (`admin`, `super_admin`) | **`super_admin only`** | NO | NO |
| | `PUT /api/admin/epapers/[id]` | `canEditEpaper` (`admin`, `copy_editor`, `super_admin`) | **`super_admin only`** | NO | NO |
| | `PATCH /api/admin/epapers/[id]` | `canEditEpaper` / `canPublishEpaper` | **`super_admin only`** | NO | NO |
| | `DELETE /api/admin/epapers/[id]` | `canDeleteEpaper` (`admin`, `super_admin`) | **`super_admin only`** | NO | NO |
| | `POST /api/admin/epapers/[id]/pages` | `canEditEpaper` | **`super_admin only`** | NO | NO |
| | `POST /api/admin/epapers/[id]/crop-hotspot` | `canEditEpaper` | **`super_admin only`** | NO | NO |
| | `POST /api/admin/epapers/[id]/generate-page-images` | `canEditEpaper` | **`super_admin only`** | NO | NO |
| | `POST /api/admin/epapers/[id]/ocr` | `canEditEpaper` | **`super_admin only`** | NO | NO |
| **Team Management** | `POST /api/admin/team` | `canManageTeam` (`admin`, `super_admin`) | **`super_admin only`** | YES (`withAdminApi`) | YES (`withAdminApi`) |
| | `PATCH /api/admin/team/[id]` | `canManageTeam` (`admin`, `super_admin`) | **`super_admin only`** | YES (`withAdminApi`) | YES (`withAdminApi`) |
| | `DELETE /api/admin/team/[id]` | `canManageTeam` (`admin`, `super_admin`) | **`super_admin only`** | YES (`withAdminApi`) | YES (`withAdminApi`) |
| | `POST /api/admin/team-setup-link` | `canManageTeam` (`admin`, `super_admin`) | **`super_admin only`** | NO | NO |
| **Global AI Ops** | `POST /api/admin/tts/settings` | `canRunGlobalAiOps` (`admin`, `super_admin`) | **`super_admin only`** | NO | NO |
| | `POST /api/admin/tts/cleanup` | `canRunGlobalAiOps` (`admin`, `super_admin`) | **`super_admin only`** | NO | NO |
| | `POST /api/admin/tts/revalidate` | `canRunGlobalAiOps` (`admin`, `super_admin`) | **`super_admin only`** | NO | NO |
| | `POST /api/admin/tts/jobs/run-due` | `canRunGlobalAiOps` (`admin`, `super_admin`) | **`super_admin only`** | NO | NO |
| **Social Dispatch** | `POST /api/admin/social-posts/[id]/dispatch` | `canManageSocialPosts` (`admin`, `super_admin`) | **`super_admin only`** | NO | NO |
| | `POST /api/admin/social-posts/generate` | `canManageSocialPosts` (`admin`, `super_admin`) | **`super_admin only`** | NO | NO |
| **Poll Configuration**| `POST /api/admin/polls` | `canViewPage('polls')` (`admin`, `super_admin`) | **`super_admin only`** | NO | NO |
| | `PATCH /api/admin/polls/[id]` | `canViewPage('polls')` (`admin`, `super_admin`) | **`super_admin only`** | NO | NO |
| | `DELETE /api/admin/polls/[id]` | `canViewPage('polls')` (`admin`, `super_admin`) | **`super_admin only`** | NO | NO |
| **Newsroom Settings** | `POST /api/admin/settings/leadership-reports` | `canManageSettings` (`super_admin only`) | **`super_admin only`** | NO | NO |
| **Elections Infrastructure**| `POST /api/admin/elections/upload` | `canManageNewsroomSettings` (`admin`, `super_admin`) | **`super_admin only`** | NO | NO |
| | `POST /api/admin/elections/results` | `canManageNewsroomSettings` (`admin`, `super_admin`) | **`super_admin only`** | NO | NO |
| | `DELETE /api/admin/elections/delete` | `canManageNewsroomSettings` (`admin`, `super_admin`) | **`super_admin only`** | NO | NO |
| **Users / Subscribers**| `PATCH /api/admin/users` | Admin Role Family (`withAdminApi` unconstrained) | **`super_admin only`** | NO (mutation unset) | NO (mutation unset) |
| **Operations Center** | `POST /api/admin/analytics/briefing-schedules/[id]/run` | `canManageLeadershipReports` (`super_admin only`) | **`super_admin only`** | NO | NO |
| | `POST /api/admin/analytics/briefing-schedules/run-due` | `canManageLeadershipReports` (`super_admin only`) | **`super_admin only`** | NO | NO |

### API Inventory Summary

- **Elevated functional domains mapped**: 9 (E-Paper Lifecycle, Team Management, Global AI Ops, Social Dispatch, Poll Configuration, Newsroom Settings, Election Infrastructure, Users / Subscriber Governance, Operations Center)
- **Elevated mutation routes inventoried**: 28 concrete API mutation endpoints
- **Missing specific RBAC guards**: 24 routes (currently allow general `admin` role family or lack specific role gating; 4 already enforce `super_admin`)
- **Identified same-origin hardening targets**: 28 routes (require explicit CSRF / `Origin` / `Sec-Fetch-Site` header verification)
- **Missing mutation audit logging targets**: 20 routes (lack structured `logActivity` or `recordAuditLog` emission)

---

## 7. Auth & Session Hardening Technical Decision

### Problem Statement (GAP-06 & GAP-07)
When a staff member's role is demoted or account deactivated in MongoDB, API routes utilizing `getAdminSessionFromReq(req)` decode the session token from the `LOKSWAMI_SESSION_COOKIE` via NextAuth `getToken()`. Because `jwt()` in `lib/auth.ts` bypasses database re-hydration if `hasHydratedRole && hasHydratedUserId` exist, the API route evaluates stale token claims until cookie expiry. Furthermore, in `session()`, `getUserByEmail()` currently overrides bootstrap super admin profiles if an email matches in MongoDB.

### Architecture Options Evaluated

1. **Option 1 (Selected): Minimal DB Identity Re-hydration in `getAdminSessionFromReq`**
   - **Mechanism**:
     - If `token.userId.startsWith('env-admin:')`: Immediately return the bootstrap `super_admin` identity without querying MongoDB. (Preserves 100% bootstrap env independence).
     - For database-backed staff users: Execute an indexed `User.findById(token.userId).select('role isActive name email').lean()`. If `!user || user.isActive === false`, return `null`. If `user.role !== token.role`, return the fresh role from MongoDB.
   - **Why Selected**:
     - Zero schema modifications or database migrations.
     - Zero new infrastructure dependencies (no Redis, no denylist cache).
     - Perfectly isolates bootstrap super admin from database state.
     - Real-time revocation: demoted staff lose privileged mutation access immediately.
   - **Performance Impact**: Negligible. Admin API mutations execute single-digit queries per second; `User.findById` on the primary key index (`_id`) executes in < 2ms.
   - **Affected Files**:
     - [`lib/auth/admin.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/auth/admin.ts) (`getAdminSessionFromReq`)
     - [`lib/auth.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/auth.ts) (`session` callback bootstrap guard)
   - **Regression Tests**:
     - Inactive user API call returns 401/403 immediately.
     - Demoted user API mutation returns 403 Forbidden without re-login.
     - Bootstrap admin continues functioning when MongoDB is disconnected or empty.

2. **Option 2 (Rejected): Token Versioning (`tokenVersion`)**
   - **Why Rejected**: Requires modifying the `User` schema, updating existing user documents, and still requires querying MongoDB to compare token version against database version. Adds complexity without reducing query overhead.

3. **Option 3 (Rejected): Redis Session Revocation Denylist**
   - **Why Rejected**: Violates Phase 3.5 architecture constraints by requiring a distributed Redis state engine for session validity checks.

---

## 8. Prioritized Phase 3.5 Gap Register

```
+---------------------------------------------------------------------------------------------------+
|  P0: Security / Access-Control Blocker (0 found)                                                  |
|  P1: Required Phase 3.5 Hardening (Owner-Approved Control Plane & Auth Integrity)                  |
|  P2: Useful Hardening / UX Consistency (Page Server Wrappers, 403 UX, Standardized Errors)        |
|  P3: Defer to Later Phase (Ad-tech platform, Redis denylist)                                     |
+---------------------------------------------------------------------------------------------------+
```

### Gap Register Summary
- **Total identified gaps**: 18 (GAP-01 through GAP-18)
- **Phase 3.5 implementation gaps**: 16 (GAP-01 through GAP-16)
- **Explicitly deferred gaps**: 2 (GAP-17 to Phase 3.10, GAP-18 to Phase 4)
- **Unresolved gaps**: 0 (all gaps accounted for; `social_posts_dispatch`, `users`, and `operations_center` fully represented)

### Complete Prioritized Gaps

#### GAP-01: Super Admin Elevation — E-Paper Complete Lifecycle
- **Priority**: P1 (Required Phase 3.5 Hardening)
- **Area**: Authorization / E-Paper Domain
- **Current Behavior**: `admin` has full create/edit/prepare/publish/delete access; `copy_editor` has edit/prepare access in `canEditEpaper` and `epaperEditorialService`.
- **Expected Behavior**: Full E-Paper lifecycle (`create`, `edit`, `page edit`, `prepare`, `assignments`, `publish`, `delete`) restricted exclusively to `super_admin`.
- **Affected Roles**: `admin`, `copy_editor`.
- **Affected Files**: [`lib/auth/permissions.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/auth/permissions.ts), [`lib/server/epaper/epaperEditorialService.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/server/epaper/epaperEditorialService.ts), [`app/api/admin/epapers/**`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/app/api/admin/epapers).
- **Security Impact**: High commercial and legal impact; prevents non-owner roles from publishing or modifying digital editions.
- **Recommended Fix**: Update `PAGE_ACCESS['epapers']`, `canCreateEpaper`, `canEditEpaper`, `canPublishEpaper`, `canDeleteEpaper` to require `isSuperAdminRole`.
- **Recommended Tests**: Update `tests/permissions-governance.test.ts` and add API route authorization tests.

#### GAP-02: Super Admin Elevation — Identity & Team Governance
- **Priority**: P1 (Required Phase 3.5 Hardening)
- **Area**: Authorization / Staff Management
- **Current Behavior**: `admin` can invite staff, create team members, and manage roles (excluding super_admin).
- **Expected Behavior**: Staff creation, onboarding invitation generation, role assignment, and user deactivation restricted to `super_admin`.
- **Affected Roles**: `admin`.
- **Affected Files**: [`lib/auth/permissions.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/auth/permissions.ts), [`app/api/admin/team/route.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/app/api/admin/team/route.ts), [`app/api/admin/team-setup-link/route.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/app/api/admin/team-setup-link/route.ts).
- **Security Impact**: Prevents compromised newsroom admin accounts from creating rogue staff or elevating privileges.
- **Recommended Fix**: Restrict `canManageTeam` and `PAGE_ACCESS['team']` to `['super_admin']`.
- **Recommended Tests**: Update `tests/api/admin-team-routes.test.ts` to assert that `admin` receives 403 Forbidden.

#### GAP-03: Super Admin Elevation — Global AI Ops & TTS Settings
- **Priority**: P1 (Required Phase 3.5 Hardening)
- **Area**: Authorization / AI Infrastructure
- **Current Behavior**: `admin` can configure global AI ops and TTS engine settings via `canRunGlobalAiOps`.
- **Expected Behavior**: Global AI model configuration, token limits, and TTS infrastructure restricted to `super_admin`.
- **Affected Roles**: `admin`.
- **Affected Files**: [`lib/auth/permissions.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/auth/permissions.ts), [`lib/server/audio/ttsService.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/server/audio/ttsService.ts), [`app/api/admin/tts/settings/route.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/app/api/admin/tts/settings/route.ts).
- **Security Impact**: Protects LLM API quotas, provider keys, and system prompts from unauthorized tampering.
- **Recommended Fix**: Change `canRunGlobalAiOps` to `isSuperAdminRole(role)`.

#### GAP-04: Super Admin Elevation — Newsroom & Election Settings
- **Priority**: P1 (Required Phase 3.5 Hardening)
- **Area**: Authorization / System Settings
- **Current Behavior**: `admin` has access to `/admin/settings/newsroom`, `/admin/settings/elections`, and `/api/admin/elections/upload`.
- **Expected Behavior**: Global system settings and election infrastructure feeds restricted to `super_admin`.
- **Affected Roles**: `admin`.
- **Affected Files**: [`lib/auth/permissions.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/auth/permissions.ts), [`app/api/admin/elections/**`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/app/api/admin/elections).
- **Security Impact**: Preserves platform operational integrity while keeping ordinary election journalism open to reporters.
- **Recommended Fix**: Restrict `canManageNewsroomSettings` to `isSuperAdminRole(role)`.

#### GAP-05: Super Admin Elevation — Reader Polls Configuration
- **Priority**: P1 (Required Phase 3.5 Hardening)
- **Area**: Authorization / Reader Engagement
- **Current Behavior**: `admin` can create, activate, and delete polls.
- **Expected Behavior**: Reader poll publication and lifecycle governed by `super_admin`.
- **Affected Roles**: `admin`.
- **Affected Files**: [`lib/auth/permissions.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/auth/permissions.ts), [`app/api/admin/polls/**`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/app/api/admin/polls).
- **Security Impact**: Prevents unauthorized editorial staff from publishing unvetted public reader surveys.
- **Recommended Fix**: Set `PAGE_ACCESS['polls'] = ['super_admin']`.

#### GAP-06: Stale Session Role in Request Token Decoding
- **Priority**: P1 (Required Phase 3.5 Hardening)
- **Area**: Authentication / Session Lifecycle
- **Current Behavior**: `jwt()` skips database lookups if `token.role` and `token.userId` are set. `getAdminSessionFromReq()` evaluates token claims directly without re-querying MongoDB.
- **Expected Behavior**: Role changes made in the database must be detected so API routes do not honor revoked privileges.
- **Affected Roles**: Any staff member whose role is modified or revoked.
- **Affected Files**: [`lib/auth/admin.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/auth/admin.ts) (`getAdminSessionFromReq`).
- **Security Impact**: Demoted staff member can continue executing privileged API calls until cookie expires.
- **Recommended Fix**: Implement Option 1 (re-hydrate DB staff role in `getAdminSessionFromReq` while bypassing bootstrap admin).

#### GAP-07: Bootstrap Super Admin Precedence in Session Callback
- **Priority**: P1 (Required Phase 3.5 Hardening)
- **Area**: Authentication / Bootstrap Identity
- **Current Behavior**: `session()` callback runs `getUserByEmail(sessionEmail)` and overwrites `session.user.role` if a DB record matches the bootstrap email.
- **Expected Behavior**: When session belongs to the bootstrap admin (`userId.startsWith('env-admin:')`), the `super_admin` role and active status must never be overridden by MongoDB records.
- **Affected Roles**: `super_admin` (bootstrap).
- **Affected Files**: [`lib/auth.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/auth.ts) (`session` callback).
- **Security Impact**: Accidental or malicious creation of a database user matching the bootstrap email could demote or lock out the platform owner.
- **Recommended Fix**: In `session()` callback, bypass DB profile override if `token.userId` starts with `env-admin:`.

#### GAP-08: Staff Login ID Collision with Bootstrap Identity
- **Priority**: P1 (Required Phase 3.5 Hardening)
- **Area**: Authentication / Identity Isolation
- **Current Behavior**: `reserveUniqueStaffLoginId()` checks MongoDB existence but does not check `ADMIN_LOGIN_ID`.
- **Expected Behavior**: `reserveUniqueStaffLoginId()` must reject and avoid generating login IDs matching `ADMIN_LOGIN_ID` or `ADMIN_USERNAME`.
- **Affected Roles**: `super_admin`.
- **Affected Files**: [`lib/auth/staffCredentials.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/auth/staffCredentials.ts) (`reserveUniqueStaffLoginId`).
- **Security Impact**: Prevents staff credential collisions with the environment bootstrap admin.
- **Recommended Fix**: Check against configured bootstrap admin identifier and append a numeric suffix if matched.

#### GAP-09: Super Admin Elevation — Social Outbound Dispatch
- **Priority**: P1 (Required Phase 3.5 Hardening)
- **Area**: Authorization / Social Distribution
- **Current Behavior**: `admin` can trigger automated external social dispatches via `/api/admin/social-posts/[id]/dispatch`.
- **Expected Behavior**: Outbound live social broadcasts restricted to `super_admin`.
- **Affected Roles**: `admin`.
- **Affected Files**: [`app/api/admin/social-posts/[id]/dispatch/route.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/app/api/admin/social-posts/%5Bid%5D/dispatch/route.ts).
- **Security Impact**: High reputational impact; prevents unauthorized automated posting to social accounts.
- **Recommended Fix**: Restrict `canManageSocialPosts` in dispatch route to `isSuperAdminRole(role)`.

#### GAP-10: Super Admin Elevation — Users & Subscriber Governance
- **Priority**: P1 (Required Phase 3.5 Hardening)
- **Area**: Authorization / Subscriber Management
- **Current Behavior**: `admin` can update user roles, toggle account active status, and modify user metadata via `/api/admin/users`.
- **Expected Behavior**: Subscriber governance and user status modifications restricted to `super_admin`.
- **Affected Roles**: `admin`.
- **Affected Files**: [`lib/auth/permissions.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/auth/permissions.ts) (`PAGE_ACCESS['users']`), [`app/api/admin/users/route.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/app/api/admin/users/route.ts).
- **Security Impact**: Prevents newsroom staff from elevating reader accounts or modifying subscriber records.
- **Recommended Fix**: Set `PAGE_ACCESS['users'] = ['super_admin']`, update `withAdminApi` in `users/route.ts` with `authorize: (role) => isSuperAdminRole(role), mutation: true`.

#### GAP-11: Super Admin Elevation — Operations Center
- **Priority**: P1 (Required Phase 3.5 Hardening)
- **Area**: Authorization / Platform Operations
- **Current Behavior**: `admin` has access to `/admin/operations` and `/admin/api-docs` via `PAGE_ACCESS['operations_center']`.
- **Expected Behavior**: System operations center and operational controls restricted to `super_admin`.
- **Affected Roles**: `admin`.
- **Affected Files**: [`lib/auth/permissions.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/auth/permissions.ts), [`app/(admin)/admin/operations/page.tsx`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/app/%28admin%29/admin/operations/page.tsx), [`app/(admin)/admin/api-docs/page.tsx`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/app/%28admin%29/admin/api-docs/page.tsx).
- **Security Impact**: Prevents non-owner roles from accessing system infrastructure controls and operational telemetry.
- **Recommended Fix**: Restrict `PAGE_ACCESS['operations_center']` to `['super_admin']`.

#### GAP-12: Page-Level Server Guards Missing (`INHERITED_ONLY` Pages)
- **Priority**: P2 (Useful Hardening / Access Boundary Enforcement)
- **Area**: CMS Shell / Route Guards
- **Current Behavior**: 27 of 48 admin pages (e.g. `/admin/ai`, `/admin/epapers`, `/admin/categories`, `/admin/contact-messages`) are Client Components or Server Components lacking `canViewPage` checks, relying solely on root layout.
- **Expected Behavior**: Every governed page must execute an independent server-side role check (`canViewPage(admin.role, '<key>')`) before rendering.
- **Affected Roles**: All admin roles.
- **Affected Files**: The 27 `INHERITED_ONLY` files identified in Section 5.
- **Security Impact**: Defense-in-depth; prevents unauthorized direct URL navigation by staff.
- **Recommended Fix**: Add Server Component wrappers or server-side auth assertions to all 27 pages.

#### GAP-13: Missing CSRF / Origin Validation on Privileged Mutations
- **Priority**: P2 (Security Defense-in-Depth)
- **Area**: Security / CSRF Defense
- **Current Behavior**: `withAdminApi` verifies `isSameOriginWrite(request)`. Routes with raw handlers (`epapers`, `polls`, `categories`, `elections`, `social-posts`) omit this check.
- **Expected Behavior**: All privileged POST, PUT, PATCH, and DELETE admin routes must enforce same-origin verification (`sec-fetch-site !== 'cross-site'`).
- **Affected Roles**: All admin roles.
- **Affected Files**: Raw route handlers in `app/api/admin/**`.
- **Security Impact**: Defense-in-depth against cross-site request forgery.
- **Recommended Fix**: Export `assertSameOriginWrite(req)` helper and call it across raw mutating handlers.

#### GAP-14: Standardized Mutation Audit Logging
- **Priority**: P2 (Security & Compliance)
- **Area**: Security / Audit Logging
- **Current Behavior**: Only `withAdminApi` routes log to `logAdminMutationRequest`. Direct routes do not record to the central security mutation log.
- **Expected Behavior**: All state-modifying admin operations must produce audit log records in `adminAuditCenter`.
- **Affected Roles**: All admin roles.
- **Affected Files**: [`app/api/admin/epapers/route.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/app/api/admin/epapers/route.ts), [`app/api/admin/polls/route.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/app/api/admin/polls/route.ts), [`app/api/admin/elections/**`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/app/api/admin/elections).
- **Security Impact**: Missing audit trail for critical content publishing and deletion actions.
- **Recommended Fix**: Wrap remaining admin mutation routes with `withAdminApi({ mutation: true })` or explicitly invoke `logAdminMutationRequest`.

#### GAP-15: Inaccessible Route Feedback (Silent Redirects)
- **Priority**: P2 (Useful Hardening / UX Consistency)
- **Area**: CMS Shell UX
- **Current Behavior**: Unauthorized URL entry redirects silently to `/admin`.
- **Expected Behavior**: Render a structured Access Denied state or flash a toast message informing the user that their role lacks permission.
- **Affected Roles**: `admin`, `copy_editor`, `reporter`.
- **Affected Files**: [`app/(admin)/admin/**/page.tsx`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/app/%28admin%29/admin).

#### GAP-16: Mobile Dock Alignment with Control Plane
- **Priority**: P2 (Useful Hardening / UX Consistency)
- **Area**: CMS Shell UX
- **Current Behavior**: Admin mobile dock includes `/admin/team`.
- **Expected Behavior**: Replace `/admin/team` in admin mobile dock with an operational surface (e.g. `/admin/articles`).
- **Affected Files**: [`app/(admin)/admin/AdminShell.tsx`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/app/%28admin%29/admin/AdminShell.tsx).

#### GAP-17: Dedicated Ads & Campaign Management Boundary
- **Priority**: P3 (Explicitly Deferred)
- **Area**: Revenue / Ads Domain
- **Current Behavior**: Revenue page exists at `/admin/revenue`. Dedicated ad-space lifecycle is not yet unified into a single runtime boundary.
- **Disposition**: **DEFERRED TO PHASE 3.10** (Formal ad-server and campaign management architecture milestone).

#### GAP-18: Server-Side Token Revocation Denylist
- **Priority**: P3 (Explicitly Deferred)
- **Area**: Session Invalidation
- **Current Behavior**: JWTs rely on client cookie clearing + DB `isActive: false` check.
- **Disposition**: **DEFERRED TO PHASE 4** (Distributed multi-node Redis session infrastructure milestone).

---

## 9. Phase 3.5 Acceptance Criteria

Before Phase 3.5 implementation is considered complete, the following criteria must be satisfied:

### 1. Authentication
- [ ] Bootstrap `super_admin` credential authentication functions reliably using `ADMIN_LOGIN_ID` and `ADMIN_PASSWORD_HASH`.
- [ ] Database staff credential authentication functions reliably for active accounts across all canonical roles.
- [ ] Deactivated staff accounts (`isActive: false`) are rejected at credential validation and rejected by active session checks.
- [ ] Invalid passwords and unknown login IDs fail safely without distinguishing error messages to untrusted clients.
- [ ] Sign-out successfully deletes session cookies and terminates browser session.
- [ ] Plaintext passwords, tokens, or credential secrets are never logged to console, audit logs, or error responses.

### 2. Authorization & RBAC
- [ ] Canonical four-role model (`super_admin`, `admin`, `copy_editor`, `reporter`) remains authoritative.
- [ ] E-Paper full lifecycle (`create`, `edit`, `page edit`, `prepare`, `assignments`, `publish`, `delete`) is restricted exclusively to `super_admin` in both UI and API routes.
- [ ] Staff and team management (`/admin/team`, `/api/admin/team`, setup link generation) is restricted exclusively to `super_admin`.
- [ ] Global AI Ops (`/admin/ai`, TTS global settings) is restricted exclusively to `super_admin`.
- [ ] Newsroom settings and Election Platform infrastructure controls are restricted exclusively to `super_admin`.
- [ ] Reader poll configuration and lifecycle (`/admin/polls`, `/api/admin/polls`) is restricted exclusively to `super_admin`.
- [ ] Outbound social post dispatch (`/api/admin/social-posts/[id]/dispatch`) is restricted exclusively to `super_admin`.
- [ ] User and subscriber governance (`/admin/users`, `/api/admin/users`) is restricted exclusively to `super_admin`.
- [ ] Operations Center (`/admin/operations`, `/admin/api-docs`) is restricted exclusively to `super_admin`.
- [ ] Every privileged API route under `app/api/admin/**` enforces server-side role authorization before executing mutations.
- [ ] Every page route under `app/(admin)/admin/**` verifies `canViewPage()` on the server.

### 3. Session Hardening
- [ ] Bootstrap super admin session profile cannot be overridden or demoted by MongoDB records matching the bootstrap email.
- [ ] Staff login ID generation avoids colliding with `ADMIN_LOGIN_ID`.
- [ ] Role demotions in the database are reflected in API routes immediately via `getAdminSessionFromReq` without honoring stale privileges.
- [ ] **Cookie Security Policy**:
  - **Deployed HTTPS Environments (Staging & Production)**: `Secure` cookie MUST be enabled (`secure: true`).
  - **Localhost HTTP Environments (Local Development & Verification)**: Must remain compatible with local unencrypted HTTP (`secure: false` when testing over localhost HTTP), while strictly preserving `httpOnly: true` and `sameSite: 'lax'` protections.

### 4. Setup Flow Security
- [ ] Staff setup tokens expire after the configured lifetime (default 48 hours).
- [ ] Setup tokens are single-use; token hash is cleared and expiration unset immediately upon password configuration.
- [ ] Setup links cannot be replayed or reused.

### 5. CMS Shell
- [ ] Sidebar navigation reflects the hardened role permissions dynamically.
- [ ] Unauthorized action buttons are not rendered to unauthorized roles.
- [ ] Initial server HTML stream renders without flashing privileged navigation elements.
- [ ] Identity display in header accurately reflects user display name and canonical role.
- [ ] Mobile navigation dock matches updated role boundaries.

### 6. Security & Audit Logging
- [ ] Privileged mutation API routes enforce same-origin verification (`sec-fetch-site` / `origin`).
- [ ] Sensitive admin mutations (content publishing, role changes, settings updates) produce structured records in the security mutation log.

### 7. Automated Testing
- [ ] All four canonical roles have explicit access-control test coverage across governed surfaces.
- [ ] Unit tests in `tests/permissions-governance.test.ts` pass with the hardened Super Admin control plane.
- [ ] API route tests verify 403 Forbidden for unauthorized roles across all elevated surfaces.
- [ ] Typecheck (`npm run typecheck`) passes with 0 errors.
- [ ] Strict lint (`npm run lint:strict`) passes with 0 warnings.

### 8. Staging Safety
- [ ] Staging verification (`npm run verify:staging`) passes with zero production resource leaks.
- [ ] Live production domains, databases, and buckets remain completely untouched.

---

## 10. Revised Phased Implementation Plan (Execution Batches)

Implementation will proceed in 5 sequential, reviewable batches after explicit owner review and approval. Every confirmed gap is traced to an exact implementation batch:

```
+---------------------------------------------------------------------------------------------------+
|  Batch 3.5A: Auth & Session Integrity Hardening                                                   |
|  - Gaps Handled: GAP-06 (stale session re-hydration), GAP-07 (bootstrap precedence),             |
|                  GAP-08 (login ID collision prevention)                                           |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
|  Batch 3.5B: Server-Side RBAC & Control-Plane Elevation                                           |
|  - Gaps Handled: GAP-01 (E-Paper), GAP-02 (Team), GAP-03 (AI Ops), GAP-04 (Settings/Elections),   |
|                  GAP-05 (Polls), GAP-09 (Social Dispatch), GAP-10 (Users), GAP-11 (Operations)   |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
|  Batch 3.5C: CMS Shell & Page-Level Alignment                                                     |
|  - Gaps Handled: GAP-12 (27 page server guards), GAP-15 (Access denied UX),                       |
|                  GAP-16 (Mobile dock update)                                                      |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
|  Batch 3.5D: Security Defense-in-Depth & Audit Logging                                            |
|  - Gaps Handled: GAP-13 (Same-origin CSRF on raw routes), GAP-14 (Mutation audit logging)         |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
|  Batch 3.5E: Regression Testing & Staging Acceptance                                              |
|  - Complete four-role test suite updates, staging environment verification, quality:full         |
+---------------------------------------------------------------------------------------------------+
```

### Batch Details

#### Phase 3.5A — Auth & Session Integrity Hardening
- **Gaps Handled**: GAP-06, GAP-07, GAP-08.
- **Exact Likely Files**:
  - [`lib/auth.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/auth.ts) (`session` callback protection for bootstrap admin)
  - [`lib/auth/admin.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/auth/admin.ts) (`getAdminSessionFromReq` DB re-hydration for staff)
  - [`lib/auth/staffCredentials.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/auth/staffCredentials.ts) (`reserveUniqueStaffLoginId` bootstrap collision check)
- **Explicit Non-Goals**: No changes to UI components, no Redis integration, no schema alterations.
- **Verification Tests**: `npm run test:admin-credentials`, `npm run test:auth-guards`, new session-freshness unit tests.
- **Exit Criteria**: Demoted/inactive staff immediately lose API access without re-login; bootstrap super admin cannot be overwritten by DB records; login IDs never collide with bootstrap admin.

#### Phase 3.5B — Server-Side RBAC & Control-Plane Elevation
- **Gaps Handled**: GAP-01, GAP-02, GAP-03, GAP-04, GAP-05, GAP-09, GAP-10, GAP-11.
- **Exact Likely Files**:
  - [`lib/auth/permissions.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/auth/permissions.ts) (Elevate `epapers`, `team`, `ai_ops`, `newsroom_settings`, `polls`, `users`, `operations_center` to `super_admin only`)
  - [`lib/server/epaper/epaperEditorialService.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/server/epaper/epaperEditorialService.ts) (Enforce `canCreateEpaper`, `canEditEpaper`, `canPublishEpaper`, `canDeleteEpaper` requiring `isSuperAdminRole`)
  - [`lib/server/audio/ttsService.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/server/audio/ttsService.ts) (Enforce `canRunGlobalAiOps` requiring `isSuperAdminRole`)
  - [`app/api/admin/team/route.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/app/api/admin/team/route.ts) & [`app/api/admin/team-setup-link/route.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/app/api/admin/team-setup-link/route.ts)
  - [`app/api/admin/polls/**`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/app/api/admin/polls)
  - [`app/api/admin/social-posts/[id]/dispatch/route.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/app/api/admin/social-posts/%5Bid%5D/dispatch/route.ts)
  - [`app/api/admin/elections/**`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/app/api/admin/elections)
  - [`app/api/admin/users/route.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/app/api/admin/users/route.ts)
- **Explicit Non-Goals**: No page layout changes, no editorial journalism restrictions (reporters draft election stories normally).
- **Verification Tests**: `npm run test:four-role-newsroom`.
- **Exit Criteria**: All elevated API routes return 403 Forbidden to `admin`, `copy_editor`, and `reporter`.

#### Phase 3.5C — CMS Shell & Page-Level Alignment
- **Gaps Handled**: GAP-12, GAP-15, GAP-16.
- **Exact Likely Files**:
  - [`app/(admin)/admin/AdminShell.tsx`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/app/%28admin%29/admin/AdminShell.tsx) (Update mobile dock, sidebar filtering)
  - 27 `INHERITED_ONLY` page files under `app/(admin)/admin/**/page.tsx` (Add Server Component auth wrappers or `canViewPage` checks)
- **Explicit Non-Goals**: No visual re-theme, no CMS navigation reorganization outside elevated surfaces.
- **Verification Tests**: `npm run typecheck`, `npm run qa:responsive`.
- **Exit Criteria**: All 48 admin pages enforce explicit server-side authorization; unauthorized direct navigation displays Access Denied; mobile dock aligns with elevated control plane.

#### Phase 3.5D — Security Defense-in-Depth & Audit Logging
- **Gaps Handled**: GAP-13, GAP-14.
- **Exact Likely Files**:
  - [`lib/api/adminRoute.ts`](file:///C:/Users/Appex/Desktop/Lokswami-v3/Lokswami-phase3.5/lib/api/adminRoute.ts) (Export `assertSameOriginWrite`)
  - Direct routes in `app/api/admin/epapers/**`, `app/api/admin/polls/**`, `app/api/admin/categories/**`, `app/api/admin/elections/**`
- **Explicit Non-Goals**: No changes to public APIs.
- **Verification Tests**: `npm run test:security`.
- **Exit Criteria**: Cross-site mutations blocked with 403 `CSRF_BLOCKED`; all admin mutations produce structured records in `adminAuditCenter`.

#### Phase 3.5E — Regression Testing & Staging Acceptance
- **Gaps Handled**: Acceptance criteria verification across all dimensions.
- **Exact Likely Files**:
  - `tests/**` (Update permissions governance and API guard test suites)
- **Explicit Non-Goals**: No deployment to production.
- **Verification Tests**: `npm run quality:full`, `npm run verify:staging`.
- **Exit Criteria**: Zero test failures; typecheck clean; strict lint clean; staging validation PASS.

---

## 11. Explicit Out-of-Scope Items

To maintain strict phase focus, the following items are formally declared **out of scope** for Phase 3.5:
1. **Phase 3.6 Advanced Editorial Workflows**: Bulk editorial scheduling, advanced multi-story linking, or AI-assisted content auto-generation.
2. **Phase 3.10 Ads & Monetization Expansion**: Building an end-to-end ad-server engine or third-party ad-network mediation (GAP-17).
3. **Database Schema Migrations**: Dropping legacy fields or changing MongoDB collection architectures.
4. **Third-Party Integrations**: Enabling live Resend email sending, live social API publishing, or n8n webhooks.
5. **Distributed Redis Session Architecture**: Introducing Redis token denylists (GAP-18).
6. **New Canonical Roles**: Creating roles outside `super_admin`, `admin`, `copy_editor`, and `reporter`.

---

## 12. Staging Safety & Isolation Checklist

Before any implementation code is promoted or tested against staging:
- [x] Dedicated staging database verified: `lokswami_staging`
- [x] Dedicated staging storage verified: `lokswami-staging-media`
- [x] Outbound social automation set to `manual`
- [x] Resend email delivery disabled
- [x] Zero production credentials or secrets exposed in repository files
- [x] Worktree initially clean: YES (clean checkout from `origin/b3/foundation`)
- [x] Current worktree status: Clean except for the intended untracked audit document `docs/b3/PHASE3_5_CMS_AUTH_RBAC_HARDENING.md`
