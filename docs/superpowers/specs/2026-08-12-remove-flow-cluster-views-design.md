# Remove Flow and Cluster Explore Views

## Goal

Remove the Flow and Cluster visualization choices from the repository Explore workspace. After this change, the visualization selector exposes only Tree and Bundle, with Tree remaining the default.

## Scope

- Remove the Explore selector buttons for Flow and Cluster.
- Remove the Explore rendering branches that are reachable only through those choices.
- Keep Tree and Bundle behavior unchanged.
- Keep database-schema Flow views and unrelated internal flow logic unchanged.
- Do not add replacement views, redirects, or compatibility abstractions.

## Behavior

Selecting a repository opens Explore in Tree view. Users can switch between Tree and Bundle only. Existing saved in-memory state is not persisted across deployments, so no migration is required.

## Testing

- Update the workspace UI source-level regression test to require Tree and Bundle and reject Graph, Flow, and Cluster selector entries and render branches.
- Run the focused workspace test, the complete test suite, and the production client build.
- Rebuild and restart the production client container, then verify the served asset no longer contains the removed selector labels.

## Error Handling

No new runtime error path is introduced. Removing the selector and its matching branches prevents users from entering the removed visualization modes.
