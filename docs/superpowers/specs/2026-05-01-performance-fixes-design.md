# Performance Fixes Design Spec

## Goal
Eliminate UI freezes on large repos. Five targeted fixes: graph node cap, D3 tick throttling, debounced graph config, analysis progress with cancellation, and hull computation cache.

## Current Performance Characteristics (as-built reference)

From WorkspaceArea.tsx:

- **Nodes** (line 1181): built from `filteredFiles.map(...)` — no cap, all files become nodes
- **alphaDecay** (line 1286–1288): already adaptive — `0.08` for `nodes.length > 300`, else `0.05`
- **Hull throttle** (lines 1323–1334): already throttled — `hullInterval = isLargeGraph ? 5 : 1` where `isLargeGraph = nodes.length > 300`. Hull recompute happens every `tickCount % hullInterval === 0` ticks
- **Tick handler** (lines 1326–1335): synchronous, every tick, no RAF batching
- **SOFT_LIMIT / HARD_LIMIT** (line 408): `SOFT_LIMIT = 300, HARD_LIMIT = Infinity` — no hard cap on file analysis
- **Large-repo warning** (lines 410–412): notification shown for `> 2000` files but analysis proceeds unconditionally
- **processFiles** (lines 445–462): concurrent worker pool (6 workers), yields every 24 completed files via `await new Promise(r => setTimeout(r, 0))`, no cancellation
- **graphConfig** changes (line 1339 dependency array): any `graphConfig` change immediately re-runs the full graph useEffect, restarting the simulation from scratch

---

## Fix 1: Graph Node Cap (200 nodes max)

### Problem
With 500+ files, D3 force simulation becomes sluggish. All files currently become nodes regardless of count.

### Logic
Score each file: `score = connections_degree + fnCount` where `connections_degree` is the sum of in-degree and out-degree from `data.connections`. Take top 200 by score when `showAllNodes` is false.

### Implementation location
After line 1181 where `nodes` is built, before the `linkMap` construction at line 1182. The `filteredFiles` array is already available at this point.

### Cap code
```javascript
var totalNodeCount = nodes.length;
if(!showAllNodes && nodes.length > 200) {
  var connCount = {};
  ((data as any).connections||[]).forEach(function(c){
    connCount[c.source] = (connCount[c.source]||0) + 1;
    connCount[c.target] = (connCount[c.target]||0) + 1;
  });
  nodes = nodes.slice().sort(function(a,b){
    var sa = (connCount[a.id]||0) + (a.fnCount||0);
    var sb = (connCount[b.id]||0) + (b.fnCount||0);
    return sb - sa;
  }).slice(0, 200);
}
```

Note: after capping nodes, the `fileIds` set and `linkMap` must be rebuilt from the capped `nodes` array so links only reference nodes that exist in the simulation. Move `fileIds` reconstruction after the cap.

### UI
Yellow banner rendered above the graph SVG when `totalNodeCount > 200 && !showAllNodes`. "Show all" button sets `showAllNodes = true`.

### State
`var _san = useState(false), showAllNodes = _san[0], setShowAllNodes = _san[1];`

Add `showAllNodes` to graph useEffect dependency array.

### Files
- Modify: `client/src/pages/WorkspaceArea.tsx`

---

## Fix 2: D3 Tick Throttle + Early Freeze

### Problem
The synchronous tick handler (line 1326) blocks the main thread on every simulation tick. For 300+ nodes this can be 16ms+ per tick, causing jank.

### RAF batching
The current tick handler sets DOM attributes synchronously. Replace with a flag-and-RAF pattern:

