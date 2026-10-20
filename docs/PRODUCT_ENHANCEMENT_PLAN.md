# Structrace Product Enhancement Plan

**Prepared:** 2026-10-20  
**Status:** Proposal based on the current product guide and repository assessment  
**Related docs:** [Product and workflow guide](../PRODUCT_GUIDE.md) · [Product assessment and development blueprint](PRODUCT_BLUEPRINT.md)

> This plan proposes improvements; it does not describe them as shipped. The existing application is a React 19/TypeScript/Vite client, Node/Express application API, Go gateway, and Python/FastAPI/Celery analysis system backed by PostgreSQL and Redis-compatible services. Recommendations below preserve working functionality and migrate incrementally. Technology licenses are identified as candidates and must be checked against exact versions, transitive dependencies, images, model weights, and distribution terms before release.

## 1. Product direction

Structrace should become an evidence-backed engineering intelligence workspace: teams connect a repository and, optionally, a database; analyze structure and change; investigate findings in source context; collaborate around decisions; and operate the service with clear security and recovery controls.

The differentiator should be the link from each claim to evidence: files, symbols, dependencies, commits, schema objects, or source locations. AI can help explain and navigate that evidence, but deterministic analysis and source references remain useful without an AI provider.

### Outcomes to measure

- Time for a new engineer to find a service's entry points and important dependencies.
- Time for a reviewer to identify likely impact areas and verify the evidence.
- Analysis completion rate, duration by repository size, queue delay, and actionable failure rate.
- Percentage of findings that link to usable evidence and can be reproduced on a later analysis.
- Successful onboarding, authorization, backup restore, and supported-version upgrade.
- User-reported usefulness of explanations and recommendations, tracked separately from raw model output.

Set numeric targets only after collecting a baseline on representative repositories and deployment sizes.

## 2. Feature inventory and improvement opportunities

Status reflects the supplied product guide and blueprint, not a fresh end-to-end acceptance run. “Implemented” means code and prior audit evidence exist; it does not certify production readiness.

| Feature area | Current state | Improvement opportunity | Priority |
| --- | --- | --- | --- |
| Repository intake and analysis | GitHub, local folder, and ZIP sources; exclude patterns; async analysis | Make source limits, supported languages, progress, cancellation, retries, and terminal errors explicit. Add reproducible fixtures and analysis version metadata. | P0 |
| Overview and health signals | Health/risk summary and repository findings | Link each score to contributing findings, definitions, and evidence. Show changes since the prior run and avoid unsupported precision. | P1 |
| Code graph and file exploration | Tree, bundle, and code graph modes with source preview and bookmarks | Improve large-graph performance with server-side filtering, progressive loading, stable layouts, and keyboard-accessible list fallback. Keep graph selection deep-linked/shareable. | P1 |
| Onboarding guide | Suggested entry points and core files | Explain why each file is suggested, expose dependency paths, and let teams annotate or dismiss suggestions. Measure time to first useful exploration. | P1 |
| Ask Codebase / AI explanations | Optional AI service | Ground answers in retrieved repository evidence with file/line citations; show provider/model, retrieval scope, and uncertainty. Add prompt-injection defenses, data controls, timeouts, quotas, and a deterministic no-AI path. | P1 |
| Git history and ownership | Commits, people, ownership, blame, heatmaps, diffs, releases | Show history coverage and identity-matching limits. Add filters and export; never imply inferred ownership is authoritative. | P2 |
| Pull request impact and review | Manual PR review and optional GitHub App automation | Verify event signatures, permissions, idempotency, retries, and delivery history. Present changed files, baseline comparison, and evidence links; require explicit human review before applying suggestions. | P1 |
| Security findings | Code and dependency findings based on supported inputs and vulnerability data | Record scanner/data-source versions and scan time; distinguish missing coverage from clean results; improve severity rationale and remediation references. | P1 |
| Patterns and architecture rules | Pattern signals, cycles, packages, endpoints, rules | Allow teams to version rules with a change history, suppress with reason/expiry, and compare violations between analyses. Link all results to source evidence. | P2 |
| Quality tools | Hotspots, coverage import, cleanup candidates, debt, stale code, trends, migrations | Include confidence and input coverage; explain ranking factors; require a confirmation step for destructive cleanup actions (currently suggestions only). Add baseline comparisons. | P1 |
| Database schema visualizer | PostgreSQL/MySQL introspection, SQL/model parsing, ER diagram and schema explorer | Add schema snapshot history and diff; show source/provenance for every object; improve large-schema search and diagram accessibility. | P1 |
| Database telemetry | PostgreSQL/MySQL metrics and dashboards; some instrumentation is optional/unverified | Label measured vs derived/unavailable signals, record polling time and permissions, and verify against representative database versions. Persist resolved alert history before advertising it. | P1 |
| SQL workspace | Read-only queries, plans, bounded rows, saved queries and history | Enforce read-only semantics across drivers, add query cancellation and safe redaction, show timeout/row-limit state, and test hostile SQL and permission boundaries. | P0 |
| Workspaces and collaboration | Workspaces/projects, notes, saved views, project membership records | Complete invitations, role definitions, removal, ownership transfer, project lifecycle, notifications, and audit trail. Clarify tenant visibility and sharing defaults. | P1 |
| Authentication and access | Password sessions, optional GitHub OAuth, project/workspace guards | Formalize RBAC and session revocation; add provider-neutral OIDC SSO when customer demand is established. SCIM is a later, demand-led enhancement. | P1/P2 |
| Exports, reports, webhooks, schedules | Existing report/export and optional webhook/scheduled paths | Version report formats, redact sensitive data, sign webhooks, protect against replay, expose delivery status/retry, and make scheduled tasks idempotent. | P1 |
| Administration and operations | Basic health routes, Compose, config checks, structured Go logs | Add an operator surface or documented CLI for integration state and job health; establish migrations, backup/restore, alerting, release and support procedures. | P0 |
| UI system and accessibility | Shared primitives/tokens, existing audit notes cleanup needs | Align tokens and interaction states, keyboard support, WCAG AA contrast for core workflows, responsive behavior, and automated visual/accessibility regression checks. | P1 |

