# Repository inventory

Audit cycle 1 — 2026-10-02. This is a **module- and route-level** inventory. A per-function inventory of the ~29k-line client was not completed this cycle; [`scripts/impact.mjs`](../../scripts/impact.mjs) (`npm run impact -- <file>`) gives the import graph and test reach for any client file on demand.

## Services and request path

```
browser ─► nginx (client/nginx.conf, :8080)
             ├─ static SPA (client/dist)
             └─ /api, /auth ─► Go gateway (server-go, :5000)
                                 ├─ bounded bodies, per-client rate limit, CORS, health
                                 └─ proxies to ─► Node API "legacy-api" (server/src, :5001)
                                                   ├─ sessions (Redis), auth, projects, GitHub proxy + Postgres cache
                                                   ├─ BullMQ analysis worker (in-process)
                                                   └─ /api/analyze, /api/tasks ─► FastAPI (server/app, :8000) ─► Celery worker (git clone + graphify)
```

| Component | Entry point | Storage | Tests |
|-----------|-------------|---------|-------|
| Client (React 19 + Vite) | `client/src/main.tsx`, routes in `client/src/App.tsx` | browser `localStorage` (bookmarks, analysis history), `sessionStorage` (pending repository) | `tests/*.test.mjs` via Vite SSR |
| Go gateway | `server-go/cmd/api/main.go`, routes in `internal/httpapi/server.go` | none | `server-go/internal/httpapi/server_test.go` |
| Node API | `server/src/index.ts` | Postgres (`db/pool.ts` schema), Redis (sessions, BullMQ) | `tests/server-security.test.mjs` |
| FastAPI + Celery | `server/app/main.py`, `server/app/tasks.py` | Redis (task status) | `server/tests/test_graphify.py` |

## Client routes

| Path | Component | Auth |
|------|-----------|------|
| `/` | `features/landing/pages/LandingPage.tsx` | public |
| `/login`, `/register` | `features/auth/pages/LoginPage.tsx`, `RegisterPage.tsx` | public |
| `/welcome` | `features/auth/pages/WelcomePage.tsx` | redirects to `/login` if signed out |
| `/workspaces` | `features/organization/pages/WorkspacesPage.tsx` | API-enforced |
| `/workspaces/:workspaceId/projects` | `features/organization/pages/ProjectsPage.tsx` | API-enforced |
| `/workspace?repo=owner/name` | `features/workspace/pages/WorkspaceArea.tsx` → `legacy/LegacyWorkspaceEngine.tsx` | API-enforced for server features |
| `/db` | `features/database/pages/DatabaseVisualizer.tsx` | public for SQL files; live connections require sign-in |

## Client feature modules (`client/src/features/`)

| Feature | Responsibility | Key files |
|---------|----------------|-----------|
| `analysis` | Parsing, rules, metrics, trends | `services/parser.ts` (2.2k lines), `services/analysisRules.ts` |
| `auth` | Login, register, welcome/onboarding | `pages/*` |
| `database` | Schema parsing, ER diagram, telemetry pages | `pages/DatabaseVisualizer.tsx`, `services/dbParser.ts` |
| `export` | Reports, share links | `services/exporters.ts`, `services/reportGenerator.ts` |
| `git-insights` | Commits, blame, ownership, branch diff, releases | `components/*` |
| `landing` | Marketing page | `pages/LandingPage.tsx` |
| `organization` | Workspaces, projects, members, pending-repo hand-off | `pages/*`, `services/organizationStore.ts`, `services/pendingRepository.ts` |
| `repository` | GitHub API client, tree building | `services/github.ts` |
| `security` | Manifest parsing, OSV vulnerability lookup | `services/manifestParser.ts`, `services/osv.ts` |
| `workspace` | Workspace shell, graphs, sections, modals | `legacy/LegacyWorkspaceEngine.tsx` (1.3k lines, `@ts-nocheck`), `components/*`, `services/analysisErrors.ts` |

## Node API routes (`server/src/index.ts`)

All `/api/projects/*` and `/api/workspaces/*` queries are scoped by `user_id` in `server/src/db/projectStore.ts`.

| Method | Path | Guards |
|--------|------|--------|
| GET | `/health/live` | — |
| GET | `/auth/config`, `/auth/me` | — |
| POST | `/auth/register`, `/auth/login` | 10 / 15 min per client |
| GET | `/auth/github`, `/auth/github/callback` | 30 / 15 min, signed-in |
| POST/GET | `/auth/logout` | 30 / 15 min |
| POST | `/auth/github/disconnect` | session |
| GET | `/api/github/repos`, `/api/github/token` | session |
| GET | `/api/github/access/:owner/:repo` | session |
| POST | `/api/github/repo`, `/api/github/file` | session + repository access check before cached data |
| POST | `/api/db/connect/postgres`, `/api/db/connect/mysql` | session, 20 / min |
| POST | `/api/db/parse-sql` | public, 5 MB cap |
| POST | `/api/architecture/enrich` | session, 20 / min |
| GET/POST/DELETE | `/api/projects`, `/api/workspaces`, `/api/projects/:id/*` (schema, db-connection, db telemetry, alerts, members) | session, owner-scoped |
| GET/POST | `/api/analysis/:owner/:repo`, `/refresh` | session |
| POST | `/api/analyze` | session, 20 / min, github.com URL + access check, proxies to FastAPI |
| GET | `/api/tasks/:taskId` | session, UUID, proxies to FastAPI |

## Database tables (`server/src/db/pool.ts`)

`organizations`, `users` (GitHub token encrypted at rest), `workspaces`, `projects` (DB credentials encrypted at rest), `project_members` (email list only — no invitations or access grants), `repo_tree_cache`, `repo_file_cache`, `repo_file_blob_cache`, `analysis_results`, `db_metric_snapshots`, `db_alert_rules`. Schema is created idempotently at startup; there is no migration framework.
