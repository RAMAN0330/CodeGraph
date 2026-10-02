# Audit changelog

Audit cycle 1 — 2026-10-02. Finding IDs refer to [AUDIT_FINDINGS.md](AUDIT_FINDINGS.md). Uncommitted at the time of writing; pre-existing local edits (ArchitectureDiagram, `.impeccable` configs, `tests/architecture-graph.test.mjs`, the system-architecture spec) were left as they were.

## Server and deployment

| Change | Files | Findings | Verified by |
|--------|-------|----------|-------------|
| Repository access checks before serving shared caches; clone-URL validation helper | `server/src/services/repoAccess.ts` (new), `server/src/index.ts` | SEC-1, SEC-2 | unit + E2E |
| Session + rate limit on DB connect, enrich, analyze; task-id validation; analyze proxied with validated URL/branch/token | `server/src/index.ts` | SEC-2, SEC-3, SEC-4 | unit + E2E |
| `GET /api/github/access/:owner/:repo` for project verification of repos outside the user's list | `server/src/index.ts`, `server-go/internal/httpapi/server.go` | UX-2 | Go test + browser |
| GitHub tokens encrypted at rest, legacy plaintext still readable | `server/src/services/credentialCipher.ts`, `server/src/db/users.ts` | SEC-5 | unit + E2E |
| `TRUST_PROXY_HOPS`; gateway `TRUST_PROXY_HEADER`, bounded visitor map; nginx forwards client IP | `server/src/config/env.ts`, `server-go/internal/{config,httpapi}/*`, `client/nginx.conf`, compose files | SEC-6 | Go test |
| Encoded raw-file URLs; 5 MB SQL-dump cap | `server/src/services/githubService.ts`, `server/src/index.ts` | SEC-7, SEC-8 | typecheck, E2E |
| FastAPI validates URL, branch and token before cloning | `server/app/main.py` | SEC-2 | FastAPI TestClient |
| Gateway: analysis routes via the API, owner/repo validation restored, CORS methods | `server-go/internal/httpapi/*` | SEC-2, REL-2, REL-3 | Go tests (12/12) |
| Production compose: Postgres service, `DATABASE_URL`, `DB_CREDENTIALS_SECRET`; both composes set `FASTAPI_URL` and proxy trust | `docker-compose*.yml`, `server/.env.example` | REL-1, REL-4 | `docker compose config` |

## Client

| Change | Files | Findings |
|--------|-------|----------|
| Landing: interactive hero trace replacing hero metrics; WAI-ARIA tabs with arrow/Home/End keys; real repository field carried into the first project; mobile tab strip and signal chips; close-out chip wrapping; `#top` anchor | `features/landing/pages/LandingPage.{tsx,css}` | UX-6, UX-7, UX-13 |
| Pending repository hand-off (`parseRepositoryInput`, session-scoped intent) | `features/organization/services/pendingRepository.ts` (new) | UX-13 |
| Welcome: state-aware copy, next step above the fold, avatar fallback, no kicker, compact capability list, muted token fix | `features/auth/pages/WelcomePage.{tsx,css}` | UX-8 |
| Workspaces: cards with project counts and names, visible create action, in-app delete dialog, loading and load-error states, pending-repo banner | `features/organization/pages/WorkspacesPage.tsx`, `OrganizationPages.css` | UX-10 |
| Projects: workspace name in breadcrumb, notes, honest member copy, owner chip, server-backed repo verification, success/error banner fix, pending-repo prefill, Lucide icons instead of emoji, contrast and hover fixes, mobile layout | `features/organization/pages/ProjectsPage.tsx`, `OrganizationPages.css`, `services/relativeTime.ts` (extracted) | UX-2, UX-9 |
| Workspace: no-repository state; error guidance with "Back to projects"; repository-named breadcrumbs; light-theme skeleton; stat-grid dividers; mobile breadcrumb | `features/workspace/components/{WorkspaceOverview,WorkspaceHeader}.tsx`, `features/workspace/services/analysisErrors.ts` (new), `shared/components/AnalysisLoader.{tsx,css}`, `index.css` | UX-1, UX-3, UX-11, UX-12 |
| `/db`: unsupported sources marked "Soon"; Lucide icons; sign-in and rate-limit messages for live connections | `features/database/pages/DatabaseVisualizer.tsx` | UX-5, SEC-3 |
| Base layer: controls inherit the app font; shadcn buttons lose UA border/background (ordered below utilities) | `client/src/shadcn.css` | UX-4 |
| Session cookie sent on GitHub proxy and analyze calls | `features/repository/services/github.ts`, `features/workspace/legacy/LegacyWorkspaceEngine.tsx` | SEC-1, SEC-2 |

## Tests and docs

- New: `tests/server-security.test.mjs`, `tests/ux-flows.test.mjs`, 3 Go tests.
- `README.md`: new configuration variables, Python test command, pointer to `docs/audit/`.
- `docs/audit/`: this changelog, findings, test coverage, inventory, roadmap.
