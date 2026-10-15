# LOKSWAMI B3 — PHASE 3.10 AUDIT
## Admin & System Management Architecture Audit

- **Audit Date:** 2026-09-26
- **Repository:** `C:\Dev\Lokswami-version-3`
- **GitHub:** `zaidshery/Lokswami-version-3`
- **Branch:** `b3/phase3.10-admin-system-management`
- **Starting HEAD:** `f95eae4`
- **Integration Base:** `b3/foundation` (`f95eae4`)
- **Status:** COMPLETED — READ-ONLY CODE & ARCHITECTURE AUDIT ONLY
- **Regression Baseline:** 303 test files, 2,021 tests passed (Vitest); `npm run typecheck` passed; `npm run lint:strict` passed.

---

## 1. Executive Summary

This audit establishes the canonical architectural, security, RBAC, settings, operational, and user administration baseline for **Phase 3.10: Admin + System Management** of Lokswami.

Lokswami operates a Next.js 15 App Router platform with a centralized admin control plane residing under `app/(admin)/admin` and `app/api/admin`. The system features four canonical newsroom staff roles (`super_admin`, `admin`, `copy_editor`, `reporter`) alongside reader identities (`reader`).

### Core Strengths of the Current Implementation
1. **Centralized Mutation Hardening:** A comprehensive wrapper pattern (`withAdminMutation` and `withAdminApi` in `lib/api/adminRoute.ts`) protects 93 out of 95 unsafe-method admin handlers with browser same-origin checks (`sec-fetch-site` and `origin`), request-id tracking, and automated audit logging.
2. **Append-Only Security Audit Log:** The `AuditLog` Mongoose model (`lib/models/AuditLog.ts`) and logging service (`lib/security/auditLogger.ts`) enforce append-only persistence. There is zero application code supporting update or deletion of audit records. Automatic retention expiration is handled by MongoDB TTL index (365 days).
3. **Sensitive Field Redaction:** Recursive redaction (`sanitizeRequestData` in `lib/security/auditLogger.ts`) scrubs passwords, hashes, session tokens, JWTs, API keys, and credentials from request bodies and query parameters before persistence.
4. **Token-Based Staff Onboarding:** Newsroom staff accounts do not use plaintext admin-assigned passwords. New members are provisioned via cryptographically random 48-hour setup tokens (`lib/auth/staffCredentials.ts`) hashed with SHA-256 in the database.
5. **Strict Secret Boundary in UI:** Platform settings (`/admin/settings`), deployment safeguards (`lib/admin/deploymentSafeguards.ts`), and operational diagnostics (`lib/admin/operationalDiagnostics.ts`) never print plaintext secrets, connection strings, or private keys; they expose only boolean configuration status and masked metadata.

### Critical Release Gates & Vulnerabilities Identified
- **P0 Finding — Last Super Admin Demotion / Deactivation Vulnerability:**
  In `app/api/admin/team/[id]/route.ts`, `ensureSuperAdminRemovalIsSafe(id)` queries `User.countDocuments({ role: 'super_admin', _id: { $ne: id } })` without checking `{ isActive: true }`. An inactive or disabled super admin in MongoDB satisfies the count, permitting the final active super admin to be demoted or deactivated. Furthermore, in `app/api/admin/users/route.ts` (`PATCH`), there is **no check whatsoever** against demoting or deactivating the last super admin.
- **P0 Finding — Concurrency / TOCTOU Race on Super Admin Removal:**
  In `app/api/admin/team/[id]/route.ts`, the super admin count check is not atomic with the update (`findByIdAndUpdate`). Two concurrent demotion requests will both pass the count check and demote each target, leaving the system with zero super administrators and resulting in complete administrative lockout.
- **P1 Finding — NextAuth Session Invalidation Asymmetry:**
  In `lib/auth.ts`, the NextAuth `jwt` callback caches `token.role` and `token.isActive` upon issuance and deliberately skips database rehydration if those fields exist. If an admin is demoted or disabled, their existing JWT session remains valid in Server Components (pages calling `getAdminSession()`) until cookie expiration (7 days). Only API routes calling `getAdminSessionFromReq` rehydrate from MongoDB.
- **P1 Finding — Ambiguous User / Subscriber Population Boundary:**
  `/admin/users` queries the `User` collection directly without filtering, commingling internal newsroom staff (`super_admin`, `admin`, `copy_editor`, `reporter`) with reader accounts (`reader`). The UI is titled "Users & Subscribers", yet the distinct `Subscriber` model (`lib/models/Subscriber.ts`, used for email newsletters) is completely decoupled and unmanaged by this surface.
- **P1 Finding — Outbound Webhook SSRF Exposure in Leadership Reports:**
  `sendLeadershipReportWebhook` (`lib/notifications/leadershipReportWebhook.ts`) dispatches HTTP POST payloads to admin-configurable URLs with only regex `^https?://` validation. There is no private IP blocking (RFC 1918, 127.0.0.1, 169.254.169.254) and no HTTPS requirement.
- **P1 Finding — Rate Limiting Omission on Sensitive Administrative Endpoints:**
  While a dual-engine (Redis + in-memory) rate limiter exists (`lib/security/getRateLimiter.ts`), it is only wired into `/api/admin/upload`. Sensitive endpoints—including user creation (`/api/admin/team`), role modification (`/api/admin/team/[id]`), setup token redemption (`/api/auth/staff-setup`), and briefing runs (`/api/admin/analytics/briefing-schedules/run-due`)—lack rate limiting.
- **P1 Finding — Settings Lost-Update Risk (No CAS / Optimistic Concurrency):**
  Leadership report schedules (`lib/storage/leadershipReportSchedulesFile.ts`) and election results are updated via read-modify-write array replacements without versioning (`__v`), ETags, or atomic predicates.
- **P2 Finding — Informational-Only Newsroom Settings & Revenue Mockup:**
  `/admin/settings/newsroom` provides read-only informational cards with no persisted configuration. `/admin/revenue` is an early static layout.

---

## 2. Phase Boundary

