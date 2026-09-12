# Pre-Phase-3 Repository Hygiene & Documentation Audit

**Document Version**: 1.0.0
**Status**: COMPLETE — AUDITED & VERIFIED
**Authoritative Baseline SHA**: `1f4dab39901451a4067e753d681753160d3fe5bb` (post-Phase-2 Architecture Freeze v1 on `b3/foundation`)
**Cleanup Branch**: `b3/pre-phase3-repo-hygiene`
**Base Branch**: `b3/foundation`
**Classification Date**: September 2026

---

## Executive Summary

Prior to commencing Phase 3 feature implementation, this repository hygiene and documentation reorganization was conducted to eliminate root-folder clutter, remove obsolete Windows batch scripts and git artifacts, segregate historical pre-freeze planning materials, reorganize current setup and operational documentation into structured subdirectories, and ensure that future autonomous agents and human engineers encounter an unambiguous, canonical documentation tree.

**Zero runtime code has been altered.** All required automated gates passed and no runtime source files were modified by this cleanup. Domain boundaries, Mongoose models, repositories, routes, auth/RBAC helpers, and test suites established during Architecture Freeze v1 remain preserved.

---

## 1. Baseline SHA Verification

- **Repository**: `https://github.com/zaidshery/Lokswami-version-3.git`
- **Starting Base SHA**: `1f4dab39901451a4067e753d681753160d3fe5bb`
- **Base Verification**:
  ```bash
  git checkout b3/foundation
  git pull --ff-only origin b3/foundation
  git rev-parse HEAD
  # Output: 1f4dab39901451a4067e753d681753160d3fe5bb
  ```
- **Cleanup Branch**: `b3/pre-phase3-repo-hygiene` branched directly from `1f4dab39901451a4067e753d681753160d3fe5bb`.

---

## 2. Root Inventory Summary

### Root Directory Breakdown (Pre-Cleanup vs Post-Cleanup)

| Category | Pre-Cleanup Count | Post-Cleanup Count | Details / Actions Taken |
| :--- | :---: | :---: | :--- |
| **Tracked Root Config / Entrypoint Files** | 19 | 19 | Preserved essential configs (`package.json`, `tsconfig.json`, `tailwind.config.js`, `auth.ts`, `middleware.ts`, `README.md`, `AGENTS.md`, etc.) |
| **Tracked Batch / Output Artifacts** | 5 | 0 | Proven obsolete test and batch helper artifacts deleted (`git rm`) |
| **Tracked Legacy Admin / Roadmap Docs** | 6 | 0 | Archived to `docs/archive/legacy-admin/` with archive banners |
| **Tracked Deployment & CI/CD Docs** | 5 | 0 | Organized into `docs/deployment/` |
| **Tracked Setup Docs** | 3 | 0 | Organized into `docs/setup/` |
| **Tracked Operations Docs** | 1 | 0 | Organized into `docs/operations/` |
| **Total Tracked Root Files** | **39** | **19** | 51.3% reduction in root file footprint; 0 clutter |

### Current Post-Cleanup Root Layout

```
Zaid-lokswami/
├── .agents/                    # Agent instructions & workflows
├── .github/                    # GitHub Actions workflows & PR templates
├── app/                        # Next.js App Router (runtime code untouched)
├── components/                 # React UI components (untouched)
├── data/                       # Local fallback & seed JSON data (intact)
├── docs/                       # Reorganized documentation hierarchy
│   ├── architecture/           # ADRs 001 - 004
│   ├── archive/                # Historical docs (legacy-admin, etc.)
│   ├── b3/                     # Canonical B3 Freeze v1 & Roadmap specs
│   ├── deployment/             # Hostinger, Vercel, CI/CD runbooks
│   ├── operations/             # Newsroom & admin runtime checklists
│   └── setup/                  # Environment & dependency onboarding guides
├── hooks/                      # Custom React hooks (untouched)
├── lib/                        # Core backend domain architecture (untouched)
├── public/                     # Static assets (untouched)
├── scripts/                    # Automation & verification scripts (untouched)
├── storage/                    # Local storage provider directory (intact)
├── tests/                      # Automated test suite (untouched)
├── types/                      # TypeScript definitions (untouched)
│
├── .env.example                # Example environment configuration
├── .env.local.example          # Local environment overrides template
├── .gitignore                  # Cleaned & deduplicated gitignore rules
├── AGENTS.md                   # Canonical operational instructions for AI agents
├── README.md                   # Repository overview with updated doc paths
├── auth.ts                     # Auth.js / NextAuth configuration
├── eslint.config.mjs           # ESLint configuration
├── global.d.ts                 # Global type definitions
├── middleware.ts               # Route guard middleware
├── next-env.d.ts               # Next.js TypeScript definitions
├── next.config.js              # Next.js build configuration
├── package-lock.json           # Exact dependency lockfile (untouched)
├── package.json                # Project manifest & scripts (untouched)
├── playwright.config.mjs       # End-to-end test configuration
├── postcss.config.js           # PostCSS configuration
├── setupTests.ts               # Vitest environment setup
├── tailwind.config.js          # Tailwind CSS styling tokens
├── tsconfig.json               # TypeScript compiler options
└── vitest.config.ts            # Vitest unit & integration test configuration
```