### Complete current capability catalog

This catalog is intended for feature-parity planning in the separate project. An
item may be optional, limited, or unverified in the existing implementation;
the catalog does not imply that every workflow is production-ready.

| Product area | Existing features to account for | New-system enhancement / parity definition |
| --- | --- | --- |
| Public entry and onboarding | Public landing page, welcome flow, login, registration, hand-off of a selected repository into onboarding | Explain the product and data boundaries plainly; guide a first-time user through account → workspace → project → repository → analysis; preserve repository selection across sign-up; offer a useful sample/demo path without uploading private code. |
| Identity and sessions | Password-based accounts, optional GitHub OAuth, session cookies, account menu/sign-out | Add password reset and verification policy, session/device visibility and revocation, optional OIDC SSO, clear provider errors, account deletion/export, and auditable role changes. |
| Workspaces and projects | Workspace listing/selection, project listing/creation, project repository context, project settings and member records | Define tenant boundaries and project lifecycle; complete invitation acceptance/expiry/revoke, role matrix, member removal, ownership transfer, archive/delete/restore, and searchable admin views. |
| Repository sources | GitHub repository selection and proxy access, local folder and ZIP intake, repository tree/blob cache, exclude patterns, refresh/re-analysis | Add source adapters with uniform validation and provenance; support GitHub first and specify local/ZIP constraints; add branch/ref selection, upload size limits, safe archive extraction, progress, cancellation, and clear refresh semantics. |
| Analysis lifecycle | Async job submission, worker processing, progress loader, stored analysis/project context, retries/error classification, analysis history and comparisons | Model jobs as durable state machines with queued/running/succeeded/failed/cancelled states, idempotency, retry history, cancellation, worker/version provenance, reproducibility and side-by-side revision comparisons. |
| Repository tree and code exploration | Virtualized file tree, file search/focus, file/source preview, repository graph with tree/bundle/code modes, graph focus and file drill-down | Preserve graph and tree workflows; add symbol-level navigation where parsers support it, path breadcrumbs, shareable deep links, keyboard/list alternatives, incremental loading, and consistent source revision labels. |
| Code graph and saved exploration | Dependency graph, grouping/focus/search, bookmarks, saved graph views, file/team notes and annotations | Persist owner, visibility, filters, layout and analysis revision; permission-check shares; allow compare/restore; explain each graph edge with parser/provenance and avoid stale saved view ambiguity. |
| Onboarding guide | Suggested entry points and core files with dependency navigation | Show the reason and evidence behind each suggested starting point; adapt to language/framework; let teams pin or annotate canonical entry points; capture feedback on usefulness. |
| Architecture and dependencies | Architecture/system diagram, modules/layers, package views, dependency cycles, detected endpoints, architecture rules and violation signals | Separate parsed facts from inferred clusters and user-authored rules; add rule versioning, exceptions with owner/expiry, drift history, path explanations and impact comparison across revisions. |
| Git insights | Commit timeline, contributor insights, ownership map/risk, CODEOWNERS, blame/commit heatmaps, branch diff, divergence and release notes generation | Show data coverage/time ranges; distinguish configured owners from inferred contributors; link claims to commits/files; compare ownership and hotspots over time; make generated release notes editable and traceable. |
| Pull request workflows | Manual pull request URL review, changed-file/architecture impact, optional GitHub App webhook-driven review | Preserve manual review; add base/head revision provenance, repeatable review status, signed webhook delivery, replay protection, idempotency, retries and delivery history; never silently approve or modify a PR. |
| Overview and health | Repository overview, health/risk signals and analysis summaries | Define every score, show source coverage and contributing evidence, compare to a baseline, separate unknown from zero, and allow teams to tailor useful views without duplicative KPI panels. |
| Security and dependency risk | Manifest/lockfile parsing, vulnerability data lookup (including OSV path), vulnerability findings, reachability analysis and finding drill-down | Record scanner/data-source versions and timestamps, distinguish affected from potentially reachable, show missing input coverage, enable reasoned suppressions/expiry, deduplicate across revisions, and track remediation. |
| Patterns and recommendations | Pattern/anti-pattern signals, prioritized action suggestions, contextual matching files and explanations | Add provenance/confidence, explain ranking factors, allow feedback and dismissals with reason, compare recommendation state between runs, and keep suggested actions human-approved. |
| Quality and maintainability | Hotspots, coverage import and per-file association, cleanup/unused-function candidates, technical debt, stale code, trend charts, migrations, cycles, packages and endpoints | Show inputs, definitions and limits; associate coverage safely; compare analysis versions; prioritize by risk plus impact; provide explainable remediation plans; never imply cleanup actions occurred automatically. |
| Ask Codebase and generated explanations | Optional codebase Q&A and AI explanations for architecture/PR/recommendations | Retrieval-ground answers with file/line citations and source revision; show model/provider and data sent; protect against repository prompt injection; enforce quotas and redaction; retain a fully useful deterministic workflow when disabled. |
| Database schema ingestion | Live PostgreSQL/MySQL introspection, SQL DDL parsing, supported repository/ORM model parsing, merged schema and source locations | Make each source and parser confidence visible; version snapshots and schema diffs; retain source-file/line provenance; validate permissions and connection targets; disclose unsupported syntax. |
| ER and schema navigation | Entity relationship diagram, column-level relations, table/object detail drawer, searchable schema explorer, domain map, table map, zoom/pan/minimap/fit-to-view | Keep large schemas usable with search/filter/layout fallbacks; add keyboard accessible table/relationship lists, stable deep links, snapshot comparison, grouping ownership and source-to-table lineage. |
| Database telemetry | PostgreSQL/MySQL overview, performance, expensive queries, storage, replication, activity, security/roles and alert surfaces | Mark data as live, cached, derived, unavailable or unsupported with timestamps; validate engine/version permissions; persist alert history; tune polling and retention; provide alert delivery/recovery evidence. |
| SQL workspace | Table browser, filtering/sorting/pagination, SQL editor, query plan/EXPLAIN, execution, result grid, saved queries/history, CSV export; read-only and bounded execution intention | Make read-only enforcement driver-level, single-statement policy explicit, add cancellation and query timeout UI, redact results from logs, audit exports, permission-check saved queries, and test all mutation/side-effect vectors. |
| Alerts and scheduled work | Project alert rules, firing/resolved surfaces, alert webhooks, scheduled analysis and weekly digest paths | Define alert state transitions and durable event history; sign webhook messages, retry safely, show delivery log, dedupe repeated notifications, allow schedule timezone/retention controls, and make jobs idempotent. |
| Collaboration and shared context | Project members, team/file notes, annotations, coverage data, saved views, saved queries, exports and reports | Give each object explicit owner/scope, history and access checks; add comment mentions/notifications only if needed; version exports and include source revision/filters so reports remain interpretable. |
| Export and reporting | Analysis reports, supported graph/data exports, CSV result downloads | Support predictable formats, accessible report layouts, controlled redaction, permission checks, async generation for large exports, export audit events and stable schemas. |
| Settings and integrations | Exclude configuration, GitHub OAuth/App, AI provider configuration, project database connection, webhook and schedule configuration, account/workspace settings | Centralize integration status and test delivery; distinguish unset/invalid/disabled/healthy; provide secret rotation and deletion; expose data processing and scopes before enabling integrations. |
| Product UI and navigation | Landing, account menu, workspace shell, module navigation (Overview, Explore, Insights, Architecture, Security, Patterns, Actions, Quality), command palette/search, settings and database workspace | Keep navigation task-oriented and consistent; command search must respect authorization; maintain loading/empty/error states, responsive layout, WCAG AA core paths, and clear current project/revision context. |
| Deployment and maintenance | Dockerfiles, Compose development/production configurations, environment examples, gateway health/config checks, source-code analysis services | Ship a repeatable single-node profile first; add migration, backup/restore, upgrade, rollback/forward-repair and operator diagnostics; document resource sizing and supported versions. |