Phase 3.10 is strictly bounded to the administrative control plane, user identity management, role-based access control, system settings, audit logging, operational diagnostics, and system governance.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PHASE 3.10 BOUNDARY                             │
├───────────────────────────────────┬────────────────────────────────────┤
│ IN SCOPE (Phase 3.10)             │ OUT OF SCOPE (Deferred / Done)     │
├───────────────────────────────────┼────────────────────────────────────┤
│ • Staff User & Team Administration│ • Editorial Work Queue (Phase 3.6) │
│ • Role Assignment & Target Guard  │ • Article & Story Desk (Phase 3.7) │
│ • Super Admin Protection & Lockout│ • Media, Video & Social(Phase 3.8) │
│ • Settings & Secret Boundaries    │ • E-Paper Ingestion (Phase 3.9)    │
│ • Audit Log Viewer & Append Trail │ • Reader Public UX (Phase 3.15)    │
│ • Permission Review Parity        │ • Deep Analytics / BI (Phase 3.11) │
│ • Operations Center & Diagnostics │ • Ad Networks & Revenue(Phase 3.12)│
│ • CSRF, Mutation & Rate Limiting  │ • Enterprise SSO / SAML / OAuth IdP│
└───────────────────────────────────┴────────────────────────────────────┘
```

---

## 3. Complete Admin / System Surface Inventory

The inventory encompasses every route under `app/(admin)/admin` and `app/api/admin`.

| Route | Method(s) | Primary Purpose | Source of Truth | Page RBAC | API RBAC | Mutation Protected |
|---|---|---|---|---|---|---|
| `/admin` | GET | Admin overview & KPI dashboard | MongoDB / File Fallback | All 4 roles | N/A (Server Component) | N/A |
| `/admin/team` | GET | Team member list, invitation, role view | `User` collection | `super_admin` | N/A (Server Component) | N/A |
| `/api/admin/team` | GET, POST | List team members / invite staff user | `User` collection | N/A | `super_admin` | `withAdminApi` (mutation: true) |
| `/api/admin/team/[id]` | PATCH, DELETE | Update staff role, state / soft-delete | `User` collection | N/A | `super_admin` | `withAdminApi` (mutation: true) |
| `/api/admin/team/[id]/setup-link` | POST | Generate/reissue staff password setup link | `User` collection | N/A | `super_admin` | `withAdminMutation` |
| `/admin/users` | GET | User & subscriber account management | `User` collection | `super_admin` | N/A (Server Component) | N/A |
| `/api/admin/users` | GET, PATCH | Paginated users list / update profile & status | `User` collection | N/A | `super_admin` | `withAdminApi` (mutation: true) |
| `/admin/settings` | GET | Platform deployment safeguards & report setup | Code / Environment / Mongo | `super_admin` | N/A (Server Component) | N/A |
| `/api/admin/settings/leadership-reports` | GET | Leadership report configuration snapshot | Mongo / File fallback | N/A | `super_admin` | Read-only |
| `/admin/settings/newsroom` | GET | Informational newsroom workflow guidelines | Static code / control center | `super_admin` | N/A (Server Component) | N/A |
| `/admin/settings/elections` | GET | Election results & live widget management | `ElectionAsset` / File store | `super_admin` | N/A (Server Component) | N/A |
| `/api/admin/elections/results` | GET, POST | Read & write election party vote tallies | `data/elections.json` / Mongo | N/A | `super_admin` | `withAdminMutation` |
| `/api/admin/elections/upload` | POST | Upload election graphics & district maps | Spaces / Local disk | N/A | `super_admin` | `withAdminMutation` |
| `/api/admin/elections/delete` | POST | Delete election asset | Spaces / Local disk | N/A | `super_admin` | `withAdminMutation` |
| `/admin/audit-log` | GET | Central admin activity & mutation log | `AuditLog` collection | `super_admin` | N/A (Server Component) | N/A |
| `/admin/permission-review` | GET | Live route access map & role governance review | `lib/auth/permissions.ts` | `super_admin` | N/A (Server Component) | N/A |
| `/admin/operations` | GET | Operations center (decisions, risks, quality) | SuperAdminDashboard / Mongo | `super_admin` | N/A (Server Component) | N/A |
| `/admin/operations-diagnostics` | GET | System health, service lanes, upload/OCR status | `lib/admin/operationalDiagnostics.ts` | `super_admin` | N/A (Server Component) | N/A |
| `/admin/ai` | GET | AI operations overview & manual audio status | Code / `TtsConfig` | `super_admin` | N/A (Server Component) | N/A |
| `/api/admin/tts/settings` | GET, PUT | TTS configuration status (PUT disabled 405) | `TtsConfig` collection | N/A | `super_admin` | `withAdminMutation` |
| `/admin/api-docs` | GET | Developer OpenAPI documentation visualizer | `lib/api/openapi.ts` | `super_admin` | N/A (Server Component) | N/A |
| `/api/docs/openapi.json` | GET | Machine-readable OpenAPI 3.1.0 document | `lib/api/openapi.ts` | N/A | Public | Read-only |
| `/admin/revenue` | GET | Revenue & monetization readiness overview | `lib/admin/dashboard.ts` | `super_admin` | N/A (Server Component) | N/A |
| `/admin/analytics` | GET | Analytics center (audience, traffic, health) | `AnalyticsEvent` / Mongo | `super_admin`, `admin` | N/A (Server Component) | N/A |
| `/admin/analytics/business-value`| GET | Business value scoring dashboard | Analytics repository | `super_admin` | N/A (Server Component) | N/A |
| `/api/health` | GET | Basic system health probe (DB connectivity) | MongoDB availability | N/A | Public | Read-only |
| `/api/v1/public/health` | GET | Public API health & dependency status | MongoDB availability | N/A | Public | Read-only |

---

## 4. Current Architecture

```
[ Browser / Admin Client ]
        │
        ├─ 1. HTTP Request + Session Cookie (LOKSWAMI_SESSION_COOKIE)
        ▼
[ Next.js Middleware / AdminPageAccessGuard ]
        │   - canViewPage(role, pageKey) -> Redirects 307 if unauthorized
        ▼
[ Server Component / Page Router ] ───► [ Direct Service / Repository ]
        │                               (Reads Mongo / File Store directly)
        ▼
[ Admin API Handler (Route.ts) ]
        │
        ├─► Wrapped by withAdminApi / withAdminMutation
        │     ├─ Same-Origin Check (Sec-Fetch-Site != 'cross-site', Origin == Host)
        │     ├─ Actor Resolution (getAdminSessionFromReq re-hydrating from DB)
        │     ├─ RBAC Assertion (authorize(role, admin))
        │     └─ Append-Only Audit Logging (logAdminMutationRequest on completion)
        ▼
