# LOKSWAMI B3 — PHASE 3.10 IMPLEMENTATION PLAN
## Admin & System Management Engineering Specification

- **Plan Date:** 2026-09-26
- **Repository:** `C:\Dev\Lokswami-version-3`
- **GitHub:** `zaidshery/Lokswami-version-3`
- **Branch:** `b3/phase3.10-admin-system-management`
- **Starting HEAD:** `f95eae4`
- **Integration Base:** `b3/foundation` (`f95eae4`)
- **Regression Baseline:** 303 test files, 2,021 tests passed (Vitest); `npm run typecheck` passed; `npm run lint:strict` passed
- **Status:** PLANNING ONLY — NO APPLICATION SOURCE MUTATED IN THIS TASK

---

## 1. Executive Summary

This document establishes the definitive, phased engineering blueprint for **Phase 3.10: Admin + System Management** of Lokswami.

The authoritative audit (`docs/b3/PHASE3_10_ADMIN_SYSTEM_MANAGEMENT_AUDIT.md`) proved that while Lokswami possesses a remarkably solid foundation—including centralized same-origin CSRF protection (`withAdminMutation`), an append-only MongoDB TTL audit log (`AuditLog`), automated credential redaction, and token-based staff setup—the control plane has three critical P0 flaws in its super-administrator lifecycle:
1. **Last Active Super Admin Removal Defect:** `ensureSuperAdminRemovalIsSafe` in `app/api/admin/team/[id]/route.ts` counts remaining super-admins without checking `isActive: true`, permitting the last *active* super admin to be demoted or disabled.
2. **Missing Guard in Users API:** `app/api/admin/users/route.ts` (`PATCH`) lacks any super-admin count or self-demotion check, allowing a super admin to demote themselves or another super admin to reader, bypassing all team safety.
3. **TOCTOU Race Condition:** The count check and update in `app/api/admin/team/[id]/route.ts` are separate asynchronous operations without atomic predicates or serialized concurrency locks, leaving a window where concurrent demotions produce zero active super admins.

Furthermore, several P1 security and consistency issues must be resolved:
- Outbound webhook SSRF exposure in leadership report dispatchers.
- NextAuth session invalidation asymmetry where demoted/disabled staff retain privileged Server Component page access for the 7-day JWT cookie lifetime.
- Missing rate limits on staff creation, role mutation, and password setup token redemption.
- Missing audit log events for staff password setup completion.
- Deprecation of query-string `?secret=` for cron trigger endpoints.
- Settings lost-update risks in leadership report schedules due to lack of optimistic concurrency (CAS).
- Ambiguous population presentation in `/admin/users`.

This implementation plan organizes Phase 3.10 into five strict, sequential subphases (**3.10A through 3.10E**). Every subphase has explicit scope boundaries, concrete code targets, comprehensive test specifications, and strict completion gates.

---

## 2. Inputs & Audit Evidence

This plan is directly grounded in the findings documented in `docs/b3/PHASE3_10_ADMIN_SYSTEM_MANAGEMENT_AUDIT.md`:

| Audit Finding ID | Severity | Source Location | Verified Defect / Behavior | Plan Target |
|---|---|---|---|---|
| **FINDING-P0-1** | **P0** | `app/api/admin/team/[id]/route.ts:57` | `ensureSuperAdminRemovalIsSafe` omits `{ isActive: true }`. Inactive super admins satisfy the check. | **3.10A** |
| **FINDING-P0-2** | **P0** | `app/api/admin/users/route.ts:216` | `PATCH` handler updates `role` and `isActive` without super admin count or self-demotion checks. | **3.10A** |
| **FINDING-P0-3** | **P0** | `app/api/admin/team/[id]/route.ts:128` | Count check is decoupled from `findByIdAndUpdate`, vulnerable to concurrent TOCTOU demotion race. | **3.10A** |
| **FINDING-P1-1** | **P1** | `lib/notifications/leadershipReportWebhook.ts:38` | Webhook URLs validated with `/^https?:\/\//` only. No private IP, loopback, or metadata blocking. | **3.10B** |
| **FINDING-P1-2** | **P1** | `lib/auth.ts:695` & `lib/auth/admin.ts:26` | NextAuth JWT skips DB rehydration. Demoted/disabled users remain authorized in Server Components. | **3.10C** |
| **FINDING-P1-3** | **P1** | `app/api/admin/team`, `app/api/auth/staff-setup` | Sensitive identity mutation endpoints lack rate limiting. | **3.10A** |
| **FINDING-P1-4** | **P1** | `app/api/auth/staff-setup/route.ts:82` | Successful password setup does not emit audit log event. | **3.10C** |
| **FINDING-P1-5** | **P1** | `app/api/admin/analytics/briefing-schedules/run-due/route.ts:15` | Cron secret accepted in query parameter `?secret=`, leaking into logs. | **3.10B** |
| **FINDING-P1-6** | **P1** | `lib/storage/leadershipReportSchedulesFile.ts:418` | Array overwrite without CAS / version check creates lost-update risk. | **3.10B** |
| **FINDING-P1-7** | **P1** | `app/(admin)/admin/users/page.tsx` | Queries `User` collection directly, conflating staff with readers while `Subscriber` is separate. | **3.10E** |

---

## 3. Phase Boundary & Canonical Roadmap

