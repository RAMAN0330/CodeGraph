# Graphify Integration Design

## Goal

Use [Graphify](https://github.com/Graphify-Labs/graphify) as the primary source of code-relationship graph data while preserving CodeGraph's existing One Dark Pro workspace, repository selection, metrics, database analysis, and quality views.

## Scope

- Generate Graphify `graph.json` during the existing background repository-analysis task.
- Return Graphify nodes, links, communities, edge types, confidence, and source locations through the existing task-status API.
- Adapt that data to the current graph canvas instead of embedding Graphify's standalone `graph.html` viewer.
- Keep the current browser parser for overview, quality, database, and fallback graph data.
- Do not port Graphify's Python extraction engine to TypeScript or add a second graph UI.

## Dependency

Pin Graphify to repository commit `10ad921b423b767dd8a947bbf0fbcc2e95038ad3` so builds are repeatable:

```text
graphifyy @ git+https://github.com/Graphify-Labs/graphify.git@10ad921b423b767dd8a947bbf0fbcc2e95038ad3
```

The worker image installs this dependency with the existing Python requirements.

## Architecture

### Backend extraction

The existing Celery task already clones the selected repository into a temporary directory. After cloning, it will run Graphify against that directory with visualization and semantic/LLM work disabled. Graphify's local deterministic extraction produces `graphify-out/graph.json`.

The task reads and validates that JSON, removes unsupported or dangling records, caps payload size, and adds it under `result.graphify`. Existing Django introspection continues in the same task result.

The GitHub token remains restricted to repository checkout and is never added to Graphify output or returned to the client.

### API contract

The existing `/api/analyze` and `/api/tasks/{task_id}` endpoints remain unchanged. A completed result gains an optional field:

```json
{
  "graphify": {
    "nodes": [],
    "links": [],
    "hyperedges": [],
    "built_at_commit": "..."
  }
}
```

`graphify` is omitted when extraction fails, preserving compatibility with existing clients and fallback behavior.

### Frontend adapter

A small pure adapter maps Graphify records into the current graph model:

- `id` and `label` identify nodes.
- `source_file`, `source_location`, and `file_type` populate node details.
- `community` and `community_name` drive node grouping and color.
- Link `source`, `target`, `type`/`relationship`, `confidence`, and `confidence_score` populate edges and tooltips.
- Dangling links are discarded defensively.

The workspace starts Graphify analysis alongside the current browser analysis. When Graphify finishes successfully, the Explore graph switches to the adapted Graphify dataset. Overview and other modules continue using the existing analysis object.

## User Experience

- Repository selection and loading behavior do not change.
- The Code graph shows richer symbol-level relationships and community grouping when Graphify data is ready.
- A compact status message distinguishes `Mapping with Graphify`, `Graphify graph ready`, and fallback mode.
- Selecting a node exposes its source file, line, type, community, degree, and incoming/outgoing relationships in the existing inspector.
- Edge details show relationship type and `EXTRACTED`, `INFERRED`, or `AMBIGUOUS` confidence.

## Failure Handling

- Clone failure remains a task failure because no analysis can proceed.
- Graphify failure is non-fatal: Django introspection returns normally and the client retains its current graph.
- Invalid JSON, missing node IDs, and dangling links are rejected or pruned before returning data.
- The worker limits returned nodes and links to prevent oversized Redis/API payloads; the initial limits are 10,000 nodes and 30,000 links.
- Temporary repositories and Graphify output are deleted in the task's existing `finally` block.

## Testing

- Python unit test: Graphify output loading validates, prunes dangling links, and enforces limits.
- Frontend unit test: a representative Graphify fixture maps IDs, communities, confidence, and source locations correctly.
- Integration smoke test: background task result includes `graphify` when extraction succeeds and omits it without failing when extraction raises.
- Existing client production build must pass.
- Docker worker/server/client rebuild and `/api/analyze` task polling must succeed for a small public repository.

## Acceptance Criteria

1. The Explore graph renders Graphify nodes and links inside the existing One Dark Pro canvas.
2. Overview, Quality, Database, Git history, export, and authentication continue to work.
3. Graphify edge type and confidence are visible from the graph inspector.
4. A Graphify error does not prevent the existing graph from rendering.
5. No iframe, duplicate navigation, or separate Graphify interface is introduced.