[ MongoDB Database (`User`, `AuditLog`, `LeadershipReportSchedule`, etc.) ]
```

---

## 5. Central RBAC Model

The canonical policy is declared in `lib/auth/permissions.ts` and `lib/auth/roles.ts`:
- **Roles:**
  - `super_admin`: Complete control over newsroom operations, identity management, system settings, audit logs, operations center, diagnostics, and deployment safeguards.
  - `admin`: Operational newsroom manager. Manages workflow queues, review queue, copy desk, assignments, articles, stories, categories, contact messages, and analytics. Cannot manage team, settings, audit log, or diagnostics.
  - `copy_editor`: Copy desk worker. Can review, edit, and transition assigned content; view articles, stories, videos, and media. Cannot publish independently or access system management.
  - `reporter`: Field contributor. Can create and edit own stories and articles; view personal work queue. Cannot access review queue, copy desk, categories, or system management.
  - `reader`: Public subscriber/consumer identity. Zero admin panel access.

### Central Policy Helpers
- `canViewPage(role, page)`: Determines route accessibility across all 52 registered admin page keys.
- `canManageTeam(role)`: Strict `isSuperAdminRole(role)`.
- `canManageTargetAdminRole(actorRole, targetRole)`:
  - `super_admin` can manage all roles (`super_admin`, `admin`, `copy_editor`, `reporter`).
  - `admin` can manage `admin`, `copy_editor`, `reporter` (when allowed by endpoint).
- `getAssignableAdminRoles(actorRole)`:
  - `super_admin`: `['super_admin', 'admin', 'reporter', 'copy_editor']`.
  - `admin`: `['admin', 'reporter', 'copy_editor']`.
- `canManageSettings(role)`: Strict `isSuperAdminRole(role)`.
- `canManageNewsroomSettings(role)`: Strict `isSuperAdminRole(role)`.
- `canManageUsers(role)`: Strict `isSuperAdminRole(role)`.
- `canRunGlobalAiOps(role)`: Strict `isSuperAdminRole(role)`.

---

## 6. Page/API/Service Authorization Parity

| Surface | Page Guard (`PAGE_ACCESS`) | GET API Guard | Mutation API Guard | Parity Status | Risk Severity |
|---|---|---|---|---|---|
| `/admin/team` | `super_admin` | `canManageTeam` (`super_admin`) | `canManageTeam` (`super_admin`) | Full Parity | None |
| `/admin/users` | `super_admin` | `canManageUsers` (`super_admin`)| `canManageUsers` (`super_admin`)| Full Parity | None |
| `/admin/settings` | `super_admin` | `canManageSettings` | None (No write API) | Full Parity | None |
| `/admin/settings/newsroom`| `super_admin` | N/A (Server Component) | None (Informational only) | Full Parity | None |
| `/admin/settings/elections`| `super_admin` | `canManageNewsroomSettings` | `canManageNewsroomSettings` | Full Parity | None |
| `/admin/audit-log` | `super_admin` | N/A (Server Component) | None (Append-only by server) | Full Parity | None |
| `/admin/permission-review`| `super_admin` | N/A (Server Component) | None (Informational only) | Full Parity | None |
| `/admin/operations` | `super_admin` | N/A (Server Component) | Content-level transition guards | Full Parity | None |
| `/admin/operations-diagnostics`| `super_admin` | N/A (Server Component) | None (Read-only diagnostics) | Full Parity | None |
| `/admin/ai` | `super_admin` | `canRunGlobalAiOps` | 405 Method Not Allowed | Full Parity | None |
| `/admin/api-docs` | `super_admin` | Public (`/api/docs/openapi.json`)| None (Read-only) | Minor Drift | Low |
| `/admin/analytics` | `super_admin`, `admin` | Inherited service checks | N/A | Full Parity | None |
| `/admin/revenue` | `super_admin` | N/A (Server Component) | None (Informational mockup) | Full Parity | None |

---

## 7. Role Hierarchy

The repository enforces strict hierarchy rules:
1. Normalization (`lib/auth/roles.ts`):
   - Maps legacy strings (`author` -> `reporter`, `editor` -> `copy_editor`, `viewer` -> `reader`).
   - Unknown role strings normalize to `null`.
2. Target-Role Safety:
   - When updating team members (`app/api/admin/team/[id]/route.ts`), the handler validates both the current role and next role against `canManageTargetAdminRole(admin.role, targetRole)`.
   - Non-super-admins cannot promote anyone to `super_admin`.

---

## 8. Privilege Escalation Analysis

An exhaustive security audit was performed across all input vectors:

| Attack Vector | Server-Side Validation Mechanism | Risk Status |
|---|---|---|
| Self-Promotion via API | Checked against `canManageTargetAdminRole(admin.role, nextRole)`. If actor is `admin`, assigning `super_admin` returns 403. | Protected |
| Arbitrary Role Strings | Sanitized via `isAdminRole(body.role)` or `normalizeUserRole(role)`. Rejects unknown values with 400 `VALIDATION_ERROR`. | Protected |
| Legacy Role Aliases Exploitation | Normalized to canonical enum before authorization checks. | Protected |
| Bypass via `/api/admin/users` | Guarded by `canManageUsers(role)` (`super_admin` only). Line 185 verifies `admin.role === 'super_admin'` before assigning `super_admin`. | Protected |
| Direct Password Injection | Team APIs do not accept passwords in payload; password set requires token redemption. | Protected |
| CSRF Role Elevation | `withAdminApi` rejects cross-site writes with 403 `CSRF_BLOCKED`. | Protected |

---

## 9. Last Super Admin Safety

### Critical P0 Vulnerability: Demotion & Lockout
The repository attempts to protect the last super admin via `ensureSuperAdminRemovalIsSafe(id)` in `app/api/admin/team/[id]/route.ts`:

```typescript
// Line 57 in app/api/admin/team/[id]/route.ts
async function ensureSuperAdminRemovalIsSafe(id: string) {
  const remainingSuperAdmins = await User.countDocuments({
    role: 'super_admin',
    _id: { $ne: id },
  });

  return remainingSuperAdmins > 0;
}
```

### Flaws Identified
1. **Disabled Accounts Satisfy the Safe Check:**
   `countDocuments` checks only `role: 'super_admin'`. It **omits** `isActive: true`. If an inactive super admin exists in the database, `remainingSuperAdmins` returns 1. The last *active* super admin can thus be deactivated or demoted!
2. **Missing Check in `/api/admin/users`:**
   In `app/api/admin/users/route.ts` (`PATCH`), there is **zero check** on whether the target user is a super admin or the last remaining super admin. A super admin can demote themselves or another super admin to `reader` via `/api/admin/users`, leaving 0 super admins.
3. **No Self-Deactivation Guard:**
   Neither `/api/admin/team/[id]` nor `/api/admin/users` prevents `admin.id === targetId`. A super admin can accidentally or maliciously disable their own active status.
4. **Bootstrap Admin Disconnection:**
   The bootstrap super admin (`env-admin:...`) is defined via environment variables and does not exist in the MongoDB `User` collection. Therefore, `countDocuments` does not reflect the bootstrap admin's existence.

---

## 10. User / Team Model Inventory

### Model Separation
Lokswami maintains three distinct identity/subscriber models:
1. `User` (`lib/models/User.ts`):
   - Mongoose collection: `users`.
   - Stores all credential-bearing accounts: newsroom staff (`super_admin`, `admin`, `copy_editor`, `reporter`) and reader web accounts (`reader`).
   - Fields: `name`, `email`, `role`, `loginId`, `whatsappNumber`, `passwordHash`, `passwordSetAt`, `setupTokenHash`, `setupTokenExpiresAt`, `setupTokenIssuedAt`, `isActive`, `lastLoginAt`, `lastActiveAt`, `readCount`, `savedArticles`, `preferredLanguage`, `optInDailyEpaper`, `pushEnabled`.
2. `Subscriber` (`lib/models/Subscriber.ts`):
   - Mongoose collection: `subscribers`.
   - Stores email newsletter subscribers (`email`, `sources`, `subscribedAt`).
   - Completely separate from `User`. It has no password, no role, and no admin access.
3. `Author` (`lib/models/Author.ts`):
   - Byline attribution record (`name`, `bio`, `avatar`, `socialLinks`, `isActive`).

---

## 11. User Creation & Invitation Architecture

```
[ Super Admin UI (/admin/team) ]
         │
         ▼
