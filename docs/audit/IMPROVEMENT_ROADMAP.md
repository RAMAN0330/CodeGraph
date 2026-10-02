# Improvement roadmap

Prioritized follow-ups after audit cycle 1 (2026-10-02). Items are ordered by risk, then user impact.

## Next (P1–P2)

1. **Run the real analysis path end to end** with a GitHub token (or OAuth app) and re-check the workspace graph, git insights, security and patterns sections in a browser. This cycle could not, because GitHub rate-limited anonymous requests from the test machine. Done when: a public and a private repository analyse successfully and every workspace section renders without console errors.
2. **Decide the 16 stale tests** listed in [TEST_COVERAGE.md](TEST_COVERAGE.md): update each to the current DESIGN.md behavior or restore the behavior it guards. Done when: `node --test tests/` is green.
3. **Bring up `docker-compose.production.yml`** once with real secrets and confirm `/health/ready`, login, and an analysis job across nginx → gateway → API → FastAPI.
4. **Stop exposing the GitHub token to the browser** (SEC-R1). Route the client's remaining direct GitHub calls (branches, commits, blame) through the API, then remove `GET /api/github/token`.
5. **Keep tokens out of Redis job data** (SEC-R2): enqueue a user id and resolve the token in the worker.
6. **Session hardening** (SEC-R3): idle timeout, rotate on privilege change, make logout POST-only.

## Then (P2–P3)

7. **Project members**: either implement real invitations and shared access, or rename the feature "Team list" everywhere. Today it only stores emails (copy now says so).
8. **Type the legacy workspace engine.** `LegacyWorkspaceEngine.tsx` is `@ts-nocheck` with ~60 `useState` hooks and accounts for most ESLint errors. Split by section and move state into hooks; measure re-render counts before/after with the React profiler.
9. **Performance baseline**: record bundle sizes per route chunk, time-to-interactive on `/` and `/workspace`, and analysis duration for a fixed reference repository, so future optimizations have numbers to beat.
10. **Migrations**: replace startup `CREATE TABLE IF NOT EXISTS`/`ALTER` with versioned migrations.
11. **Design-system alignment**: DESIGN.md documents a 4-step type ramp and 4 radii, while the shipped CSS uses many intermediate values. Either widen the documented scale or converge the CSS, then refresh `.impeccable/design.json` (`/impeccable document`) and the stale landing surface brief.
12. **Implement or remove upcoming DB sources** (SQLite, MongoDB, CSV, Snowflake) now shown as "Soon".
