# System Architecture View

## Goal

Replace the existing basic SVG inside the System Architecture section with a validated, system-level architecture experience inspired by GitDiagram. Do not add it to the Explore graph area or visualization selector.

## Placement

- The feature lives only under the existing `activeSection === 'architecture'` route.
- The Cosmos dependency graph remains the detailed file-level graph in Explore.
- The current `ArchitectureDiagram` implementation is replaced in place.

## Architecture Contract

```ts
type ArchitectureGraph = {
  version: 1;
  summary: string;
  groups: ArchitectureGroup[];
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
};
```

Groups contain a stable ID, label, description, and display order. Nodes contain a stable ID, group ID, label, description, kind, and one or more real repository paths. Edges contain source, target, label, and evidence paths.

Allowed node kinds are `ui`, `api`, `service`, `data`, `infrastructure`, `test`, and `external`.

## Deterministic Generation

- Build the initial architecture immediately from repository analysis and Graphify data.
- Classify files using analyzed layers, file types, paths, manifests, and framework conventions.
- Aggregate files into bounded components rather than rendering every file.
- Aggregate connections between components and keep evidence paths for each edge.
- Reject dangling edges, unknown group IDs, duplicate IDs, and repository paths that do not exist in the analyzed file set.
- Bound the output to at most 10 groups, 60 components, 120 edges, and 8 evidence paths per edge.

## Optional AI Enrichment

- Show a `Generate explanation` action in System Architecture.
- AI may improve the architecture summary, group labels, node labels, and descriptions.
- AI may not add or remove IDs, paths, groups, nodes, or edges.
- Validate enriched output against the deterministic graph before applying it.
- If enrichment fails, retain the deterministic diagram and show a non-blocking error.

## Rendering

- Compile the validated architecture graph to Mermaid flowchart syntax with ELK layout.
- Escape all identifiers and text before compilation.
- Render Mermaid in strict security mode and sanitize the generated SVG.
- Draw groups as subgraphs and components as typed nodes.
- Clicking a component opens its primary repository path through the existing file inspector.
- Hovering a component shows its description and supporting paths.

## Page Layout

- Header: `System Architecture`, repository name, generation status, and action buttons.
- Summary panel: concise architecture explanation and validation status.
- Main diagram: responsive pan/zoom Mermaid canvas.
- Details panel: selected component description, kind, files, incoming/outgoing connections, and evidence.
- Actions: `Generate explanation`, `Copy Mermaid`, and `Download PNG`.
- States: loading skeleton, empty repository, deterministic fallback, enrichment error, and export error.

## Data Flow

Repository and Graphify analysis are normalized into `ArchitectureGraph`. Validation runs before rendering. Optional enrichment receives only the bounded validated graph and returns text updates keyed by existing IDs. The compiler produces Mermaid; selection resolves validated repository paths through the existing inspector callback.

## Security

- Never render raw model-generated Mermaid.
- Validate every path against the analyzed repository.
- Escape all compiler-controlled Mermaid text.
- Use strict Mermaid security configuration and DOM sanitization.
- Do not place GitHub tokens or source contents in export metadata.

## Verification

- Unit-test deterministic grouping, bounds, path validation, edge aggregation, and Mermaid escaping.
- Test that enrichment cannot introduce new IDs or paths.
- Test node selection opens only validated paths.
- Test copy and PNG export failure states.
- Run the complete repository test suite and production build.
- Browser-test the System Architecture section when a browser is available.