[ POST /api/admin/team ]
   ├─ Validates email, name, role
   ├─ Asserts canManageTargetAdminRole
   ├─ Generates unique loginId (e.g., 'john-doe')
   ├─ Creates/updates User record in MongoDB (isActive: true)
   ├─ Issues Setup Token (crypto.randomBytes(24) -> 48 hex chars)
   │    └─ Stores SHA-256 hash in setupTokenHash
   │    └─ Sets setupTokenExpiresAt (now + 48 hours)
   ├─ Sends Invitation Email via Resend / SMTP (if configured)
   └─ Returns setupLink in API response for clipboard copying
         │
         ▼
[ User clicks /setup-admin-account?token=... ]
         │
         ▼
[ POST /api/auth/staff-setup ]
   ├─ Hashes input token with SHA-256
   ├─ Finds user by setupTokenHash
   ├─ Validates token expiration (< 48 hrs) and role (isAdminRole)
   ├─ Hashes new password with bcrypt (cost factor 12)
   ├─ Clears setupTokenHash & setupTokenExpiresAt (one-time redemption)
   └─ Saves passwordHash & passwordSetAt
```

### Security Audit of Invitation Flow
- Token Entropy: 192 bits (`crypto.randomBytes(24)`). Cryptographically secure against brute force.
- Replay Protection: Token is cleared immediately upon successful redemption.
- Expiration: Default 48 hours (`ADMIN_STAFF_SETUP_TOKEN_HOURS`).
- Email Hijacking Mitigation: Setup link is returned directly to the initiating super admin in the API response, allowing manual delivery if email delivery is unconfigured.

---

## 12. Password Handling

1. **Hashing Algorithm:** `bcryptjs` with salt work factor of 12 (`lib/auth/jwt.ts` line 14).
2. **Hash Exposure Prevention:**
   - Password hashes are never returned by `/api/admin/team` or `/api/admin/users`.
   - Projections explicitly omit `passwordHash` or map records via `toTeamMember()`, which extracts only `credentialStatus: 'password_ready' | 'setup_pending' | 'setup_expired' | 'credentials_not_set'`.
3. **No Plaintext Password Exposure:**
   - Administrators cannot view or reset passwords to a plaintext string.
   - Password resets must occur via token-based setup links (`/api/admin/team/[id]/setup-link`).

---

## 13. Session Invalidation

| Scenario | Server Component Behavior (`getAdminSession`) | Admin API Route Behavior (`getAdminSessionFromReq`) | Public / Reader API Behavior |
|---|---|---|---|
| Role Demoted to Reader | Continues to recognize old role until JWT cookie expires | Re-queries MongoDB, detects non-admin role, returns 401 | Remains valid reader session |
| Account Deactivated (`isActive: false`) | Continues to recognize user as active until JWT expires | Re-queries MongoDB, detects `isActive === false`, returns 401 | Continues until JWT expires |
| Password Changed | Existing JWTs remain valid (no `passwordChangedAt` or `tokenVersion` check) | Existing JWTs remain valid if user is active and role is valid | Remains valid |
| User "Deleted" (Soft-demoted to reader) | Continues to recognize old role until JWT cookie expires | Re-queries MongoDB, detects reader role, returns 401 | Remains valid reader session |

### Classification
This is a **P1 Authorization Drift Risk**. NextAuth JWT tokens lack a `tokenVersion` or `sessionVersion` claim. While API mutations calling `getAdminSessionFromReq` are protected by fresh database lookups, server-rendered admin pages rely on un-invalidated cookies.

---

## 14. Account Disable / Delete Semantics

- **Account Disabling:** Setting `isActive: false` halts access to all API routes calling `getAdminSessionFromReq`.
- **Account Deletion:** `DELETE /api/admin/team/[id]` does **not** destroy the MongoDB document:
  ```typescript
  // Line 182 in app/api/admin/team/[id]/route.ts
  await User.findByIdAndUpdate(id, {
    $set: {
      role: 'reader',
      isActive: true,
    },
  });
  ```
- **Editorial Attribution Safety:** Because the record is soft-demoted to `reader` rather than purged from MongoDB, historical articles, stories, bylines, and audit entries referencing `_id` are **never orphaned**.
- **Reversibility:** A super admin can restore the user by updating their role back to `admin`, `copy_editor`, or `reporter` via `/admin/team`.

---

## 15. Settings Architecture

The platform's settings are split between environment configurations, file stores, and database models:

| Setting Category | Storage Location | Editable via UI? | Restart Required? | Secret Boundary |
|---|---|---|---|---|
| Deployment Safeguards | Environment variables (`MONGODB_URI`, `NEXTAUTH_SECRET`, etc.) | Read-only in UI | Yes (Env change) | Boolean / status only |
| Leadership Report Schedules | `LeadershipReportSchedule` in MongoDB / File fallback | Yes (via API) | No | Non-secret metadata |
| Critical Alert State | `leadershipReportCriticalAlertState.json` / Mongo | Yes (Mute/Unmute) | No | Non-secret timestamps |
| TTS & Audio Settings | `TtsConfig` model (`lib/models/TtsConfig.ts`) | Read-only (PUT returns 405)| No | Provider metadata only |
| Newsroom Guidelines | Static TypeScript code (`lib/admin/newsroomControlCenter.ts`) | No (Informational)| Yes (Code deploy) | Public guidelines |
| Election Configurations | `data/elections.json` / `ElectionAsset` | Yes (via election API) | No | Non-secret vote tallies |

---

## 16. Secret Boundary

Lokswami implements strict secret boundary defenses:
1. **Server-Side Isolation:** Secrets (`MONGODB_URI`, `NEXTAUTH_SECRET`, `DIGITALOCEAN_SPACES_SECRET_KEY`, `OCR_SPACE_API_KEY`, `LEADERSHIP_REPORT_CRON_SECRET`) are never serialized to the client.
2. **Boolean Diagnostics:** `buildUploadRuntimeSummary()` and `buildDatabaseCheck()` inspect `process.env.*` and return status booleans (`configured: true/false`).
3. **No Plaintext Readback:** No administrative API endpoint returns environment variables, credentials, or secret keys.

---

## 17. Newsroom Settings

- **File:** `app/(admin)/admin/settings/newsroom/page.tsx`.
- **Purpose:** Outlines desk ownership rules, assignment policies, push-alert editorial criteria, and queue thresholds.
- **Current State:** Completely read-only and informational. It connects editors to operational queues (`/admin/team`, `/admin/push-alerts`, `/admin/assignments`, `/admin/content-queue`) without storing conflicting state.
- **Classification:** Phase 3.10 Supporting (Editorial reference surface).

---

## 18. Configuration Concurrency

- **Lost-Update Vulnerability:**
  In `lib/storage/leadershipReportSchedulesFile.ts` (`updateLeadershipReportSchedule`), the schedule array is fetched, mutated in memory, and rewritten. If two administrators update schedules simultaneously, the second write silently overwrites the first.
- **Recommendation:** Implement atomic property updates or optimistic concurrency control via document versioning (`__v` CAS check).

---

## 19. Provider & Feature Configuration

- **DigitalOcean Spaces:** Configured via `DIGITALOCEAN_SPACES_*` environment variables. Used for media, PDFs, and manual audio.
- **OCR Engine:** Primary local Hindi/English OCR via Tesseract worker threads. Remote fallback configured via `OCR_SPACE_*` or `OCR_CUSTOM_API_*`.
- **Email Delivery:** Resend / SMTP configured via `RESEND_API_KEY` / `SMTP_*` for team invitations and leadership briefings.
- **Social Automation:** Webhook handoff to n8n via `SOCIAL_WEBHOOK_URL`.
- **TTS Engine:** Automated TTS (Gemini) is removed from runtime. Article audio relies strictly on manual uploads to Spaces.

---

## 20. Dangerous Provider Configuration & SSRF Audit

### Critical P1 Finding: Unvalidated Webhook Endpoints
In `sendLeadershipReportWebhook` and `sendLeadershipReportCriticalAlertWebhook` (`lib/notifications/leadershipReportWebhook.ts`):
- URLs from `scheduleConfig.webhookUrls` are validated only with `/^https?:\/\/[^\s]+$/i`.
- The server performs direct `fetch(url, { method: 'POST', body: JSON.stringify(payload) })`.
- **SSRF Risk:** An administrator can configure webhooks targeting `http://localhost:3000`, `http://127.0.0.1`, cloud metadata endpoints (`http://169.254.169.254`), or internal microservices, causing the Next.js server to dispatch HTTP POST requests with report payloads to internal infrastructure.
- **Remediation Required in 3.10B:** Enforce HTTPS-only, disallow private IP ranges and loopback interfaces, and implement hostname allowlisting.