### Feature-parity rule for the clean project

Build a capability matrix before implementation. For every catalog row, mark
**keep**, **redesign**, **defer**, or **drop**, and record the user outcome,
data needed, API owner, permission, acceptance flow, and whether it is required
for the first release. Do not port UI screens as isolated replicas: preserve
the user outcome and evidence path, then rebuild the workflow in the new domain
and API design. The default is to keep valuable capabilities, redesign known
limits, and defer only features that depend on unresolved licensing, customer
demand, or operational readiness.

## 3. Clean-slate system design for a separate project

The following is the recommended target for a new repository. It is a greenfield
design informed by the existing product; it is not a claim that the current
application uses these boundaries. Keep the first deployable system a modular
monolith plus isolated analysis workers. Split services only when independent
scaling, isolation, or release cadence is demonstrated by measurements.

### 3.1 Product and service boundaries

| Boundary | Owns | Does not own |
| --- | --- | --- |
| Next.js web app | Routing, rendering, accessible interaction, client cache, forms, view state, user-facing job progress | Authorization decisions, secret storage, analysis truth, direct customer DB credentials |
| Python control-plane API (FastAPI) | Identity/session integration, workspaces/projects, policies, repository connections, analysis orchestration, saved views/annotations, reports, audit events, public API and OpenAPI contract | CPU-heavy parsing internals that are measured Rust candidates; direct UI rendering |
| Python analysis workers | Repository acquisition/normalization, language pipeline orchestration, Git history, security/quality/architecture signals, database schema parsing, deterministic results | Browser sessions, organization policy decisions, long-lived customer credentials in job payloads |
| Rust compute worker/library (optional) | Narrow, versioned CPU-intensive parsers/graph algorithms or inference adapter proven hot by benchmark | Product policy, tenant authorization, general orchestration, duplicate implementation of all Python analysis |
| PostgreSQL | Identity references, tenants, projects, sources, job metadata, analysis metadata/findings, collaboration, audit, integration references | Large temporary workspaces or opaque model files |
| Valkey-compatible broker/cache | Queue transport, short-lived cache, rate-limit counters where suitable | Durable business record or sole source of job/audit state |
| Object storage (optional) | Large immutable analysis artifacts, report exports, snapshots if PostgreSQL size/IO evidence justifies it | Credentials, authorization policy, mutable source of truth without metadata/version records |
| Inference provider adapter | Optional external or local model call, retrieval context contract, quotas and provenance | Unbounded access to repository or database data; durable product state |

### 3.2 Logical architecture and primary flows

```text
User browser
  └── Next.js app (MIT)
       └── HTTPS / same-site session
            └── FastAPI control-plane API (Python; MIT)
                 ├── PostgreSQL (domain state and metadata)
                 ├── Valkey (short-lived queue/cache; BSD-3-Clause candidate)
                 ├── GitHub / optional identity / optional inference adapters
                 └── analysis job → Python workers
                                  ├── deterministic analysis pipeline
                                  ├── optional Rust compute worker over versioned contract
                                  └── artifact store (only if needed)

Connected customer DBs are reached only by bounded, authorized read paths;
they are never reachable from the browser or an unrestricted model adapter.
```