---

## 3. Files Deleted

The following 5 tracked files were proven to be obsolete test artifacts or unreferenced helper scripts containing hard-coded machine paths. All were deleted using `git rm`:

| File Path | Classification | Evidence | Repository References Found | Risk Assessment |
| :--- | :--- | :--- | :--- | :--- |
| `git_status.txt` | **DELETE** | 0-byte tracked text file created during local Git diagnostics. | 0 references across repo. | **Zero risk**. No runtime, build, or CI impact. |
| `git_version.txt` | **DELETE** | 0-byte tracked text file created during local Git diagnostics. | 0 references across repo. | **Zero risk**. No runtime, build, or CI impact. |
| `test_echo.txt` | **DELETE** | 13-byte text file containing `hello world` and CRLF artifacts. | 0 references across repo. | **Zero risk**. No runtime, build, or CI impact. |
| `commit.bat` | **DELETE** | Windows batch script with hard-coded one-off staging of specific files (`lib/notifications/teamInviteEmail.ts`, `app/api/admin/team/route.ts`, `app/api/admin/team/[id]/setup-link/route.ts`, `app/(admin)/admin/team/TeamManagementClient.tsx`), fixed commit message `feat: Implement secure automated email invitations via Resend`, and `git push`. Obsolete local helper, unsafe as a generic repository workflow, unreferenced by runtime/build/CI. | 0 references in code/CI. | **Zero risk**. Removes unsafe hard-coded staging script. |
| `run_git.bat` | **DELETE** | Windows batch script containing obsolete absolute machine path (`C:\Users\Appex\Zaid-lokswami\...`) targeting an old machine. | 0 references in code/CI. | **Zero risk**. Obsolete local script. |

---

## 4. Files Archived

The following 6 documents were identified as legacy pre-freeze materials containing outdated phase numbering or historical planning references. They were moved to `docs/archive/legacy-admin/` and marked with archive notices:

| Original Path | Proposed Destination | Classification | Evidence & Context | References Updated | Risk |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `CURRENT_ADMIN_ROADMAP.md` | `docs/archive/legacy-admin/CURRENT_ADMIN_ROADMAP.md` | **ARCHIVE** | Historical admin status sheet describing Phase 1–5 pre-freeze progress. Superseded by `docs/b3/ROADMAP.md`. Added archive warning banner. | Updated `docs/README.md`. | **Zero risk**. Preserved for historical auditability. |
| `PHASE4_CMS_QA_CHECKLIST.md` | `docs/archive/legacy-admin/PHASE4_CMS_QA_CHECKLIST.md` | **ARCHIVE** | Historical checklist describing manual QA for CMS roles. Contains obsolete git remote instructions referencing `zaid2`. Added warning banner to prevent operational misuse. | Updated `docs/README.md`. | **Zero risk**. Dangerous Git guidance safely quarantined. |
| `PHASE5_GOVERNANCE_CHECKLIST.md` | `docs/archive/legacy-admin/PHASE5_GOVERNANCE_CHECKLIST.md` | **ARCHIVE** | Historical super-admin governance checklist for Phase 5 pre-freeze. Added archive note; updated link to `docs/operations/ADMIN_RUNTIME_CHECKLIST.md`. | Updated `docs/README.md`. | **Zero risk**. Active checklist is in `docs/operations/`. |
| `FOUR_ROLE_NEWSROOM_ADMIN_PLAN.html` | `docs/archive/legacy-admin/FOUR_ROLE_NEWSROOM_ADMIN_PLAN.html` | **ARCHIVE** | Pre-freeze visual admin mockup artifact. Preserved for reference. | Updated `docs/README.md`. | **Zero risk**. Non-runtime artifact. |
| `FOUR_ROLE_NEWSROOM_ADMIN_PLAN.pdf` | `docs/archive/legacy-admin/FOUR_ROLE_NEWSROOM_ADMIN_PLAN.pdf` | **ARCHIVE** | Pre-freeze visual admin plan in PDF format. | Updated `docs/README.md`. | **Zero risk**. Non-runtime artifact. |
| `NEXT_SPRINT.md` | `docs/archive/legacy-admin/NEXT_SPRINT.md` | **ARCHIVE** | Historical sprint notes written during initial admin stability push. Superseded by B3 phase plans. Added historical notice. | Updated `docs/README.md`. | **Zero risk**. Historical note preserved. |