---

## 21. AI Ops Boundary

- **File:** `app/(admin)/admin/ai/page.tsx`.
- **Function:** Informs administrators that paid third-party AI APIs (OpenAI, Gemini) are deactivated. Editorial staff use external browser tools for drafting.
- **Audio Controls:** Embeds `TtsOperationsPanel` to manage manual audio asset health and revalidation.
- **Security:** Guarded by `canRunGlobalAiOps` (`super_admin`). PUT requests to `/api/admin/tts/settings` return 405 Method Not Allowed.

---

## 22. Audit Log Architecture

- **Model:** `AuditLog` in `lib/models/AuditLog.ts`.
- **Collection:** `auditLogs`.
- **Fields Captured:**
  - `action`: `create`, `read`, `update`, `delete`, `publish`, `archive`, `assign`, `review`, `approve`, `reject`, `login`, `logout`, `settings_change`, `dispatch`, `retry`, `reconcile`, `prepare`, `cancel`.
  - `resourceType`: `article`, `video`, `story`, `epaper`, `user`, `settings`, `role`, `poll`, `category`, `auth_session`, `media`, `social`, `push`, `other`.
  - `userId`, `userEmail`, `userRole`: Server-verified actor identity.
  - `method`, `endpoint`, `statusCode`, `duration`.
  - `requestData`: Sanitized payload object.
  - `ipAddress`, `userAgent`, `timestamp`.
- **Event Producers:**
  - `withAdminMutation`: Automatically logs every unsafe HTTP method across admin API routes.
  - `withAdminApi`: Centralized error, rejection, and success logging.
  - `lib/auth.ts`: Authentication sign-in, OAuth, and rate-limit audit events.

---

## 23. Audit Log Integrity & Redaction

- **Append-Only Invariant:** There are zero endpoints or repository methods that update or delete records in `auditLogs`.
- **Actor Integrity:** Actor attributes are populated from the authenticated session context (`getAdminMutationContext().actor`), preventing client forgery.
- **Redaction Rigor:**
  `sanitizeRequestData` in `lib/security/auditLogger.ts` automatically redacts keys matching: `password`, `passwordHash`, `token`, `secret`, `apiKey`, `accessKey`, `authorization`, `cookie`, `credential`, `privateKey`, `sessionId`, `setupUrl`, `creditCard`, `ssn`, `pin`.
- **Error Sanitization:** `sanitizeAuditMessage` strips secrets from error strings via regex replacement.

---

## 24. Audit Retention & Scale

- **Indexes:**
  - `{ userId: 1, timestamp: -1 }`
  - `{ action: 1, timestamp: -1 }`
  - `{ resourceType: 1, resourceId: 1, timestamp: -1 }`
  - `{ endpoint: 1, timestamp: -1 }`
  - TTL index: `{ createdAt: 1 }` with `expireAfterSeconds: 31536000` (1 year).
