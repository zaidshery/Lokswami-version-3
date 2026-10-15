# ADR-0003: Strict Human Editorial Authority for AI Operations

- **Status**: `ACCEPTED`
- **Date**: 2026-09-08
- **Author**: Principal B3 Software Architect

## Context
Generative AI models excel at multi-source synthesis, research summarization, and headline variations, but risk hallucinations, factual errors, and lack of accountability. An unverified AI hallucination in a newsroom destroys editorial credibility and creates severe legal liability.

## Decision
All AI-generated or AI-assisted content within LokSwami B3 must operate under strict human editorial governance:
1. AI generates structured Evidence Packages and draft suggestions only.
2. AI is strictly prohibited from directly altering an article's status to `published`.
3. An authenticated human editor (`copy_editor`, `admin`, or `super_admin`) must explicitly review, verify, and approve any AI-assisted draft before publication.

## Consequences
- **Positive**: Protects newsroom credibility; ensures journalistic integrity; enables legal compliance.
- **Trade-offs**: AI operations cannot be 100% autonomous.