Core request flow: authenticate → authorize tenant/project/source → create a
durable job record → enqueue a minimal job reference → worker rechecks scope and
resolves credentials securely → acquire and analyze a pinned source revision →
store versioned result metadata/artifacts → update job state → notify/poll the
client. A queue message is a delivery mechanism, not the durable job record.

Q&A flow: authorize project and analysis revision → retrieve bounded relevant
chunks from that revision → apply prompt-injection and secret filtering policy
→ call configured provider/runtime through an adapter → validate structured
citations against retrieved evidence → persist only configured metadata → show
answer with source links and provider/data disclosure. If inference is absent
or fails, repository browsing and deterministic findings still work.

### 3.3 Domain model

Use explicit tenant ownership and foreign keys. Initial entities should include:

- `User`, `IdentityProviderLink`, `Session` (or external session reference)
- `Organization`, `OrganizationMembership`, `Invitation`
- `Workspace` (if distinct from organization), `Project`, `ProjectMembership`
- `RepositoryConnection`, `RepositoryRevision`, `AnalysisConfiguration`
- `AnalysisJob`, `AnalysisRun`, `ArtifactReference`, `Finding`, `EvidenceReference`
- `SavedView`, `Annotation`, `CoverageImport`, `SavedQuery`, `ExportJob`
- `DatabaseConnectionSecretRef`, `SchemaSnapshot`, `TelemetrySample`, `AlertRule`, `AlertEvent`
- `Integration`, `WebhookDelivery`, `ScheduledTask`, `AuditEvent`

Every durable analysis run should record immutable source revision, analysis
engine version, configuration hash, start/end time, status, and artifact/result
references. Findings need stable IDs within a run, type/severity, evidence
references, confidence/limitations, and lifecycle state. Avoid storing the same
large file content in every feature table; use a versioned source/artifact
reference with explicit retention.

### 3.4 API and event contracts

- Define domain services independently of FastAPI route functions; validate all
  request and response schemas at the boundary.
- Use OpenAPI for synchronous APIs and a versioned internal job envelope for
  workers. Include schema version, job ID, tenant/project IDs, actor ID, source
  revision and configuration ID; do not include bearer tokens or plaintext DB
  secrets.
- Return stable error envelopes containing safe code/message and request ID;
  use cursor pagination for large findings, history, members, and telemetry.
- Use idempotency keys for analysis creation, webhook delivery, exports, and
  schedule execution. Persist delivery attempts and terminal reasons.
- Keep internal services private on the deployment network. Add a separate
  public API version only when external clients need a compatibility promise.

### 3.5 Repository and analysis pipeline

1. Validate provider, repository identity, ref, path excludes and user access.
2. Resolve immutable commit/revision and record source provenance.
3. Fetch via least-privilege provider adapter or safely unpack an upload in an
   isolated workspace with path traversal, size and decompression limits.
4. Normalize files and detect supported languages/frameworks with explicit
   coverage reporting.
5. Run deterministic stages: parse/index → dependency graph → architecture,
   endpoint, package and cycle signals → Git history → security manifests and
   vulnerability data → quality/coverage → database models/schema if present.
6. Store versioned findings and evidence; emit progress and resource usage.
7. Clean temporary files according to retention policy and preserve prior
   successful results if a refresh fails.

Each stage should be independently observable and retry-safe. A missing parser,
unsupported lockfile, unavailable vulnerability feed, or partial Git history
must produce a coverage limitation, not a false clean result.

### 3.6 Deployment profiles

- **Development:** Next.js, FastAPI, one worker, PostgreSQL, Valkey, local fake
  provider adapters and fixture repositories via Compose.
- **Small production:** self-hosted Next.js and API containers, separate worker
  container(s), PostgreSQL and Valkey with persistent storage, TLS proxy,
  backups, health checks and bounded concurrency.
- **Scale-out:** increase stateless API replicas and worker pools independently;
  move large artifacts to compatible object storage; add separate metrics and
  tracing backend only as operational needs justify. Kubernetes is optional,
  not a baseline requirement.
- **Inference:** disabled by default unless deployment chooses an external
  provider or provisions local model hardware. Model process/resource limits
  are independent from API worker limits.

### 3.7 Clean-repository layout

```text
apps/web/                 Next.js product UI
services/api/             FastAPI control plane and OpenAPI contract
services/analysis-worker/ Python job orchestration and deterministic analyzers
crates/compute/            Optional Rust library/worker for measured hot paths
packages/contracts/        API schemas, job envelope and shared generated types
infra/compose/             Local and single-node deployment profiles
db/migrations/             Ordered SQL migrations
docs/                      Architecture decisions, operations, security, feature map
```

Keep generated TypeScript API types derived from the API contract; avoid
copying business logic across web, Python and Rust. A Rust crate should expose a
small versioned input/output contract and have Python integration tests against
the same fixtures before it becomes part of production analysis.

### 3.8 Frontend and inference implementation direction

### Recommended near-term shape: modular services, not microservices

```text
Browser
  └── Next.js web application (proposed migration from React/Vite)
       └── Go edge gateway (existing; routing, TLS boundary, limits, request IDs)
            ├── Application API (existing Node/Express until route parity is proven)
            ├── Python analysis API and workers (existing FastAPI/Celery)
            └── Optional Rust inference service (only for measured hot paths)

Shared services: PostgreSQL · Valkey-compatible queue/cache/session service · object storage only if artifact volume requires it
```

