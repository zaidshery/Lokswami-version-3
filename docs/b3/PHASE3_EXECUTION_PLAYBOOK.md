# LokSwami B3 — Phase 3 Execution Playbook

## Purpose & Scope

This execution playbook establishes the canonical engineering workflow, validation cycles, and quality gates for LokSwami B3. This Accelerator applies to the remaining approved Phase 3 workstreams and subsequent controlled cutover work as defined by the canonical, owner-approved B3 roadmap.

The goal of this system is to:
- Standardize the implementation and verification loop across all engineering agents and developers.
- Shorten repetitive prompts and eliminate ambiguity in acceptance criteria.
- Protect the codebase against regressions without burdening developers with heavy verification suites during iterative authoring.
- Prevent accidental leaks of secrets, local development state, or unapproved dependencies.
- Standardize PR review readiness and enforce strict human merge control.

---

## Core Principles

1. **Safety First, Speed Second**: No changes to production, no unapproved schema mutations, no production credential usage, and no bypass of governance gates.
2. **Fast Feedback During Implementation; Full Verification Only on Stable Candidates**:
   - Do NOT run `npm run test:ci` or `npm run build:ci` after minor CSS or line-level edits.
   - Run focused, scoped unit tests and typechecks during active authoring.
   - Run the complete safety suite (`npm run verify:phase3`) only when the candidate is stable and ready for PR.
3. **Canonical Architecture as Source of Truth**:
   - Reader routes live under `app/(reader)`.
   - CMS routes live under `app/(admin)`.
   - Domain logic lives under `lib/`.
   - Permissions live in `lib/auth/permissions.ts` and `lib/auth/roles.ts`.
4. **Independent Final Review & Explicit Human Merge Authorization**:
   - Automated agents (Codex, Antigravity, etc.) **NEVER merge pull requests**.
   - Agents may create, update, and push branches, open PRs, and report CI status when authorized.
   - The final merge action requires explicit authorization from the repository owner.

---

## Two Validation Modes

### 1. Fast Loop (During Active Implementation)

The Fast Loop is designed for rapid iteration with zero unnecessary overhead.

```
[Inspect Architecture]
        ↓
[Scoped Implementation Change]
        ↓
[Focused Tests / Fast Unit Tests]
        ↓
[Typecheck (if types affected)]
        ↓
[Targeted Browser QA / Visual Verification (if UI)]
        ↓
[Fix / Adjust]
        ↓
[Repeat]
```

#### Step-by-Step Fast Loop Workflow:
1. **Inspect Architecture**: Consult the relevant design documents under `docs/b3/`, existing components, and domain helpers.
2. **Make One Scoped Change**: Touch only the files required for the immediate task. Do not make speculative refactors.
3. **Run Focused Tests**:
   - Run only the specific Vitest file:
     ```bash
     npx vitest run tests/path-to-test.test.ts
     ```
4. **Run Typecheck**:
   - If interfaces, components, or API schemas were modified:
     ```bash
     npm run typecheck
     ```
5. **Run Scoped Browser QA** (for reader/CMS UI tasks):
   - Verify visually against the local development server (`http://127.0.0.1:3000`).
   - Run responsive checks for modified components using:
     ```bash
     npm run qa:responsive
     ```
6. **Inspect & Repeat**: Adjust implementation based on quick feedback.

> [!IMPORTANT]
> **DO NOT** run `npm run test:ci` or `npm run build:ci` repeatedly during the Fast Loop. Full builds are slow and unnecessary while code is in flux.

---

### 2. Final Candidate Loop (Pre-PR and PR Verification)

Once the feature or bug fix is fully implemented and tested via the Fast Loop, execute the Final Candidate Loop to guarantee zero regressions across the entire repository.

```
Focused Tests Stable
        ↓
Typecheck (`npm run typecheck`)
        ↓
Strict Lint (`npm run lint:strict`)
        ↓
Security Tests (`npm run test:security`)
        ↓
Governance Tests (`npm run test:governance`)
        ↓
Four-Role Newsroom Tests (`npm run test:four-role-newsroom`)
        ↓
Dependency Security Floor (`npm run verify:dependency-security`)
        ↓
Full CI Suite (`npm run test:ci`)
        ↓
CI-Safe Build (`npm run build:ci`)
        ↓
Scope & Secrets Safety Inspection (`npm run check:phase3-scope`)
        ↓
Real-Content / Responsive QA (if applicable)
        ↓
Commit & Push to Feature Branch
        ↓
GitHub Exact-Head CI Verification
        ↓
Review Threads Verification (0 unresolved)
        ↓
Independent Final Review
        ↓
Explicit Human Merge Authorization
```

#### Orchestrated Final Verification Command:
To run the safety gates deterministically in a fail-fast order, execute:
```bash
npm run verify:phase3
```
This orchestrates:
1. `npm run typecheck`
2. `npm run lint:strict`
3. `npm run test:security`
4. `npm run test:governance`
5. `npm run test:four-role-newsroom`
6. `npm run verify:dependency-security`
7. `npm run test:ci`
8. `npm run build:ci`

#### Scope & Secrets Check:
Before committing, inspect the repository diff and working tree for accidental leakage:
```bash
npm run check:phase3-scope
```
Ensure that no `.env` files, credentials, local `.next-dev-server.json` runtime artifacts, or unintended test outputs are tracked or staged.

---

## Pull Request Policy & Governance

1. **Branch Naming**:
   - Follow the convention: `b3/<feature-name>` (e.g., `b3/phase3-4-breaking-news-rail`).
   - Feature branches branch from and target `b3/foundation`.
2. **Commit Hygiene**:
   - Commits should use conventional commit formatting: `feat(b3): ...`, `fix(b3): ...`, `chore(b3): ...`.
   - Never force-push (`git push --force`) to shared or canonical branches.
3. **PR Creation & Reporting**:
   - Use `docs/b3/templates/PHASE3_PR_REPORT_TEMPLATE.md` to format PR descriptions.
   - Include base SHA, exact head SHA, test outcomes, responsive QA measurements, CI run IDs, and explicit confirmation of P0/P1/P2 resolution.
4. **Review Threads**:
   - All comments and review threads must be resolved before a PR is marked ready.
   - Code adjustments must directly resolve the raised concern.
5. **Merge Invariants**:
   - Agents must never execute `git merge`, `gh pr merge`, or use the GitHub API to merge a PR.
   - Every merge into `b3/foundation` must be performed or explicitly approved by the human owner.
