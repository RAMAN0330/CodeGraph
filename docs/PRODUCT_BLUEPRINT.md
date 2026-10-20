# Structrace Product Assessment and Development Blueprint

**Assessment date:** 2026-10-20

**Basis:** checked-in source, package manifests, Docker Compose files, README,
architecture notes, and audit records in `docs/audit/`. This is a repository
assessment, not a live production certification or legal opinion.

This document accompanies [PRODUCT_GUIDE.md](../PRODUCT_GUIDE.md). The guide
explains the product journey and features; this blueprint separates current
implementation from proposed work and defines a practical route to a
commercially deployable release.

## 1. Product intent and outcomes

Structrace turns repository and database evidence into an explorable workspace
for software engineers and engineering leads. Its strongest product value is
connecting repository structure, dependency and change signals, findings, and
source context so a user can investigate impact without treating generated
scores as authoritative on their own.

### Product outcomes

1. Help a new engineer find key modules, files, and dependencies quickly.
2. Help a reviewer inspect the likely impact and evidence for a proposed
   change.
3. Help a team revisit analysis, notes, saved views, and trends across work.
4. Keep repository and customer database credentials protected and access
   decisions explainable.
5. Let an operator deploy, upgrade, back up, restore, monitor, and diagnose the
   system with documented procedures.

### Primary users

- **Engineer:** explores an unfamiliar repository and validates findings in
  source.
- **Reviewer / tech lead:** assesses change impact, architectural boundaries,
  ownership concentration, and quality risk.
- **Workspace administrator:** manages projects, members, integrations, and
  access policy.
- **Platform operator:** runs the application, analysis queue, data stores,
  upgrades, and recovery procedures.

## 2. Current implementation assessment

Status labels: **Implemented** means code exists; it does not imply every
production scenario is verified. **Partial** means there is a material gap.
**Optional** means availability depends on an external integration. **Proposed**
means not implemented as a complete product capability.

| Area | Observed implementation | Status and gap |
| --- | --- | --- |
| Client | React 19, TypeScript, Vite, feature-first client structure, lazy route loading, shared UI primitives, graph and dashboard modules. | **Implemented.** Existing audit records 1,563 ESLint problems and 16 pre-existing stale Node tests. No current clean frontend lint baseline. |
| Analysis | Python 3.12 image, FastAPI, Celery workers, Redis queue, Git retrieval and repository analysis. The Node API also has analysis-related code. | **Implemented, split ownership.** Analysis correctness and a real GitHub-backed end-to-end run were not verified in the latest recorded audit. |
| Application API | Node 24 / Express 5 handles sessions, GitHub access, project/workspace data, SQL workspace and database introspection. | **Implemented.** Startup schema setup uses `CREATE TABLE IF NOT EXISTS` and `ALTER`; there is no versioned migration history in `server/src/db/pool.ts`. |
| Edge gateway | Go standard-library gateway is the production Compose entry point; Node API remains a compatibility service for application endpoints. | **Implemented, migration incomplete.** Maintaining two gateway implementations adds routing, test, and release complexity. |
| Data stores | PostgreSQL 16 for durable data; Redis 7.4 image for shared queue/session/cache roles in Compose. | PostgreSQL is a suitable permissively licensed core. **Redis 7.4 is not an approved permissive-license choice for this brief**; replace it with a verified Valkey release before claiming a commercially permissive default stack. |
| Auth and authorization | Password and optional GitHub OAuth sessions; project and workspace guards; encrypted GitHub and database secrets are recorded in the security audit. | **Partial.** No generic OIDC/SSO or SCIM lifecycle. Team membership and invitation semantics need clear product boundaries; the audit roadmap notes membership is currently a stored list rather than an end-to-end invitation workflow. |
| Repository security | Repository access checks before protected cache reads, token encryption in queued jobs, request limits, URL validation and authorization fixes are recorded as completed in the Oct 2 audit. | **Implemented with focused verification.** Repeat security checks on every supported gateway path and keep fail-closed tests in CI. |
| Database visualizer | SQL and model schema parsing, PostgreSQL/MySQL introspection and telemetry, query workspace guarded as read-only. | **Implemented for supported paths.** Telemetry and production customer-network behavior remain unverified for release. “Resolved alerts” are not a persisted history. |
| Collaboration | Workspaces, projects, annotations, saved views, coverage reports, and project member records. | **Partial.** Do not market as mature enterprise administration until invitations, lifecycle, role definitions, ownership transfer, and audit events are implemented and verified. |
| Integrations | GitHub OAuth/App, optional OpenAI API, customer PostgreSQL/MySQL, webhook and schedule code paths. | **Optional.** GitHub OAuth/App and AI provider flows require configured credentials and independent verification. Avoid making core product usability depend on AI. |
| UI and accessibility | Design tokens and shared components; route and mobile UX fixes in latest audit. | **Implemented with known cleanup.** Keep keyboard, contrast, responsive, empty/error/loading state checks as release criteria; test suite has conflicting historical expectations. |
| Operations | Docker Compose, container health checks, basic live/ready routes, Go structured logging, production config validation, CodeQL workflow. | **Partial.** Production Compose was config-validated but not started end to end per audit. No complete backup/restore runbook, SLOs, metric/tracing backend, or automated build/test workflow is evidenced. |
| Dependencies and licensing | npm lockfiles exist; Python requirements are unpinned; Go gateway has no third-party modules in `go.mod`. `graphifyy` is pinned to a Git commit. | **Partial.** No checked-in full SBOM or transitive license report; inspect the pinned Git source and all runtime/container dependencies before release. |