---

## 5. Files Moved to Setup

The following 3 documents provide developer onboarding and prerequisite environment configuration. They were moved to `docs/setup/`:

| Original Path | Destination Path | Classification | Evidence & Purpose | References Updated | Risk |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `MONGODB_SETUP.md` | `docs/setup/MONGODB_SETUP.md` | **MOVE** | Active setup guide for MongoDB connection, Atlas configuration, and index initialization. | `README.md`, `docs/README.md`. | **Zero risk**. |
| `EPAPER_V2_SETUP.md` | `docs/setup/EPAPER_V2_SETUP.md` | **MOVE** | Active guide for configuring PDF rendering, Poppler, and Tesseract OCR tools. | `README.md`, `docs/README.md`. | **Zero risk**. |
| `QUICK_START.md` | `docs/setup/QUICK_START.md` | **MOVE** | Active developer onboarding guide covering repo clone, env setup, and dev server start. | `README.md`, `docs/README.md`. | **Zero risk**. |

---

## 6. Files Moved to Deployment

The following 5 documents define production hosting, VPS setup, and CI/CD pipelines. They were moved to `docs/deployment/`:

| Original Path | Destination Path | Classification | Evidence & Purpose | References Updated | Risk |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `HOSTINGER_DEPLOY.md` | `docs/deployment/HOSTINGER_DEPLOY.md` | **MOVE** | Authoritative production deployment guide for Hostinger Node/VPS environments. | `README.md`, `docs/README.md`, updated internal relative links to `./DEPLOY_SMOKE_CHECKLIST.md`, `../operations/ADMIN_RUNTIME_CHECKLIST.md`, `./LEADERSHIP_REPORTS_HOSTINGER.md`, `./HOSTINGER_CICD_SETUP.md`. | **Zero risk**. |
| `DEPLOY_SMOKE_CHECKLIST.md` | `docs/deployment/DEPLOY_SMOKE_CHECKLIST.md` | **MOVE** | Pre- and post-deployment smoke verification steps for production deployments. | `README.md`, `docs/README.md`, `docs/deployment/HOSTINGER_DEPLOY.md`, `docs/deployment/HOSTINGER_CICD_SETUP.md`. Updated link to `../operations/ADMIN_RUNTIME_CHECKLIST.md`. | **Zero risk**. |
| `HOSTINGER_CICD_SETUP.md` | `docs/deployment/HOSTINGER_CICD_SETUP.md` | **MOVE** | GitHub Actions automated deployment workflow configuration for Hostinger VPS. | `README.md`, `docs/README.md`, `docs/deployment/HOSTINGER_DEPLOY.md`. | **Zero risk**. |
| `LEADERSHIP_REPORTS_HOSTINGER.md` | `docs/deployment/LEADERSHIP_REPORTS_HOSTINGER.md` | **MOVE** | Runbook for setting up and verifying leadership email reports via cron. | `docs/README.md`, `docs/deployment/HOSTINGER_DEPLOY.md`. | **Zero risk**. |
| `VERCEL_CICD_SETUP.md` | `docs/deployment/VERCEL_CICD_SETUP.md` | **MOVE** | Historical/alternative deployment guide for Vercel preview environments. | `README.md`, `docs/README.md`. | **Zero risk**. |

---

## 7. Files Moved to Operations

The following operational checklist was moved to `docs/operations/`:

| Original Path | Destination Path | Classification | Evidence & Purpose | References Updated | Risk |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `ADMIN_RUNTIME_CHECKLIST.md` | `docs/operations/ADMIN_RUNTIME_CHECKLIST.md` | **MOVE** | Authoritative newsroom checklist for validating active admin, auth, and CMS workflows. | `README.md`, `docs/README.md`, `docs/archive/legacy-admin/PHASE5_GOVERNANCE_CHECKLIST.md`, `docs/deployment/DEPLOY_SMOKE_CHECKLIST.md`, `docs/deployment/HOSTINGER_DEPLOY.md`. | **Zero risk**. |