- **Scale Safety:** `getAuditLogs()` enforces a strict maximum query limit of 1,000 records (`Math.min(filter.limit || 50, 1000)`), preventing unbounded collection scans.

---

## 25. Permission Review

- **File:** `app/(admin)/admin/permission-review/page.tsx`.
- **Nature:** 100% informational.
- **Source of Truth:** Dynamically inspects `ADMIN_PAGE_KEYS`, `PAGE_ACCESS`, and `PAGE_LABELS` in `lib/auth/permissions.ts`.
- **Safety:** The UI cannot be used to toggle or corrupt permissions. It clearly communicates which routes have broad access versus those restricted to `super_admin`.

---

## 26. Permission Drift Analysis

Comparing `PAGE_ACCESS`, navigation definitions in `AdminShell.tsx`, and API route guards:

| Surface | Nav Visible To | Page Guard (`canViewPage`) | API Route Guard | Drift Assessment |
|---|---|---|---|---|
| `/admin/team` | `super_admin` | `super_admin` | `canManageTeam` (`super_admin`) | Perfectly aligned |
| `/admin/users` | `super_admin` | `super_admin` | `canManageUsers` (`super_admin`)| Perfectly aligned |
| `/admin/settings` | `super_admin` | `super_admin` | Read-only | Perfectly aligned |
| `/admin/audit-log` | `super_admin` | `super_admin` | Server Component only | Perfectly aligned |
| `/admin/permission-review`| `super_admin` | `super_admin` | Server Component only | Perfectly aligned |
| `/admin/operations` | `super_admin` | `super_admin` | Server Component only | Perfectly aligned |
| `/admin/operations-diagnostics`| `super_admin`| `super_admin` | Server Component only | Perfectly aligned |
| `/admin/api-docs` | Hidden in nav | `operations_center` (`super_admin`)| Public spec (`/api/docs/openapi.json`)| Minor documentation drift |

---

## 27. Operations Center

- **Route:** `/admin/operations` (accessed as `operations_center` in permissions).
- **Responsibility:** Editorial decision rail, blocker triage, edition quality oversight, and audience growth highlights.
- **State Mutation:** It triggers no direct destructive operations. Actions link to specific review queues, copy desk items, or e-paper revision pages where established domain invariants apply.

---

## 28. Operations Diagnostics

- **Route:** `/admin/operations-diagnostics`.
- **Exposed Signals:** MongoDB connection state, Spaces bucket/region/CDN status, OCR mode & provider availability, leadership report failure rates, request log latency summaries (slow requests, validation failures, failed auth).
- **Security Posture:** Safe. Exposes operational health signals without disclosing credentials, connection strings, or internal infrastructure IP addresses.

---

## 29. Health & Readiness Endpoints

- `/api/health`: Public probe. Executes fast MongoDB ping with 1.5s timeout. Returns `{ status: 'ok', db: 'connected' }` or 503 `{ status: 'error', db: 'unavailable' }`.
- `/api/v1/public/health`: Public API v1 health status. Exposes timestamp and high-level dependency status without system internals.

---

## 30. Destructive System Actions Inventory

| Destructive Action | Target Surface | RBAC | Safeguards & Invariants | Audit Trail |
|---|---|---|---|---|
| Soft-Delete Team Member | `DELETE /api/admin/team/[id]` | `super_admin` | Checks `ensureSuperAdminRemovalIsSafe`, demotes to `reader` | Logged via `withAdminApi` |
| Deactivate Staff Account | `PATCH /api/admin/team/[id]` | `super_admin` | Checks `ensureSuperAdminRemovalIsSafe` (vulnerable to TOCTOU) | Logged via `withAdminApi` |
| Deactivate/Demote via Users API | `PATCH /api/admin/users` | `super_admin` | **None** (P0 Vulnerability: can demote last super admin) | Logged via `withAdminApi` |
| Delete Election Results | `POST /api/admin/elections/delete`| `super_admin` | Validates asset key | Logged via `withAdminMutation`|
| Delete E-Paper Edition | `DELETE /api/admin/epapers/[id]` | `super_admin` | Restricts to draft or requires admin approval | Logged via `withAdminMutation`|

---

## 31. Mutation Security Wrappers & CSRF Protection

- **Same-Origin Enforcement:**
  `isSameOriginWrite()` in `lib/api/adminRoute.ts` checks:
  1. `sec-fetch-site === 'cross-site'` -> immediately rejected with 403 `CSRF_BLOCKED`.
  2. Compares `origin` header with request host/proto.
- **Integration Coverage:**
  `security-admin-mutations.test.ts` proves that all 93 active mutation handlers in `app/api/admin` are wrapped with `withAdminMutation` or `withAdminApi(..., { mutation: true })`.
- **Gap Identified:**
  `/api/auth/staff-setup` lives under `app/api/auth/` and is **not** wrapped by `withAdminMutation`.

---

## 32. Rate Limiting & Idempotency

- **Current State:**
  - Dual-engine limiter (`lib/security/getRateLimiter.ts`) supports sliding-window Upstash Redis with local in-memory fallback.
  - Credential login rate-limited to 5 attempts per 15 minutes per IP.
  - General API limited to 100 req/min.
- **Gaps:**
  - `POST /api/admin/team` has no rate limiter.
  - `POST /api/auth/staff-setup` has no rate limiter.
  - `PATCH /api/admin/team/[id]` has no rate limiter.
  - Repeated rapid clicks on "Generate Setup Link" issue multiple setup tokens, invalidating previously generated links.

---

## 33. Concurrency & TOCTOU Analysis

1. **Super Admin Removal Race (P0):**
   Demoting a super admin checks the count in step 1, then executes `findByIdAndUpdate` in step 2. Concurrent requests will demote both users.
2. **Settings Overwrite Race (P1):**
   `updateLeadershipReportSchedule` in `lib/storage/leadershipReportSchedulesFile.ts` reads the file/Mongo, modifies the item, and saves the whole collection without optimistic concurrency control (`__v` or atomic filter).

---

## 34. Admin Shell & Navigation

- **Component:** `app/(admin)/admin/AdminShell.tsx`.
- **Dynamic Derivation:** Menu links are filtered using `canViewPage(role, surface.pageKey)`. Links for `/admin/team`, `/admin/settings`, `/admin/audit-log`, etc., are completely hidden from `admin`, `copy_editor`, and `reporter`.
- **Navigation Groups:**
  - Desk Workflow (`dashboard`, `work_queue`, `push_alerts`, `copy_desk`, `team`, `operations_center`).
  - Content (`articles`, `stories`, `videos`, `social_posts`, `epapers`, `emagazines`, `media`, `polls`, `categories`, `contact_messages`).
  - Insights (`analytics`, `business_value`, `revenue`, `ai_ops`).
  - Governance & Settings (`audit_log`, `permission_review`, `users`, `operations_diagnostics`, `elections`, `newsroom_settings`, `settings`).