Keep clear ownership boundaries: Next.js renders the product experience; the application API owns users, tenants, projects, authorization, integrations, and durable domain data; Python owns repository parsing and analysis orchestration; Rust is an optional performance component with a stable API; Go remains a small edge gateway while it provides distinct operational value.

Before adding a new service, benchmark representative repositories and identify whether latency comes from parsing, graph algorithms, model inference, database access, or UI rendering. A Rust rewrite without a measured bottleneck increases build, debugging, and operational burden without guaranteeing faster end-to-end analysis.

### Next.js frontend recommendation

A move from Vite to Next.js is a product direction to evaluate, not a prerequisite for the enterprise roadmap. The current client is already React/TypeScript and has feature modules. Preserve those modules and migrate route-by-route only if server rendering, integrated routing, metadata, or deployment needs justify the move.

- Keep interactive graph and analysis screens as client-rendered components; server-render only pages where it improves initial load or access-controlled delivery.
- Keep authorization in the backend. Next.js middleware and server actions are not the security boundary for project data.
- Use a typed API client generated from a maintained OpenAPI contract once the route inventory is accurate.
- Avoid a second design system. Reuse accessible primitives and existing product tokens; verify the exact component package license before adoption.
- Test route parity, OAuth redirects, deep links, error states, and bundle/performance baselines before retiring Vite.

Next.js is MIT-licensed. Its deployment model and each adapter/plugin still need review; self-hosting avoids making a hosted platform mandatory.

### Python and Rust for inference and analysis

Python should remain the primary inference integration and analysis language in the near term because the repository already has FastAPI/Celery and Python analysis code. Keep provider interfaces replaceable and make inference optional. For local model execution, evaluate `llama.cpp` (MIT) or ONNX Runtime (MIT) only after matching model format, hardware, quality, and license requirements. Model weights have separate terms and must be individually cleared; framework license alone does not grant commercial rights to weights or data.

Rust is appropriate for a bounded, benchmark-proven component such as CPU-heavy parsing, graph construction, incremental diffing, or a local inference runtime. Candidate options include:

- **Candle** (Apache-2.0): Rust ML framework; assess model/operator coverage and hardware support before selection.
- **ONNX Runtime** (MIT): inference runtime with non-Rust language bindings; usable behind a Rust service when the model export path is supported.
- **llama.cpp** (MIT): local LLM inference with quantized model support; evaluate deployment hardware and model-specific weight terms.

Do not run multiple inference stacks by default. Choose one runtime per deployment profile, expose a narrow internal HTTP/gRPC or job interface, bound memory/concurrency, and report model identity and resource use. Compare Python baseline and candidate runtime on the same repository/query fixtures for latency, throughput, memory, output quality, and failure behavior before deciding to adopt Rust.

## 4. Open-source tools and license review shortlist

The table records project-level license candidates; it is not a transitive dependency clearance. Confirm current release license files, exact versions, container image terms, plugins, model weights, font assets, and notices before commercial distribution. This plan intentionally favors self-hostable, replaceable components.

| Need | Preferred candidate | Role and integration | License candidate | Lightweight alternative / note |
| --- | --- | --- | --- | --- |
| Frontend | Next.js + React + TypeScript | Proposed route migration; retain client feature modules and backend-owned auth | MIT | Keep current Vite application until measured benefits justify migration. |
| Python API | FastAPI | Existing analysis API; typed internal and external contracts | MIT | Already present. |
| Background work | Celery + Valkey | Existing job pipeline; replace Redis 7.4 default only after protocol/session/persistence tests | Celery BSD-3-Clause; Valkey BSD-3-Clause | A single-process worker is suitable only for development, not durable production jobs. |
| Application API | Existing Express, then assess consolidation | Session and business API; publish OpenAPI and migrate deliberately | Express MIT | Avoid introducing a second full API framework during transition. |
| Edge gateway | Existing Go standard library | TLS/reverse-proxy boundary, request limits, request IDs, health | Go BSD-style | Caddy (Apache-2.0) or Traefik (MIT) may provide TLS proxying if gateway capabilities are redundant; evaluate operational fit. |
| Relational data | PostgreSQL | Users, projects, analysis metadata, audit, saved state | PostgreSQL License | Existing primary database. |
| Cache / queue | Valkey | Redis-compatible cache, queue and shared sessions, after validation | BSD-3-Clause | Keep only required roles; do not add another broker without evidence. |
| Identity provider | Keycloak via OIDC | Optional self-hosted enterprise SSO | Apache-2.0 | Existing local accounts for small deployments; OIDC integration should remain provider-neutral. |
| Local inference | llama.cpp or ONNX Runtime | Optional self-hosted inference adapter, after model/hardware review | MIT | Existing remote provider remains optional and replaceable; no model is bundled by default. |
| Rust inference/compute | Candle or a Rust wrapper around ONNX Runtime | Optional isolated worker for benchmark-proven workloads | Apache-2.0 / MIT | Python remains default until benchmarks show a material improvement. |
| API docs | OpenAPI + Swagger UI | Contract and interactive endpoint docs | Specification is open; Swagger UI Apache-2.0 | Generate from API definitions; do not expose internal endpoints publicly by default. |
| Browser tests | Playwright | Critical browser flows and responsive checks | Apache-2.0 | Start with a few smoke journeys to manage CI cost. |
| Metrics/traces | OpenTelemetry Collector | Self-hosted telemetry pipeline if operational questions require it | Apache-2.0 | Structured redacted logs and health routes first. |
| Metrics storage | Prometheus | Scrape and retain self-hosted service metrics | Apache-2.0 | Compose deployment can begin with logs and metrics endpoint; size retention deliberately. |
| Dashboards | Grafana OSS | Operator dashboards over Prometheus | AGPL-3.0 | AGPL obligations may matter for distribution/hosted offerings; omit if license policy prefers permissive-only components. |
| Error tracking | GlitchTip | Self-hostable error collection candidate | MIT for core; verify edition/dependencies | Logs plus OpenTelemetry may suffice initially. Review each release and dependency. |
| Container packaging | Docker/OCI-compatible images + Compose | Local and small-install deployment | Component-specific; Docker Engine is Apache-2.0, Compose is Apache-2.0 | OCI is a format; base image licenses must be inventoried. |
| Reverse proxy/TLS | Caddy | Optional TLS termination when not provided by deployment platform | Apache-2.0 | Existing Go gateway can remain the edge if it handles TLS and proxy needs. |
| Database migrations | Versioned migration tool (select after stack ownership decision) | Ordered schema changes and upgrade path | Verify selected tool release | Prefer SQL migrations checked into the repo; avoid runtime ad hoc DDL. |
| SBOM | Syft | Generate SPDX/CycloneDX inventories for images and source | Apache-2.0 | Run in CI and archive with release artifacts. |
| Vulnerability scanning | Trivy | Scan images, filesystems, and dependencies | Apache-2.0 | Pair with language lockfile checks and documented triage. |
| Secret scanning | Gitleaks | Detect accidental committed secrets in CI and local hooks | MIT | Ensure findings are reviewed and false positives are tracked. |
| CI | GitHub Actions workflows or self-hosted equivalent | Build, checks, scans, artifact publication | Marketplace action licenses vary | Pin actions by commit SHA and review each action license/source. |

