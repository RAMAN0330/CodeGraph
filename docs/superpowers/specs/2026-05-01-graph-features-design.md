# Graph Features — Execution Flow + File Drill-Down Design Spec

## Goal
Two enhancements to the D3 force graph: (1) a "Call Flow" toggle that shows individual function-call edges with labels instead of aggregated file-import edges, and (2) a file node click drill-down that opens a mini function-level graph for that file.

## Architecture
Both are purely client-side changes to WorkspaceArea.tsx. No new API calls. Data already available in `data.connections` (has `fn`, `source`, `target`, `count` per function call) and `data.functions` (has all function names per file).

## Current Graph Setup (as-built reference)

From WorkspaceArea.tsx line 1180–1340:

- Nodes are built at line 1181: `var nodes = filteredFiles.map(function(f){return {id:f.path, name:f.name, folder:f.folder, fnCount:f.functions.length, layer:f.layer, churn:f.churn||0};})`
- Links are **aggregated** at lines 1182–1190: connections are deduplicated by `source|target` key into a `linkMap`, summing `.count`
- The `link` D3 selection is a `<path>` with `marker-end='url(#arr)'`, stroke-width scaled by `sqrt(d.count)*0.3`
- The tick handler (lines 1326–1335) updates both link paths and node `transform`, with hull updates throttled by `hullInterval` (already 5 ticks for large graphs, 1 for small)
- Node click handler (line 1295): `node.on('click', function(e,d){ e.stopPropagation(); if(selectFileRef.current) selectFileRef.current(d.id); })`
- SVG element referenced via `svgRef.current`; main graph useEffect dependency array ends with `[data, colorMap, colorMode, theme, folderFilter, graphConfig]`

---

## Feature 1: Execution Flow Toggle

### Toggle UI
Button group in graph controls: "File View" | "Call Flow". Default = File View (current behavior).

### Call Flow Mode
- Each connection entry becomes its own edge (not aggregated by source+target file pair)
- Edge label = `fn` field (function name being called), shown at midpoint of edge
- Multiple thin arrows between same two files instead of one thick arrow
- Arrow stroke-width = 1px (vs current variable width by count)
- On edge hover: tooltip showing `callerFile → functionName → calleeFile`
- Same directional arrows (marker-end `url(#arr)` already exists)

### Data
`data.connections` already has `[{source, target, fn, count}]` — render one SVG path per entry in Call Flow mode instead of deduplicating via `linkMap`. Raw links must still be filtered to only include nodes present in `filteredFiles` (same `fileIds` check at line 1184).

### Conditional link building
```javascript
var rawLinks = [];
(data as any).connections.forEach(function(c){
  if(!fileIds.has(c.source)||!fileIds.has(c.target)) return;
  if(c.source===c.target) return;
  rawLinks.push({source:c.source, target:c.target, fn:c.fn||'', count:c.count||1});
});
var links = callFlowMode ? rawLinks : Array.from(linkMap.values());
```

### Edge label selection
After creating the `link` path selection, create a sibling `linkLabel` text selection:
```javascript
var linkLabel = linkLayer.append('g').selectAll('text')
  .data(callFlowMode ? rawLinks : [])
  .enter().append('text')
  .attr('font-size', 9)
  .attr('fill', '#8b949e')
  .attr('text-anchor', 'middle')
  .attr('dy', -3)
  .attr('pointer-events', 'none')
  .text(function(d){ return d.fn || ''; });
```

### Tick handler addition
Inside the existing `sim.on('tick', ...)` block (line 1326), after the `node.attr('transform', ...)` line:
```javascript
if(linkLabel) {
  linkLabel.attr('x', function(d){ return ((d.source.x||0)+(d.target.x||0))/2; })
           .attr('y', function(d){ return ((d.source.y||0)+(d.target.y||0))/2; });
}
```

### State and dependency
- Add state: `var _cfm = useState(false), callFlowMode = _cfm[0], setCallFlowMode = _cfm[1];`
- Add `callFlowMode` to the graph useEffect dependency array alongside `graphConfig`

### Files
- Modify: `client/src/pages/WorkspaceArea.tsx` — add `callFlowMode` state, toggle button in graph controls, conditional link rendering, `linkLabel` selection, tick handler update

---

## Feature 2: File Drill-Down Mini Graph

### Trigger
Click a file node in the D3 graph → opens a floating panel (400×400px) positioned near the node. Currently the click handler only calls `selectFileRef.current(d.id)` — we extend it to also set drill-down state.

### Position calculation
```javascript
// In node click handler, after existing selectFileRef call:
var rect = svgRef.current ? svgRef.current.getBoundingClientRect() : {left:0, top:0};
setDrillDown({file: d, x: rect.left + (d.x||0) + 20, y: rect.top + (d.y||0) - 100});
```

`d.x` and `d.y` are the D3 simulation coordinates in SVG space. The panel is positioned in `fixed` layout so screen-space coordinates from `getBoundingClientRect()` + simulation coords work correctly (assuming no zoom transform offset — a limitation: zoomed graphs will have offset; acceptable for v1).

### Content: Mini Function Graph
- Nodes = all functions in the clicked file from `data.functions` (or `allFns` built during analysis) where `f.file === clickedFile.path`
- Edges = intra-file function calls detected by scanning each function's `code` field for occurrences of other function names in the same file (string includes check: `fn.code.includes(other.name + '(')`)
- External incoming/outgoing calls are out of scope for v1 (too expensive to compute on the fly without pre-built indexes)

### Mini graph rendering
- Separate D3 force simulation inside a `useEffect` with a local `svgRef`; disposed via `sim.stop()` on cleanup
- Node radius = 14px
- Node fill: `#1a3a1a` if exported, `#1c2128` if internal; stroke: `#3fb950` / `#30363d`
- Edge arrows: new `<marker id="dd-arr">` scoped to the mini SVG defs
- Node labels: truncated function name, `font-size: 8px`

### Panel UI
- `position: fixed` (not `absolute`) so it stays on screen regardless of scroll
- `left: clampedX, top: clampedY` clamped to `window.innerWidth - 420` and `window.innerHeight - 380`
- Header: `{file.name} — {fileFns.length} functions` + × close button
- Empty state: "No functions found in this file" message
- No scroll; mini SVG is fixed at 380×320

### Error handling
- 0 functions: show empty state text, no SVG rendered
- Escape key: close panel (add to existing keydown listener or new `useEffect` in WorkspaceArea)
- `sim.stop()` always called in `useEffect` cleanup

### Files
- Create: `client/src/components/FileDrillDown.tsx`
- Modify: `client/src/pages/WorkspaceArea.tsx`
  - Add `import FileDrillDown from '../components/FileDrillDown'`
  - Add state: `var _dd = useState(null), drillDown = _dd[0], setDrillDown = _dd[1]`
  - Extend node click handler with position + `setDrillDown` call
  - Render `FileDrillDown` conditionally in return JSX (outside the SVG, inside the wrapper div)
  - Add Escape key handler to clear `drillDown`

---

## Error Handling Summary
| Condition | Handling |
|---|---|
| Call Flow with 0 connections | No edges rendered; graph shows nodes only |
| Drill-down with 0 functions | Panel shows "No functions found in this file" |
| Mini sim on panel close | `sim.stop()` called in useEffect cleanup |
| Panel out of viewport | Clamped to `window.innerWidth - 420` / `window.innerHeight - 380` |
| D3 not available in FileDrillDown | `import * as d3 from 'd3'` — already a project dep |
