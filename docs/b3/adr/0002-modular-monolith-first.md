# ADR-0002: Modular Monolith Before Microservices

- **Status**: `ACCEPTED`
- **Date**: 2026-09-08
- **Author**: Principal B3 Software Architect

## Context
There is frequent industry temptation to decompose web applications into distributed microservices. In digital news publishing, microservices introduce cross-service network latency, complex distributed transactions, deployment fragility, and heavy observability overhead without solving core product bottlenecks.

## Decision
LokSwami B3 will remain a modular monolith with strict domain boundaries (`lib/content`, `lib/server`, `lib/security`), stable public API contracts (`/api/v1`), and asynchronous background workers. Service extraction is strictly prohibited unless justified by measured performance bottlenecks, hardware requirements (e.g. GPUs), or independent scaling contention.

## Consequences
- **Positive**: High development velocity; simple zero-downtime Hostinger deployments; shared type safety across frontend and backend.
- **Trade-offs**: Requires discipline to prevent leaky abstractions between internal domain modules.