---

## 8. Local Generated Artifacts Identified

A comprehensive review using `git status --ignored --short` identified local generated files. None are tracked in git; all are properly covered by `.gitignore`:

| Local Artifact | Location | Status | Action Taken |
| :--- | :--- | :--- | :--- |
| `.next/` | Root | Gitignored | Preserved locally for build caching; verified ignored. |
| `.next-dev/` | Root | Gitignored | Preserved locally; verified ignored. |
| `tsconfig.tsbuildinfo` | Root | Gitignored | Incremental TypeScript cache; verified ignored. |
| `.hostinger/` | Root | Gitignored | Deployment packaging staging directory; verified ignored. |
| `node_modules/` | Root | Gitignored | Preserved intact; no re-installation or deletion needed. |
| `data/article-locks.json` | `data/` | Gitignored | Runtime locking artifact; verified ignored. |
| `data/users.json` | `data/` | Gitignored | Local runtime fallback user store; verified ignored. |
| `storage/logs/security/*.jsonl` | `storage/logs/` | Gitignored | Local security audit log stream; verified ignored. |

---

## 9. Untracked Local Files Reviewed

Specific checks were performed on potential untracked candidates mentioned in project guidelines:

1. **`globals.css` in root**:
   - `git ls-files globals.css` returned empty.
   - Active stylesheet resides at `app/globals.css` (intact and unchanged).
   - No root `globals.css` was present in the working tree.
2. **`NEXT_SCRIPT.md` in root**:
   - `git ls-files NEXT_SCRIPT.md` returned empty.
   - A historical file named `NEXT_SPRINT.md` existed in the root. It was inspected, classified as legacy planning, and archived to `docs/archive/legacy-admin/NEXT_SPRINT.md`.
3. **Current Untracked Status**:
   - `git status -uall` confirms **0 untracked files** in the repository.

---

## 10. Files Intentionally Retained

### Core Code and Asset Directories Retained
- `app/`: Next.js App Router routes, layouts, and API handlers.
- `components/`: Modular React components for admin, editorial, reader, and media.
- `data/`: Preserved per explicit project requirement. Domain repositories utilize fallback JSON files when MongoDB is unconfigured or during local test execution.
- `docs/`: Expanded and organized into structured subdirectories (`b3/`, `setup/`, `deployment/`, `operations/`, `archive/`, `architecture/`).
- `hooks/`: Custom client-side React hooks.
- `lib/`: Backend domain implementations across Content, Video, E-Paper, Reader, Identity, Audience, Distribution, Analytics, Media, and TTS.
- `public/`: Public static assets and logos.
- `scripts/`: Operational verification and CI automation scripts.
- `storage/`: Local disk storage adapter and log directory structures.
- `tests/`: Automated Vitest, governance, security, and Playwright test suites.
- `types/`: Domain TypeScript type contracts.
- `.agents/`: Agent instructions and skills.
- `.github/`: CI workflows and issue templates.

### Root Configuration and Entrypoint Files (19 Files Retained)
- `AGENTS.md`: Authoritative instruction document for AI agents.
- `README.md`: Master project guide (updated with clean links).
- `auth.ts`: NextAuth / Auth.js configuration.
- `middleware.ts`: Next.js edge route protection and request logging.
- `package.json` & `package-lock.json`: Dependency manifests (strictly locked).
- `next.config.js`: Next.js build configuration and headers.
- `eslint.config.mjs`: Linter rules.
- `tailwind.config.js` & `postcss.config.js`: Tailwind styling configuration.
- `playwright.config.mjs`: E2E test runner configuration.
- `vitest.config.ts`: Unit test runner configuration.
- `tsconfig.json`: TypeScript configuration.
- `setupTests.ts`: Test setup and polyfill definitions.
- `global.d.ts` & `next-env.d.ts`: TypeScript environment declarations.
- `.env.example` & `.env.local.example`: Environment variable templates.
- `.gitignore`: Git exclusion rules.

---

## 11. `.gitignore` Audit & Findings

### Findings
- The original `.gitignore` contained duplicate `.env` ignore blocks:
  - Block 1 (lines 11–15): `.env`, `.env.hostinger`, `.env.local`, `.env.*.local`
  - Block 2 (lines 54–60): `.env`, `.env.local`, `.env.hostinger`, `.env.production`, `.env.test`, `.env*.local`
