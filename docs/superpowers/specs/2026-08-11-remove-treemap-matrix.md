# Remove Treemap and Matrix Views

## Goal

Remove the Treemap and Matrix visualization choices from the workspace.

## Changes

- Remove the Treemap and Matrix buttons from the visualization selector.
- Remove their render containers and refs.
- Remove the D3 effects that render those two views.
- Keep Graph, Tree, Flow, Cluster, and Bundle unchanged.
- Do not change repository analysis data, APIs, or backend behavior.

## Verification

- Assert that workspace source no longer exposes Treemap or Matrix visualization controls.
- Confirm the remaining visualization controls are present.
- Run the workspace tests and production client build.
