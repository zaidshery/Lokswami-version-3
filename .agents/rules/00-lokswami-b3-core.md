# LokSwami B3 Core Rule

Always read and obey the repository root engineering guidance:

@../../AGENTS.md

For all B3 architecture-sensitive work, consult the source of truth documents:

@../../docs/b3/PRODUCT_VISION.md
@../../docs/b3/CURRENT_STATE.md
@../../docs/b3/FUNCTIONAL_REQUIREMENTS.md
@../../docs/b3/NON_FUNCTIONAL_REQUIREMENTS.md
@../../docs/b3/ARCHITECTURE.md
@../../docs/b3/AI_NEWSROOM.md
@../../docs/b3/ROADMAP.md
@../../docs/b3/TEST_STRATEGY.md
@../../docs/b3/BASELINE.md

### Truth Hierarchies

- **Target / Normative Hierarchy**: Product Owner explicit requirements → root AGENTS.md → B3 rules → PRODUCT_VISION → Requirements → Architecture / ADRs → Implementation.
- **Current / Descriptive Hierarchy**: Verified running code → Automated tests → Active schemas/configs → Observable runtime behavior → CURRENT_STATE.md.
- **Rule**: `CURRENT_STATE.md` is descriptive only and must never override verified repository implementation facts.

---

## Non-Negotiable Operating Principles

1. **Evolution, Not Rewrite**: LokSwami B3 is an evolution of the existing production modular monolith, never a destructive greenfield rewrite.
2. **Preserve Existing UI**: Preserve the existing Reader and CMS UI/UX baseline unless a redesign is explicitly requested. Extend shared components and design tokens.
3. **Preserve Production Behavior**: Maintain working production behavior, public article visibility rules, and MongoDB/file-store persistence compatibility.
4. **Architecture Progression**: Follow the disciplined path:
   `modular monolith → stronger domain boundaries → stable APIs (/api/v1) → CDN/cache → async jobs → workers → observability → measured service extraction`.
5. **Justified Distribution**: Never introduce microservices merely for architectural fashion. Every service extraction must be justified by measured bottlenecks or operational requirements.
6. **Human Editorial Authority**: Human editor/admin retains final publication authority.
7. **AI Assistance Boundary**: AI assists with intake, research, verification, drafts, SEO, headlines, and distribution copy, but AI must **never** auto-publish journalism by default.
8. **Reader Performance Priority**: Reader performance is a first-class product requirement:
   - LCP $\le$ 2.5s (p75)
   - INP $\le$ 200ms (p75)
   - CLS $\le$ 0.1 (p75)
9. **Async Heavy Processing**: Heavy PDF, OCR, AI, TTS, media encoding, and distribution jobs must run asynchronously and never compete with latency-sensitive reader requests.
10. **Distribution-First Capabilities**: Sharing, social cards, and WhatsApp previews are first-class product features with stable public URLs, dynamic Open Graph tags, and branded imagery.
11. **Server-Side Security**: Authentication and role authorization (RBAC) must always be enforced server-side.
12. **Zero Secrets**: Never commit secrets, credentials, or private API keys to source control or logs.
13. **Data & Persistence Safety**: Never perform destructive data migrations or execute unverified production database operations.
14. **Measure Before Claiming**: Measure and benchmark capacity before claiming concurrent-user or throughput numbers.
15. **Execution Sequence**: For all significant tasks, follow:
    `UNDERSTAND → BASELINE → REQUIREMENTS → DESIGN → IMPLEMENT → TEST → REVIEW → DOCUMENT`.