---

## 35. System UX & Accessibility

- **Audit Observations:**
  - Dark mode and light mode are comprehensively supported using CSS custom properties (`--admin-shell-*`).
  - Screen-reader announcements and semantic headings (`<h1>` through `<h3>`) are properly structured across `/admin/settings`, `/admin/team`, and `/admin/audit-log`.
  - Empty, loading, and error states are implemented with distinct visual treatments and retry actions.
  - Touch targets on mobile docks meet accessibility guidelines (minimum 44x44px).

---

## 36. Privacy & Data Minimization

- **Password Hashes:** Never leaked in API payloads.
- **Tokens:** Setup tokens are stored exclusively as SHA-256 hashes.
- **Client IP & User Agent:** Redacted from user-facing screens and exposed only to `super_admin` in `/admin/audit-log` and `/admin/operations-diagnostics`.

---

## 37. Contact & Subscriber Data Boundary

- **Contact Messages:** Managed under `/admin/contact-messages` by `super_admin` and `admin`.
- **Newsletter Subscribers:** Stored in `Subscriber` collection. Currently decoupled from `/admin/users`.
- **Reader Users:** Stored in `User` collection (`role: 'reader'`).

---

## 38. Analytics, Business & Revenue Scope Boundary

- **Analytics (`/admin/analytics`):** Phase 3.10 Supporting (system health tab is verified). Broader BI features deferred to Phase 3.11.
- **Business Value (`/admin/analytics/business-value`):** Phase 3.11 scope.
- **Revenue (`/admin/revenue`):** Phase 3.12 scope.

---

## 39. API Documentation & Debug Surfaces

- Developer OpenAPI documentation is rendered at `/admin/api-docs`.
- The raw JSON contract is served at `/api/docs/openapi.json`. It is public, read-only, and exposes no secret keys or database connection strings.

---

## 40. Server Error Safety

- System management API routes catch unhandled errors and return sanitized JSON responses (`{ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' }`).
- Raw MongoDB stack traces and filesystem paths are suppressed from API outputs.

---

## 41. Admin Activity Attribution

All administrative writes audited via `logAdminMutationRequest` bind:
- `userId`: Authenticated actor ID.
- `userEmail`: Authenticated actor email.
- `userRole`: Authenticated actor role.
- `timestamp`: Server system time.
Client attempts to inject actor identity are ignored because the values are extracted from the validated server session.

---

## 42. Test Inventory

Existing test suite contains comprehensive tests verifying permissions, guards, and mutation security:
- `tests/permissions-governance.test.ts` (11 tests covering all role permissions)
- `tests/admin-page-access.test.tsx` (34 tests verifying page guard redirects)
- `tests/security-admin-mutations.test.ts` (9 tests verifying CSRF, same-origin, and audit logging)
- `tests/admin-shell-navigation.test.tsx` (16 tests verifying role-based menu filtering)
- `tests/permission-review.test.ts` (Validating permission review data aggregation)
- `tests/operational-diagnostics.test.ts` (Validating diagnostics data mapping)
- `tests/deployment-safeguards.test.ts` (Validating deployment check evaluations)

---

## 43. Four-Role Matrix Across Admin Surfaces

| Surface / Route | Super Admin | Admin | Copy Editor | Reporter |
|---|---|---|---|---|
| Dashboard (`/admin`) | Full Access | Full Access | Role Workspace | Role Workspace |
| Work Queue (`/admin/work`) | Full Access | Full Access | Queue View | Own Work View |
| Team (`/admin/team`) | **Manage All** | Denied (307) | Denied (307) | Denied (307) |
| Users (`/admin/users`) | **Manage All** | Denied (307) | Denied (307) | Denied (307) |
| Settings (`/admin/settings`)| **Manage All** | Denied (307) | Denied (307) | Denied (307) |
| Newsroom Settings (`/admin/settings/newsroom`)| View Only | Denied (307) | Denied (307) | Denied (307) |
| Elections (`/admin/settings/elections`)| **Manage All** | Denied (307) | Denied (307) | Denied (307) |
| Audit Log (`/admin/audit-log`)| **View All** | Denied (307) | Denied (307) | Denied (307) |
| Permission Review (`/admin/permission-review`)| **View All** | Denied (307) | Denied (307) | Denied (307) |
| Operations Center (`/admin/operations`)| **Full Access**| Denied (307) | Denied (307) | Denied (307) |
| Operations Diagnostics (`/admin/operations-diagnostics`)| **Full Access**| Denied (307) | Denied (307) | Denied (307) |
| AI Ops (`/admin/ai`) | **Full Access**| Denied (307) | Denied (307) | Denied (307) |
| Analytics (`/admin/analytics`)| Full Access | Full Access | Denied (307) | Denied (307) |
| Business Value (`/admin/analytics/business-value`)| Full Access | Denied (307) | Denied (307) | Denied (307) |
| Revenue (`/admin/revenue`)| Full Access | Denied (307) | Denied (307) | Denied (307) |
| Articles (`/admin/articles`)| Full Access | Full Access | Edit Assigned | Create / Own Only |
| Stories (`/admin/stories`) | Full Access | Full Access | Edit Assigned | Create / Own Only |
| Videos (`/admin/videos`) | Full Access | Full Access | Edit Assigned | Denied (307) |
| E-Papers (`/admin/epapers`)| **Full Access**| Denied (307) | Denied (307) | Denied (307) |

---

## 44. Prioritized Security Vulnerabilities & Findings

### P0 (Must Fix Before Phase 3.10 Merge)
1. **Last Super Admin Demotion & Lockout (Team API):** Fix `ensureSuperAdminRemovalIsSafe` in `app/api/admin/team/[id]/route.ts` to require `{ role: 'super_admin', isActive: true, _id: { $ne: id } }`. Prevent self-demotion and self-deactivation when remaining active count is zero.
2. **Missing Super Admin Protection (Users API):** Implement identical super admin protection in `app/api/admin/users/route.ts` (`PATCH`) to prevent demoting or deactivating the last active super admin via the general user management API.
3. **Atomic Demotion CAS Predicate:** Guard super admin demotions with an atomic conditional query (`findOneAndUpdate({ _id: id, role: 'super_admin' }, ...)` with a concurrency lock or pre-condition) to eliminate the TOCTOU race.