### Canonical Roadmap Alignment
The roadmap for Lokswami Version 3 is strictly defined:
- **Phase 3.6:** Newsroom Work Management ✅
- **Phase 3.7:** Articles / Stories / Copy Desk ✅
- **Phase 3.8:** Media / Video / Social / Push ✅
- **Phase 3.9:** E-Paper ✅
- **Phase 3.10:** Admin + System Management ◀ *(Current Phase)*
- **Phase 3.11:** Homepage 2.0 ⏭ *(Next Canonical Phase)*
- **Phase 3.12:** Article Reader 2.0
- **Phase 3.13:** Deep Links + Share + Open Graph
- **Phase 3.14:** Video Hub + Shorts
- **Phase 3.15:** E-Paper Reader + E-Magazine
- **Phase 3.16:** Mobile
- **Phase 3.17:** Accessibility
- **Phase 3.18:** Performance + Analytics + UAT + Migration Rehearsal
- **Phase 3.19:** Production Cutover

### Roadmap Label Corrections
The audit document made informal references to later phases (e.g. labeling deep analytics as "Phase 3.11" or revenue as "Phase 3.12"). This implementation plan establishes the strict, canonical definitions:
1. **Analytics & Business Value (`/admin/analytics`, `/admin/analytics/business-value`):** Classified as **Supporting / Regression Only** for Phase 3.10. Deeper algorithmic analytics and business intelligence enhancements belong to **Phase 3.18**, NOT Phase 3.11.
2. **Revenue & Monetization (`/admin/revenue`):** Classified as **Later Phase / Out of Scope** for Phase 3.10. Commercial ad networks and programmatic display belong to post-reader monetization, NOT Phase 3.12.
3. **Reader UX & Profiles:** Belong strictly to **Phase 3.11** (Homepage 2.0) and **Phase 3.12** (Article Reader 2.0).
4. **Phase 3.11 Handoff:** Upon completion of Phase 3.10, the control plane is sealed. The immediate next phase is **Phase 3.11: Homepage 2.0**.

---

## 4. Regression Baseline

The platform baseline at the initiation of Phase 3.10 planning is verified:
- **Branch:** `b3/phase3.10-admin-system-management`
- **HEAD:** `f95eae4`
- **Foundation HEAD:** `f95eae4`
- **Git Sync with Origin:** `0 0`
- **Vitest Test Suite:** 303 test files, 2,021 tests passed (0 failures)
- **Typecheck:** `npm run typecheck` passed (0 errors)
- **Strict Lint:** `npm run lint:strict` passed (0 warnings)
- **Working Tree Preservation:** Unrelated development data files (`data/analytics-events.json`, `data/categories.json`, `next-env.d.ts`) remain untouched.

All subphases must preserve this baseline. No test count reduction is permitted.

---

## 5. Security Invariants

Phase 3.10 enforces eight immutable security invariants:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 3.10 CORE SECURITY INVARIANTS                      │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. INVARIANT-SUPERADMIN-PERSISTENCE:                                        │
│    At all times, across every role change, user deactivation, or deletion,  │
│    there MUST remain at least ONE active, enabled super_admin in MongoDB.   │
│                                                                             │
│ 2. INVARIANT-ATOMIC-GOVERNANCE:                                             │
│    Super admin role/status transitions must be atomic and race-free. Count  │
│    validation and mutation must execute within an atomic predicate or lock. │
│                                                                             │
│ 3. INVARIANT-ROUTE-PARITY:                                                  │
│    No secondary or administrative API (/api/admin/users) may bypass the     │
│    authoritative governance rules enforced on primary routes (/api/admin/team)│
│                                                                             │
│ 4. INVARIANT-SECRET-NON-EXPOSURE:                                           │
│    No administrative API or diagnostic surface may serialize plaintext      │
│    credentials, secret keys, or database connection strings.               │
│                                                                             │
│ 5. INVARIANT-SSRF-SAFE-WEBHOOKS:                                            │
│    Outbound webhook requests must enforce HTTPS and block private IP subnets,│
│    loopbacks, link-local addresses, cloud metadata services, and redirects. │
│                                                                             │
│ 6. INVARIANT-SESSION-FRESHNESS:                                             │
│    Deactivated or demoted accounts must lose privileged access in Server     │
│    Components immediately upon database update without awaiting cookie expiry│
│                                                                             │
│ 7. INVARIANT-APPEND-ONLY-AUDIT:                                             │
│    Audit logs are strictly append-only. No API or service may alter or       │
│    delete historical audit records. Actor identity is server-derived.       │
│                                                                             │
│ 8. INVARIANT-BOUNDED-RESOURCES:                                             │
│    All administrative identity, onboarding, and webhook actions must be      │
│    rate-limited and timeout-bounded.                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Canonical RBAC Model

The four newsroom roles defined in `lib/auth/roles.ts` and `lib/auth/permissions.ts` remain the sole staff identities:
- `super_admin`: Platform governance, team administration, settings, audit logs, operations center, and diagnostics.
- `admin`: Operational newsroom manager. Content queues, assignments, categories, contact messages, analytics. Strictly forbidden from team, settings, audit logs, and diagnostics.
- `copy_editor`: Copy desk worker. Reviews assigned stories/articles. No publishing authority; no administrative access.
- `reporter`: Field author. Submits own articles and stories. No copy desk review access; no administrative access.
- `reader`: Public consumer identity. Zero administrative panel access.

### Parity Invariant
Administrative surfaces (`/admin/team`, `/admin/users`, `/admin/settings`, `/admin/settings/newsroom`, `/admin/settings/elections`, `/admin/audit-log`, `/admin/permission-review`, `/admin/operations`, `/admin/operations-diagnostics`, `/admin/ai`) require strict `super_admin` authorization across Page Guards (`canViewPage`), API Route Guards (`withAdminApi`), and Service Layers.

---

## 7. P0 Closure Plan

