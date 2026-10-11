# Reconstructed R05: role and runtime contract verification

The original R05 finding and acceptance criteria are unavailable. The owner authorized investigation of the recovered role/runtime reference on 11 October 2026. This report records the current automated contracts; it does not claim recovery of the original audit.

## Reviewed contracts

- `lib/auth/roles.ts` defines exactly Super Admin, Admin, Copy Editor and Reporter as CMS roles, with Reader separate. Legacy Author and Editor normalize to Reporter and Copy Editor; Viewer normalizes to Reader. Unknown roles normalize to null.
- `lib/auth/permissions.ts` keeps system-control pages and actions restricted to Super Admin. Reporter ownership, Copy Editor assignment, and Admin publishing permissions are covered by the established acceptance suites.
- Existing tests check the canonical core-page matrix, server guards on system-control pages, sensitive API role checks, editorial transitions, and shell role-boundary behavior.
- Middleware exception handling is the separate reconstructed R04 correction. This verification does not broaden that patch or change role mappings.

## Recorded validation

On Node 20 and UTC, 10 established suites passed: 70 tests.

```sh
npx vitest run tests/permissions-governance.test.ts tests/phase310-four-role-acceptance.test.ts tests/phase39-four-role-acceptance.test.ts tests/phase38-four-role-acceptance.test.ts tests/story-editing-permissions.test.ts tests/permission-review.test.ts tests/role-workflow-guide.test.ts tests/newsroom-workflow-transitions.test.ts tests/api/admin-epaper-role-guard.test.ts tests/api/admin-sensitive-role-guards.test.ts
npm run test:auth-guards
npm run test:admin-credentials
```

The auth-guard script passed 7 cases. The credentials script passed 8 synthetic cases and explicitly skipped verification of configured credentials because none were supplied. R03 CI on head `727e382eb296740863f2de52d7c928091ed4daf2` also passed the full suite, lint, typecheck, dependency floor and build.

No current defect was reproduced in these reviewed contracts, so this report proposes no runtime or permission change. Automated verification is complete for this reconstructed scope. Authenticated browser workflows using real Super Admin, Admin, Copy Editor and Reporter accounts remain a CMS acceptance gate; source assertions and synthetic credentials do not establish that live acceptance. An original audit closure claim remains unavailable without the original criteria.
