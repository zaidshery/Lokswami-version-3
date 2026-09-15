# LokSwami B3 — RBAC Policy & Future Governance Model

> [!IMPORTANT]
> **POLICY DOCUMENTATION ONLY — NO IMPLEMENTATION IN THIS ACCELERATOR PR**
> This document records the approved architectural direction for LokSwami B3 Role-Based Access Control (RBAC).
> **DO NOT** modify `lib/auth/permissions.ts`, `lib/auth/roles.ts`, or any route guards in this PR.
> Implementation will take place in scheduled future phases (Phase 3.5, Phase 3.9, and Phase 3.10).

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
|         Senior Editorial Gatekeeper, Reviewer & Publisher   |
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

The following capabilities are scheduled to become **Super-Admin-Only**:

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
  - Reporters and copy editors have standard rights to draft and publish election news.
- **Election Platform Controls** (Super-Admin-Only):
  - Configuring real-time election tally APIs, live result banners, constituency maps, and third-party feed connectors.

### B. AI Editorial Assistance vs. Global AI Ops
- **Safe AI Editorial Tools** (In Scope for Editorial):
  - Using approved, sandboxed AI tools inside the editor: draft spellcheck, headline suggestion helpers, summary generation, and translation assistance.
  - Available to authorized editorial roles (`reporter`, `copy_editor`, `admin`).
- **Global AI Ops** (Super-Admin-Only):
  - Configuring underlying LLM providers (e.g., Gemini API keys, temperature settings, fallback strategies, and token budget enforcement).

---

## 4. Implementation Phasing & Roadmap

| Phase | Milestone | Scope |
|---|---|---|
| **Accelerator v1 (Current)** | Policy Documentation | Document policy only. Zero code edits in `lib/auth/permissions.ts`. |
| **Phase 3.5** | Editorial & Newsroom Workflow Hardening | Align `copy_editor` and `admin` workflow boundaries, lock release rules. |
| **Phase 3.9** | E-Paper & E-Magazine Control Plane Migration | Move full E-Paper lifecycle to Super-Admin-only controls. |
| **Phase 3.10** | System Governance, Diagnostics & AI Ops Lock | Restrict AI Ops, Operations Diagnostics, Revenue, and Team Management to Super Admin. |
