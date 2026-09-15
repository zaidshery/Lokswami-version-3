# [Phase X.Y] — [Task Title]

---

## 1. Phase / Task
- **Phase**: Phase 3.X
- **Task Identifier**: B3-TASK-3.X
- **Status**: [DRAFT / APPROVED / IN_PROGRESS / READY_FOR_REVIEW]

---

## 2. Objective
[Concise 2-3 sentence statement explaining the user outcome, business objective, and technical purpose of this task.]

---

## 3. User-Approved Product Behavior
[Bullet points describing the exact, user-approved interactions, layout, visual hierarchy, and copy. Quote or reference user instructions explicitly.]
- Behavior item 1
- Behavior item 2
- Behavior item 3

---

## 4. In Scope
- [Scoped feature or fix item 1]
- [Scoped feature or fix item 2]
- [Documentation or test coverage item]

---

## 5. Out of Scope
- [Unrelated phase features — e.g., subsequent Phase 3.X items]
- [Unrelated layout redesigns]
- [Unrelated schema or database model changes]
- [Dependency updates / npm audit fix]
- [Automatic PR merge]

---

## 6. Base SHA & Starting Baseline
- **Canonical Base Branch**: `b3/foundation`
- **Verified Starting Base SHA**: `[INSERT_EXACT_BASE_SHA_HERE]`

---

## 7. Branch
- **Working Branch**: `b3/[feature-slug]`

---

## 8. Architecture Constraints
- Reader routes remain under `app/(reader)`.
- CMS routes remain under `app/(admin)`.
- Reusable domain logic lives under `lib/`.
- Single source of truth for permissions: `lib/auth/permissions.ts`.
- E-Paper is a daily, city/edition publication; E-Magazine is a monthly issue publication.
- Preserve file-store / MongoDB dual-layer compatibility via `isMongoAvailable`.
- No new third-party dependencies unless explicitly authorized.

---

## 9. Files Likely Affected
- `[MODIFY] path/to/existing/file.tsx`
- `[NEW] path/to/new/component.tsx`
- `[NEW] tests/path-to-test.test.ts`

---

## 10. Design Lock
- **Color Palette & Theme**: [Inter, Outfit, Tailwind tokens, CSS variables, Dark/Light/Auto preservation]
- **Typography & Glyph Safety**: Devanagari matra & ligature clearance; no clipping.
- **Layout Constraints**: Bounded maximum container width, consistent spacing tokens.

---

## 11. Acceptance Criteria
- [ ] Criterion 1: [Specific, measurable functional requirement]
- [ ] Criterion 2: [Specific, measurable layout/responsive requirement]
- [ ] Criterion 3: [Specific, measurable edge-case handling]
- [ ] Criterion 4: Zero horizontal overflow on canonical viewports.
- [ ] Criterion 5: Zero console errors or hydration warnings.

---

## 12. Focused Tests (Fast Loop)
- List exact test command(s) to run during iteration:
  ```bash
  npx vitest run tests/[specific-test].test.ts
  npm run typecheck
  ```

---

## 13. Browser QA (Responsive Viewports)
- Canonical Viewports: 360, 375, 390, 412, 430, 768, 820, 1024, 1440.
- Boundary Checks: 389/390, 767/768, 1023/1024.
- Execution Command:
  ```bash
  npm run qa:responsive
  ```

---

## 14. CMS Role QA (If Applicable)
- [ ] `super_admin`: Full technical control plane access verified.
- [ ] `admin`: Executive management actions verified.
- [ ] `copy_editor`: Review and publish actions verified.
- [ ] `reporter`: Draft authoring and restricted publishing verified.

---

## 15. Environment Requirements
- **Target**: LOCAL / PREVIEW
- **MongoDB**: Local test instance or file-store fallback.
- **Outbound**: All external messaging (push, WhatsApp, social, TTS) disabled or mocked.
- **Production Writes**: STRICTLY PROHIBITED.

---

## 16. FAST LOOP (Authoring Cycle)
1. Inspect architecture & existing patterns.
2. Make one scoped change.
3. Run focused unit tests.
4. Run typecheck if types affected.
5. Check visual behavior via browser QA.
6. Fix and repeat.
*(DO NOT run test:ci or build:ci repeatedly during this phase).*

---

## 17. FINAL GATES (Candidate Verification)
Execute the complete verification pipeline once implementation is stable:
```bash
npm run verify:phase3
npm run check:phase3-scope
```

---

## 18. PR Requirements
- PR Target: `b3/foundation`
- PR Title: `B3: Phase 3.X [Feature Description]`
- PR Report formatted using `docs/b3/templates/PHASE3_PR_REPORT_TEMPLATE.md`.
- Exact-head CI run ID included.
- 0 unresolved review threads.

---

## 19. Defect Register (P0 / P1 / P2)
- **P0 (Blocker)**: None
- **P1 (High Priority)**: None
- **P2 (Polish / Edge Case)**: None

---

## 20. Explicit Non-Merge Instruction

> [!CAUTION]
> **DO NOT MERGE.**
> Automated agents (Codex, Antigravity, etc.) are strictly forbidden from merging pull requests.
> Merge execution requires independent human review and explicit authorization from the repository owner.
