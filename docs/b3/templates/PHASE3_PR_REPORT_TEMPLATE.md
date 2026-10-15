# [Phase X.Y PR Title]

## Summary of Changes
[Provide a concise 2-3 paragraph explanation of the changes, architectural decisions, and why they fulfill the task acceptance criteria.]

---

## Baseline & Head Verification

- **Base Branch**: `b3/foundation`
- **Verified Starting Base SHA**: `[BASE_SHA]`
- **Working Branch**: `[BRANCH_NAME]`
- **Exact Head SHA**: `[HEAD_SHA]`

---

## Changed Files & Scope Summary

### Files Changed:
- `path/to/modified/file.ts`
- `path/to/new/file.tsx`
- `tests/path/to/test.test.ts`

### Scope Summary:
- **In Scope**: [Summary of implemented items]
- **Out of Scope**: [Explicit confirmation of items intentionally omitted]
- **Scope Deviations**: NONE.
- **Next Phase Started**: NO. [Explicit confirmation that subsequent phase work has NOT started].

---

## Verification Pipeline & Test Evidence

| Quality Gate | Command | Status | Output Summary |
|---|---|---|---|
| **Focused Tests** | `npx vitest run tests/...` | PASS | [e.g., X tests passed] |
| **Typecheck** | `npm run typecheck` | PASS | 0 errors |
| **Strict Lint** | `npm run lint:strict` | PASS | 0 warnings, 0 errors |
| **Security Tests** | `npm run test:security` | PASS | All security suites passed |
| **Governance Tests** | `npm run test:governance` | PASS | Deployment safeguards & permissions passed |
| **Four-Role Newsroom** | `npm run test:four-role-newsroom` | PASS | 4-role transitions & routes verified |
| **Dependency Security** | `npm run verify:dependency-security` | PASS | Lockfile clean, zero advisories |
| **Full CI Test Suite** | `npm run test:ci` | PASS | Full test suite passed |
| **CI-Safe Build** | `npm run build:ci` | PASS | Next.js production build succeeded |
| **Scope & Secret Safety**| `npm run check:phase3-scope` | PASS | Clean scope, zero secret leaks |

---

## Browser & Responsive QA

Tested using `npm run qa:responsive` against local development server:

| Viewport (Width) | Target Archetype | Route | Status | Errors | Overflow (ScrollW vs InnerW) |
|---|---|---|---|---|---|
| **360px** | Compact Android | `/main` | 200 OK | 0 | None (360 vs 360) |
| **375px** | Compact iOS | `/main` | 200 OK | 0 | None (375 vs 375) |
| **390px** | Baseline Mobile | `/main` | 200 OK | 0 | None (390 vs 390) |
| **412px** | Modern Android | `/main` | 200 OK | 0 | None (412 vs 412) |
| **430px** | Large Mobile | `/main` | 200 OK | 0 | None (430 vs 430) |
| **768px** | Portrait Tablet | `/main` | 200 OK | 0 | None (768 vs 768) |
| **820px** | Mid Tablet | `/main` | 200 OK | 0 | None (820 vs 820) |
| **1024px** | Landscape Tablet | `/main` | 200 OK | 0 | None (1024 vs 1024) |
| **1440px** | Standard Desktop | `/main` | 200 OK | 0 | None (1440 vs 1440) |

- **Real-Content QA**: Verified against offline content snapshots.
- **Staging / Environment QA**: Zero production writes; outbound integrations sandboxed.

---

## GitHub CI & Review Threads

- **Exact-Head CI Workflow Run ID**: `[INSERT_CI_RUN_ID]`
- **CI Job Status**: All checks completed successfully (`success`).
- **Review Threads**: 0 unresolved threads.

---

## Defect Classification (P0 / P1 / P2)

- **P0 (Blockers)**: 0
- **P1 (High Priority Defects)**: 0
- **P2 (Edge Case / Polish)**: 0

---

## Worktree State

```bash
$ git status --short --untracked-files=all
# Expected: clean or only permitted untracked artifacts
```

---

## Final Instruction & Merge Status

> [!CAUTION]
> **DO NOT MERGE.**
> This pull request is ready for final independent human review.
> Automated agents MUST NOT merge.