```javascript
var _needsRender = false;
var _rafId = null;

function _doRender() {
  if(graphConfig.curvedLinks){
    link.attr('d', function(d){
      var dx=d.target.x-d.source.x, dy=d.target.y-d.source.y, dr=Math.sqrt(dx*dx+dy*dy);
      return 'M'+d.source.x+','+d.source.y+'A'+dr+','+dr+' 0 0,1 '+d.target.x+','+d.target.y;
    });
  } else {
    link.attr('d', function(d){ return 'M'+d.source.x+','+d.source.y+'L'+d.target.x+','+d.target.y; });
  }
  node.attr('transform', function(d){ return 'translate('+(d.x||0)+','+(d.y||0)+')'; });
}

sim.on('tick', function(){
  _needsRender = true;
  tickCount++;
  if(tickCount % hullInterval === 0) updateHulls();
});

function _rafLoop(){
  if(_needsRender){ _doRender(); _needsRender = false; }
  _rafId = requestAnimationFrame(_rafLoop);
}
_rafLoop();
```

Cleanup in useEffect return: `cancelAnimationFrame(_rafId); if(simRef.current) simRef.current.stop();`

### Early freeze for large graphs
The existing alphaDecay (line 1286) already sets `0.08` for `nodes.length > 300`. After the cap (Fix 1), large graphs that would have had 300+ nodes are now capped at 200, so this threshold effectively never fires. Adjust: apply `alphaDecay = 0.08` when `totalNodeCount > 150` (pre-cap total, not post-cap):
```javascript
var alphaDecay = (totalNodeCount > 150) ? 0.08 : 0.05;
```

### Hull throttle
The existing `hullInterval` logic (line 1323–1324) already does this (`isLargeGraph ? 5 : 1`). The RAF change above preserves this by keeping `tickCount % hullInterval` logic in the `sim.on('tick')` callback. No change needed beyond the RAF refactor.

### Files
- Modify: `client/src/pages/WorkspaceArea.tsx` — refactor tick handler, add RAF loop and cancelAnimationFrame in cleanup

---

## Fix 3: Debounce Graph Config Changes

### Problem
Sliders in graph controls (linkDist, spacing) fire `setGraphConfig` on every mouse move. Each change re-runs the full graph useEffect (line 1339 dependency array includes `graphConfig`), restarting the D3 simulation from scratch on every pixel of slider movement.

### Logic
Introduce a debounced mirror of `graphConfig`. The graph useEffect depends on `gcDebounced` instead of `graphConfig`. A separate `useEffect` with a 300ms debounce copies `graphConfig` → `gcDebounced`.

```javascript
// After graphConfig state declaration:
var _gcDebRef = useRef(null);
var _gcDeb = useState(graphConfig), gcDebounced = _gcDeb[0], setGcDebounced = _gcDeb[1];
useEffect(function(){
  if(_gcDebRef.current) clearTimeout(_gcDebRef.current);
  _gcDebRef.current = setTimeout(function(){ setGcDebounced(graphConfig); }, 300);
  return function(){ if(_gcDebRef.current) clearTimeout(_gcDebRef.current); };
}, [graphConfig]);
```

Replace `graphConfig` with `gcDebounced` in the graph useEffect dependency array. Inside the useEffect body, replace all reads of `graphConfig.X` with `gcDebounced.X`.

### Files
- Modify: `client/src/pages/WorkspaceArea.tsx`

---

## Fix 4: Analysis Cancellation + Hard Limit

### Problem
- `HARD_LIMIT = Infinity` means 5000-file repos proceed to full analysis with no opt-out
- The `processFiles` concurrent worker loop (lines 445–462) has no cancellation path; once started, it runs to completion even if the user navigates away or the page becomes unresponsive
- No Cancel button in the UI during analysis

### Hard Limit change
Change line 408 from:
```javascript
var SOFT_LIMIT=300, HARD_LIMIT=Infinity;
```
to:
```javascript
var SOFT_LIMIT=300, HARD_LIMIT=2000;
```

The existing block at lines 410–412 shows an info notification for `> 2000` files. Replace this notification with a blocking confirmation:
```javascript
if(files.length > HARD_LIMIT) {
  var proceed = window.confirm(
    'This repo has '+files.length+' files.\n\n'+
    'Analyzing may take several minutes and could slow the browser.\n\n'+
    'Click OK to continue, or Cancel to abort.'
  );
  if(!proceed) { setLoading(false); setProgress(''); return; }
}
```

