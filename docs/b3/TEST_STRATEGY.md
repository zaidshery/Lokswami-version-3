# LokSwami B3 — Test Strategy & Verification Discipline

## 1. Testing Philosophy

In LokSwami B3, testing is not a post-facto checklist; it is an active architecture safeguard. 

Because B3 evolves an active production newsroom platform with dual persistence (MongoDB + file fallbacks) and complex editorial state transitions, every change must be verified against regressions before any deployment.

---

## 2. The B3 Testing Pyramid

```
           / \
          /   \     E2E / Browser Smoke (Playwright, browser-smoke-local.js)
         /     \
        /-------\   Integration & Governance (Newsroom transitions, Auth guards, CAS locks)
       /         \
      /-----------\ Unit Tests (Vitest: mappers, SEO analysis, rate limiters, cursor logic)
     /_____________\ Static Analysis (TypeScript typecheck, ESLint strict, dependency audit)
```

---

## 3. Test Suites & Execution Protocols

### 3.1 Static Analysis & Quality
- **Command**: `npm run typecheck`
  - Validates full TypeScript AST without emitting code (`tsc --noEmit`).
- **Command**: `npm run lint` & `npm run lint:strict`
  - Validates ESLint rules across server, API, security, and storage modules with zero warnings allowed on critical paths.
- **Command**: `npm run verify:dependency-security`
  - Validates package dependency tree against known security advisories.

### 3.2 Unit & Domain Logic Testing
- **Framework**: Vitest (`vitest run`)
- **Key Coverage**:
  - `tests/public-articles-service.test.ts`: Publication state filtering and feed mapping.
  - `tests/article-seo.test.ts`: Canonical URLs, meta title/description limits, structured schema.
  - `tests/security-rate-limiter.test.ts`: Sliding-window limiters and circuit-breaker tripping.
  - `tests/epaper-workflow-v3.test.ts`: Edition lifecycle, page numbering, and hotspot coordinates.
  - `tests/swipe-feed.test.tsx`: Shorts cursor pagination and view window math.

### 3.3 Integration & Governance Testing
- **Command**: `npm run test:security`
  - Runs validation on rate limiters, audit loggers, CSP reports, admin team routes, and TTS queues.
- **Command**: `npm run test:governance`
  - Tests deployment safeguards, permission reviews, and operational diagnostics.
- **Command**: `npm run test:four-role-newsroom`
  - Verifies RBAC isolation between `reporter`, `copy_editor`, `admin`, and `super_admin`.
- **Command**: `npm run test:auth-guards` & `npm run test:admin-credentials`
  - Validates session security and brute-force protection on credentials endpoints.

### 3.4 Production Readiness & Build Verification
- **Command**: `npm run build:ci`
  - Performs Next.js production build (`next build`) with environment variable synchronization and artifact cleanup.
  - Required before marking any architecture task complete.
- **Command**: `npm run verify:prod-env`
  - Assesses environment variable completeness against production criteria.

---

## 4. Verification Workflow for B3 Tasks

For every architecture modification, the agent and developer must execute this sequence:

1. **Focused Test Run**:
   ```bash
   npx vitest run tests/<targeted-test>.test.ts
   ```
2. **TypeScript Compilation**:
   ```bash
   npm run typecheck
   ```
3. **Relevant Governance / Security Test**:
   ```bash
   npm run test:security
   ```
4. **CI-Safe Production Build (if touching build/runtime paths)**:
   ```bash
   npm run build:ci
   ```
5. **Git Inspection**:
   Inspect `git diff` to ensure zero unintended file touches, no deleted tests, and no modified generated assets.