### Architecture and maintainability findings

- Preserve the modular monolith and existing worker separation. Do not add
  microservices or a large orchestration platform until measurements require
  them.
- Choose one application API/gateway ownership boundary. Until Node routes are
  migrated and parity-tested in Go, document both as active components and
  exercise the full Go → Node → FastAPI path in release validation.
- Move shared analysis rules out of client source imports into a versioned,
  server-owned package or explicit API contract. The current Node image copies
  source files from the client tree to satisfy runtime imports, creating a
  fragile build boundary.
- Replace startup DDL with ordered, reversible/versioned migrations and test
  upgrades from the previous supported release.
- Pin Python dependencies and container image digests for release builds;
  retain automated update review rather than allowing silent unreviewed drift.
- Establish a baseline before optimization: route bundle sizes, client
  interaction timings, queue age, analysis duration on fixed fixtures, API
  latency, and database query latency.

## 3. Proposed commercial and enterprise requirements

These are roadmap requirements, not current capabilities.

### Identity, access, and administration

- Add a generic OIDC provider interface and test with one self-hosted IdP.
  Keycloak is a candidate deployment option; keep local accounts available for
  development and small deployments.
- Define organization roles (`owner`, `admin`, `member`, `viewer`) and project
  permissions explicitly. Default to least privilege; test every read/write
  route against user, project, and organization boundaries.
- Implement real invitation states (pending, accepted, expired, revoked),
  membership removal, ownership transfer, and account deactivation.
- Add administrator views for users, organizations, projects, integration
  status, and session revocation.
- Defer SCIM until customer demand justifies its support and testing cost.

### Auditability and governance

- Record security-relevant changes: sign-in failures, membership and role
  changes, credential changes, exports, administrative actions, and integration
  configuration. Store actor, timestamp, object, action, outcome, and request
  identifier; never store credentials or source contents in audit records.
- Add configurable retention and export, document deletion behavior, and
  ensure audit storage is append-only at the application permission boundary.
- Define repository and analysis retention, customer data residency options,
  support access boundaries, and incident response before making compliance
  claims.

### APIs and integrations

- Publish OpenAPI contracts for public application endpoints, validate
  requests/responses, define stable error envelopes, and add request IDs.
- Introduce `/api/v1` only when external client compatibility is required;
  first inventory existing routes and consumers to avoid gratuitous migration.
- Add webhook signing, replay protection, delivery attempts, bounded retries,
  and delivery visibility. Keep scheduled work idempotent and observable.
- Keep GitHub, identity, AI, and notification providers behind small interfaces
  where there is a real second provider or a likely deployment variation.

### Reliability and operations

