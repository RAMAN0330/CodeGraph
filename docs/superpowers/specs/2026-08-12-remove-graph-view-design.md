# Remove Graph View

## Scope

Remove only the `Graph` visualization from the repository workspace. Keep the file explorer, file details, and the `Tree`, `Flow`, `Cluster`, and `Bundle` visualizations.

## Behavior

- The visualization selector no longer shows `Graph`.
- `Tree` becomes the default visualization when the workspace opens.
- No grouped Sigma graph model, focus controller, WebGL renderer, graph-specific toolbar, or Graphify graph status is constructed or mounted from the workspace.
- Existing repository analysis and the remaining visualization data flow stay unchanged.
- Navigation to Explore continues to open the repository explorer, now showing Tree.

## Code Changes

- Remove Graph-only imports, state, memoized models, effects, handlers, and render branches from `LegacyWorkspaceEngine.tsx`.
- Remove Graph from the visualization selector and settings/view assertions.
- Keep standalone grouped-graph source files unless they become safely removable without affecting unrelated work; they will no longer be reachable from the workspace bundle.
- Update focused workspace tests to assert that Graph is absent and Tree remains available.

## Error Handling

Removing the Graph runtime path eliminates its layout and WebGL failures. The existing loading and error behavior for repository analysis and the remaining views is unchanged.

## Verification

- A regression test confirms the workspace no longer imports or renders the grouped graph and no longer exposes a Graph button.
- Workspace UI tests confirm Tree, Flow, Cluster, and Bundle remain.
- The complete test suite and production client build must pass.
