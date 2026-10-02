# Audit findings

Audit cycle 1 — 2026-10-02. Scope: Node API (`server/src`), Go gateway (`server-go`), FastAPI analysis service (`server/app`), deployment config, and the client's landing, welcome, workspaces, projects, workspace and `/db` surfaces.

Severity: **P0** critical · **P1** high · **P2** medium · **P3** low. Status: **Fixed** (implemented and verified), **Documented** (not changed; needs a decision or more work).

## Security and access control

| ID | Sev | Finding | Location | Status |
|----|-----|---------|----------|--------|
| SEC-1 | P1 | **Private source exposed through the shared repo cache.** `POST /api/github/repo` and `/api/github/file` needed no session, and their Postgres cache is keyed only by owner/repo/branch/path. After any user with access analysed a private repo, anyone (even anonymous) could read its tree and file contents from cache. | `server/src/index.ts` (github proxy routes), `server/src/db/repoCache.ts` | Fixed |
| SEC-2 | P1 | **Unauthenticated arbitrary `git clone`.** In production the Go gateway forwarded `POST /api/analyze` straight to FastAPI, which cloned any URL it was given (`file://`, internal hosts, embedded credentials) with no session check. | `server-go/internal/httpapi/server.go`, `server/app/main.py`, `server/app/tasks.py` | Fixed |
| SEC-3 | P1 | **Unauthenticated server-side DB connections (SSRF).** `POST /api/db/connect/{postgres,mysql}` let anyone make the API open TCP connections to arbitrary host:port and returned the raw driver error, enabling internal port scanning and credential guessing from the server's network position. | `server/src/index.ts` | Fixed |
| SEC-4 | P2 | **Unauthenticated paid-API endpoint.** `POST /api/architecture/enrich` called OpenAI with the server key for anyone. | `server/src/index.ts` | Fixed |
| SEC-5 | P2 | **GitHub OAuth tokens stored in plaintext** while database credentials were already AES-GCM encrypted. | `server/src/db/users.ts` | Fixed |
| SEC-6 | P2 | **All users shared one rate-limit bucket in production.** Behind nginx → gateway, `trust proxy 1` resolved every client to the nginx container IP, so 10 failed logins by anyone locked out login for everyone for 15 min; the gateway's per-IP limiter had the same flaw and its visitor map grew without bound. | `server/src/index.ts`, `server-go/internal/httpapi/middleware.go`, `client/nginx.conf` | Fixed |
| SEC-7 | P3 | Raw-file fallback built `raw.githubusercontent.com` URLs from unencoded owner/repo/path, allowing `../` segments to redirect the request (with the caller's own token) to another repository and cache it under an unrelated key. | `server/src/services/githubService.ts` | Fixed |
| SEC-8 | P3 | `/api/db/parse-sql` accepted up to 10 MB into a backtracking regex with no size guard. | `server/src/index.ts` | Fixed (5 MB cap, 413) |
| SEC-R1 | — | **Residual:** `GET /api/github/token` hands the GitHub token to the browser by design (client calls GitHub directly). Any XSS would expose it. | `server/src/index.ts` | Documented |
| SEC-R2 | — | **Residual:** BullMQ analysis jobs store the requester's GitHub token in Redis job data (plaintext, ~1 h retention after completion). | `server/src/queue/analysisQueue.ts` | Documented |
| SEC-R3 | — | **Residual:** session cookie lifetime is 30 days with no idle timeout; `GET /auth/logout` is CSRF-able (logout only). | `server/src/index.ts` | Documented |

Verified with: unit tests (`tests/server-security.test.mjs`, 9 tests), Go tests (12), and an end-to-end run of the API against a throwaway Postgres with two synthetic accounts — all five guarded endpoints returned 401 anonymously; user B could not list, introspect, query telemetry for, create in, or delete user A's workspaces/projects; tokens were stored as `iv:tag:ciphertext` and legacy plaintext rows still read back. FastAPI validation was exercised with 7 accepted/rejected URL cases.

Fix summary:
- New `server/src/services/repoAccess.ts`: `canReadRepository()` asks GitHub whether the requester's token (or anonymous access) can read the repo before any shared-cache hit is served; definitive answers memoized 5 min per token hash, transient failures and rate-limit 403s fail closed without memoizing. Also `parseGithubCloneUrl()`.
- `requireAuth` + a 20/min limiter on db-connect, enrich and analyze; `/api/tasks/:taskId` requires auth and a UUID.
- Gateway routes `/api/analyze` and `/api/tasks/*` through the Node API instead of directly to FastAPI; FastAPI also validates URL/branch/token itself (defense in depth).
- `encryptSecret`/`revealSecret` in `credentialCipher.ts`; undecryptable values degrade to "not connected".
- `TRUST_PROXY_HOPS` (Node) and `TRUST_PROXY_HEADER` (Go) plus nginx `X-Real-IP`/`X-Forwarded-For` headers.

## Reliability and deployment

| ID | Sev | Finding | Status |
|----|-----|---------|--------|
| REL-1 | P1 | `docker-compose.production.yml` ran the API with `NODE_ENV=production` but supplied no `DATABASE_URL`, no `DB_CREDENTIALS_SECRET` and no Postgres service, so `validateEnvironment()` aborted startup — `npm run docker:up` could not bring the API up. Added a Postgres service and required variables. Validated with `docker compose config`; **not** started end-to-end. | Fixed (config-validated) |
| REL-2 | P2 | Go gateway tests failed 3/9: gateway-level owner/repo validation had been dropped when the GitHub routes moved to the Node proxy. Restored as a body-validating wrapper. | Fixed |
| REL-3 | P3 | Gateway CORS preflight allowed only GET/POST/OPTIONS, so cross-origin DELETE/PUT (e.g. `npm run dev:go`) failed. | Fixed |
| REL-4 | P2 | Legacy-API containers got `FASTAPI_URL=http://localhost:8000` from `server/.env`, which is wrong inside a container. Compose now sets `http://analysis:8000`. | Fixed |

## Product, UX and UI components

| ID | Sev | Finding | Status |
|----|-----|---------|--------|
| UX-1 | P1 | Opening `/workspace` without `?repo=` showed a fake "Analyzing your repository… Ns elapsed" screen forever. Now a "No repository selected" state with a direct repo field and a link to projects. | Fixed |
| UX-2 | P1 | With GitHub connected, **projects could not be created for public repositories the user doesn't own** (verification only accepted the user's own repo list). Added `GET /api/github/access/:owner/:repo` and use it as the fallback check. | Fixed |
| UX-3 | P2 | Analysis failures showed raw `GitHub API error: 403` with only "Retry". Now explains the cause (rate limit / private repo / not found / expired token / network) with a recovery step and "Back to projects". | Fixed |
| UX-4 | P2 | Form controls and many buttons rendered in **Arial** (no Tailwind preflight is loaded, so controls used the UA font), and shadcn `Button`s without a page class kept the UA grey border/background. Fixed at the root with a `@layer base` reset ordered below utilities. | Fixed |
| UX-5 | P2 | `/db` offered MongoDB and Snowflake but wired both to the PostgreSQL driver; SQLite/CSV only accepted `.sql`. Now marked "Soon" and disabled, matching the project dialog. | Fixed |
| UX-6 | P2 | Landing hero claimed "This is that graph, not a mockup of it" with no graph on screen; hero stats ("6 files traced") contradicted the "1,842 files" proof strip. Replaced with an interactive trace whose signals open their modules. | Fixed |
| UX-7 | P2 | Landing capability rail used `role="tab"` without arrow-key navigation, `aria-controls` or a tabpanel. Implemented the WAI-ARIA tabs pattern with roving focus. | Fixed |
| UX-8 | P2 | Welcome page: primary "Continue" CTA was below the fold; copy said "Connect GitHub…" even when connected; empty avatar `src` (console error, blank ring); kicker label violated DESIGN.md; `--wp-muted` mapped to primary text colour. | Fixed |
| UX-9 | P2 | Projects page: project notes were never shown; "Invite" implied email/access that doesn't exist (members are a stored list only); success message rendered inside the red error banner; delete-button hover put white text on pale pink (contrast failure); leftover dark-theme hover greys; mobile list had a fixed `100dvh` height (large gap) and 65 px horizontal overflow. | Fixed |
| UX-10 | P3 | Workspaces page: rows showed a generic "Project workspace" subtitle and no counts; create action was icon-only until hover; delete used `window.confirm`; 50 px overflow on mobile. Now cards with codebase/database counts, recent project names, an always-visible action and an in-app confirm dialog. | Fixed |
| UX-11 | P3 | Analysis loader skeleton used dark-theme tiles and One Dark blue accents in the light theme. | Fixed |
| UX-12 | P3 | Workspace overview stats grid: legacy 2-column divider rules leaked into the 3-column grid; header breadcrumb read "Workspace / Project" and overflowed at 390 px. | Fixed |
| UX-13 | P3 | Landing → product hand-off: the "One field to start" input was a static span. It is now a real field; the repository is carried through sign-in and pre-fills the first project. | Fixed |
| UX-D1 | — | `client/.impeccable/surfaces/src-features-landing-pages-landingpage-tsx.md` still describes the earlier dark One Dark Pro build; DESIGN.md (light console) is authoritative. | Documented |
| UX-D2 | — | ~1,500 ESLint errors (mostly `any`/`var` in `LegacyWorkspaceEngine.tsx` and analysis services) and many off-ramp font sizes/radii flagged by the Impeccable detector predate this audit. Count unchanged by this work (1,563). | Documented |

## Performance

No performance work was undertaken and **no measurements were taken** this cycle. Observations for a future cycle (unmeasured): the client production bundle reports a direct-`eval` warning from a dependency; `LegacyWorkspaceEngine.tsx` holds ~60 `useState` hooks in one component, which likely causes broad re-renders.
