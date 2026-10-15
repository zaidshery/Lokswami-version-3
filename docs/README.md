# LokSwami Documentation Index

Welcome to the centralized documentation directory for LokSwami. This directory organizes architecture specifications, operational runbooks, deployment guides, setup instructions, and historical references.

> [!IMPORTANT]
> **Authoritative Baseline**: The canonical Phase 2 architecture freeze and current program guidelines are defined in [`docs/b3/`](./b3/).
> Files under [`docs/archive/`](./archive/) are strictly **historical** and are **NOT** authoritative for current architecture, roadmap, or operational decisions.

---

## Documentation Structure

```
docs/
├── b3/           # Authoritative B3 Architecture Freeze v1, audits, debt register, roadmap
├── setup/        # Local & environment setup guides (MongoDB, E-Paper, Quick Start)
├── deployment/   # Production hosting, CI/CD, and smoke test checklists (Hostinger, Vercel)
├── operations/   # Day-to-day newsroom and admin runtime runbooks & checklists
├── architecture/ # Architecture Decision Records (ADR 001 - 004)
├── archive/      # Historical roadmaps, legacy QA checklists, and pre-freeze plans
├── quality/      # Security audits and test reports
├── release/      # Release verification records
└── seo/          # Search engine optimization guidelines and baselines
```

---

## 1. Canonical B3 Architecture & Program Direction

Current authoritative architectural baseline for LokSwami Phase 3+:

- [Architecture Freeze v1 Specification](./b3/ARCHITECTURE_FREEZE_V1.md)
  - The canonical architectural contract covering domain boundaries, persistence models, storage providers, auth/RBAC, and background processing.
- [B3 Master Roadmap](./b3/ROADMAP.md)
  - Authoritative multi-phase plan spanning Phase 1 through Phase 8.
- [Phase 2 Final Integration Audit](./b3/PHASE2_FINAL_INTEGRATION_AUDIT.md)
  - Comprehensive post-integration audit confirming all 7 domain slices and quality gates.
- [Phase 2 Debt Register](./b3/PHASE2_DEBT_REGISTER.md)
  - Explicit register of non-blocking debt (P2/P3 items) tracked for subsequent phases.
- [Phase 2 Implementation Plan](./b3/PHASE2_IMPLEMENTATION_PLAN.md)
  - Architectural blueprint and delivery methodology for Phase 2.
- [Pre-Phase-3 Repository Hygiene Audit](./b3/PRE_PHASE3_REPOSITORY_HYGIENE_AUDIT.md)
  - Repository inventory, artifact removal, and documentation re-organization audit.

---

## 2. Setup Guides

Guides for local development and dependency configuration:

- [MongoDB Setup Guide](./setup/MONGODB_SETUP.md)
  - Configuring local MongoDB or MongoDB Atlas, replica sets, connection URIs, and index verification.
- [E-Paper v2 Setup](./setup/EPAPER_V2_SETUP.md)
  - Setting up PDF processing, image extraction, and OCR prerequisites.
- [Quick Start Guide](./setup/QUICK_START.md)
  - Developer bootstrapping guide for cloning, environment variable configuration, and local server startup.

---

## 3. Deployment & CI/CD

Production deployment documentation and pipelines:

- [Hostinger Deployment Runbook](./deployment/HOSTINGER_DEPLOY.md)
  - Production deployment steps, standalone Node server build, environment loading, and PM2 process management.
- [Deploy Smoke Checklist](./deployment/DEPLOY_SMOKE_CHECKLIST.md)
  - Pre- and post-deployment smoke testing checklist for newsroom and reader routes.
- [Hostinger CI/CD Setup](./deployment/HOSTINGER_CICD_SETUP.md)
  - GitHub Actions automated deployment workflow configuration for Hostinger VPS.
- [Leadership Reports Deployment Guide](./deployment/LEADERSHIP_REPORTS_HOSTINGER.md)
  - Configuration and verification for leadership reporting surfaces on Hostinger.
- [Vercel CI/CD Setup](./deployment/VERCEL_CICD_SETUP.md)
  - Deployment configuration for preview and production environments on Vercel.

---

## 4. Operational Runbooks & Standard Operating Procedures (SOPs)

Day-to-day operations and runtime checklists for editorial and admin staff:

- [Admin Runtime Checklist](./operations/ADMIN_RUNTIME_CHECKLIST.md)
  - Core operational checklist for admin features, authentication, permissions, and safeguards.
- [Article Creation SOP](./ARTICLE_CREATION_SOP.md)
  - Exact Reporter quick-submit and Copy Editor/Admin article creation, readiness, review, scheduling, and publication steps.
- [Newsroom CMS Role SOP](./LOKSWAMI_CMS_ROLE_SOP.md)
  - Daily workflows, permissions, checklists, and issue handling for Reporter, Copy Editor, and Admin.
- [Printable CMS Role SOP (PDF)](./LOKSWAMI_CMS_ROLE_SOP.pdf) / [HTML Source](./LOKSWAMI_CMS_ROLE_SOP.html)
  - Branded A4 edition for staff onboarding and newsroom desk reference.
- [E-Paper Workflow v3 Runbook](./EPAPER_WORKFLOW_V3_RUNBOOK.md)
  - Runbook for edition publishing, page processing, and coordinate mapping.

---

## 5. Architecture Decision Records (ADRs)

Foundational architectural records preserved for architectural context:

- [ADR 001: Keep The Next.js + MongoDB Monolith](./architecture/adr-001-keep-nextjs-mongodb-monolith.md)
- [ADR 002: MongoDB-Backed TTS Queue](./architecture/adr-002-mongodb-backed-tts-queue.md)
- [ADR 003: Security Audit Design](./architecture/adr-003-security-audit-design.md)
- [ADR 004: API-First Modular Media Platform](./architecture/adr-004-api-first-modular-media-platform.md)

---

## 6. Archive (Historical / Legacy)

> [!WARNING]
> The documents in this section are retained strictly for historical context.
> They reflect pre-freeze planning and old phase numbering. Do not follow them for active development.

- [Legacy Admin Planning & Roadmaps](./archive/legacy-admin/)
  - [CURRENT_ADMIN_ROADMAP.md](./archive/legacy-admin/CURRENT_ADMIN_ROADMAP.md) (Old admin status sheet superseded by B3 roadmap)
  - [PHASE4_CMS_QA_CHECKLIST.md](./archive/legacy-admin/PHASE4_CMS_QA_CHECKLIST.md) (Historical CMS checklist containing legacy git/remote references)
  - [PHASE5_GOVERNANCE_CHECKLIST.md](./archive/legacy-admin/PHASE5_GOVERNANCE_CHECKLIST.md) (Historical pre-freeze governance checklist)
  - [FOUR_ROLE_NEWSROOM_ADMIN_PLAN.html](./archive/legacy-admin/FOUR_ROLE_NEWSROOM_ADMIN_PLAN.html) / [.pdf](./archive/legacy-admin/FOUR_ROLE_NEWSROOM_ADMIN_PLAN.pdf) (Legacy design artifact)
  - [NEXT_SPRINT.md](./archive/legacy-admin/NEXT_SPRINT.md) (Historical sprint notes)