### P1 (Should Fix During Phase 3.10)
1. **NextAuth Session Invalidation Asymmetry:** Add token version / active status re-verification to NextAuth session callback or ensure Server Components check active status reliably.
2. **SSRF Hardening in Leadership Report Webhooks:** Block private IP ranges, loopback addresses, cloud metadata services, and enforce HTTPS in `lib/notifications/leadershipReportWebhook.ts`.
3. **Rate Limiting on Administrative Mutations:** Apply `checkRateLimit` to `/api/admin/team`, `/api/admin/team/[id]`, `/api/admin/users`, and `/api/auth/staff-setup`.
4. **Audit Logging for Staff Password Setup:** Add `logAuthAuditEvent` to `POST /api/auth/staff-setup` so that password setup events are captured in `AuditLog`.
5. **Briefing Cron Secret in Query Parameter:** Deprecate `?secret=` query parameter for cron execution; require `Authorization: Bearer` or `X-Lokswami-Cron-Secret` header.
6. **Settings Update Optimistic Concurrency:** Introduce versioning or CAS checks in `updateLeadershipReportSchedule` to prevent lost updates.
7. **User vs Subscriber UX Clarification:** Clarify `/admin/users` UI to distinguish staff members from readers and newsletter subscribers.

### P2 (Can Defer Safely)
1. **Newsroom Settings Persistence:** Move newsroom guidelines from static cards to editable parameters if editorial workflow rules become configurable.
2. **OpenAPI Cookie Scheme Drift:** Update `openapi.ts` security scheme name to match `LOKSWAMI_SESSION_COOKIE`.
3. **Revenue Screen Backend:** Connect `/admin/revenue` when ad networks are onboarded in Phase 3.12.

---

## 45. Proposed Phase 3.10 Subphases

### 3.10A — Identity, Team, & Super Admin Safety Hardening
- **Objective:** Fix the P0 last-super-admin lockout risks, eliminate TOCTOU demotion races, add self-demotion guards, and secure staff account lifecycle.
- **Files:** `app/api/admin/team/[id]/route.ts`, `app/api/admin/users/route.ts`, `lib/auth/staffCredentials.ts`, `app/api/auth/staff-setup/route.ts`.
- **Tests:** Add unit and integration tests verifying:
  - Last active super admin cannot be demoted or deactivated (both via Team and Users API).
  - Inactive super admins do not satisfy the safety check.
  - Concurrent demotion requests are safely serialized.
  - Setup tokens are rate-limited and audit-logged upon redemption.

### 3.10B — Configuration, Webhook SSRF, & Secret Boundaries
- **Objective:** Eliminate SSRF risks in outbound webhooks, secure cron secret authentication, and implement optimistic concurrency on settings updates.
- **Files:** `lib/notifications/leadershipReportWebhook.ts`, `app/api/admin/analytics/briefing-schedules/run-due/route.ts`, `lib/storage/leadershipReportSchedulesFile.ts`, `app/api/admin/settings/leadership-reports/route.ts`.
- **Tests:** Add tests for private IP blocking, HTTPS validation, header-only cron authentication, and concurrent schedule update conflict rejection.

### 3.10C — Audit Log & Permission Parity Verification
- **Objective:** Expand audit logging coverage to password setups, verify append-only integrity, and harden session rehydration.
- **Files:** `lib/security/auditLogger.ts`, `app/api/auth/staff-setup/route.ts`, `lib/auth/admin.ts`, `lib/auth.ts`.
- **Tests:** Verify staff setup audit entries, session invalidation behavior, and redaction assertions.

### 3.10D — Operations Center & Diagnostics Hardening
- **Objective:** Validate operations diagnostics stability, health check minimization, and verify recovery paths.
- **Files:** `lib/admin/operationalDiagnostics.ts`, `app/(admin)/admin/operations-diagnostics/page.tsx`, `app/api/health/route.ts`.
- **Tests:** Test diagnostics with simulated missing providers and verify zero secret leakage.

### 3.10E — Admin System UX, Accessibility, & Final Integration QA
- **Objective:** Polish UI/UX, verify responsive docks, test screen reader compliance across team/settings/audit screens, and run full regression suite.
- **Files:** `app/(admin)/admin/AdminShell.tsx`, `app/(admin)/admin/team/TeamManagementClient.tsx`, `app/(admin)/admin/users/UsersManagementClient.tsx`.
- **Tests:** Vitest component tests, Playwright access checks, `npm run typecheck`, `npm run lint:strict`, and `npm run build:ci`.

---

## 46. Risks & Open Questions

1. **Session Invalidation Across Microservices / Processes:**
   Should NextAuth JWT sessions adopt a database-backed `sessionVersion` or Redis blacklist to immediately terminate sessions across all server components when an account is disabled?
2. **Staff vs Reader Population Separation:**
   Should `/admin/users` be refactored into two distinct views: (a) Newsroom Staff (direct link to `/admin/team`), and (b) Reader & Subscriber Directory?
3. **Outbound Webhook IP Resolution:**
   Should the system perform DNS resolution before dispatching webhooks to verify that the destination IP does not resolve to private subnets (e.g. via DNS rebinding)?
4. **Bootstrap Admin Migration:**
   Should the environment-backed bootstrap super admin be migrated to a permanent database record during initial deployment, or remain an immutable disaster-recovery fallback?

---

## 47. Safe Validation Record

- **Pre-flight Git Status:**
  - Branch: `b3/phase3.10-admin-system-management`
  - Starting HEAD: `f95eae4`
  - Foundation Base: `f95eae4`
  - Sync with origin: `0 0`
  - Working Tree: Preserved pre-existing generated/data files (`data/analytics-events.json`, `data/categories.json`, `next-env.d.ts`) per repository rule in `AGENTS.md`.
- **Safe Static Analysis:**
  - `npm run typecheck`: Passed with 0 errors.
  - `npm run lint:strict`: Passed with 0 warnings across all admin and core libraries.
- **Focused Vitest Suite:**
  - Executed 7 test files (`permissions-governance`, `security-admin-mutations`, `admin-page-access`, `admin-shell-navigation`, `permission-review`, `operational-diagnostics`, `deployment-safeguards`).
  - Result: 76 tests passed, 0 failures.
- **Zero Mutating Operations:**
  - No real users created, modified, or deleted.
  - No roles changed.
  - No settings mutated.
  - No external providers or webhooks invoked.
  - No production or staging credentials inspected or exposed.
