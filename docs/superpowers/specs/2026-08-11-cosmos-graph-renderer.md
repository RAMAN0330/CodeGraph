# Cosmos Graph Renderer

## Goal

Replace the slow Reagraph network with Cosmos.gl so repository graph layout and rendering run on the GPU.

## Scope

- Replace only the main `Graph` visualization.
- Remove Reagraph and its Three.js dependency chain.
- Keep Graphify and repository analysis data unchanged.
- Preserve community/folder colors, filtering, Call Flow, node selection, the file inspector, zoom, fit, reset, and stage clearing.
- Keep Tree, Flow, Cluster, and Bundle unchanged.

## Rendering Design

- Use `@cosmos.gl/graph` for GPU layout and rendering.
- Use bounded point sizes and cluster-aware forces.
- Do not render permanent labels for every node.
- Render a lightweight HTML label and tooltip only for the hovered or selected node.
- Emphasize the selected node and its immediate neighbors; dim unrelated elements when supported without rebuilding graph data.
- Fit the graph after data is loaded and preserve smooth camera interaction.

## Component Boundary

`CosmosGraphCanvas` receives normalized nodes and links and translates Cosmos index-based events back to existing workspace node objects. It owns the renderer lifecycle and camera controls. `LegacyWorkspaceEngine` continues to own filtering, selected files, tooltips, and inspector state.

## Performance Requirements

- No React component per node or edge.
- No CPU force simulation.
- No workspace state updates during simulation frames.
- Reinitialize only when graph data or layout-affecting settings change.
- Lazy-load the renderer so other workspace views do not download it.

## Verification

- Test stable indexed normalization, dangling/self-edge removal, metadata, colors, and bounded sizes.
- Run the complete test suite and production build.
- Compare the new renderer chunk with Reagraph's approximately 1.3 MB chunk.
- Rebuild the live client and verify HTTP serving.
- Browser-test graph rendering, hover, selection, inspector opening, stage clearing, zoom, fit, filtering, and Call Flow when a browser is available.
