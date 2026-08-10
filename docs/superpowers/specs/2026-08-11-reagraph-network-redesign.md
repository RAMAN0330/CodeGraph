# Reagraph Network Redesign

## Goal

Replace the main repository network's Sigma renderer with Reagraph so nodes remain visually distinct as the repository grows. Preserve all non-network visualizations and the existing workspace interaction model.

## Scope

- Replace only the `Graph` view renderer.
- Keep the Graphify adapter and existing repository analysis data unchanged.
- Preserve folder filtering, community/folder colors, call-flow mode, tooltips, zoom controls, stage clearing, node selection, and the right file inspector.
- Keep Treemap, Matrix, Tree, Flow, Cluster, and Bundle on their current renderers.

## Visual Design

- Use Reagraph's WebGL canvas and force-directed layout.
- Increase node and cluster separation so node circles do not overlap at rest.
- Bound node size to a narrow range; encode importance without allowing high-degree nodes to obscure neighbors.
- Use progressive labels: show labels that fit at the current zoom, reveal a node's full label on hover or selection, and suppress colliding labels. Every node remains visible even when its label is suppressed.
- On hover, emphasize the node and its immediate connections. On selection, retain emphasis and dim unrelated graph elements.
- Fit the settled graph within the available canvas, accounting for the right inspector.
- Retain the existing dark theme, folder/community palette, dotted canvas background, and toolbar placement.

## Component Boundary

`ReagraphCanvas` receives normalized nodes and edges from `LegacyWorkspaceEngine`. It owns only rendering, layout, camera controls, hover state, and translating Reagraph events into the existing callbacks. The workspace continues to own selected files, filters, tooltips, and inspector content.

The component exposes `zoomIn`, `zoomOut`, `reset`, and `fit` through its ref so the existing toolbar does not change.

## Data Rules

- Preserve duplicate call-flow edges when call-flow mode is enabled.
- Aggregate ordinary dependency edges by source and target.
- Drop dangling edges and self-links before rendering.
- Use stable repository identifiers for nodes and edges.
- Derive cluster identity from Graphify community/folder information.

## Performance

- Avoid React elements per graph node or edge.
- Memoize normalized graph data.
- Do not update workspace state on layout ticks.
- Disable expensive always-on labels and edge labels for dense graphs.
- Re-layout only when graph data, filtering, call-flow mode, or layout settings change.

## Failure and Empty States

- Render a small empty-state message when filtering produces no nodes.
- Keep the rest of the workspace usable if the graph renderer cannot initialize.
- Clean up WebGL resources and listeners when switching visualization or leaving the page.

## Verification

- Unit-test graph normalization: duplicate edges, dangling edges, self-links, node metadata, sizes, and colors.
- Build the production client.
- Exercise zoom, fit, hover, node selection, stage clearing, folder filtering, and call-flow mode in the browser.
- Compare the rendered graph against the supplied screenshot and require distinct nodes, reduced label collisions, and no blank screen after node selection.
