# Analysis engine — audit, modernization options, and impact-tooling plan

Status: **not implemented** — this is a findings-and-plan document to work from, not a changelog.

Scope note, because the two halves of this document analyze two different things:

- **Parts 1–2** audit the *product feature* that analyzes other people's repositories — `client/src/features/analysis/services/parser.ts` and its server fork `server/src/analysis/parser.ts`. This is what generates "God Object", "23 duplicates", "10 security issues" for a repo a user connects.
- **Part 3** plans a *new internal tool* for this repository's own source — "if I change `client/src/features/workspace/legacy/LegacyWorkspaceEngine.tsx`, what breaks?" These use different tech and are not related except that both are "analysis."

---

## Part 1 — Audit of the current pattern-detection engine

File: `client/src/features/analysis/services/parser.ts` (2294 lines). Every detector in it is a regex or substring check over raw file content — there is no AST involved anywhere in this file, despite the app already parsing every file with tree-sitter elsewhere in the pipeline (see finding 1.9).

Ordered by how much it actually costs the product, most severe first.

### 1.1 Zero test coverage for every function this audit covers

`detectPatterns`, `detectDuplicates`, `detectSecurity`, `generateSuggestions`, `calcComplexity`, and the dead-function filter have **no tests**. A repo-wide grep for `detectPatterns|detectDuplicates|detectSecurity|generateSuggestions|calcComplexity|deadFn|findCalls` across every test file returns zero matches. 10 test files exist; they cover markdown link extraction, a DB parser, and UI state — not one line of the actual analysis logic that is this product's core value proposition. Every issue below could regress silently on the next edit.

### 1.2 The server copy is a manually-synced fork, guaranteed to drift

`server/src/analysis/parser.ts` (2237 lines) is a hand-maintained port of the client file — its own comment says so ("Kept in sync manually"). A diff shows the detection logic is currently byte-identical to the client version. That means every finding below exists in *two* places today, and the next edit to either file that isn't mirrored by hand will silently fork behavior between the browser-side and background-job analysis paths, with no test to catch it (see 1.1).

### 1.3 Pattern detection is single-signal string matching — concrete false positives per pattern

Each "design pattern" is one `.filter()` over a substring/regex check, at `parser.ts:373` onward:

| Pattern | Rule | Concrete failure |
|---|---|---|
| Singleton (375) | `includes('getInstance')` or `/let\s+instance\s*=/` | `let instance = createSandbox();` in a test helper — flagged, not a Singleton |
| Factory (377) | `/create[A-Z]\w*\(/` or `includes('return new')` | `function createUser(name){ return new User(name); }`, called once — flagged as Factory for the whole file |
| Observer/Event (379) | `includes('.on(')` etc. | `program.on('option', ...)` (a CLI parser) — flagged as Observer |
| Custom Hooks (381) | `/export\s+(?:const|function)\s+use[A-Z]/` | `export default function useAuth(){}` — **missed** (default exports don't match) |
| HOC (383) | `/with[A-Z]\w*\s*=\s*\(/` | `const withRetryLogic = (n) => n+1;` — a generic helper, flagged as a React HOC |
| God Object (442) | `functions.length > 15` | a 20-function barrel `index.ts` re-export file — flagged; a 900-line class with 14 giant 200-line methods — **not** flagged |
| Long File (444) | `lines > 500` | a 600-line generated i18n strings file — flagged; a 480-line file with severe branching — not |

No structural verification exists anywhere in this function. Every row above is a real match against real, unremarkable code.

### 1.4 Duplicate detection compares 2 of N samples, and truncates before comparing

`detectDuplicates` (451) requires a function name to appear in ≥3 files (516) but then only computes similarity between the *first two* samples (522) — a third, wildly different implementation never affects the verdict. Worse, `codeSimilarity`'s LCS comparison (599) truncates any string over 500 characters to its first 500 (608–611) before comparing, so two 700-line duplicated functions are judged only on their first ~500 normalized characters. Functions under 80 characters are skipped entirely (541), so a 6-line auth-check helper copy-pasted five times is invisible — the exact case where duplication is most dangerous.

### 1.5 Dead-function detection misses dynamic dispatch and JSX-only components

The real filter lives in `LegacyWorkspaceEngine.tsx:757-781` (reproduced verbatim in the server fork). `findJSCalls` (parser.ts:1749) only matches `CallExpression` nodes where `callee.type==='Identifier'` — a function invoked as `handlers[eventName]()` or registered as `emitter.on('save', 'handleSave')` is never counted as called, and gets reported dead. A presentational component used only as `<UserCard/>` in JSX is not explicitly exempted either; the explicit reference-counting logic (1787–1789) only special-cases `ArrayExpression` elements and `Property` values, not JSX elements.

### 1.6 The security scanner has a self-neutering hack and is regex-shallow

`getSecurityScanContent` (92–101): if a scanned file's content literally contains the string `detectSecurity:function(files){` — i.e., a repo that vendors a copy of this very file, or a fork of Structrace itself — the scanner regex-replaces its own detector body with `return[]` before scanning that content. A self-recognition special case baked into a security scanner. Separately, the secrets regex (760) requires a literal `key = "value"` pair and is bypassed by a template literal or string concatenation; the SQLi check (764) requires the exact call shape `query(...+` and misses `db.raw(sql)` built two lines earlier.

### 1.7 Layer-violation detection is asymmetric by construction

`detectLayerViolations` (657) only flags an import where the source layer is *numerically higher* than the target by more than 1 (669) — a `services` file importing from `data` (a common backward-dependency smell) is never flagged because that's an *upward* move in the level numbering, not downward. It also only inspects direct edges, not transitive chains through barrel files.

### 1.8 Performance: repeated O(n²) scans and duplicate AST parsing per file

`detectLayerViolations` calls `files.find(...)` twice per connection (660–663) with no index — O(connections × files). Every file's content is parsed by the JS parser **twice**: once during function extraction (932–971) and again inside `findCalls` (1749) during dependency detection — a full re-parse of identical source. On a 1000+ file repo this compounds badly; there is no `Map`-based lookup anywhere these `.find()` calls appear.

### 1.9 The AST this file needs already exists elsewhere in the pipeline — it just isn't used here

This is the root cause tying together 1.3–1.6. The server-side parser already loads tree-sitter (`web-tree-sitter`, confirmed in `server/src/analysis/parser.ts`'s Node WASM setup) and the client loads a CDN `TreeSitter` global. Real syntax trees are already being built in this codebase. `detectPatterns`, `detectDuplicates`, and `detectSecurity` don't use them — they re-derive everything from raw string content with regex, one file after the AST for that same file has already been built for function extraction. The fix is not "add a new parsing dependency"; it's "point the existing detectors at the AST that's already sitting in memory."

### 1.10 Missing edge-case handling

- **Non-UTF8 content**: `decodeBase64Utf8` (`github.ts:29-42`) uses `TextDecoder('utf-8').decode()` without `{fatal:true}` — invalid bytes are silently replaced with U+FFFD rather than throwing, so the Latin-1 fallback path never fires. Binary content gets mangled into replacement-character soup and fed straight into every regex scanner.
- **Binary misidentification**: `isBinary`/`isText` (140–148) is extension-list based only, no magic-byte sniffing — an extensionless binary or unlisted binary extension is treated as source and run through full extraction.
- **Complexity scoring** (682): both JS-style and Python-style branch patterns are summed against every file regardless of language (a comment at 694 acknowledges the resulting double-count is "acceptable"), and there's no nesting-depth weight — 31 independent flat `if`s outscores 10 `if`s nested 10 deep, despite the latter being harder to reason about.

---

## Part 2 — Modern library alternatives

Two separate needs surfaced. Recommendations are split accordingly.

### 2A. For the product's own repo-analysis engine (Parts 1.3–1.10)

| Candidate | What it buys over current code | Maintenance (Sep 2026) | Integration cost | License |
|---|---|---|---|---|
| **Keep tree-sitter, wire detectors to the AST already built** (1.9) | Fixes the root cause directly: structural checks instead of regex, for every pattern in 1.3, 1.5, 1.6 at once. No new dependency. | N/A — already vendored | Highest of the options, but it's a refactor of existing code, not new integration surface | N/A |
| **jscpd** (duplicate detection) | Real token-based clone detection (shingling), not a 2-of-N LCS comparison; handles 224 languages; `--cross-formats` for JS↔TS | Active — v5 (Rust engine) shipped hours before this research, v4 (TS engine) still maintained on a branch | Low — CLI or programmatic API, drop-in replacement for `detectDuplicates` | MIT |
| **Semgrep OSS (CLI)** | Structural, AST-aware rule matching for the security scanner — immune to the template-literal/concatenation bypasses in 1.6, since rules match syntax, not literal text | Active — 2,800+ community rules, no account needed | Medium — separate binary to shell out to (Python/Go), first real "engine" dependency added to this analysis path | LGPL-2.1, CLI is free and local |
| **Knip** | If the product's own dead-code UX (not the target-repo scanner) is ever revisited, Knip is the current default for unused-export detection in TS/JS, with 150 framework plugins | Active — v6.34, days old | N/A here — Knip analyzes a TS *project*, not arbitrary repos of unknown language, so it fits Part 3 far better than Part 1 (see below) | ISC |

**Recommendation for 2A:** fix 1.9 first — it's a zero-new-dependency structural fix that resolves most of the false positive/negative rows in 1.3, 1.5, and 1.6 simultaneously, and it removes the "two engines to keep in sync" risk noted in 1.2 by making the detectors thin consumers of one parse. Add jscpd next for duplicate detection specifically — it's the smallest integration and directly replaces the weakest, most-truncated part of the current logic (1.4). Treat Semgrep as a later, bigger step: real value, but it's the first dependency in this path that means shelling out to a separate engine rather than working with data already in memory.

### 2B. Already integrated, but unused — worth wiring up before adding anything new

The Python worker (`server/app/tasks.py:74`) already shells out to `graphify extract` (the `graphifyy` PyPI package — local, deterministic, tree-sitter-based, no LLM, already a `requirements.txt` dependency) and stores its output. The client has a fully-built, unit-tested adapter for that exact output shape: `client/src/features/analysis/services/graphifyAdapter.ts`, covered by `tests/graphify-adapter.test.mjs`. **It is never imported anywhere in the client application.** The pipeline computes a real AST-based community-detected graph and then discards it before it reaches a screen. This is the same shape of gap as `ownershipRisk.ts` found earlier this session — a finished, tested integration nobody wired up. Before evaluating any new library, this one is already paid for and sitting idle.

### 2C. For Part 3 — this repository's own TS/JS source

| Candidate | Fit | Maintenance | License |
|---|---|---|---|
| **dependency-cruiser** | Native `tsconfig` path-alias resolution (this repo's `client/tsconfig.app.json` defines `@/*`), JSON output shaped as `{modules:[{source, dependencies:[{resolved}]}]}` — trivial to invert into a reverse-dependency index, and can later enforce the layer rules 1.7 struggles with, but for *this* repo's own architecture, not the ones it scans | Active — v18.2.0, released 24 days before this research, ~7,000 stars | MIT |
| **madge** | Simpler API (`.obj()` graph), no path-alias awareness out of the box | Active, ~10,000 stars, but "default visualizations get unwieldy" on larger graphs per its own ecosystem coverage | Anti-hint only — not chosen | MIT |
| **ts-morph / Knip** | Real TS-compiler-API analysis; Knip specifically would tell you unused exports/files across this codebase in one pass | Both active (Knip v6.34, days old) | Complementary to the impact tool, not a replacement — see Part 3 | MIT / ISC |

**Recommendation for 2C:** dependency-cruiser, specifically because it already understands this repo's `@/*` path alias without extra configuration, and its JSON output requires no post-processing to invert.

---

## Part 3 — Plan for a file-level change-impact tool (this repo's own source)

### Why this can't reuse the product's own analysis engine

The product's `connections` array (built in `server/src/analysis/runAnalysis.ts`) is a **call-graph**, not an import graph — it's built by tokenizing file content and matching function-name usages back to defining files (`Parser.findCalls`), not by parsing `import`/`require` statements. A repo-wide grep for any import-statement extraction (`ImportDeclaration`, `require(`) in this codebase returns zero hits. So there is nothing to reuse here; a real import graph needs a real import-graph library — hence 2C.

### What already exists and *is* reusable once the graph is built

- `client/src/features/workspace/services/architectureGraph.ts` — `buildArchitectureGraph(files, connections)` is a pure function with no I/O; it takes generic `{path}`/`{source,target}` shapes and classifies files into layers by path regex. It doesn't care where the edges came from, so dependency-cruiser's output can be fed into it directly if a visual "architecture of this repo" view is ever wanted.
- `client/src/features/workspace/services/codeFlowLayout.ts` — `buildCodeFlowLayout(nodes, links)`, with DFS-based cycle detection (`findBackEdges`) and left-to-right layering, also pure and reusable if the impact tool ever grows a visual mode.

Neither is required for the CLI itself — they're available if a graphical version is wanted later.

### The test-coverage wrinkle

This repo's 10 tests don't statically `import` the modules they test — they load them at runtime through a headless Vite server: `vite.ssrLoadModule('/src/features/workspace/services/architectureGraph.ts')`, with the path as a **string literal**, not an import statement. A naive "grep test files for an import of X" pass for the "which tests cover this file" feature will find nothing. The tool needs a second, explicit regex pass for `ssrLoadModule\(['"]([^'"]+)['"]\)` alongside normal import scanning.

### Plan

1. Add `dependency-cruiser` as a devDependency (root or `client/`; nothing in this monorepo currently has it — confirmed absent from root, `client/`, and `server/` `package.json`).
2. New file: `scripts/impact.mjs` — there is no `scripts/` directory anywhere in this repo yet, and no existing CLI/shebang-script convention to match, so this establishes the first one. Root-level, since it needs to reason about `client/`, `server/`, and (per Go, see below) potentially `server-go/` from one place, matching how root `package.json` already orchestrates all three.
3. Build the graph via dependency-cruiser's programmatic API against `client/src`, get its JSON module list, and invert `{source → [dependencies]}` into `{target → [dependents]}` — this is the whole graph-reversal step, and it's small.
4. Walk the inverted graph breadth-first from the queried file to report direct importers and transitive dependents, with depth shown so a large blast radius is visible at a glance, not just a flat list.
5. Cross-reference against `tests/*.test.mjs` using both a normal static-import scan and the `ssrLoadModule(...)` string-literal regex described above.
6. Output modes: human-readable table (default) and `--json`, so it can be wired into a pre-commit hook or CI check later that warns when a diff touches a file with an unusually large dependent count — per the original ask, that wiring is a follow-on, not part of this build.
7. Command shape: `node scripts/impact.mjs <path-relative-to-client-src>` — e.g. `node scripts/impact.mjs features/workspace/legacy/LegacyWorkspaceEngine.tsx`.

### Explicitly out of scope for the first version

- **`server/` (Node/TS)** and **`server-go/`** are not covered initially. `server-go/go.mod` has no `go.sum` (stdlib-only, no external deps yet) and no existing dependency tooling; a Go equivalent (`golang.org/x/tools/refactor/importgraph`, or `godepgraph --reverse`) is a clean, separate follow-on once the Go side has enough internal package boundaries for "impact" to mean something. `server/`'s Python half (FastAPI/Celery, under `server/app/`) would need a different tool entirely (`pydeps`/`import-linter`). Scoping to `client/src` first is where this repo's actual churn and cross-file coupling is highest (the 2000+ line `LegacyWorkspaceEngine.tsx` alone touches most of the workspace feature set).

---

## What to do now vs. later

**Now, low effort / high payoff:**
- Wire up `graphifyAdapter.ts` (2B) — it's finished and tested, just disconnected.
- Build the Part 3 impact CLI against `client/src` — self-contained, no product-behavior risk, immediately useful for reviewing changes to files like `LegacyWorkspaceEngine.tsx`.
- Add tests for `detectPatterns`/`detectDuplicates`/`detectSecurity`/`calcComplexity` against the false-positive/negative cases in Part 1 *before* changing any of their logic — right now a fix could regress silently in either direction.

**Next, medium effort:**
- Point the pattern/duplicate/security detectors at the tree-sitter AST already being built (1.9) instead of raw-content regex. This is the single highest-leverage fix in Part 1 and touches the most rows in the false-positive table.
- Add jscpd for duplicate detection specifically (2A).
- De-duplicate the client/server parser fork (1.2) into one shared module once the above lands, so there's only one place left to fix next time.

**Later, larger effort:**
- Semgrep integration for security scanning (2A) — real payoff, but it's the first "shell out to a separate engine" dependency in this path.
- Extend the impact tool to `server/` and `server-go/` once those codebases have more internal structure to make "impact" meaningful.