- `logs/` directory was listed as `*.log` multiple times.

### Actions Taken
- Consolidated environment variable rules into a single comprehensive section:
  ```gitignore
  # Environment variables
  .env
  .env.local
  .env.hostinger
  .env.production
  .env.test
  .env*.local
  ```
- Consolidated log directory and file rules:
  ```gitignore
  # Logs & Archives
  logs/
  *.log
  storage/logs/
  ```
- Confirmed full coverage for `node_modules/`, `.next/`, `.next-dev/`, `.hostinger/`, `*.tsbuildinfo`, `test-results/`, and `playwright-report/`.

---

## 12. Broken & Stale References Corrected

All moved documentation files were cross-referenced across the entire codebase using `git grep -n`. The following references were systematically updated:

1. **`README.md`**:
   - Line 142: Updated link from `HOSTINGER_CICD_SETUP.md` to `docs/deployment/HOSTINGER_CICD_SETUP.md`.
   - Line 158: Updated link from `HOSTINGER_DEPLOY.md` to `docs/deployment/HOSTINGER_DEPLOY.md`.
   - Line 168: Updated link from `VERCEL_CICD_SETUP.md` to `docs/deployment/VERCEL_CICD_SETUP.md`.
   - Lines 170–184: Completely refreshed `Project Docs` table pointing to new paths in `docs/b3/ROADMAP.md`, `docs/deployment/`, `docs/operations/`, `docs/setup/`, and `docs/archive/legacy-admin/`.
2. **`docs/README.md`**:
   - Rewritten to serve as the master documentation index, linking to Canonical B3, Setup, Deployment, Operations, ADRs, and Legacy Archive.
3. **`docs/deployment/HOSTINGER_DEPLOY.md`**:
   - Updated relative links to `./HOSTINGER_CICD_SETUP.md`, `./DEPLOY_SMOKE_CHECKLIST.md`, `../operations/ADMIN_RUNTIME_CHECKLIST.md`, and `./LEADERSHIP_REPORTS_HOSTINGER.md`.
4. **`docs/deployment/DEPLOY_SMOKE_CHECKLIST.md`**:
   - Updated relative link to `../operations/ADMIN_RUNTIME_CHECKLIST.md`.
5. **`docs/deployment/HOSTINGER_CICD_SETUP.md`**:
   - Updated relative links to `./HOSTINGER_DEPLOY.md` and `./DEPLOY_SMOKE_CHECKLIST.md`.
6. **`docs/archive/legacy-admin/PHASE5_GOVERNANCE_CHECKLIST.md`**:
   - Updated relative link to `../../operations/ADMIN_RUNTIME_CHECKLIST.md`.
7. **`lib/admin/deploymentSafeguards.ts` & Admin Settings UI**:
   - `lib/admin/deploymentSafeguards.ts` defines documentation paths (`/HOSTINGER_DEPLOY.md`, `/DEPLOY_SMOKE_CHECKLIST.md`, `/ADMIN_RUNTIME_CHECKLIST.md`), rendered as links in `app/(admin)/admin/settings/DeploymentSafeguardsPanel.tsx`.
   - **Runtime Characterization**: These root-prefixed paths were non-functional web links prior to this cleanup; Next.js App Router does not serve root Markdown files as public web pages, so clicking these links previously returned 404 responses. They have historically functioned as non-routable source-file labels rather than valid web routes.
   - **Decision & Claim Qualification**: In adherence to the Architecture Freeze v1 principle against inventing new runtime documentation-serving systems or copying source files into `public/` during hygiene cleanup, runtime source code was left untouched. The audit claim of "zero broken references" is explicitly qualified: all repository documentation, README links, and automation scripts were verified and updated, while these three admin UI doc paths are cataloged as existing operational UI debt (assigned to Phase 4 Production & Scale / operational hardening).

---

## 13. Historical Git Instructions Isolated

- In `docs/archive/legacy-admin/PHASE4_CMS_QA_CHECKLIST.md`, legacy Git instructions referencing the `zaid2` remote and old checkout sequences were identified.
- Prominently placed an archive warning alert banner at the top of the file:
  ```markdown
  > [!WARNING]
  > **Historical Document**: Do not use as current Git/deployment guidance.
  > The current authoritative B3 workflow is defined by `AGENTS.md`,
  > `docs/b3/ARCHITECTURE_FREEZE_V1.md`, and current repository instructions.
  ```