### License control policy

1. Maintain a versioned dependency/license ledger for direct and transitive runtime components.
2. Generate an SPDX or CycloneDX SBOM for source dependencies and each shipped image.
3. Track model weights, datasets, fonts, parsers, plugins, Git dependencies, and base images as separate assets.
4. Include required notices and source offers; record license exceptions with an owner and review date.
5. Treat “open source,” free-to-download, and public repository as insufficient evidence of commercial-use rights.
6. Request legal review for copyleft, source-available, ambiguous, or model-specific restrictions before bundling or hosting.

## 5. Enterprise product requirements

### Identity and tenant administration

- Define organization roles (`owner`, `admin`, `member`, `viewer`) and project-level capabilities in a permission matrix.
- Implement invitations with pending, accepted, expired, revoked states; member removal; ownership transfer; account deactivation; session revocation.
- Add optional provider-neutral OIDC login and SSO enforcement policies after role and session behavior is stable. Defer SCIM until there is a named customer requirement.
- Test every read, write, export, job-status, cache, and webhook route across tenant boundaries.

### Audit, retention, and governance

- Append audit events transactionally for login/security events, membership/role changes, integration/secret changes, exports, administrative actions, and deletion.
- Store actor, time, action, object, outcome, request/job ID; exclude credentials, raw SQL results, and repository source.
- Define repository cache, snapshots, telemetry, query history, audit, and account retention/deletion behavior.
- Provide export/deletion controls and document support access, incident response, and data-processing boundaries before compliance claims.

### Integrations and APIs

- Inventory current routes and consumers before versioning external APIs. Publish OpenAPI contracts, stable error envelopes, pagination, request IDs, and deprecation policy.
- Sign webhooks, validate delivery origin, prevent replay, use bounded idempotent retries, and expose delivery status.
- Keep GitHub, identity, inference, notification, and object-storage integrations behind narrow adapters only where provider variation is real.

## 6. Security, reliability, and performance

### Security requirements

- Require TLS at public boundaries; use secure, HTTP-only, same-site session cookies and rotate sessions after sign-in or privilege changes.
- Enforce server-side authorization for each object operation. Fail closed when project or organization context is missing.
- Encrypt stored credentials with managed keys; document rotation and re-encryption. Keep secrets out of logs, job payloads, URLs, errors, telemetry, and model prompts unless explicitly needed and disclosed.
- Defend Git and database fetches from SSRF, DNS rebinding, redirects to private networks, malicious archive paths, oversized inputs, and decompression bombs.
- Bound API bodies, query results, SQL duration, model tokens, inference concurrency, worker memory, timeouts, and upstream retries.
- Keep customer code and SQL data out of external inference by default; require explicit configuration and disclose the data flow when an external provider is enabled.

### Reliability requirements

- Add versioned migrations and test both clean install and upgrade from the prior supported release.
- Make analyses, schedules, webhook deliveries, and alerts idempotent; expose retry count, terminal failure, and dead-letter state.
- Define liveness/readiness separately and implement graceful shutdown for API and workers.
- Document backups, restore exercises, recovery-time and data-loss targets; do not publish targets until measured.
- Start with structured redacted logs, correlation IDs, queue metrics, API/worker latency, and health. Add traces and dashboards where they answer concrete operator questions.

### Performance and inference requirements

- Establish fixed test repositories at small, medium, and large sizes; record analysis time, peak memory, queue wait, database query time, and graph rendering performance.
- Profile before optimizing. Prefer Python improvements and batching/indexing when they meet targets; evaluate Rust only for an isolated hot path.
- For inference, benchmark cold start, tokens/sec or request latency, memory/VRAM, concurrency, output usefulness, citations, and failure modes on the same prompts and hardware.
- Use bounded context, file-level retrieval, cancellation, and visible progress. Cache only versioned inputs/results with authorization-safe keys.

## 7. UX and product identity

