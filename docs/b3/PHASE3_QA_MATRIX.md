# LokSwami B3 — Standard QA Matrix

## Overview

This document specifies the standard QA matrix, viewport dimensions, verification criteria, and role-based test expectations for LokSwami B3.

All Phase 3 features (reader-facing and CMS-facing) must be validated against the applicable dimensions defined in this matrix prior to final PR submission.

---

## 1. Reader Responsive Viewports

### Canonical Viewports

The reader application must render correctly, maintain touch usability, and exhibit zero horizontal overflow across the following nine canonical widths:

| Width (px) | Device Archetype / Target | Primary Focus Areas |
|---|---|---|
| **360** | Compact Android (e.g. Galaxy A-series) | Minimum mobile boundary, logo & hamburger clearance, compact action buttons |
| **375** | Compact iOS (e.g. iPhone SE) | Narrow iOS layout, compact language selector, navigation drawer |
| **390** | Standard iOS (iPhone 12 / 13 / 14 / 15) | Baseline mobile standard, geometric logo centering, touch target bounds |
| **412** | Modern Android (e.g. Google Pixel / Galaxy S) | Standard Android mobile layout, card typography spacing |
| **430** | Large Mobile (e.g. iPhone Pro Max / Plus) | High-resolution mobile, max mobile content width |
| **768** | Portrait Tablet (iPad portrait) | Tablet header transition, multi-column card layout introduction |
| **820** | Modern Tablet (iPad Air 10.9) | Mid-size tablet layout, reading experience, sidebar rails |
| **1024** | Landscape Tablet / Small Laptop (iPad Pro) | Desktop navigation emergence, sticky editorial rails |
| **1440** | Standard Desktop | Full editorial grid, max container width, multi-rail layout |

### Critical Boundary Breakpoints

Inspect layouts at boundary transitions to catch layout snapping, overlap, or sudden horizontal scrollbar emergence:

- **389px / 390px**: Transition between compact sub-390 mobile controls and baseline mobile layout (e.g., language selector display and touch bounding box).
- **767px / 768px**: Transition between mobile navigation drawer and desktop/tablet navigation bars.
- **1023px / 1024px**: Transition between tablet layout and full desktop editorial rails.

---

## 2. Reader QA Dimensions

Every reader UI change must be evaluated against the following 11 dimensions:

1. **Horizontal Overflow**:
   - `document.documentElement.scrollWidth` must exactly equal `window.innerWidth`.
   - Zero unintentional horizontal scrolling on any canonical viewport.
2. **Header & Navigation Collisions**:
   - Verify hamburger menu, brand logo, language toggle, and search trigger do not collide or wrap awkwardly.
   - Brand logo must remain cleanly centered on mobile and properly aligned on desktop.
3. **Hindi & Devanagari Typography**:
   - Zero vertical clipping of ascenders (matras like ो, ै) or descenders (halant ्, u-matras ु, ू).
   - Verify font loading, fallback rendering, and line-height adequacy.
4. **Theme Preservation (Light / Dark / Auto)**:
   - Verify page renders correctly in Light mode, Dark mode, and Auto (system preference).
   - No flash of unstyled content or wrong theme on initial page render.
   - Contrast ratios must comply with WCAG AA (minimum 4.5:1 for normal text).
5. **Touch Targets**:
   - Primary interactive controls (buttons, links, search triggers, hamburger) must maintain minimum 44×44px effective touch target size.
   - Any deliberate responsive exception (such as the compact 34×44px language toggle segment at 390–639px designed to preserve logo clearance) must be documented and deliberate.
6. **Keyboard Focus & Accessibility**:
   - Logical tab order across all interactive elements.
   - Clearly visible focus rings on focusable controls.
   - Modals and drawers must trap focus when open and restore focus to trigger when closed with `Escape`.
7. **Reduced Motion**:
   - Animations must respect `prefers-reduced-motion: reduce`.
   - Transitions must gracefully disable or degrade to instantaneous state changes.
8. **Loading, Error & Empty States**:
   - Rails, feeds, and articles must display skeleton loaders during data fetch.
   - Empty rails (e.g., Live Updates, Popular News) must gracefully backfill or collapse without breaking layout.
   - Friendly error fallbacks when network requests fail.
9. **Console Errors & Warnings**:
   - Zero uncaught exceptions, unhandled Promise rejections, or React hydration mismatch warnings in the browser console.
10. **Route Correctness**:
    - URLs must be clean, semantic, and canonical.
    - Active navigation indicators must use segment-safe path matching (e.g., matching `/main/shorts` but not `/main/shortsfoo`).
11. **SSR & Crawlability**:
    - Semantic HTML tags (`<header>`, `<nav>`, `<main>`, `<article>`, `<footer>`).
    - Proper metadata, OpenGraph tags, schema markup, and crawlable initial HTML response.

---

## 3. CMS & Newsroom QA Dimensions

CMS changes must be validated against the editorial lifecycle across the four newsroom roles:

1. **Navigation Visibility**: Role-appropriate sidebar menu items and quick-action buttons must appear or remain hidden based on user permissions.
2. **Direct Route Authorization**: Attempting to navigate directly to unauthorized URLs must trigger an appropriate redirect to login or a 403 Forbidden screen.
3. **API Authorization**: Server actions and API routes must authenticate sessions and verify role permissions before executing mutations.
4. **Read Authority**: Editors can view permitted drafts, scheduled items, and historical revisions according to their role.
5. **Create**: Authors can create new articles, drafts, and assign metadata (category, tags, authors).
6. **Edit & Locking**: Multi-user editing controls, draft versioning, and article lock acquire/release mechanics.
7. **Review Workflow**: Proper transition through states: `draft` → `in_review` → `approved`.
8. **Publishing**: Publishing authority enforces due dates, scheduled release, and editorial flags (Breaking, Trending).
9. **Delete & Archive**: Destructive actions (deletion, unpublishing) require appropriate authorization and confirmation dialogs.
10. **Audit & Observability**: Sensitive actions (role changes, publish events, deletions) are logged to the security audit trail.
11. **Error Handling**: Clear error toasts and validation feedback for network failures, validation errors, and lock conflicts.

---

## 4. The Four Canonical Newsroom Roles

The newsroom permissions model consists of four canonical roles:

1. **`super_admin`**:
   - Technical control plane and system owner.
   - Full access to all administrative, technical, operational, and editorial settings.
2. **`admin`**:
   - Executive newsroom manager.
   - Full operational management of editorial staff, articles, and newsroom workflows.
3. **`copy_editor`**:
   - Senior editorial gatekeeper.
   - Reviews, edits, approves, schedules, and publishes articles submitted by reporters.
4. **`reporter`**:
   - Content creator and author.
   - Authors stories, submits drafts for review, and manages personal drafts.

### Source of Truth Notice

> [!IMPORTANT]
> The application's canonical permissions code in `lib/auth/permissions.ts` and `lib/auth/roles.ts` is the single source of truth for all role capabilities.
> QA documentation and test cases must test against this canonical implementation rather than inventing parallel or diverging permission definitions.