- This ensures no developer or autonomous agent mistakes these legacy instructions for current repository workflow.

---

## 14. Runtime Source Changes
**NONE**. Zero lines changed in `app/`, `components/`, `hooks/`, `lib/`, `public/`, `storage/` runtime code, `tests/`, or `types/`.

---

## 15. Dependency Changes
**NONE**. `package.json` and `package-lock.json` are unmodified. No package upgrades, additions, or audit fixes were executed.

---

## 16. Quality Gates & Test Results

All required quality gates were executed on the working tree before commit and push:
1. `git diff --check`: Verifies no whitespace or conflict marker errors.
2. `npm run typecheck`: TypeScript verification across all files.
3. `npm run lint:strict`: Strict ESLint check on core domain and governance code.
4. `npm run verify:dependency-security`: Validates explicitly governed advisory-version floors (PASS). Note: npm currently reports 35 advisory findings (31 moderate, 3 high, 1 critical) across the full dependency tree, which remain cataloged under DEBT-010 for Phase 4 controlled remediation.
5. `npm run test:security`: Validates API authentication and RBAC boundaries.
6. `npm run test:governance`: Validates super-admin governance surfaces and permission review.
7. `npm run test:four-role-newsroom`: Validates reporter, copy editor, admin, and super-admin workflows.
8. `npm run test:ci`: Full Vitest suite across all 228 test files and 1,179 tests.
9. `npm run build:ci`: Production Next.js build confirming static generation of all 172 routes.
10. `npm run lint`: Informational linting (inherited normal warnings recorded).

---

## 17. Remaining Repository Debt

All non-blocking debt items remain strictly aligned with the canonical roadmap and [`docs/b3/PHASE2_DEBT_REGISTER.md`](./PHASE2_DEBT_REGISTER.md):

- **Phase 3 (Reader / Product Experience & Performance UX)**:
  - **DEBT-007 (Partial)**: UI ESLint warning cleanup for reader and public components directly touched during Phase 3 UX work.
  - **DEBT-009 (Partial)**: Field Core Web Vitals (CWV) telemetry aggregation and reader performance UX.
- **Phase 4 (Production & Scale / Security & Operational Hardening)**:
  - **DEBT-001**: End-to-end distributed tracing (`x-request-id`) and structured JSON logging.
  - **DEBT-002**: Durable background queues (Redis / BullMQ) with retries and DLQs for PDF processing and OCR.
  - **DEBT-003 (Initial)**: Distributed Pub/Sub adapter for multi-instance newsroom live analytics streaming.
  - **DEBT-004 (Initial)**: Dedicated asynchronous media processing workers for Sharp image optimization.
  - **DEBT-005**: Edge CDN cache purge integration (Cloudflare / Fastly API hooks).
  - **DEBT-006**: Runtime modernization (migrating Vitest config to native ESM and Node 20.x maintenance).
  - **DEBT-007 (Remaining)**: Incremental cleanup of remaining non-reader legacy ESLint warnings (total baseline: 197).
  - **DEBT-008**: Multi-region database backup automation and staging restore drill orchestration.
  - **DEBT-009 (Production)**: Automated leadership alerts and daily CWV aggregation rollups from ingested telemetry.
  - **DEBT-010**: Controlled remediation and upgrades for 35 npm advisory findings (31 moderate, 3 high, 1 critical).
  - **Unnumbered Phase-4 operational UI debt**: Admin Deployment Safeguards documentation links currently use pre-existing non-routable source-file paths (`/HOSTINGER_DEPLOY.md`, `/DEPLOY_SMOKE_CHECKLIST.md`, `/ADMIN_RUNTIME_CHECKLIST.md`). Resolve during Phase 4 operational hardening using an established documentation link/viewing pattern.
- **Phase 8 (Apps & Advanced Scale)**:
  - **DEBT-003 / DEBT-004 (Scale Extraction)**: Physical microservice extraction for distributed pub/sub and media workers if measured production scale requires container isolation.

---

## 18. Recommendation for Phase 3 Start

With repository hygiene complete, root-level clutter eliminated, and documentation canonically organized:
1. The repository is in an **optimal state** for Phase 3.
2. Independent review should approve and merge this hygiene PR (`b3/pre-phase3-repo-hygiene` into `b3/foundation`).
3. Phase 3.1 (Modern Responsive Reader Experience & Brand Redesign) can commence cleanly without ambiguity regarding roadmap, architecture, or operational guidelines.