- Keep a single application shell with project context, clear module navigation, predictable actions, and consistent page titles.
- Treat source evidence as the central interaction: every finding should open the relevant file, symbol, dependency, commit, or schema object when available.
- Use compact technical layouts and avoid summary cards or charts without a concrete decision purpose.
- Define design tokens for typography, spacing, surfaces, focus, status, and data visualization; document responsive and accessible component behavior.
- Provide useful loading, empty, success, warning, failure, retry, and cancellation states for every asynchronous flow.
- Ensure keyboard access, semantic controls, visible focus, readable contrast, and accessible alternatives for graph-only interactions.
- Make AI provenance visible; label generated text and let users inspect the evidence behind it.
- Establish a distinct visual identity through restrained color, consistent iconography, product naming, and clear technical language rather than decorative complexity.

## 8. Roadmap and acceptance criteria

Effort estimates are relative planning ranges: **S** = focused days, **M** = one or more iterations, **L** = multi-iteration work. Refine after discovery. Items are proposed and require implementation and verification.

| Phase | Priority / work | Dependencies | Effort | Acceptance criteria |
| --- | --- | --- | --- | --- |
| Foundation | **P0:** Run production-shaped Compose path through login, authorized repository access, analysis, persistence, restart, and readiness. | Test credentials/repository and environment secrets | M | Clean setup follows docs; full smoke journey succeeds; restart preserves required state; no secrets in logs. |
| Foundation | **P0:** Establish CI checks and resolve known test/lint debt with explicit intended behavior. | Current audit and product decisions | M | Pull requests have repeatable build, lint/type, unit/integration checks; exceptions have owners and expiry. |
| Foundation | **P0:** Complete license ledger/SBOM and replace Redis 7.4 default with a verified Valkey release if compatible. | Exact component inventory; queue/session/persistence compatibility | M | Every shipped artifact is inventoried; no unapproved license in default distribution; session and job recovery checks pass. |
| Foundation | **P0:** Add schema migrations and backup/restore runbook; remove startup DDL as the upgrade mechanism. | Schema inventory and deploy fixture | M | Clean install and previous-version upgrade converge; restore exercise is recorded with measured recovery. |
| Core | **P1:** Fix analysis progress, errors, retries, versioning, and evidence provenance; verify a real GitHub-backed run. | Production-shaped stack | M | Supported fixture repositories produce reproducible results and actionable job failures; all results include analysis/source version. |
| Core | **P1:** Align API contracts and move shared analysis rules out of client-source imports. | Route/import inventory | M | Client and server builds have explicit versioned contracts; no runtime image copy from client source is required. |
| Core | **P1:** Improve core accessibility, responsive behavior, evidence links, and design-token consistency. | Design-system audit | M | Core flows are keyboard operable; target viewport review has no unintended overflow; findings expose evidence and states. |
| Core | **P1:** Add observability baseline and operator runbooks. | Production-shaped deployment | M | Operators can follow a request/job to completion, inspect queue age/failure, and execute restart/backup/restore procedures. |
| Enterprise | **P1:** Complete roles, invitations, membership lifecycle, audit events, and admin session controls. | Tenant/permission decisions | L | Permission matrix is tested route-by-route; invite and removal flows work; privileged changes create atomic audit records. |
| Enterprise | **P2:** Add OIDC SSO through standard protocol and validate with Keycloak. | Stable roles/session lifecycle | L | Login, logout, claims mapping, deprovisioning, failure and local-account policy are covered. |
| Enterprise | **P2:** Harden webhooks, schedules, reports, external API contracts, retention, and deletion. | API inventory and data policy | M/L | Signed replay-resistant delivery; documented API compatibility; deletion verified across durable and cached data. |
| Product experience | **P1/P2:** Evaluate Next.js migration on route/metadata/deployment needs; migrate incrementally if benefits are evidenced. | Frontend baseline and route map | M/L | No broken deep links/auth paths; interaction and bundle performance meet or improve baseline; existing workflows retained. |
| Inference | **P2:** Add grounded inference adapter with citation and privacy controls; benchmark Python runtime first. | Fixed prompt/repository fixtures, model license review | M | Responses cite repository evidence; provider/model and data scope are visible; no-AI core workflows remain available. |
| Optimization | **P3:** Prototype Rust for the measured highest-cost parser/graph/inference path. | Benchmark confirms bottleneck and service boundary | M/L | Same fixtures show agreed material improvement in latency or memory without correctness regression or unacceptable ops cost. |
| Growth | **P3:** Consider SCIM, configurable dashboards, and deeper policy only with validated demand. | Stable enterprise lifecycle and named owner | L | Each feature has user/buyer, success metric, support plan, license review, and operational owner. |

### Release gates

**Commercial baseline:** P0 work complete; supported installation/upgrade/recovery documented; license inventory reviewed; security and tenant-boundary regressions covered; critical user workflows verified.

**Enterprise readiness:** commercial baseline plus role/invitation lifecycle, audit trail, OIDC SSO, administrator controls, retention/deletion policy, incident and support procedures.

**AI readiness:** model and weight license review, data-flow disclosure, grounded citations, prompt-injection controls, quota/cost limits, observability, and a useful no-AI path.

## 9. Verification strategy

Do not treat documentation as implementation evidence. Validate each accepted feature at the appropriate layer:

1. **Unit:** parser behavior, graph calculations, validation, permission policy, credential handling, SQL guards, prompt assembly and output citation mapping.
2. **Integration:** API/PostgreSQL/Valkey sessions and jobs, migrations, worker retries, GitHub access, database drivers, webhook delivery, inference adapter.
3. **Browser:** sign-in, project setup, analysis progress/failure/retry, graph evidence navigation, collaboration, database visualizer, read-only SQL, responsive/keyboard paths.
4. **Security:** cross-tenant access, session rotation, CSRF, SSRF, secret redaction, archive traversal, webhook replay, SQL mutation attempts, prompt injection and external-data boundaries.
5. **Operations:** clean deployment, restart, queue outage, database outage, backup/restore, upgrade, worker crash, secret rotation, model unavailable, resource exhaustion.
6. **Performance:** fixed repository/query fixtures; record baseline and compare changes. Do not claim inference or Rust speedups without repeatable measurements.

