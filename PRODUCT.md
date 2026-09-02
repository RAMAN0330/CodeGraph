# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Software engineers and engineering leads investigating an unfamiliar or changing codebase.

## Product Purpose

GraphKeep turns a connected code repository into an explorable workspace for understanding its architecture, file relationships, ownership, history, databases, and security posture.

## Positioning

The product combines repository navigation and graph-based code exploration with practical engineering intelligence in one workspace.

## Operating Context

Users connect or enter a GitHub repository, select it, then work in a workspace with an architecture graph, repository tree, module navigation, code drill-down, Git insights, database visualization, and vulnerability scanning.

## Capabilities and Constraints

- Existing routes and product capabilities remain functional: landing, login, repository selection, workspace, and database visualization.
- The visual system may be replaced. Existing repository and analysis workflows remain product truth.
- The current implementation is a React and Vite web application.

## Brand Commitments

- Product name: GraphKeep.
- The interface should support dense technical work without becoming visually noisy.

## Evidence on Hand

- Working source for the repository selector and workspace is present under `client/src/features/`.
- No approved visual brand guide, production screenshots, customer claims, or external brand assets were supplied.

## Product Principles

- Make codebase structure legible at a glance.
- Keep exploration actions close to the evidence they affect.
- Surface risk and change signals without obscuring primary work.
- Prefer stable, precise interfaces over decorative product metaphors.

## Accessibility & Inclusion

- Preserve keyboard navigation and clear focus states.
- Respect reduced-motion preferences.
- Maintain WCAG AA contrast for interactive controls and essential content.