### P0-1: Team Last Active Super Admin Safety
- **Root Cause:** `ensureSuperAdminRemovalIsSafe(id)` in `app/api/admin/team/[id]/route.ts` runs `User.countDocuments({ role: 'super_admin', _id: { $ne: id } })` without `{ isActive: true }`.
- **Target Subphase:** **3.10A**
- **Action:** Replace route-local logic with a centralized domain helper `assertRemainingActiveSuperAdmins(targetId)` in `lib/auth/superAdminGovernance.ts`. The query requires `{ role: 'super_admin', isActive: true, _id: { $ne: targetId } }`. If the count is 0, the mutation is rejected with 400 `BAD_REQUEST` (`At least one active super admin must remain`).
- **Self-Action Guard:** Explicitly reject self-demotion or self-deactivation when `admin.id === targetId` if the remaining active count is 0.

### P0-2: Users PATCH Last Super Admin Safety
- **Root Cause:** `app/api/admin/users/route.ts` (`PATCH`) allows updating `role` and `isActive` via `findByIdAndUpdate` without evaluating whether the target user is a super admin or the last remaining super admin.
- **Target Subphase:** **3.10A**
- **Action:** Refactor `app/api/admin/users/route.ts` (`PATCH`) to use the exact same `lib/auth/superAdminGovernance.ts` validation service. If the target user currently has `role === 'super_admin'`, any attempt to set `role !== 'super_admin'` or `isActive === false` invokes `assertRemainingActiveSuperAdmins(targetId)`.

### P0-3: Super Admin Demotion TOCTOU Race Condition
- **Root Cause:** In `app/api/admin/team/[id]/route.ts`, checking the remaining count and executing `findByIdAndUpdate` are two distinct asynchronous queries. Two concurrent requests can both see 1 remaining super admin and both execute demotion, leaving 0 super admins.
- **Target Subphase:** **3.10A**
- **Action:** Implement an atomic governance mechanism in `lib/auth/superAdminGovernance.ts`:
  1. **MongoDB Replica Set:** Utilize `startSession()` and `withTransaction()` where supported, executing the count and update within the transaction.
  2. **Process-Level Mutex (Standalone / Local / File Fallback):** Implement an asynchronous serialized lock (`withSuperAdminLock(fn)`) ensuring that concurrent super-admin mutations within the Node.js process are executed sequentially, eliminating race conditions.
  3. **Atomic Predicate:** The update query targets `{ _id: targetId, role: 'super_admin' }` with optimistic condition checking.

---

## 8. P1 Closure Plan

### P1-1: Leadership Report Outbound Webhook SSRF Hardening
- **Target Subphase:** **3.10B**
- **Action:** Create `lib/security/safeUrlFetch.ts` and update `lib/notifications/leadershipReportWebhook.ts`:
  - Enforce `https://` protocol only (reject `http://` in production / non-test environments).
  - Reject URLs containing credentials/userinfo (`user:pass@host`).
  - Perform DNS lookup and validate that resolved IP addresses do NOT belong to private IPv4 subnets (RFC 1918: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), loopback (`127.0.0.0/8`, `::1`), link-local (`169.254.0.0/16`, cloud metadata `169.254.169.254`), or IPv6 site/unique-local (`fe80::/10`, `fc00::/7`).
  - Configure `fetch` with `redirect: 'manual'` (or `'error'`) to prevent open redirects from bypassing IP checks.
  - Enforce 5-second timeout via `AbortSignal.timeout(5000)` and limit response body reading to 2KB.

### P1-2: NextAuth Session Invalidation & Role Freshness
- **Target Subphase:** **3.10C**
- **Action:** Update `lib/auth/admin.ts` `getAdminSession()`:
  - When `sessionUser.userId` is present and is a valid ObjectId, re-hydrate `role` and `isActive` directly from MongoDB (with short in-memory cache of 30 seconds to prevent DB hammering, invalidated immediately on admin mutations).
  - If the database indicates `isActive === false` or the user is demoted to `reader`, `getAdminSession()` immediately returns `null`.
  - Server Components will immediately deny access and redirect to signin.

### P1-3: Rate Limiting on Sensitive Administrative Mutations
- **Target Subphase:** **3.10A**
- **Action:** Wire `checkRateLimit` from `lib/security/getRateLimiter.ts`:
  - `POST /api/admin/team` (Staff invitation): Limit to 10 invitations per 10 minutes per IP/actor.
  - `PATCH /api/admin/team/[id]` (Role/status update): Limit to 30 mutations per 5 minutes.
  - `POST /api/auth/staff-setup` (Setup token redemption): Limit to 5 attempts per 15 minutes per IP.
  - `POST /api/admin/team/[id]/setup-link` (Setup link regeneration): Limit to 5 per 15 minutes per target member.

### P1-4: Audit Logging for Staff Password Setup
- **Target Subphase:** **3.10C**
- **Action:** In `app/api/auth/staff-setup/route.ts` (`POST`), upon successful password establishment, call `logAuthAuditEvent` with `action: 'login'` or dedicated action `'settings_change'`, capturing `userId`, `userEmail`, `userRole`, `success: true`. Ensure zero password or token values are included.

### P1-5: Briefing Cron Secret Transport Deprecation
- **Target Subphase:** **3.10B**
- **Action:** In `app/api/admin/analytics/briefing-schedules/run-due/route.ts`:
  - Deprecate `?secret=` query parameter.
  - Enforce `Authorization: Bearer <secret>` or `X-Lokswami-Cron-Secret: <secret>` headers.
  - Use `crypto.timingSafeEqual` for constant-time secret comparison.
  - If a query parameter is passed in production, log a deprecation warning in development/staging and reject in production.

### P1-6: Settings Optimistic Concurrency Control (CAS)
- **Target Subphase:** **3.10B**
- **Action:** In `lib/storage/leadershipReportSchedulesFile.ts` and `app/api/admin/settings/leadership-reports/route.ts`:
  - Add `updatedAt` / `version` field to `updateLeadershipReportSchedule`.
  - The API accepts `expectedUpdatedAt`. If the database/file record has a later timestamp, return 409 `CONFLICT` (`Settings were modified by another administrator. Please reload.`).

