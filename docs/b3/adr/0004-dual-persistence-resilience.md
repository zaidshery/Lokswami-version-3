# ADR-0004: Dual-Persistence Architecture (MongoDB + Atomic File Store)

- **Status**: `ACCEPTED FOR CURRENT COMPATIBILITY / TRANSITIONAL` (Provisional)
- **Date**: 2026-09-08
- **Author**: Principal B3 Software Architect

## Context
Breaking news traffic surges can cause transient database connection pool exhaustion or network timeouts. When a digital newspaper crashes during high-traffic news events, readers abandon the site. LokSwami already contains a tested atomic JSON file-store fallback in `lib/storage/` inherited from the existing codebase.

However, long-term local file persistence presents architectural challenges for:
- Multiple application instances behind a load balancer
- Containerized or serverless deployments
- Horizontal scaling
- Immutable ephemeral deployments
- Independent background workers running on separate nodes
- Hostinger/VPS failovers

## Decision
LokSwami B3 preserves the existing MongoDB + atomic file-store fallback **for current compatibility**, but does **not** treat it as an irreversible permanent architecture:
1. Primary read/write operations target MongoDB via Mongoose.
2. High-traffic public reading paths use bounded connection probes (`isMongoAvailable()`).
3. If MongoDB connectivity stalls or fails, read paths seamlessly serve the latest cached atomic file-store snapshots from `lib/storage/` without returning HTTP 500 errors to readers.
4. Schema evolutions in MongoDB models must maintain compatibility with corresponding file-store serialization helpers.
5. **Replacement Criteria**: This dual-persistence mechanism must be preserved until a separately approved architecture migration demonstrates an equal or safer replacement (e.g., Redis edge caching, read replicas, or distributed memory tier) with full backward compatibility, verified rollback plans, and zero risk of data loss.

## Consequences
- **Positive**: Exceptional reader uptime during database outages or maintenance windows today; zero regression in existing fallback guarantees.
- **Trade-offs**: Dual-testing overhead for schema changes; cannot scale state across multi-node server clusters without a distributed shared filesystem or alternative caching tier.
