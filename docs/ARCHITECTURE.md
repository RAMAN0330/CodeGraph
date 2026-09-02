# CodeFlow architecture

## Client

The client uses a feature-first structure. A feature owns its pages, components,
services, and feature-specific types. Cross-feature imports must target a feature's
service or component explicitly; reusable primitives live under `shared/`.

- `app/`: runtime configuration and application composition
- `features/analysis/`: repository parsing, metrics, and technical-debt analysis
- `features/database/`: schema ingestion and ER visualization
- `features/export/`: report and graph exports
- `features/git-insights/`: history, ownership, blame, and branch comparison
- `features/landing/`: public landing experience
- `features/repository/`: GitHub access, repository selection, caching, and trees
- `features/security/`: dependency vulnerability analysis
- `features/workspace/`: workspace orchestration and workspace-only UI
- `shared/`: domain-neutral UI primitives and shared types

Page routes are lazy-loaded in `App.tsx`, keeping feature bundles isolated until
the user navigates to them. Environment access is centralized in `app/config.ts`.

## Server

The Node server is the browser-facing gateway. It owns authentication, database
introspection, GitHub proxying, and forwarding analysis jobs to FastAPI. Runtime
configuration lives in `src/config/`, and shared transport types live in
`src/types/`. The Python service owns asynchronous analysis jobs.

`server-go/` is the production gateway migration target. It uses only the Go
standard library and provides bounded request bodies, upstream timeouts,
structured logging, panic recovery, explicit CORS, health checks, graceful
shutdown, GitHub tree proxying, and FastAPI job forwarding. The Node gateway
remains the compatibility implementation until OAuth and database routes have
been migrated and parity-tested.

## Dependency rules

1. `shared/` must not import from a feature.
2. Feature UI may use its own services, `shared/`, or another feature's public service.
3. Environment variables are read only by configuration modules.
4. Route pages compose features; reusable business logic does not belong in pages.
5. Server transport types remain independent from Express handlers.