### P1-7: Ambiguous User / Subscriber Population Presentation
- **Target Subphase:** **3.10E**
- **Action:** In `app/(admin)/admin/users/page.tsx` and `UsersManagementClient.tsx`:
  - Explicitly badge records: Staff accounts (`super_admin`, `admin`, `copy_editor`, `reporter`) vs Reader accounts (`reader`).
  - Provide a clear banner and quick-link from `/admin/users` to `/admin/team` for staff management.
  - Add explanatory note that newsletter subscribers are managed separately via the `subscribers` collection.

---

## 9. P2 / Deferred Work

The following items are documented as safe to defer beyond Phase 3.10:
1. **Dynamic Newsroom Guidelines Engine:** Keep `/admin/settings/newsroom` as read-only informational cards. Defer dynamic workflow engine configuration to post-3.19.
2. **OpenAPI Security Scheme Label Sync:** Rename `bearerAuth` to `cookieAuth` in `lib/api/openapi.ts`.
3. **Revenue Screen Implementation:** Keep `/admin/revenue` as an informational monetization readiness dashboard. Full ad network configuration is deferred to post-reader monetization.
4. **Subscriber Management Console:** Dedicated CRUD interface for `Subscriber` newsletter emails deferred to Phase 3.18.

---

## 10. Subphase 3.10A Detailed Plan: Identity, Team, & Super Admin Safety

### Objective
Close all Phase 3.10 P0 identity vulnerabilities, implement the canonical last-active-super-admin invariant, eliminate TOCTOU demotion races, add self-action protections, and rate-limit onboarding endpoints.

### Scope & Deliverables
1. **`lib/auth/superAdminGovernance.ts` (New Domain Service):**
   - `assertRemainingActiveSuperAdmins({ targetId, actorId, nextRole, nextIsActive })`:
     - Determines if the target user currently has `role === 'super_admin'`.
     - Determines if the proposed update would demote the user (`nextRole !== 'super_admin'`) or deactivate them (`nextIsActive === false`).
     - If so, executes a query for remaining active super admins: `{ role: 'super_admin', isActive: true, _id: { $ne: targetId } }`.
     - If remaining count is `< 1`, rejects with typed error `LastSuperAdminRemovalError`.
     - If `targetId === actorId` and remaining count `< 1`, rejects with `SelfDemotionError`.
   - `withSuperAdminLock<T>(fn: () => Promise<T>): Promise<T>`:
     - An in-memory serialized execution queue to guarantee sequential execution of super-admin role changes within the Node.js process.
     - Attempts MongoDB session transaction (`withTransaction`) if replica set is detected; falls back gracefully to serialized lock.
2. **`app/api/admin/team/[id]/route.ts` Refactoring:**
   - Replace local `ensureSuperAdminRemovalIsSafe` with `assertRemainingActiveSuperAdmins`.
   - Wrap PATCH and DELETE mutations in `withSuperAdminLock`.
   - Apply `checkRateLimit({ scope: 'admin', identifier: admin.id })`.
3. **`app/api/admin/users/route.ts` Refactoring:**
   - In `PATCH`, check existing user's role before applying updates.
   - If target user is `super_admin`, call `assertRemainingActiveSuperAdmins`.
   - Wrap update in `withSuperAdminLock`.
   - Apply `checkRateLimit`.
4. **`app/api/admin/team/route.ts` & `app/api/auth/staff-setup/route.ts` Rate Limiting:**
   - Add `checkRateLimit` to `POST /api/admin/team` (scope: `'auth'`).
   - Add `checkRateLimit` to `POST /api/auth/staff-setup` (scope: `'auth'`).

### Required Tests
- `tests/admin-super-admin-safety.test.ts`:
  - Sole active super admin cannot demote self via `/api/admin/team/[id]`.
  - Sole active super admin cannot be deactivated via `/api/admin/team/[id]`.
  - Inactive second super admin does NOT satisfy the safety check.
  - Sole active super admin cannot be demoted to reader via `/api/admin/users` PATCH.
  - Sole active super admin cannot be deactivated via `/api/admin/users` PATCH.
  - Two concurrent demotion requests are serialized; the first succeeds, the second is rejected with 400.
  - Soft-delete (DELETE `/api/admin/team/[id]`) cannot delete the last active super admin.
  - Rate limiter blocks rapid requests to `/api/admin/team` and `/api/auth/staff-setup`.

### Acceptance Gate
All tests pass; `npm run typecheck` and `npm run lint:strict` pass.
**Acceptance Marker:** `PHASE_3_10A_COMPLETE_READY_FOR_3_10B`

---

## 11. Subphase 3.10B Detailed Plan: Settings, Configuration, & Secret Boundary

### Objective
Eliminate outbound webhook SSRF vulnerabilities, enforce HTTPS, secure cron secret transport, implement settings optimistic concurrency (CAS), and safeguard the secret boundary.

### Scope & Deliverables
1. **`lib/security/safeUrlFetch.ts` (New Security Helper):**
   - `validateSafeWebhookUrl(urlString: string): { safe: boolean; error?: string }`:
     - Parses URL, enforces `protocol === 'https:'` (permits `http://` only in test/local environments when explicitly flagged).
     - Rejects `username` or `password` in URL.
     - Performs DNS lookup (via `dns.promises.lookup` or `dns.promises.resolve4`/`resolve6`).
     - Checks resolved IP against CIDR blocks for:
       - Loopback: `127.0.0.0/8`, `::1`
       - Private IPv4: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
       - Link-Local / Cloud Metadata: `169.254.0.0/16`, `169.254.169.254`
       - Unique-Local IPv6: `fc00::/7`, `fe80::/10`
   - `safeWebhookFetch(urlString: string, options: RequestInit): Promise<Response>`:
     - Calls `validateSafeWebhookUrl`.
     - Passes `redirect: 'manual'` (or `'error'`) to prevent redirect to internal IP.
     - Adds `signal: AbortSignal.timeout(5000)` (5-second timeout).
     - Caps response text reading to 2048 bytes.
