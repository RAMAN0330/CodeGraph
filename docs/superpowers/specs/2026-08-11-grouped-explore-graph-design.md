# Grouped Explore Graph Design

## Goal

Replace the current unlabeled Cosmos file cloud in Explore with a performant, deterministic dependency graph whose folder communities, file names, and cross-folder relationships are visually understandable.

This change applies only to the Explore Code Graph. The System Architecture diagram remains separate and unchanged.

## Primary Experience

The graph renders files as labeled nodes inside visible folder containers. Containers use a stable left-to-right dependency layout so the same repository produces the same visual structure between visits. The default view shows the repository's connected file graph without requiring hierarchical drill-down.

Each folder container displays:

- the folder name;
- its file count;
- its file nodes;
- an expand control when density limits hide lower-priority files.

Each file node displays its filename. Its repository path remains available through hover, search, and the existing file inspector.

## Graph Model

### Nodes

One graph node represents one repository file. Function definitions remain in the existing inspector and do not become graph nodes.

Each node includes:

- stable repository path ID;
- filename label;
- parent folder ID;
- file type or extension;
- incoming and outgoing dependency counts;
- existing analysis metadata used by the inspector.

### Edges

One directed edge represents an analyzed file dependency. Duplicate source-target relationships are aggregated. Self-links and dangling links are rejected.

Edges are classified as:

- internal: both files belong to the same folder container;
- cross-folder: source and target belong to different containers.

Cross-folder edges use a visually stronger but still subdued style and route between container boundaries. Selecting a node reveals edge direction and relationship details more prominently.

### Folder Groups

The immediate analyzed folder path is the default grouping key. Root files belong to a `root` group. Groups with no visible files are omitted.

Folder groups are ordered deterministically from dependency sources to dependency sinks, with path name as the stable tie-breaker.

## Layout

Use Sigma.js as the WebGL renderer. Compute deterministic node positions before rendering:

1. Build the folder dependency graph from cross-folder edges.
2. Assign folder containers to left-to-right dependency ranks.
3. Place containers in stable path order within each rank.
4. Lay out files within each container using a compact deterministic grid or local force pass.
5. Reserve horizontal and vertical space based on label width and visible node count.

Folder boundaries and headings render as a canvas or HTML layer behind Sigma. Their positions derive from the same layout coordinates as file nodes.

The layout must not continuously simulate after settling. This avoids visual movement, unnecessary CPU work, and unstable labels.

## Label Rules

Readable filenames are a first-class requirement.

- Selected and hovered node labels are always visible.
- High-connectivity entry points are visible at the initial fit.
- Remaining filenames appear as zoom provides sufficient room.
- Collision detection suppresses the lower-priority label when two labels overlap.
- Suppressed labels are never inaccessible: search, hover, and zoom reveal them.
- Labels use a solid dark backing or halo to remain readable over edges.
- Full repository paths appear in tooltips and the inspector rather than permanently on the canvas.

The renderer must not promise every filename simultaneously at repository-fit scale; doing so recreates the current overlap problem. It must make every filename reachable and readable without changing graph levels.

## Density Management

The initial view prioritizes connected code files. For a dense folder, show the most connected files up to a per-container display budget and expose an `Expand` action for the remainder.

Expanding a folder affects only that container and triggers a deterministic layout update. It does not replace the entire graph or create a drill-down level.

Disconnected files appear in a clearly labeled `Unconnected files` area so they do not distort the dependency layout.

## Interaction

### Selection

Clicking a file:

- opens it in the existing file inspector;
- keeps its filename visible;
- highlights direct incoming and outgoing neighbors;
- emphasizes related edges and their direction;
- fades unrelated nodes, groups, and edges without removing them.

Clicking the empty stage clears focus and restores the complete graph.

### Search

The existing workspace search should find file nodes by filename or path. Selecting a result centers and zooms the graph to that node, then applies the normal focused selection state.

### Display Mode

A compact `All files / Focus selected` control determines whether unrelated nodes remain faded or are temporarily hidden. `All files` is the default.

Zoom, fit, reset, folder filters, and the existing inspector continue to work.

## Performance

- Use Sigma.js WebGL rendering for file nodes and edges.
- Do not render function nodes.
- Aggregate duplicate edges before passing them to the renderer.
- Recompute layout only when graph data, folder expansion, or active filtering changes.
- Avoid React state updates during pointer movement except for the active tooltip or label.
- Keep container and label overlays synchronized using Sigma camera transforms.
- Lazy-load the Explore renderer so other sections do not pay its bundle cost.

For repositories beyond the safe renderer limit, apply the same per-folder visibility budget and show an explicit count of hidden files rather than silently dropping them.

## States and Errors

- Empty analysis: explain that no dependency graph is available.
- No connected files: show the unconnected area with filenames and search.
- Layout failure: fall back to a deterministic folder grid with internal file grids.
- WebGL unavailable: show a clear compatibility message instead of a white screen.
- Selected file removed by filtering: clear selection and retain the current camera position.

## Accessibility

- Controls and search results are keyboard accessible.
- Folder and node colors are not the sole source of meaning; headings, labels, and edge direction remain explicit.
- Focus rings are visible.
- Tooltips do not contain information unavailable elsewhere in the inspector.

## Testing

Pure graph-model tests cover:

- duplicate and dangling-edge pruning;
- folder grouping and root-file handling;
- deterministic group and node ordering;
- dependency rank calculation;
- dense-folder visibility budgets;
- unconnected-file separation;
- selection neighborhood derivation.

Renderer tests cover:

- node click and stage-clear callbacks;
- label-priority behavior;
- search centering;
- folder expansion;
- WebGL failure fallback.

Production verification includes TypeScript build, repository tests, Docker rebuild, HTTP health, and browser interaction checks when a browser backend is available.

## Out of Scope

- Hierarchical folder-to-function drill-down levels;
- function nodes on the Explore canvas;
- changes to the System Architecture section;
- AI-generated graph topology;
- a continuously moving force simulation.
