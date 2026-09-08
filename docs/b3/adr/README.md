# LokSwami B3 — Architecture Decision Records (ADR) Registry

## Overview

This directory contains the historical Architecture Decision Records (ADRs) for the LokSwami B3 platform. 

An ADR captures an important architectural decision, including its context, alternatives considered, decision outcome, and consequences.

---

## ADR Template Standard

Every B3 ADR follows this standard structure:

- **Title**: `ADR-XXXX: [Short Title]`
- **Status**: `PROPOSED | ACCEPTED | SUPERSEDED | DEPRECATED`
- **Context**: The problem, constraints, and business/technical drivers.
- **Decision**: The specific architectural choice made.
- **Consequences**:
  - Positive outcomes and capabilities unlocked.
  - Trade-offs, operational burdens, or technical debt incurred.
- **Compliance & Verification**: How the decision is tested and enforced.

---

## Initial Core Decision Records

The following foundational architectural decisions govern LokSwami B3:

| ADR ID | Decision Title | Status | Core Principle |
| :--- | :--- | :--- | :--- |
| **[ADR-0001](file:///c:/Users/Lenovo/OneDrive/Desktop/Lokswami_V3/Zaid-lokswami/docs/b3/adr/0001-preserve-existing-ui.md)** | Preserve Existing Reader & CMS UI Baseline | `ACCEPTED` | Evolution over rewrite; extend existing shared components and design tokens. |
| **[ADR-0002](file:///c:/Users/Lenovo/OneDrive/Desktop/Lokswami_V3/Zaid-lokswami/docs/b3/adr/0002-modular-monolith-first.md)** | Modular Monolith Before Microservices | `ACCEPTED` | Strengthen internal domain boundaries, stable APIs, and queues before service extraction. |
| **[ADR-0003](file:///c:/Users/Lenovo/OneDrive/Desktop/Lokswami_V3/Zaid-lokswami/docs/b3/adr/0003-human-governed-ai-newsroom.md)** | Strict Human Editorial Authority for AI Operations | `ACCEPTED` | AI assists with research and drafting; AI never auto-publishes journalism by default. |
| **[ADR-0004](file:///c:/Users/Lenovo/OneDrive/Desktop/Lokswami_V3/Zaid-lokswami/docs/b3/adr/0004-dual-persistence-resilience.md)** | Dual-Persistence Architecture (MongoDB + File Store) | `TRANSITIONAL` | Preserved for current compatibility until a separately approved migration proves a safer replacement. |