2. **`lib/notifications/leadershipReportWebhook.ts` Integration:**
   - Replace raw `fetch` calls in `sendLeadershipReportWebhook` and `sendLeadershipReportCriticalAlertWebhook` with `safeWebhookFetch`.
   - Update URL filtering to reject invalid or unsafe URLs upon schedule saving.
3. **`app/api/admin/analytics/briefing-schedules/run-due/route.ts` Cron Auth Hardening:**
   - Require `Authorization: Bearer <secret>` or `X-Lokswami-Cron-Secret: <secret>`.
   - Deprecate `?secret=` query parameter (reject or return 400 with warning).
   - Use `crypto.timingSafeEqual` with matching buffer lengths.
4. **`lib/storage/leadershipReportSchedulesFile.ts` Optimistic Concurrency:**
   - In `updateLeadershipReportSchedule`, support `expectedUpdatedAt?: string`.
   - If provided and does not match current `updatedAt`, throw `SettingsConflictError(409)`.
   - Surface 409 in `app/api/admin/settings/leadership-reports/route.ts`.

### Required Tests
- `tests/admin-webhook-security.test.ts`:
  - Webhook rejected if targeting `http://localhost:3000`.
  - Webhook rejected if targeting `http://127.0.0.1`.
  - Webhook rejected if targeting `http://169.254.169.254`.
  - Webhook rejected if targeting private IP `10.0.0.1` or `192.168.1.1`.
  - Webhook rejected if protocol is unencrypted `http://` in production.
  - Webhook fetch enforces 5s timeout and limits response reading.
  - Cron route rejects query-string `?secret=` and accepts valid `Bearer` header.
  - Timing-safe comparison prevents timing attacks.
  - Stale settings update returns 409 Conflict.

### Acceptance Gate
All tests pass; `npm run typecheck` and `npm run lint:strict` pass.
**Acceptance Marker:** `PHASE_3_10B_COMPLETE_READY_FOR_3_10C`

---

## 12. Subphase 3.10C Detailed Plan: Audit, Permission Parity, & Session Integrity

### Objective
Ensure administrative session authorization is fresh in Server Components, capture audit evidence for staff onboarding, and verify append-only audit integrity.

### Scope & Deliverables
1. **`lib/auth/admin.ts` `getAdminSession` Database Rehydration:**
   - In `getAdminSession()` (used by Server Component pages), check if `sessionUser.userId` is a valid MongoDB ObjectId.
   - If so, query `User.findById(userId).select('role isActive').lean()`.
   - If the user record does not exist, `isActive === false`, or the role is no longer an admin role, return `null`.
   - This guarantees that when a user is disabled or demoted, their next page navigation immediately redirects them out of the admin panel.
2. **`app/api/auth/staff-setup/route.ts` Audit Logging:**
   - In `POST`, upon successful password setup, call `logAuthAuditEvent`:
     ```typescript
     void logAuthAuditEvent({
       action: 'login', // or 'settings_change'
       userId: result.loginId || result.email,
       userEmail: result.email,
       userRole: result.role,
       success: true,
       reason: 'Staff account password established via setup token',
     });
     ```
   - Verify that neither the setup token nor the password is included in requestData or audit logs.
3. **Audit Log Append-Only Invariant Verification:**
   - Audit all routes and models to ensure no route exists that performs `AuditLog.updateOne`, `updateMany`, `deleteOne`, or `deleteMany`.
   - Add integration test asserting that the `AuditLog` collection is strictly append-only.

### Required Tests
- `tests/admin-session-invalidation.test.ts`:
  - `getAdminSession()` returns `null` if database user has `isActive: false`, even if JWT says active.
  - `getAdminSession()` returns `null` if database user has `role: 'reader'`, even if JWT says `super_admin`.
  - Bootstrap admin continues to be authorized without database check.
- `tests/admin-audit-integrity.test.ts`:
  - Staff password setup produces an audit entry.
  - Audit entry does not contain password, hash, or setup token.
  - Audit log queries adhere to pagination and 1,000-record query cap.

### Acceptance Gate
All tests pass; `npm run typecheck` and `npm run lint:strict` pass.
**Acceptance Marker:** `PHASE_3_10C_COMPLETE_READY_FOR_3_10D`

---

## 13. Subphase 3.10D Detailed Plan: Operations, Diagnostics, & Recovery Safety

### Objective
Ensure operational diagnostics and recovery pathways are reliable, non-leaking, bounded, and gracefully degrade during provider outages.

### Scope & Deliverables
1. **`lib/admin/operationalDiagnostics.ts` Information Minimization:**
   - Verify that `buildDiagnosticsSummary()` never serializes raw connection strings or secrets.
   - Ensure all database, spaces, OCR, and webhook statuses are represented as boolean or masked strings (`configured: true`, `region: 'blr1'`).
2. **Graceful Outage Degradation:**
   - Ensure that if MongoDB is unavailable, `/api/health` returns HTTP 503 `{ status: 'error', db: 'unavailable' }` without throwing an unhandled exception.
   - Ensure that if Spaces or OCR are unavailable, the diagnostics screen reports `status: 'degraded'` rather than crashing the page render.
3. **Destructive Action Safeguards:**
   - Audit `/admin/operations` and related recovery triggers to ensure confirmation dialogs, idempotency, and audit trails are complete.

