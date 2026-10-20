# Product plan: from dashboards to a workspace that answers "what should I do next?"

Status: proposal, 2026-10-20. Builds on [MODERNIZATION_PLAN.md](MODERNIZATION_PLAN.md) (platform phases) and adds the product layer on top of it.

## 1. The problem we solve

Teams inherit code and databases they did not write, and the cost is the time between "something is wrong or I need to change this" and "I know where, why, and who can help". Today that time goes to reading code, asking colleagues, and guessing what a change will break. A dashboard shows numbers; it does not shorten that time.

**Promise:** open a project and in under a minute know (1) what needs attention now, (2) why it matters, (3) what to do about it, and (4) what else it touches, across code and database together.

## 2. Users and their jobs

| User | Job to be done | Today's pain |
|---|---|---|
| New or rotating engineer | Understand an unfamiliar repo and database fast | Weeks of reading; tribal knowledge |
| Tech lead / EM | Decide what to fix first and justify it | Debt is invisible; no ranking |
| Reviewer | Know the blast radius of a PR | Diffs hide dependents and tables |
| DBA / backend dev | Keep the database healthy and safe to query | Separate tools for stats, schema, SQL |
| Security / compliance owner | Prove who did what, keep prod safe | No audit trail, shared credentials |

## 3. What makes this more than a dashboard

1. **Needs-attention feed (per project).** One ranked list that merges findings: vulnerable reachable dependencies, high-churn complex files, dependency cycles, unused code, poorly covered widely used files, firing database alerts, slow queries, tables without a primary key, schema drift. Each item states why it matters, the effort, and a link to the page that fixes it. Dismiss and snooze are saved per project.
2. **Code and database in one graph.** The table-usage analysis already links tables to code. Make it navigable both ways: from a table to the endpoints and files that use it, and from an endpoint to the tables it reaches. Impact questions ("what breaks if I change `orders.status`?") become one click.
3. **Safe change.** Before-you-merge view: for a PR, the files, endpoints and tables affected, the owners to ask, and the coverage of what it touches. For SQL: read-only by default, explain plans, and typed confirmation for writes on connections labelled prod.
4. **Continuity.** Resume where you left off on any device, digest emails of what changed since you last looked (weekly digest exists), and "N commits behind" sync status.
5. **Proof.** Audit log, roles and exportable reports so a team can adopt it formally.

## 4. Monetisation (assumption: seat-based SaaS)

| Plan | Who | Includes |
|---|---|---|
| Free | Individuals, public repos | 1 project, public GitHub repos, schema and overview for one database, community support |
| Team | Engineering teams | Private repos, organizations, unlimited projects, PR review bot, digests, SQL workspace, saved queries, 90-day history |
| Business | Larger orgs | SSO, audit log, roles and teams, prod safeguards, retention controls, SLA |

Gates are enforced in the API (plan and role checks), never only hidden in the UI.

## 5. System design

### Components
```
Browser (React/Vite)  ──HTTPS──►  Gateway (Node today, Go/Rust target)
  workspace shell                    auth, sessions, orgs/roles, audit
  attention feed                     GitHub read proxy (ETag cache)
                                     DB telemetry + SQL workspace (read-only)
                                     job API ──► Redis/BullMQ ──► analysis workers
Postgres (app data)  ◄──────────────┘     (parse, graph, hotspots, security)
```
The attention feed is a pure function of data the client already receives (analysis result, database overview), so slice 1 needs no backend change. Server-side persistence (dismissals, snooze, history) is added in slice 3.

### Attention item model
```
{ id, source: 'code'|'database', kind, severity: critical|high|medium|low,
  title, why, effort: 'minutes'|'hours'|'days', score, target: {section, ref?} }
```
Score = severity weight × reach (dependents, affected rows or endpoints) so a vulnerable package reachable from 12 files outranks one reachable from 1. Ranking is deterministic and unit-tested.

### Data and API changes (later slices)
- `attention_state(project_id, item_id, user_id, state, until)` for dismiss and snooze.
- `analysis_history` already exists; add a diff endpoint ("new since last analysis") feeding a "what changed" strip.
- `audit_log(org_id, actor, action, resource, at, meta)` written by the gateway middleware.
- Plan and role checks centralised in one authorisation module.

### Non-functional targets
- First useful paint of the feed within 1 s of analysis data arriving; ranking runs in the browser in under 50 ms for 10k files.
- Database access stays read-only unless a connection is explicitly opted in and the user is an editor.
- No secrets in browser storage; GitHub tokens server-side only (done in PR #1).

### Trade-offs
- Client-side ranking now: fastest to ship and testable, but dismissals are per browser until slice 3. Revisit when teams share a project.
- Rules-based scoring, not ML: explainable ("why is this #1?"), easy to tune. Revisit when we have usage data on which items people act on.
- Keeping the Node gateway while Go/Rust replaces it: the feed does not depend on the gateway, so the migration is not blocked.

## 6. Delivery slices

1. **Needs-attention feed** on both Overview pages, with deep links and tests. (Codebase first, then database.)
2. **Impact view**: table ↔ code navigation; PR blast radius.
3. **Persistence**: dismiss and snooze, "since your last visit", sync status.
4. **Teams**: roles, audit log, plan gates (Phase 4 of the modernization plan).
5. **Onboarding**: connect GitHub and a database, first feed in under 5 minutes, sample project.

## 7. Success measures
Time from opening a project to first action; share of feed items acted on or dismissed with a reason; weekly active projects; free-to-team conversion.

## 8. Open questions for the owner
- Which plan limits matter most to you (projects, seats, history length)?
- Is a hosted-only product acceptable, or do customers need self-hosting?
- Which database engines come after Postgres and MySQL?
