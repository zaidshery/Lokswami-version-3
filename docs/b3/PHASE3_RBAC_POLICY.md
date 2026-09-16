# LokSwami B3 — RBAC Policy & Future Governance Model

> [!IMPORTANT]
> **POLICY DOCUMENTATION ONLY — NO IMPLEMENTATION IN THIS ACCELERATOR PR**
> This document records a proposed architectural direction for LokSwami B3 Role-Based Access Control (RBAC).
> **PROPOSED / DEFERRED / REQUIRES SEPARATE APPROVAL**
> **DO NOT** modify `lib/auth/permissions.ts`, `lib/auth/roles.ts`, or any route guards in this PR.
> This proposal is separate from approved roadmap workstreams and does not alter canonical roadmap ownership or runtime permissions.

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

The following capabilities are proposed for future Super-Admin-only control, subject to separate owner approval and implementation:

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

## 4. Governance Status & Proposed Future Alignment

> [!NOTE]
> **PROPOSED / DEFERRED / REQUIRES SEPARATE APPROVAL**
> Product roadmap sub-phase assignment belongs strictly to the canonical, owner-approved `docs/b3/ROADMAP.md`.
> RBAC runtime permissions and route guards are governed authoritatively by `lib/auth/permissions.ts`, `lib/auth/roles.ts`, and `tests/permissions-governance.test.ts`.
> Any future structural changes to the four-role newsroom model are deferred, require separate architectural approval, and must not be assigned to any product sub-phase by this Accelerator.

| Milestone | Status | Scope |
|---|---|---|
| **Accelerator v1 (Current)** | Tooling & Governance Baseline | Tooling and policy clarification only. Zero code edits in `lib/auth/permissions.ts` or `lib/auth/roles.ts`. |
| **Proposed Newsroom Hardening** | PROPOSED / DEFERRED | Potential refinement of editorial review boundaries subject to separate governance approval. |
| **Proposed E-Paper Control Plane** | PROPOSED / DEFERRED | Potential migration of E-Paper lifecycle controls subject to separate governance approval. |
| **Proposed Infrastructure Lock** | PROPOSED / DEFERRED | Potential restriction of operational diagnostics and infrastructure controls subject to separate governance approval. |