### Required Tests
- `tests/admin-operations-safety.test.ts`:
  - Diagnostics payload does not match any regex for credentials (`mongodb://`, `Bearer `, `secret`).
  - Public health probe returns minimal JSON without leaking internal topology.
  - Simulated database outage returns clean 503 JSON without stack trace.
  - Simulated Spaces outage marks storage degraded without breaking overall health.

### Acceptance Gate
All tests pass; `npm run typecheck` and `npm run lint:strict` pass.
**Acceptance Marker:** `PHASE_3_10D_COMPLETE_READY_FOR_3_10E`

---

## 14. Subphase 3.10E Detailed Plan: System UX, Accessibility, & Final QA

### Objective
Polish admin system UI/UX, verify responsive layouts and accessibility compliance, clarify user population boundaries, and execute the complete regression test suite.

### Scope & Deliverables
1. **`/admin/users` Population Clarity:**
   - Add visual badges distinguishing staff members from readers.
   - Add an informational header clarifying that staff permissions and setup links are managed in `/admin/team`.
   - Provide direct link from `/admin/users` to `/admin/team` when viewing staff members.
2. **System UX Feedback:**
   - Verify loading spinners, skeleton states, error banners, and success toasts across `/admin/team`, `/admin/users`, `/admin/settings`, and `/admin/audit-log`.
   - Add 409 Conflict toast handling when settings update is rejected.
   - Add 429 Rate Limit toast handling with retry-after message.
   - Ensure destructive confirmations require explicit button confirmation.
3. **Accessibility (WCAG 2.1 AA):**
   - Ensure all modal dialogs trap focus and close on Escape.
   - Verify screen reader announcements for status changes (`aria-live="polite"`).
   - Verify touch targets on mobile viewports meet minimum 44x44px.
4. **Responsive Layouts:**
   - Validate desktop (1440x900), tablet (768x1024), and mobile (390x844).
5. **Four-Role Matrix Verification:**
   - Execute full four-role acceptance test suite.

### Required Tests
- `tests/phase310-four-role-acceptance.test.ts`:
  - Full matrix test covering `super_admin`, `admin`, `copy_editor`, `reporter` across all Phase 3.10 routes and APIs.
- Component accessibility and responsive layout tests.

### Acceptance Gate
All tests pass; full CI build passes (`npm run build:ci`); `npm run test:ci` passes.
**Acceptance Marker:** `PHASE_3_10E_COMPLETE_READY_FOR_PHASE_3_10_MERGE`

---

## 15. Dependency Graph

```
┌────────────────────────────────────────────────────────┐
│ 3.10A: Identity, Team & Super Admin Safety             │
│ (Fixes P0-1, P0-2, P0-3, self-actions, rate limits)    │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ 3.10B: Settings, Webhook SSRF & Secret Boundary        │
│ (Fixes P1-1, P1-5, P1-6, safe URL fetch, CAS, cron auth│
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ 3.10C: Audit Parity & Session Freshness                │
│ (Fixes P1-2, P1-4, getAdminSession DB check, setup log)│
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ 3.10D: Operations & Diagnostics Safety                 │
│ (Minimization, outage resilience, safe health routes)  │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ 3.10E: System UX, Accessibility & Final QA             │
│ (Fixes P1-7, user clarity, a11y, 4-role verification)  │
└────────────────────────────────────────────────────────┘
```

---

## 16. Data & Schema Implications

No destructive database schema migrations are required for Phase 3.10:
- **`User` Model:** Existing fields (`role`, `isActive`, `loginId`, `setupTokenHash`, `setupTokenExpiresAt`, `setupTokenIssuedAt`, `passwordHash`) remain unchanged.
- **`AuditLog` Model:** Fields remain unchanged. Retains 365-day TTL index.
- **`LeadershipReportSchedule` Model:** Add optional `updatedAt` / `version` field for optimistic concurrency checks.
- **`Subscriber` Model:** Remains completely decoupled from `User`.

---

## 17. Concurrency Model

1. **Super Admin Removal Concurrency:**
   - Handled via `withSuperAdminLock` in Node.js, serializing concurrent demotions/deactivations within the runtime process.
   - Accompanied by MongoDB session transactions where replica sets exist.
   - Eliminates the window where two requests can demote separate super admins simultaneously.
2. **Settings Updates Concurrency:**
   - Handled via optimistic concurrency (CAS).
   - Writes pass `expectedUpdatedAt`; if the stored document was modified after `expectedUpdatedAt`, write is rejected with 409 Conflict.
3. **Setup Token Redemption Concurrency:**
   - `setStaffPasswordWithToken` uses atomic `findOneAndUpdate({ setupTokenHash: hash, setupTokenExpiresAt: { $gt: now } }, ...)` clearing the hash in the same update. Only the first concurrent request succeeds; the second receives 400 Invalid/Expired.

---

## 18. Session Authorization Model

```
[ Browser Request with Cookie ]
               │
               ▼
[ Next.js Middleware / Page Guard ]
               │
               ▼
[ Server Component (getAdminSession) ]
               │
               ├─ 1. Reads NextAuth session from JWT
               ├─ 2. If sessionUser is DB staff (valid ObjectId):
               │       └─ Queries User in MongoDB: { _id, isActive, role }
               │       └─ If isActive === false OR role demoted:
               │            └─ Returns null (Immediate 307 Redirect to /signin)
               ▼
[ Admin API Handler (withAdminApi) ]
               │
               ├─ 1. Same-Origin Check (Sec-Fetch-Site & Origin)
               ├─ 2. getAdminSessionFromReq (Fresh DB lookup of role & isActive)
               └─ 3. Authorize callback (RBAC check)
```

---

## 19. Secret & Configuration Trust Model

