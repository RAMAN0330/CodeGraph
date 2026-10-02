# Test coverage and verification status

Audit cycle 1 — 2026-10-02.

## Commands

```bash
node --test tests/                                              # Node suites (client via Vite SSR, server via tsx)
cd server-go && go test ./...                                   # Go gateway
cd server && .venv/bin/python -m unittest discover -s tests     # FastAPI analysis service
cd client && npx tsc -b && npx eslint . && npx vite build       # client typecheck, lint, build
cd server && npx tsc --noEmit -p .                              # API typecheck
```

## Results

| Check | Baseline (before) | After |
|-------|-------------------|-------|
| `node --test tests/` | 101 tests: 85 pass, 16 fail | 113 tests: 97 pass, 16 fail (identical failure set) |
| `go test ./...` | 9 tests: 6 pass, 3 fail | 12 tests: 12 pass |
| Python `unittest` | 3 pass | 3 pass |
| Client `tsc -b` | pass | pass |
| Server `tsc --noEmit` | pass | pass |
| Client ESLint | 1,563 problems | 1,563 problems |
| Client `vite build` | not run | pass |

`pytest` is not installed in `server/.venv`; the Python tests are `unittest`-compatible.

## New tests

- `tests/server-security.test.mjs` (9): repository access memoization per principal, no cross-user reuse, fail-closed on transient and rate-limit responses, malformed input never reaching GitHub, clone-URL validation, token encryption with legacy-plaintext compatibility, and a route-guard contract for every outbound/paid/job route.
- `tests/ux-flows.test.mjs` (3): repository-input parsing (caught a real `.git/` parsing bug during this cycle), analysis-error guidance, and the workspace's no-repository and failure states.
- `server-go/internal/httpapi/server_test.go` (+3): analysis routes reach the legacy API (never FastAPI directly), per-client rate limiting behind a proxy, CORS for mutating methods.

## Pre-existing failures (unchanged, need an owner decision)

All 16 assert earlier design iterations that conflict with the current code and DESIGN.md. They were not rewritten, because choosing the intended behavior is a product decision:

| Test | What it expects | Current behavior |
|------|-----------------|------------------|
| github auth redirects to workspaces | OAuth callback → `/workspaces` | → `/welcome` (deliberate onboarding step) |
| landing uses the imported workspace-preview entry experience | `landing-workspace-preview` markup | module rail + evidence pane |
| organization pages use the Light platform layout contract | `workspace-card-panel` class | different layout classes |
| insight surfaces inherit the One Dark Pro theme tokens | dark theme tokens | light theme (DESIGN.md) |
| Platform typography uses Montserrat at weight 700 | Montserrat | JetBrains Mono everywhere (DESIGN.md) |
| Summary shows repository name without removed overview copy | older overview copy | redesigned overview |
| Summary unused-code button opens the unused panel… | react-test-renderer root | renderer unmounts (deprecated API) |
| Attention panel provides a complete, data-backed triage queue | "N open signals across N checks" | redesigned issue distribution |
| Header separates primary navigation from workspace utilities | `workspace-command-label` | label removed |
| Workspace command center uses the full canvas… | older overview grid | `ov-grid-v2` |
| Account menu interactions dismiss outside click and Escape… | exported `accountMenuDismissHandlers` | helper no longer exported |
| Explore visualization selector exposes only Tree and Bundle (×2) | `vizType:'dendro'` | different viz set |
| Settings omits graph controls ignored by the grouped renderer | older settings markup | changed |
| folder controls render above the interactive stage… | older grouped-graph markup | changed |
| node labels draw a solid dark backplate… | dark label backplate | light theme |

## Verification by method

| Area | Method | Status |
|------|--------|--------|
| API auth guards, IDOR, token encryption | Real HTTP against a scratch Postgres with two synthetic users | Tested and passed |
| FastAPI URL validation | FastAPI `TestClient`, 7 cases | Tested and passed |
| Gateway routing, validation, rate limit, CORS | Go unit tests | Tested and passed |
| Landing, welcome, workspaces, projects, `/db`, workspace states | Headless Chromium screenshots at 1440×900 and 390×844, horizontal-overflow scan, console-error capture, scripted clicks/keyboard | Tested and passed |
| Landing → sign-in → workspace → pre-filled project form | Scripted browser run | Tested and passed |
| Workspace overview dashboard (post-analysis) | Rendered with mock analysis data (temporary preview entry, removed) | Partially verified — real analysis could not run |
| Full repository analysis, graph views, git insights, security scan | — | **Not tested**: GitHub's anonymous API limit returned 403 from this machine and no token was available |
| OAuth connect flow | — | **Not tested** (needs a GitHub OAuth app) |
| `docker-compose.production.yml` | `docker compose config` | Config-validated only; stack not started |
| Database telemetry pages | — | **Not tested** this cycle |
| Function-level unit coverage | — | **Not measured**; no coverage tooling is configured |
