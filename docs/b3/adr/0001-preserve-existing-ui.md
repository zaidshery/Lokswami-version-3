# ADR-0001: Preserve Existing Reader and CMS UI Baseline

- **Status**: `ACCEPTED`
- **Date**: 2026-09-08
- **Author**: Principal B3 Software Architect

## Context
LokSwami has an existing, working Hindi digital newsroom platform with active reader pages, an interactive E-Paper viewer, shorts, and a comprehensive administrative CMS shell. Rewriting the UI from scratch creates visual regressions, breaks editorial muscle memory, slows time-to-value, and wastes existing engineering investments.

## Decision
The existing LokSwami reader and CMS UI/UX is the non-negotiable baseline. We will not redesign the product or introduce parallel design systems unless explicitly instructed by the Product Owner. All frontend enhancements must reuse and extend shared components (`components/ui`, `components/layout`, `components/forms`), design tokens, and Hindi typography standards.

## Consequences
- **Positive**: Eliminates visual regressions; protects reader familiarity; accelerates backend and API modernization.
- **Trade-offs**: Requires disciplined inspection of existing components before adding new markup.