- **Environment Secrets:** `MONGODB_URI`, `NEXTAUTH_SECRET`, `DIGITALOCEAN_SPACES_SECRET_KEY`, `OCR_SPACE_API_KEY`, `LEADERSHIP_REPORT_CRON_SECRET` are server-only.
- **Client Serializability:** No API serializer or JSON response may include these keys.
- **Masking:** Diagnostics return `configured: boolean` or masked strings (`sk-...1234`).
- **Timing-Safe Comparison:** All secret comparisons for machine cron requests use `crypto.timingSafeEqual`.

---

## 20. Webhook Network Trust Model

```
[ Outbound Webhook Request ]
               │
               ▼
[ validateSafeWebhookUrl ]
   ├─ Protocol Check: Must be https:
   ├─ Userinfo Check: Must NOT contain user:pass
   ├─ DNS Resolution: Resolve hostname to IP addresses
   ├─ IP Range Assertion: Reject if in:
   │    ├─ Loopback (127.0.0.0/8, ::1)
   │    ├─ Private IPv4 (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
   │    ├─ Link-Local / Metadata (169.254.0.0/16, 169.254.169.254)
   │    └─ Unique/Site-Local IPv6 (fc00::/7, fe80::/10)
   ▼
[ safeWebhookFetch ]
   ├─ Redirect: 'manual' (Prevent open redirect to private IP)
   ├─ Timeout: 5000ms (AbortSignal.timeout)
   └─ Response Bounded: Read max 2048 bytes
```

---

## 21. Audit & Redaction Model

- **Append-Only Invariant:** Verified by automated tests. No code path permits update or deletion of `AuditLog`.
- **Actor Attribution:** Bound to authenticated session context; client-provided actor fields are ignored.
- **Redaction:** `sanitizeRequestData` recursively redacts sensitive fields matching regex patterns for passwords, hashes, tokens, keys, authorization headers, and cookies.
- **Setup Event Inclusion:** Staff password setup completion is recorded without sensitive payload.

---

## 22. Operations & Diagnostics Trust Boundary

- `/api/health` and `/api/v1/public/health` are public, returning minimal status (`{ status: 'ok' }` or `{ status: 'error' }`).
- `/admin/operations-diagnostics` requires `super_admin` role. It discloses dependency connectivity and health metrics, but zero secrets or internal network topology.
- Operational recoveries (e.g. OCR retry, push alert cancellation) require explicit confirmation and produce audit log entries.

---

## 23. Test Strategy

Phase 3.10 includes nine dedicated test suites:
1. `tests/admin-super-admin-safety.test.ts` (Last super admin safety across Team and Users APIs)
2. `tests/admin-identity-concurrency.test.ts` (Concurrent demotion race serialization)
3. `tests/admin-webhook-security.test.ts` (SSRF IP blocking, HTTPS, timeout, bounded responses)
4. `tests/admin-settings-concurrency.test.ts` (Optimistic concurrency / CAS 409 conflict tests)
5. `tests/admin-session-invalidation.test.ts` (Immediate Server Component lockout on demotion/deactivation)
6. `tests/admin-audit-integrity.test.ts` (Append-only enforcement and setup event audit logging)
7. `tests/admin-operations-safety.test.ts` (Diagnostics minimization and provider outage resilience)
8. `tests/phase310-four-role-acceptance.test.ts` (Four-role RBAC matrix across all Phase 3.10 surfaces)
9. `tests/phase310-accessibility-ux.test.ts` (Keyboard navigation, a11y live regions, responsive docks)

---

## 24. Four-Role Acceptance Matrix

| Surface / Route | Super Admin | Admin | Copy Editor | Reporter |
|---|---|---|---|---|
| Dashboard (`/admin`) | Full Access | Full Access | Workspace View | Workspace View |
| Team (`/admin/team`) | **Full Access** | Denied (307) | Denied (307) | Denied (307) |
| `/api/admin/team` | **Full Access** | Denied (403) | Denied (403) | Denied (403) |
| `/api/admin/team/[id]` | **Full Access** (Safe) | Denied (403) | Denied (403) | Denied (403) |
| Users (`/admin/users`) | **Full Access** | Denied (307) | Denied (307) | Denied (307) |
| `/api/admin/users` | **Full Access** (Safe) | Denied (403) | Denied (403) | Denied (403) |
| Settings (`/admin/settings`)| **Full Access** | Denied (307) | Denied (307) | Denied (307) |
| Audit Log (`/admin/audit-log`)| **Full Access** | Denied (307) | Denied (307) | Denied (307) |
| Permission Review (`/admin/permission-review`)| **Full Access** | Denied (307) | Denied (307) | Denied (307) |
| Operations Center (`/admin/operations`)| **Full Access** | Denied (307) | Denied (307) | Denied (307) |
| Diagnostics (`/admin/operations-diagnostics`)| **Full Access** | Denied (307) | Denied (307) | Denied (307) |
| AI Ops (`/admin/ai`) | **Full Access** | Denied (307) | Denied (307) | Denied (307) |

---

## 25. UX & Accessibility Strategy

1. **State Treatments:**
   - Loading: Non-blocking animated skeletons matching the card layout.
   - Empty: Clear icons, descriptive guidance, and action buttons.
   - Error: Clear error message, error code, and retry trigger.
   - Conflict (409): Specific banner explaining that settings were updated by another editor, with a "Reload Latest" button.
   - Rate Limited (429): Toast with countdown indicator.
2. **WCAG 2.1 AA Compliance:**
   - Explicit `label` associations for all inputs.
   - `role="alert"` or `aria-live="polite"` on feedback banners.
   - Keyboard navigable focus rings (`:focus-visible`).
   - Modal focus trapping and `Escape` key listeners.
   - Touch targets meeting minimum 44x44px.

---

## 26. Safety & Environment Rules

1. **Read-Only / Local Mock Testing:** Automated tests must use mock databases, mock network dispatchers, and local fixtures. No real network calls to external webhooks, email providers, or cloud storage.
2. **Zero Plaintext Credentials:** No test or code may inspect or print `.env`, `.env.local`, or secret variables.
3. **No Unapproved State Mutations:** No changes to real production or staging MongoDB instances.