- Define initial service objectives: availability, analysis queue delay,
  successful analysis completion, and API latency. Choose targets from measured
  usage before publishing commitments.
- Add structured, redacted logs consistently across Node, Python, and Go;
  propagate request/job IDs. Add OpenTelemetry traces and metrics only where
  they will answer operational questions. The Collector is Apache-2.0; do not
  add a hosted telemetry vendor as a mandatory dependency.
- Document readiness semantics, graceful shutdown, worker concurrency, retry
  and dead-letter handling, queue recovery, database connection limits, and
  capacity scaling.
- Produce backup and restore procedures for PostgreSQL and persistent queue
  state; run a restore exercise and record recovery time and data-loss window.
- Use a supported release Compose profile for small deployments. Consider
  Kubernetes only when measured availability, scale, or isolation needs exceed
  Compose operations.

## 4. Technology strategy and licensing

Licenses below were checked against project-maintained license files or
official project pages on 2026-10-20. This is a first-party component review,
not a complete dependency clearance. Commercial distribution still requires a
version-specific review of all direct and transitive dependencies, fonts,
parser grammars/WASM artifacts, model weights, base images, and optional
integrations.

| Component | Product role / integration | License check | Recommendation and operational note |
| --- | --- | --- | --- |
| React + TypeScript + Vite | Client UI, feature modules and static build. Already present. | React: MIT. [React license](https://github.com/react/react/blob/main/LICENSE) | Keep. Continue lazy feature routes and shared design primitives; avoid another UI framework. Audit every package in the lockfile. |
| Node.js + Express | Session-bearing application API and compatibility routes. Already present. | Express: MIT. [Express license](https://github.com/expressjs/express/blob/master/LICENSE) | Keep while Go migration is incomplete. Define one source of truth for authorization and contracts during migration. |
| Go standard library | Production edge gateway. Current `go.mod` has no third-party module dependencies. | Go source uses a BSD-style license. [Go license file](https://github.com/golang/go/blob/master/LICENSE) | Keep the gateway small; do not duplicate application business logic in it. |
| FastAPI + Celery | Analysis API and asynchronous workers. Already present. | FastAPI: MIT. [FastAPI license metadata](https://github.com/fastapi/fastapi/blob/master/pyproject.toml); Celery: BSD-3-Clause. [Celery license](https://github.com/celery/celery/blob/main/LICENSE) | Keep the background pipeline; pin the complete Python environment and record worker compatibility with API/job payload versions. |
| PostgreSQL | Durable account, workspace, project, analysis and saved state. Already present. | PostgreSQL License, permissive and commercially usable. [Official PostgreSQL license](https://www.postgresql.org/about/licence/) | Keep as primary store; introduce migrations, retention rules, indexes, connection limits, backups and restore tests. |
| Redis 7.4 in Compose | Queue/session/cache dependency. | Redis 7.4 uses RSALv2 or SSPLv1 for the relevant release; these do not meet this brief's permissive-license preference. [Official Redis version/license table](https://redis.io/de/legal/licenses/) | **Replace in the default distributable deployment.** Valkey is the preferred candidate and publishes BSD-3-Clause source licensing. [Valkey BSD-3-Clause license](https://github.com/valkey-io/valkey/blob/unstable/LICENSES/BSD-3-Clause.txt). Verify the exact release image, protocol compatibility, persistence, and client behavior before migration. |
| Keycloak (proposed) | Optional self-hosted OIDC identity provider; integrate through standard OIDC, not a Keycloak-specific app contract. | Apache-2.0. [Keycloak license metadata](https://github.com/keycloak/keycloak/blob/main/pom.xml) | Add only when SSO demand is confirmed. It adds a service, database, upgrades, realm configuration and operational ownership; local password auth remains the lightweight option. |
| Playwright (proposed) | Browser-level regression coverage for sign-in, project setup, analysis states and critical DB flows. | Apache-2.0. [Playwright package license](https://github.com/microsoft/playwright/blob/main/packages/playwright/package.json) | Add as a dev dependency after agreeing supported workflows; browser binaries add CI time and storage, but testing can run locally or in existing CI. |
| OpenTelemetry Collector (proposed) | Optional self-hosted receiver/exporter for app telemetry. | Apache-2.0. [Collector source license headers](https://github.com/open-telemetry/opentelemetry-collector) | Add after metrics and trace questions are defined. No collector or metrics backend is currently configured. |

### Licensing and supply-chain release gate

1. Generate an SPDX or CycloneDX SBOM from the locked client/server
   dependencies and all final container images.
2. Resolve and review every license expression, including multi-license
   choices; keep a small approved/needs-review/rejected ledger with package,
   exact version, source URL, and decision owner.
3. Review the pinned `graphifyy` repository and any language parser/WASM or
   bundled font assets separately. Public source availability is not a license.
4. Reject new runtime dependencies without a pinned version, maintainer/source
   review, vulnerability policy, and license decision.
5. Preserve notices and source-license files in any binary or source
   distribution where required. Obtain legal review for ambiguous or
   non-permissive components before commercial release.

## 5. Development and execution toolchain

| Lifecycle need | Primary approach | Lightweight path / current state |
| --- | --- | --- |
| Frontend | Existing React, TypeScript, Vite, ESLint and shared UI primitives. | Existing `npm run build --prefix client`; lint debt must be triaged, not hidden. |
| API and workers | Existing Express, FastAPI, Celery and Go gateway; typed request/response boundaries. | Run the modular services through Compose for integration work. |
| Data and migrations | PostgreSQL; add a versioned migration mechanism to the Node-owned schema. Redis-compatible Valkey for queue/session roles after compatibility validation. | One PostgreSQL and one Valkey service in Compose. No search cluster or object store until a feature requires one. |
| Authentication | Existing secure session model; add provider-neutral OIDC integration if enterprise SSO is prioritized. | Local password account plus optional GitHub OAuth. Keycloak is an optional self-hosted IdP, not mandatory. |
| AI and analysis | Existing deterministic analysis first; optional OpenAI integration remains replaceable and clearly labeled. | Core analysis works without AI. No model weights/datasets are being recommended in this blueprint. |
| Testing | Existing Node tests, Go tests, Python unittest-compatible tests, TypeScript/build checks; add browser-level Playwright coverage for critical paths. | Use current package scripts and `go test ./...`; no separate test service required. |
| CI/CD | Extend GitHub Actions with locked installs, lint/type checks, unit tests, Go/Python checks, builds, SBOM and image scans. | One CI workflow on pull requests; deploy manually from a tagged, verified artifact initially. Current workflow only establishes CodeQL scanning. |
| Containers | Existing multi-stage Dockerfiles and Compose health checks. | Compose for local and small installs; document TLS/reverse proxy and durable storage. |
| Observability | Redacted JSON logs and request/job IDs first; add OpenTelemetry after defining SLOs and diagnostic questions. | Container logs plus health routes; no paid service required. |
| Security / dependency checks | Existing CodeQL; add lockfile vulnerability scanning, secret scanning, SBOM, container scanning and a license policy. | Run scans in CI and provide reproducible local commands; manually review flagged license ambiguity. |
| Collaboration | Git branches, pull requests, code review and Markdown architecture/operations docs. | Keep repo as the system of record; no mandatory hosted project-management tool. |

### Local development commands currently declared

```bash
npm run install:all
npm run dev
npm run build
cd server-go && go test ./...
cd server && .venv/bin/python -m unittest discover -s tests
cd client && npm run lint
```

Check `README.md`, `.env.example` files and local runtime prerequisites before
running these commands. Python dependencies currently come from an unpinned
requirements file; lock/pin them before relying on reproducible installs.

## 6. UX and design-system requirements

- Keep a consistent application shell, module navigation, page title, project
  context, and placement of primary actions.
- Treat repository evidence as the core UI object: findings link to files,
  dependencies, history, and source whenever that evidence exists.
- Use compact layouts that support technical density; do not add summary cards
  unless they improve a concrete decision.
- Define shared typography, spacing, colors, borders, focus rings, icon sizing,
  and state tokens in one design reference and CSS source. Resolve documented
  token drift rather than adding one-off values.
- Every async action needs pending, success, empty, failure, retry and
  cancellation behavior appropriate to the operation. Analysis jobs must
  expose progress, terminal failure reason, and a safe retry path.
- Support keyboard operation, visible focus, semantic headings/labels, useful
  screen-reader names, and WCAG AA contrast for core workflows.
- Validate desktop and narrow mobile widths for account, workspace/project,
  analysis status, and database schema pages. Graph canvases may be
  desktop-oriented but need a clear narrow-screen fallback.
- Make optional AI results visibly attributable and verifiable against
  deterministic graph/source evidence.

## 7. Data and API design requirements

- Keep durable domain records in PostgreSQL with foreign keys, uniqueness,
  not-null checks and indexes that reflect authorization and query patterns.
- Add migrations with an explicit schema version, one-way release sequencing,
  rollback or forward-repair policy, and tested upgrade from the prior release.
- Avoid putting bearer credentials or source contents in queue metadata, logs,
  URLs, analytics, or errors. Queue payloads should use stable identifiers and
  short retention; secrets are resolved/decrypted only by authorized workers.
- Paginate history, audit events, saved queries, large file lists and workspace
  tables. Bound query results, request bodies, analysis concurrency and
  connected-database timeouts.
- Standardize API validation and errors (`code`, safe `message`, optional
  `details`, `request_id`) while preserving backward compatibility for current
  clients.
- Use transactions around membership/role changes and audit events; ensure a
  failed authorization cannot partially mutate state.
- Document data classification, retention, export and deletion for repository
  cache, analysis snapshots, database credentials, query history and user data.

## 8. Security, reliability, and performance requirements

### Security

- Require TLS at the public boundary; set secure, HTTP-only, same-site session
  cookies and rotate sessions after authentication or privilege changes.
- Enforce authorization server-side for every object operation and integration
  callback. Test cross-user and cross-organization access paths.
- Keep secret encryption keys out of source control; support rotation with a
  documented re-encryption strategy. Never log secrets or raw customer SQL
  results.
- Protect outbound GitHub and database fetches from SSRF, DNS rebinding,
  redirects to private networks, hostile clone URLs and oversized payloads.
- Apply bounded retries, timeouts, circuit behavior and concurrency to every
  upstream and worker path. Rate limits should use the real client identity
  only behind a configured trusted proxy chain.
- Run dependency, secret and static analysis checks in CI. Triage findings and
  document exceptions with expiry dates.

### Reliability and performance

- Use readiness checks that verify only the dependencies required to serve
  traffic; liveness must not restart a healthy process because a downstream
  dependency is temporarily unavailable.
- Make analysis, scheduled scans, webhook delivery and telemetry polling
  idempotent. Track retry count, terminal reason, queue age and dead-letter
  state.
- Define operational objectives after recording a baseline. Initial candidate
  measurements: API p95 by route, login success/error rate, queue wait time,
  analysis completion/failure by repository size, worker memory, database pool
  saturation and cache hit rate.
- Use pagination, query plans and indexes for measured hotspots. Avoid adding
  cache layers or distributed infrastructure before a benchmark demonstrates
  need.
- Publish a compatibility matrix for app, schema, queue payload, Redis-compatible
  service, and supported database versions.

## 9. Prioritized implementation roadmap

Complexity is relative: **S** = a few focused days, **M** = roughly one to two
weeks, **L** = multiple iterations/teams. Estimates are planning ranges, not
promises; split work after discovery. The audit artifacts linked in each item
are the current evidence base.

| Priority / phase | Deliverable and approach | Dependencies | Complexity | Measurable acceptance |
| --- | --- | --- | --- | --- |
| **P0 / Foundation** | Execute one production-shaped Compose stack with non-development secrets and test login, authorized repository read, analysis job, database persistence, readiness and restart behavior. Record runbook and logs. | Access to a test GitHub OAuth app/repository and deployment secrets. Existing audit records only config validation. | M | A clean environment starts from documented steps; smoke path passes; restart preserves required data; no credential appears in logs. |
| **P0 / Foundation** | Establish CI baseline for Node, client, Go, and Python; resolve the 16 known stale tests against the current UI contract and triage lint failures into owned work. | Decide intended product behavior for the conflicts in `docs/audit/TEST_COVERAGE.md`. | M | Pull requests run deterministic checks; all required suites pass; intentional exclusions are named, tracked and expire. |
| **P0 / Foundation** | Build SBOM and license ledger; inspect Graphify, fonts, WASM grammars, all container bases and transitive packages. Replace Redis 7.4 default image with a pinned Valkey image after compatibility tests. | License review owner; queue/session compatibility tests. | M | Every shipped runtime artifact has an SBOM and reviewed license; no unresolved non-permissive component in the default distribution. |
| **P1 / Core refinement** | Add versioned database migrations and migration/restore integration coverage; establish supported upgrade path. | P0 deploy fixture and current schema inventory. | M | Fresh install and previous-version upgrade produce the same schema; backup restore succeeds with documented RPO/RTO. |
| **P1 / Core refinement** | Consolidate shared analysis rules into a server-owned package/API boundary and remove image-time client-source copies. | Inventory current imports and pin shared contract/version. | M | Client can change without server image build depending on client source paths; API and worker compatibility tests pass. |
| **P1 / Core refinement** | Finish observability baseline: consistent redacted logs, request/job IDs, queue metrics, route and worker timing. Add OpenTelemetry Collector only if self-hosted trace/metric needs are confirmed. | P0 production-shaped run; define initial questions and retention. | M | Operators can trace a sample analysis from request to terminal job without secrets; dashboards/queries show queue age, failures and latency. |
| **P1 / Core refinement** | Establish design-system and accessibility release checks; align documented tokens with shipped CSS and resolve narrow-screen overflow. | Current `client/DESIGN.md` and audit debt. | M | Core flows pass keyboard-only and automated accessibility checks; viewport checks show no unintended horizontal overflow. |
| **P2 / Enterprise** | Define organization/project role matrix, implement real invite lifecycle and membership removal, and emit audit events atomically. | Product decisions for tenant visibility, admin boundaries and retention. | L | Permission matrix tests pass for every route; invitation lifecycle works end to end; audit record exists for each privileged change. |
| **P2 / Enterprise** | Add provider-neutral OIDC SSO using standard OIDC discovery and claims mapping; validate with Keycloak and one compatible provider. | P2 authorization model and session rotation. | L | Login, logout, role mapping, deprovisioning and failure paths are tested; password sign-in remains available per deployment policy. |
| **P2 / Enterprise** | Version and publish external API contracts; add webhook delivery signing/retries/visibility and explicit deprecation policy. | API inventory and consumer list. | M | OpenAPI matches live routes; contract checks pass; webhook replay and retry behavior are tested. |
| **P2 / Enterprise** | Add durable analysis/audit retention and export controls, admin session revocation, and documented data deletion. | Audit schema and legal/contract requirements. | M/L | A workspace admin can export and delete data according to documented retention; deletion is verified across caches and snapshots. |
| **P3 / Growth** | Add optional SCIM provisioning, configurable dashboards and richer enterprise policy only against validated customer demand. | Stable SSO, roles, audit and support ownership. | L | Feature has a named buyer/user need, operational owner, success metric and support plan before implementation. |

### Release scope

**Minimum commercial release gate:** all P0 items; P1 migration and analysis
boundary work; documented supported deployment and recovery; reviewed license
inventory; security and permission regression suite; no known release-blocking
data-loss or cross-tenant access issue.

**Enterprise tier gate:** role matrix and invitation lifecycle, audit events,
OIDC SSO, admin/session controls, retention/export policy, support and incident
process, and customer-facing deployment/upgrade documentation. SCIM and custom
dashboards are later capabilities unless a committed customer contract makes
them necessary.

## 10. Testing, CI/CD and release operations

### Required test layers

1. **Unit:** parsing, authorization policy, credential handling, API
   validation, job idempotency, analysis rules and data transformations.
2. **Integration:** Node/PostgreSQL/Valkey session and queue behavior;
   FastAPI/worker job lifecycle; migrations; connected database read-only
   enforcement; gateway routing and trusted-proxy behavior.
3. **Browser workflow:** register/login, GitHub connection, project creation,
   job progress/failure/retry, saved context, permissions, and a supported DB
   workflow at desktop and narrow width.
4. **Security regression:** unauthenticated access, IDOR, SSRF, CSRF/session
   rotation, rate-limit identity, secret redaction, webhook replay and read-only
   query guarantees.
5. **Operations:** clean deployment, restart, backup/restore, queue restart,
   database unavailable behavior, worker crash/retry and secret rotation.

### Pull request and release pipeline

- Pull request: lockfile installs; formatting/lint/type checks; Node, Go and
  Python tests; client/server builds; dependency vulnerability and secret scans;
  CodeQL; changed API contract checks.
- Nightly or release: integration and browser suites; SBOM generation; license
  policy review; container scan; image build and digest recording.
- Release: immutable tagged artifacts, migration/rollback notes, release
  checklist, deployment smoke test, backup confirmation and a rollback/forward
  repair decision.

The repository currently has a CodeQL workflow, but the full CI pipeline above
is proposed. `docs/audit/TEST_COVERAGE.md` is a dated audit record, not a
current green CI badge; rerun checks before relying on its results.

### Operator runbooks to publish

- First installation and environment configuration.
- Secret generation, storage, rotation and compromise response.
- Upgrade, migration, rollback/forward repair, backup and restore.
- Queue stuck-job inspection and safe retry/dead-letter handling.
- GitHub OAuth/App setup and callback troubleshooting.
- Database connection troubleshooting and customer-side permissions.
- Incident triage, log redaction, security contact and vulnerability response.

## 11. Known limitations, dependencies and risks

- Product Guide is intentionally broader than the currently verified
  production path; implementation status must be maintained as features change.
- Current production Compose uses Redis 7.4, which conflicts with this brief's
  permissive-license criterion. Treat replacement and exact image review as a
  release gate, not a claim that Valkey migration is already complete.
- Python requirements are not version-locked. Git-pinned dependencies require
  source license and supply-chain review.
- Node and Go gateways overlap while routes are being migrated. Missing parity
  checks could create divergent authorization or behavior.
- Startup DDL has no durable migration sequencing; application upgrades may
  be hard to roll back or reproduce.
- No evidence in the checked-in records establishes successful production
  restore, SSO, SCIM, complete telemetry, a full frontend lint pass, or a
  real analysis run against a private GitHub repository.
- Product role, project visibility, invitation, audit retention, and deletion
  policy decisions are needed before promising enterprise governance.
- External provider availability, GitHub API limits, database permissions,
  optional OpenAI billing/data handling, and image registry changes affect
  deployment behavior and must be documented per deployment.

## 12. Release-readiness checklist

- [ ] Capability status in `PRODUCT_GUIDE.md` matches code and verified paths.
- [ ] Clean installation, login, project authorization and analysis smoke flow
      passes in a production-shaped environment.
- [ ] User A cannot read or mutate user B's organization/project data through
      any route, cache, export or job status endpoint.
- [ ] Secret material is encrypted where stored, rotated by documented
      procedure, and absent from logs, queues and error responses.
- [ ] Default runtime dependency and container image licenses are reviewed;
      SBOM and notices are archived with the release.
- [ ] Versioned migrations upgrade the prior supported version; tested restore
      meets documented recovery objectives.
- [ ] Supported browser workflows, keyboard operation and mobile fallbacks
      pass; known accessibility defects have owners and dates.
- [ ] CI checks and vulnerability policy have owners; exceptions are tracked.
- [ ] Health, queue, error and latency signals are actionable for operators.
- [ ] Release notes, configuration reference, upgrade/rollback, backup,
      recovery, retention and support procedures are published.
- [ ] Optional integrations clearly show setup state, failure behavior and
      data-processing boundaries.

## 13. Evidence and source records

- [Repository architecture](ARCHITECTURE.md)
- [Audit findings](audit/AUDIT_FINDINGS.md)
- [Audit improvement roadmap](audit/IMPROVEMENT_ROADMAP.md)
- [Recorded test coverage and verification](audit/TEST_COVERAGE.md)
- [Analysis engine audit](analysis-engine-audit-and-modernization.md)
- [Application README and declared development commands](../README.md)