### cancelledRef
Add near other refs (search for existing `useRef` declarations):
```javascript
var cancelledRef = useRef(false);
```

At the start of `beginRepoAnalysis` (before `processFiles` is called), reset it:
```javascript
cancelledRef.current = false;
```

Inside `processFiles`, the concurrent workers yield every 24 files (line 455). After each yield, add the cancellation check. Since workers run concurrently, the check must be inside the `worker` while loop:
```javascript
async function worker(){
  while(nextIndex < max){
    if(cancelledRef.current) return; // <-- add this line
    var i = nextIndex++;
    await analyzeFile(files[i], i);
    completed++;
    if(completed%10===0) setProgress('Analyzed '+completed+'/'+max+' files');
    if(completed%24===0) await new Promise(function(r){ setTimeout(r,0); });
  }
}
```

After `Promise.all(workers)`, add:
```javascript
if(cancelledRef.current) { setLoading(false); setProgress(''); return; }
await finishAnalysis();
```

### Cancel button UI
Find where `progress` string is rendered during loading. Add Cancel button adjacent to the progress indicator:
```javascript
loading && cancelledRef && React.createElement('button', {
  onClick: function(){
    cancelledRef.current = true;
    setLoading(false);
    setProgress('Cancelled.');
  },
  style:{
    background:'#6e2222', border:'1px solid #f85149', color:'#f85149',
    borderRadius:6, padding:'4px 12px', fontSize:'0.8rem', cursor:'pointer', marginLeft:8
  }
}, 'Cancel')
```

### Files
- Modify: `client/src/pages/WorkspaceArea.tsx` — add `cancelledRef`, change `HARD_LIMIT`, add confirmation modal, add cancellation check in worker loop, add Cancel button

---

## Fix 5: Hull Computation Cache

### Problem
`updateHulls()` (lines 1306–1322) calls `hullLayer.selectAll('*').remove()` and redraws all hulls on every triggered tick. Even with the existing `hullInterval` throttle (every 5 ticks for large graphs), this is O(folders × nodes_per_folder) DOM work that recreates SVG paths from scratch.

### Cache logic
Track last rendered hull polygon per folder. Only re-render a folder's hull if any of its nodes moved more than 5px since the last hull render.

```javascript
var hullPosCache = {}; // {folder: [{x,y}, ...]}

function positionsChangedSignificantly(folder, currentNodes){
  var prev = hullPosCache[folder];
  if(!prev || prev.length !== currentNodes.length) return true;
  for(var i=0; i<currentNodes.length; i++){
    var dx = (currentNodes[i].x||0) - prev[i].x;
    var dy = (currentNodes[i].y||0) - prev[i].y;
    if(dx*dx + dy*dy > 25) return true; // 5px threshold
  }
  return false;
}

function updateHulls(){
  folders.forEach(function(f){
    var fn = nodesByFolder[f];
    if(!fn || fn.length < 1) return;
    if(!positionsChangedSignificantly(f, fn)) return; // skip if unchanged
    hullPosCache[f] = fn.map(function(n){ return {x:n.x||0, y:n.y||0}; });
    // ... rest of hull rendering for this folder (remove old + add new)
  });
}
```

The `hullLayer.selectAll('*').remove()` must move inside the per-folder update, removing only the specific folder's existing hull path and label. This requires adding a `data-folder` attribute to hull elements to select them per-folder:
```javascript
hullLayer.selectAll('[data-folder="'+f+'"]').remove();
// ... then append new path and text with .attr('data-folder', f)
```

### Files
- Modify: `client/src/pages/WorkspaceArea.tsx` — add `hullPosCache` object inside graph useEffect, refactor `updateHulls` to per-folder incremental update with position-change detection
