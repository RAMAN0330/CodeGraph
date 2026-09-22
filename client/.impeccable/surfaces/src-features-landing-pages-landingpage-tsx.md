---
version: 1
slug: "src-features-landing-pages-landingpage-tsx"
primary_target: "src/features/landing/pages/LandingPage.tsx"
related_targets: []
---

## Scope & mode
Persuade — the Structrace marketing landing page (`client/src/features/landing/pages/LandingPage.tsx`).

## Audience, job, action, proof
Software engineers/leads evaluating a repo-analysis tool, skeptical of another dev-tool pitch. Job: decide Structrace is worth connecting a real repository to. Action: "Get started" → `/login`. Proof: the hero graph is a real, code-driven demonstration (not a static screenshot) of the actual product mechanism — files, dependencies, ownership, schema, security signals.

## Chosen direction & memorable moment
"Unfolding Map" (surface-scope roll, seed key 98c15e93, lead card). One collapsed repo node deploys stage by stage into the full graph as the visitor scrolls through five stages that map 1:1 to real product capabilities (files → dependency graph → ownership/history → db schema → security signals). Visual system unchanged: dark IDE ground (#1e2227/#282c34), One Dark Pro accents (#61afef blue, #98c379 green, #e5c07b amber, #e06c75 red), Montserrat display, monospace data labels, hairline grid canvas.

Signature interaction: a sticky SVG graph panel (right column) whose nodes/edges reveal via IntersectionObserver as the visitor scrolls the left-column narrative. Mobile falls back to stepped, non-scroll-linked snapshots per stage (no sticky panel), per the accessibility/responsive note carried from the Miura-fold challenger this direction was raised from.

## Unresolved decisions
- The hero graph's demo repo/file names (`acme/api`, `auth/session.ts`, etc.) are illustrative content, not a real customer — replace if a real reference repo becomes available.
- No screenshot-based finish review was run this session (no headless browser tool available in this environment); visual QA was code-level only. Flagged to the user directly.