## 10. Known decisions and risks

- **Next.js migration:** likely useful for route structure and optional server rendering, but the current Vite client is established. Decide after documenting the specific product benefit and migration cost.
- **Python/Rust split:** Python is the lowest-risk default for current analysis and inference. Rust is a targeted optimization choice, not a blanket backend replacement.
- **Gateway/API overlap:** Go and Node currently coexist. Pick one owner for each route and prove parity before retiring any service.
- **Valkey:** the blueprint identifies Redis 7.4 as a license mismatch for the stated permissive default. Compatibility and exact release license must be checked before migration.
- **Model rights:** framework/runtime licenses do not license model weights, training data, or generated assets.
- **Enterprise claims:** avoid compliance/security certifications and uptime commitments until controls and operations have been independently verified.
- **Dependencies:** all listed license data is a shortlist, not a legal opinion or complete dependency audit. Check exact releases before shipping.

## 11. Immediate next steps

1. Treat the current `PRODUCT_GUIDE.md` and `PRODUCT_BLUEPRINT.md` as baseline and keep capability statuses aligned with code.
2. Complete the production-shaped smoke path, CI baseline, license inventory, Valkey compatibility decision, and migration/restore foundation.
3. Pick one measurable product workflow—recommended: repository intake to cited impact explanation—and define baseline timing and user success criteria.
4. Implement missing foundation and workflow improvements before adding enterprise infrastructure or a new inference service.
5. Evaluate Next.js migration and Rust acceleration as evidence-backed technical decisions with small prototypes and explicit acceptance criteria.

## 12. Monetization and commercial packaging

Structrace can be sold as a hosted engineering intelligence product, with a
self-hosted or dedicated deployment option for organizations that need more
control over code and data. Pricing should reflect customer value and operating
costs, not the number of problems the scanner finds. Treat the packages below
as hypotheses to validate with design partners, not final price commitments.

### 12.1 Proposed plans

| Plan | Target customer | Candidate included value | Possible limits / upgrade signals |
| --- | --- | --- | --- |
| **Free** | Individual engineers evaluating the product | Core deterministic repository analysis, local/ZIP intake, basic exploration and a short analysis history | Limit active projects, stored history, scan frequency, or repository size. Keep the product useful without paid AI or a hosted provider. |
| **Team** | Small engineering teams | Private repository workflows, shared projects, notes, saved views, PR impact review, reports, and database schema exploration | Price around active projects and included analysis volume. Upgrade when teams need longer history, more concurrent scans, or broader collaboration. |
| **Business** | Growing organizations | Organization administration, role controls, OIDC SSO, audit history, scheduled analysis, retention controls, and support commitments | Use workspace/project or annual organization pricing with defined usage allowances. Do not sell governance controls until their workflows are implemented and verified. |
| **Enterprise** | Organizations with strict deployment, governance, and support needs | Dedicated or self-hosted deployment, advanced administration, configurable retention, deployment assistance, support and agreed service objectives | Quote based on deployment model, scale, support scope, and operational requirements. Require documented install, upgrade, backup, restore, and incident processes. |

### 12.2 Pricing metric and cost controls

- Test a hybrid model: workspace subscription plus included analysis usage, with
  clear overage or upgrade behavior. Candidate usage measures are active
  projects, repository size bands, completed analysis runs, or worker minutes.
- Avoid charging per finding: it can make customers feel punished for
  discovering more risk and may discourage useful scans.
- Keep deterministic analysis available without paid inference. Make hosted AI
  optional, show which provider is used, and meter AI usage separately if it
  creates material variable cost.
- Model infrastructure costs by repository size, scan frequency, worker
  concurrency, artifact retention, support load, and inference usage. Set plan
  allowances only after representative workload measurements.
- Make usage visible to workspace administrators. Provide job quotas,
  concurrency limits, and predictable pause/upgrade behavior instead of
  surprise bills or silently dropped scans.
- Offer self-hosted deployment when customers need code to remain in their
  environment. Price for software/support and deployment burden, not as a way to
  imply that hosted operation is insecure.

### 12.3 Validate willingness to pay

1. Recruit a small set of engineering teams that regularly onboard to unfamiliar
   codebases or review high-impact changes.
2. Run a complete pilot workflow: connect a repository, analyze it, follow
   evidence to relevant files, review a change, and share the result.
3. Measure time to useful understanding, time spent on impact review, repeat
   usage, analysis completion, and whether the team would pay to continue.
4. Ask which capabilities justify budget: collaboration, private-repository
   access, history, PR workflow, database insight, SSO, retention, or deployment
   control. Use observed demand to prioritize packaging.
5. Test willingness to pay with plan concepts and actual purchasing decisions;
   do not treat feature requests or stated interest as proof of demand.

### 12.4 Commercial readiness gates

- Publish clear data-flow and retention explanations for repository content,
  analysis artifacts, database credentials, SQL results, and optional AI calls.
- Establish a supported deployment and upgrade path, backups and restore
  exercises, security response ownership, dependency/license inventory, and
  support channel before accepting production-critical use.
- Define service objectives only after collecting operational baselines and
  proving that monitoring and incident response can support them.
- Do not claim compliance certification, guaranteed absence of provider rate
  limits, or enterprise security properties without evidence and, where
  applicable, independent assessment.
- Keep customer value, gross margin, support burden, and inference/compute costs
  under review as plans evolve.
