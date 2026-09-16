# LokSwami B3 — RBAC Policy & Future Governance Model

> [!IMPORTANT]
> **POLICY DOCUMENTATION ONLY — NO RUNTIME IMPLEMENTATION IN THIS PR**
> This document establishes the architectural direction for LokSwami B3 Role-Based Access Control (RBAC).
> **OWNER-APPROVED DIRECTION / IMPLEMENTATION DEFERRED**
> When this Roadmap Sync PR is explicitly approved and merged by the owner, the Super-Admin owner-control model becomes the approved Phase 3 architectural direction and is scheduled for implementation in Phase 3.5. Runtime permissions remain unchanged until the separate Phase 3.5 implementation PR is approved and merged.
> **DO NOT** modify `lib/auth/permissions.ts`, `lib/auth/roles.ts`, or any route guards in this PR.

---

## 1. Executive Summary & Core Hierarchy

LokSwami operates with a four-tier newsroom access model designed to balance editorial agility with stringent operational and technical safeguards:

```
+-------------------------------------------------------------+
|                        SUPER ADMIN                          |
|         Owner / Technical & Operational Control Plane       |
+-------------------------------------------------------------+
                              |
+-------------------------------------------------------------+
|                           ADMIN                             |
|          Executive Newsroom Operations & Staff Manager      |
+-------------------------------------------------------------+
                              |
+-------------------------------------------------------------+
|                        COPY EDITOR                          |
|       Senior Editorial Reviewer & Copy-Desk Gatekeeper      |
+-------------------------------------------------------------+
                              |
+-------------------------------------------------------------+
|                          REPORTER                           |
|               Content Creator & Draft Submitter             |
+-------------------------------------------------------------+
```

---

## 2. Super Admin as the Technical & Infrastructure Control Plane

In the approved B3 architecture, **Super Admin** represents the platform owner and technical control plane. Standard day-to-day newsroom activities belong to `admin`, `copy_editor`, and `reporter`, while high-stakes, system-wide, and revenue-impacting controls belong exclusively to `super_admin`.

The following capabilities represent the approved direction for future Super-Admin-only control, scheduled for runtime implementation in Phase 3.5:

### A. E-Paper Complete Lifecycle
The daily E-Paper publication carries direct brand, commercial, and legal significance. The following actions will be restricted to Super Admin:
- E-Paper Issue Creation (`create`)
- Issue Editing & Metadata Modification (`edit`)
- Page Editing & Hotspot Zone Mapping (`page edit`)
- Issue Preparation & PDF Processing (`prepare`)
- Edition Assignment & City Edition Control (`assignment/control`)
- Issue Publishing (`publish`)
- Issue Deletion / Archival (`delete`)

### B. Identity, Access & Staff Governance
- Team Member Creation & Role Assignment (`Team`, `/admin/team`)
- Team Onboarding Invitations (`Manage Team`, `/admin/team-setup-link`)
- Users & Subscribers Management (`Users & Subscribers`)
- Permission Review & Role Auditing (`Permission Review`)

### C. System Configuration & Operations
- Newsroom Global Settings (`Newsroom Settings`)
- Operations Center (`Operations Center`, `/admin/operations`)
- Operational Diagnostics & Cache Purging (`Operations Diagnostics`, `/admin/diagnostics`)
- Security & Mutation Audit Logs (`Audit Log`, `/admin/audit-logs`)
- Global Platform Settings (`Global Settings`)

### D. Revenue & Business Intelligence
- Revenue & Monetization Controls
- Advertisement Banner & Campaign Management
- Business Value Analytics & Monetization Reports
- Core System Analytics & Traffic Reports (`Analytics`)
- Reader Poll Configuration & Publishing (`Polls`)

### E. AI Infrastructure & Global AI Ops
- Global AI Configuration (`AI Ops`, `Global AI Ops`)
- AI Model Selection, API Key Management, and Rate Limits
- System-wide Prompt Guardrails and Fine-tuning Parameters

### F. Election Platform Controls
- Election Platform Infrastructure & Settings
- Live Election Data Feed Configuration & Widget Management

---

## 3. Critical Editorial vs. Platform Distinctions

To prevent operational bottlenecks, clear distinctions are established between platform controls and routine editorial workflows:

### A. Election Journalism vs. Election Platform Controls
- **Ordinary Election Journalism** (In Scope for Editorial):
  - Writing election stories, field reports, interviews, candidate profiles, and opinion pieces.
  - Adding "Election" category or tags to articles.
  - Ordinary election journalism uses the normal editorial workflow and the same role permissions as other newsroom content. Reporters may draft and submit eligible election stories; copy editors may perform their normal scoped editorial review; publishing authority remains with roles authorized by the canonical runtime permission helpers.
- **Election Platform Controls** (Super-Admin-Only):
  - Configuring real-time election tally APIs, live result banners, constituency maps, and third-party feed connectors.

### B. AI Editorial Assistance vs. Global AI Ops
- **Safe AI Editorial Tools** (In Scope for Editorial):
  - Using approved, sandboxed AI tools inside the editor: draft spellcheck, headline suggestion helpers, summary generation, and translation assistance.
  - Available to authorized editorial roles (`reporter`, `copy_editor`, `admin`).
- **Global AI Ops** (Super-Admin-Only):
  - Configuring underlying LLM providers (e.g., Gemini API keys, temperature settings, fallback strategies, and token budget enforcement).

---

## 4. Governance Status & Phased Implementation Alignment

> [!NOTE]
> **OWNER-APPROVED DIRECTION / IMPLEMENTATION DEFERRED**
> When this Roadmap Sync PR is explicitly approved and merged by the owner, the Super-Admin owner-control model becomes the approved Phase 3 architectural direction and is scheduled for implementation in Phase 3.5. Runtime permissions remain unchanged until the separate Phase 3.5 implementation PR is approved and merged.
>
> - **Current Runtime Permissions**: Governed authoritatively today by executable code in `lib/auth/permissions.ts`, `lib/auth/roles.ts`, and verified by `tests/permissions-governance.test.ts`.
> - **No Automatic Restriction**: No new Super-Admin restriction takes effect merely because the roadmap or direction is approved.
> - **Dedicated Implementation Gate**: Actual permission changes require the dedicated Phase 3.5 implementation PR, comprehensive four-role tests, independent review, and explicit owner merge authorization.
> - **Phase 3.4 Invariant**: Phase 3.4 is strictly limited to CMS inventory, RBAC gap discovery (e.g., Election and Ads controls), and staging/preview infrastructure. Zero runtime RBAC migrations occur in Phase 3.4.
> - **Phase 3.5 Invariant**: Phase 3.5 executes the runtime implementation of the approved owner-control direction across menus, routes, APIs, and domain permission helpers.

| Milestone | Status | Scope |
|---|---|---|
| **Accelerator v1 (Merged)** | Tooling & Governance Baseline | Tooling and policy clarification. Zero code edits in `lib/auth/permissions.ts` or `lib/auth/roles.ts`. |
| **Phase 3.4 (Next)** | Discovery & Staging Foundation | CMS inventory, RBAC gap discovery, staging DB/auth/storage isolation. Runtime RBAC remains unchanged. |
| **Phase 3.5** | Runtime Implementation | Execution of approved Super-Admin control plane: menu/sidebar permissions, route authorization, API authorization, domain helpers, and four-role tests. |
