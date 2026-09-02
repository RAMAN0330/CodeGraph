# System Architecture View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the basic System Architecture SVG with a validated system-level Mermaid/ELK diagram, details, exports, and optional AI text enrichment.

**Architecture:** A pure client service deterministically builds, validates, and compiles a bounded `ArchitectureGraph`. The System Architecture component renders the compiled Mermaid diagram and owns selection/export UI. A server endpoint optionally enriches text fields but cannot mutate topology.

**Tech Stack:** React, TypeScript, Mermaid, ELK, DOMPurify, Express, OpenAI Responses API, Node test runner, Vite.

## Global Constraints

- Implement only in the existing System Architecture section.
- Never render raw model-generated Mermaid.
- Every node path and edge must be validated against analyzed repository data.
- Keep Explore and Cosmos graph behavior unchanged.

### Task 1: Validated Architecture Model

**Files:**
- Create: `client/src/features/workspace/services/architectureGraph.ts`
- Create: `tests/architecture-graph.test.mjs`

- [ ] Write failing tests for grouping, bounds, edge evidence, dangling edges, path validation, enrichment topology protection, and Mermaid escaping.
- [ ] Run the test and verify failure because the service is missing.
- [ ] Implement deterministic construction, validation, enrichment application, and Mermaid compilation.
- [ ] Run the test and verify it passes.

### Task 2: System Architecture UI

**Files:**
- Replace: `client/src/features/workspace/components/ArchitectureDiagram.tsx`
- Modify: `client/src/features/workspace/legacy/LegacyWorkspaceEngine.tsx`
- Modify: `client/src/index.css`
- Modify: `client/package.json`
- Modify: `client/package-lock.json`

- [ ] Install Mermaid, ELK layout, and DOMPurify.
- [ ] Render header, summary, diagram, selected-component details, validation status, loading, empty, and errors.
- [ ] Connect validated component paths to the existing file-inspector callback.
- [ ] Implement Copy Mermaid and Download PNG actions.
- [ ] Add Generate explanation with non-blocking fallback.

### Task 3: Optional Enrichment Endpoint

**Files:**
- Modify: `server/src/config/env.ts`
- Modify: `server/src/index.ts`
- Modify: `server/.env.example`

- [ ] Add optional OpenAI API key/model configuration.
- [ ] Add a bounded `/api/architecture/enrich` endpoint using the Responses API.
- [ ] Return only summary and text updates keyed by existing IDs.
- [ ] Reject oversized input and return 503 when enrichment is not configured.

### Task 4: Verification and Production

- [ ] Run client tests, server build, and client production build.
- [ ] Run all repository tests and `git diff --check`.
- [ ] Rebuild affected production containers and verify HTTP health.
- [ ] Record browser QA as passed or blocked based on browser availability.