---

## 27. Git & Integration Strategy

For each implementation subphase (3.10A through 3.10E):
1. **Recon First:** Verify code and tests in target area.
2. **Implement Focused Tests:** Write unit/integration tests establishing red/green state.
3. **Implement Code Changes:** Make clean, focused modifications.
4. **Run Full Verification Gates:**
   - `npm run typecheck`
   - `npm run lint:strict`
   - `npm run test:four-role-newsroom`
   - `npm run test:security`
   - `npm run test:auth-guards`
   - `npm run check:phase3-scope`
   - `npm run build:ci`
   - `npm run test:ci`
5. **Git Review:**
   - Inspect `git status --short`, `git diff --check`, and `git diff --stat`.
   - Never use `git add .` or `git add -A`. Explicitly stage reviewed files.
   - Ensure generated/data files (`data/analytics-events.json`, `data/categories.json`, `next-env.d.ts`) remain un-staged unless explicitly required.
   - Push to `b3/phase3.10-admin-system-management` and verify remote sync `0 0`.

---

## 28. Phase 3.10 Completion Gates

Before Phase 3.10 is considered complete and ready for merge into `b3/foundation`:
1. All three P0 findings (P0-1, P0-2, P0-3) are completely closed and verified by automated concurrency tests.
2. All seven P1 findings are closed and verified.
3. Total test suite passes with 0 failures, preserving or increasing the 2,021 test baseline.
4. `npm run typecheck` passes with 0 errors.
5. `npm run lint:strict` passes with 0 warnings.
6. `npm run build:ci` succeeds cleanly.
7. Four-role RBAC matrix is 100% verified.

---

## 29. Phase 3.11 Handoff Boundary

Upon completion and merge of Phase 3.10:
- The administrative and system management control plane is sealed and production-ready.
- The next canonical phase is **Phase 3.11: Homepage 2.0**, which will modernize reader-facing homepage layouts, live update tickers, breaking news priority rails, and popular news feeds.
- No reader-facing homepage code is modified during Phase 3.10.

---

## 30. Risks & Open Questions

1. **MongoDB Deployment Mode in Production:**
   - If production runs as a single-node MongoDB without replica sets, transactions throw an error. The implementation handles this gracefully by combining multi-document transactions (when supported) with in-process serialized execution (`withSuperAdminLock`).
2. **NextAuth JWT Rehydration Performance:**
   - Re-hydrating user active status and role in `getAdminSession()` requires a quick database lookup. To prevent excessive database load on page navigation, a lightweight in-memory cache (30-second TTL) invalidated immediately on administrative mutations can be utilized.
3. **Outbound Webhook DNS Rebinding:**
   - Webhook validation checks resolved IPs before `fetch`. In high-security environments, DNS rebinding could theoretically resolve a public IP during validation and a private IP during fetch. For Phase 3.10, performing validation immediately prior to request dispatch with a dedicated agent/dispatcher mitigates this risk.

---

## 31. Phase 3.10A Implementation Completion Record

- **Completed Phase:** Phase 3.10A — Identity + Team + Last-Active-Super-Admin Safety
- **P0-1 Closure:** Replaced flawed local `ensureSuperAdminRemovalIsSafe` with canonical governance service `lib/auth/superAdminGovernance.ts`. The remaining-admin check strictly queries `{ role: 'super_admin', isActive: true, _id: { $nin: [targetId] } }`. Inactive super admin accounts cannot satisfy the invariant.
- **P0-2 Closure:** Route parity achieved in `PATCH /api/admin/users`. Inspects target user canonical state and wraps role/isActive updates with `safeMutateSuperAdmin`, eliminating backdoor demotions and deactivations.
- **P0-3 Closure (Concurrency Architecture):** Implemented multi-layered race-free synchronization:
  1. In-process mutex queue (`withProcessQueue`) for process-local FIFO execution.
  2. MongoDB-backed distributed lock lease (`GovernanceLock.findOneAndUpdate` with 10s TTL, polling backoff) for cross-instance mutual exclusion.
  3. MongoDB multi-document transactions (`session.withTransaction`) when running on replica sets with fallback to distributed lock on standalone Mongo.
  4. File-storage serialization via `readUsersFile` / `withUsersFileMutationLock`.
- **P1 Identity Hardening:**
  - Rate limiting via `lib/security/getRateLimiter.ts`:
    - `POST /api/admin/team`: `staff_invite` (10 requests / 10 minutes)
    - `PATCH /api/admin/team/[id]`, `DELETE /api/admin/team/[id]`, `PATCH /api/admin/users`: `admin_mutation_sensitive` (30 requests / 5 minutes)
    - `POST /api/admin/team/[id]/setup-link`: `setup_link_regeneration` (5 requests / 15 minutes)
    - `POST /api/auth/staff-setup`: `staff_setup_redemption` (5 requests / 15 minutes)
  - Setup credential security: Atomic `findOneAndUpdate` claiming and invalidation in `setStaffPasswordWithToken` prevents token double-redemption races. Setup link regeneration overwrites the token hash atomically.
- **Verification & Test Coverage:**
  - Added `tests/admin-super-admin-safety.test.ts` (25 focused tests covering invariant checks, inactive super admins, self-demotion, self-deactivation, soft-deletion, Users API parity, concurrency races, and rate limiting).
  - Full regression: 304 test files, 2,046 tests passed (0 failures).
  - All automated checks clean: `typecheck`, `lint:strict`, `test:four-role-newsroom`, `test:security`, `test:auth-guards`, `check:phase3-scope`, `build:ci`.
- **Target Commit:** `feat(admin): harden super admin governance and onboarding`
