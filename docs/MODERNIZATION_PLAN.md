# Modernization plan

This is the roadmap for turning CodeGraph into an enterprise codebase and database workspace (the 9-section brief from 2026-10-16). It builds on the existing audit in [docs/audit/](audit/). Phases are ordered the way the brief asks: fix what exists first, then GitHub sync, caching and persistence, then the database workspace, then organizations and access control. Each phase ships as its own PR with tests, and a phase starts only after the previous PR is merged.

## Where the product stands (audit, 2026-10-16)

| Area | Works today | Gaps |
|---|---|---|
| GitHub | Tree and file caches in Postgres (ETag and blob-sha keyed); read-only `/api/github/proxy` with ETag cache and request coalescing (PR #1); webhook-driven PR reviews through a server GitHub App | No sync status or "repo changed since analysis" signal in the UI; branch, commit and blame views refetch on every mount; rate-limit and auth failures surface as generic errors |
| Persistence | Projects, workspaces, saved views, annotations and coverage are stored on the server; bookmarks, and (PR #1) sidebar width and last section per repo, are stored in the browser | Open file, branch, filters and the database page are lost on reload; no server-side "last workspace" to restore on another device |
| Performance | Workers for diffs, a virtualized repo tree, and shared DB telemetry polls (PR #1) | No measured baseline (bundle size, time to interactive, analysis time); the 1,400-line `LegacyWorkspaceEngine.tsx` holds about 50 `useState` hooks, so any change re-renders the whole workspace |
| Database | One encrypted connection per project (Postgres or MySQL), forced read-only; schema introspection, ER map, and overview, performance, queries, storage, replication, activity, security and alerts pages from real engine stats | No SQL editor or query execution, no data browser, no query history or saved queries, no execution plans; one connection per project; SQLite, MongoDB, CSV and Snowflake are shown as "Soon" |
| Organizations | Organizations with `admin` and `member` roles, invites, workspace and project ownership checks on the backend | Two roles only, no teams, no per-resource permissions, no audit log; "project members" only stores emails; no environment labels (dev, staging, prod) on connections |
| Security | Encrypted secrets at rest, CSRF-resistant JSON API, per-route rate limits; in PR #1 the GitHub token is server-only, queued tokens are encrypted, and sessions have an idle timeout | No audit trail of who did what; schema migrations run as startup `CREATE TABLE IF NOT EXISTS` |
| Tests | 200 Node tests in `tests/`, 183 passing; server unit tests (`npm test` in `server/`) | 16 stale UI-contract tests that need a decision (see [TEST_COVERAGE.md](audit/TEST_COVERAGE.md)); no end-to-end test of sign-in, analysis, and the database dashboard |

## Phase 0: hardening (PR #1, in review)

GitHub token kept on the server, ETag-cached GitHub proxy, encrypted job tokens, session idle timeout, shared DB telemetry polls, saved layout per repo, the in-browser GitHub App key path removed, and the UI style skill.

## Phase 1: fix what exists

- Decide each of the 16 stale tests: either update the test to current behaviour or restore the behaviour it guards. **Done when** `node --test tests/*.test.mjs` is green and runs in CI.
- Remove or finish controls that do nothing: the "Soon" database sources, and project members that only store emails (rename to "Team list" or make them real; Phase 4 makes them real).
- Replace startup DDL with versioned migrations, so schema changes in later phases are safe to deploy.
- Record a performance baseline (route bundle sizes, time to interactive on `/workspace`, analysis time for a fixed reference repo), so later phases have numbers to beat.

## Phase 2: Git sync, caching and session continuity

- Sync status: compare the analysed commit with the branch HEAD (one conditional request) and show "up to date" or "N commits behind, re-analyse".
- Cache branches, commits, contributors and blame per repo and branch in the client, keyed by the head sha, so switching sections never refetches unchanged data.
- Clear messages for 401 (reconnect GitHub), 403/429 rate limits (with the reset time from the forwarded headers), and 404 (no access).
- Server-side workspace state per user (repo, branch, open file, section, filters, database page), saved with debounced, batched writes and restored on any device without re-running the analysis. No secrets in browser storage.
- Split `LegacyWorkspaceEngine.tsx` by section as part of this work, measuring re-renders before and after.

## Phase 3: database workspace

- SQL editor with syntax highlighting, schema-aware autocomplete, formatting, a result-row limit, and a statement timeout. It runs on the existing read-only connection; write access is opt-in per connection and gated by role in Phase 4.
- Query history and saved queries per project; `EXPLAIN` plans for Postgres and MySQL; duration and row count on every result.
- Data browser: paginated table view with sort, filter, column picker and search, which you can open from the schema explorer and from any query result.
- Multiple named connections per project with an environment label (dev, staging, prod) and a live health indicator.
- Links between the two halves of the product: from a table to the code that uses it (the existing table-usage analysis), and from code back to the table.

## Phase 4: organizations, access control and audit

- Roles: owner, admin, editor, viewer, plus teams. Permissions per resource (repository project, database connection, saved query), enforced in the API, with the UI only hiding what the API would refuse.
- Real project membership: invite an existing org member to a project and grant a role there.
- Audit log of sign-ins, permission changes, connection edits and executed queries, viewable and exportable by admins.
- Production safeguards: write queries on connections labelled prod require an editor role and a typed confirmation.
- Leave room for SSO (OIDC/SAML) in the auth layer, without building it yet.

## Definition of done per phase

Each PR lands with: unit tests for new server logic, an updated or new test in `tests/` for each changed workflow, a before/after number for any performance claim, a migration where the schema changes, and the README or API table updated.
