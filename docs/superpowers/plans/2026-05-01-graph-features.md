# Graph Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Call Flow toggle (individual function-call edges with labels) and file node drill-down mini graph to the D3 force graph.

**Architecture:** WorkspaceArea.tsx gets `callFlowMode` state + conditional link rendering. New `FileDrillDown.tsx` component with its own mini D3 simulation. All data from existing `data.connections` and `data.functions`.

**Tech Stack:** React 18 (`// @ts-nocheck`), D3 (already imported as `d3`), TypeScript.

---

## Task 1: Call Flow toggle in main graph

**File:** `client/src/pages/WorkspaceArea.tsx`

- [ ] Read lines 1180–1210 to locate: (a) where `nodes` is built, (b) where `linkMap` and `links` are constructed, (c) where graph control buttons are rendered (search for `graphConfig.viewMode` button group or similar)

- [ ] Add `callFlowMode` state near other graph-related states (search for `useState` declarations at the top of the component body, add after the last graph state):
  ```javascript
  var _cfm=useState(false),callFlowMode=_cfm[0],setCallFlowMode=_cfm[1];
  ```

- [ ] Build `rawLinks` alongside the existing `linkMap` so Call Flow mode has per-connection data. In the graph useEffect, immediately after line 1190 (`var links=Array.from(linkMap.values());`), add:
  ```javascript
  // Raw per-connection links for Call Flow mode
  var rawLinks=[];
  (data as any).connections.forEach(function(c){
      if(!fileIds.has(c.source)||!fileIds.has(c.target))return;
      if(c.source===c.target)return;
      rawLinks.push({source:c.source,target:c.target,fn:c.fn||'',count:c.count||1});
  });
  var links=callFlowMode?rawLinks:Array.from(linkMap.values());
  ```
  Note: delete the original `var links=Array.from(linkMap.values());` line and replace with the block above (which re-declares `links`).

- [ ] Find the graph controls area where view mode buttons are rendered (search for `'Force'` or `'Radial'` button labels in the JSX). Add the Call Flow toggle button to that controls area:
  ```javascript
  React.createElement('button',{
      onClick:function(){setCallFlowMode(function(v){return !v;});},
      style:{
          background:callFlowMode?'#238636':'transparent',
          border:'1px solid '+(callFlowMode?'#238636':'#30363d'),
          color:callFlowMode?'#fff':'#8b949e',
          borderRadius:6,padding:'4px 10px',fontSize:'0.75rem',cursor:'pointer',marginLeft:8
      }
  },callFlowMode?'Call Flow ✓':'Call Flow')
  ```

- [ ] In the graph useEffect, after the `link` selection is created (line 1290, the `var link=linkLayer.selectAll('path')...` call), add the `linkLabel` selection for Call Flow edge labels:
  ```javascript
  var linkLabel=linkLayer.append('g').selectAll('text')
      .data(callFlowMode?rawLinks:[])
      .enter().append('text')
      .attr('font-size',9)
      .attr('fill','#8b949e')
      .attr('text-anchor','middle')
      .attr('dy',-3)
      .attr('pointer-events','none')
      .text(function(d){return d.fn||'';});
  ```

- [ ] Update the tick handler (lines 1326–1335) to also position link labels. Inside `sim.on('tick', function(){ ... })`, after the `node.attr('transform', ...)` line, add:
  ```javascript
  if(callFlowMode&&linkLabel){
      linkLabel
          .attr('x',function(d){return((d.source.x||0)+(d.target.x||0))/2;})
          .attr('y',function(d){return((d.source.y||0)+(d.target.y||0))/2;});
  }
  ```

- [ ] In Call Flow mode, set a thinner stroke-width on links. Find the `link` selection creation (line 1290) and make `stroke-width` conditional:
  ```javascript
  .attr('stroke-width',function(d){return callFlowMode?1:Math.max(1,Math.min(2,Math.sqrt(d.count)*0.3));})
  ```
  Replace the existing `.attr('stroke-width', function(d){ return Math.max(1,Math.min(2,Math.sqrt(d.count)*0.3)); })` with this.

- [ ] Add `callFlowMode` to the graph useEffect dependency array. Current array (line 1339):
  ```javascript
  },[data,colorMap,colorMode,theme,folderFilter,graphConfig]
  ```
  Change to:
  ```javascript
  },[data,colorMap,colorMode,theme,folderFilter,graphConfig,callFlowMode]
  ```

- [ ] Verify by running `npm run dev` in `client/` and toggling the button — should see individual edge labels in Call Flow mode.

- [ ] Commit: `feat: call flow toggle showing individual function-call edges`

---

## Task 2: FileDrillDown component

**File to create:** `client/src/components/FileDrillDown.tsx`

- [ ] Confirm `client/src/components/` directory exists (it does — `RepositoryGraph.tsx` and `ui/` are already there per git status).

- [ ] Create `client/src/components/FileDrillDown.tsx` with the full content below. The file uses standard TypeScript interfaces (no `// @ts-nocheck` needed since it's a clean new file):

```tsx
import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface FnEntry {
  name: string;
  file: string;
  code?: string;
  isExported?: boolean;
}

interface DrillDownFile {
  path: string;
  name: string;
  [key: string]: any;
}

interface Props {
  file: DrillDownFile;
  allFunctions: FnEntry[];
  onClose: () => void;
  x: number;
  y: number;
}

export default function FileDrillDown({ file, allFunctions, onClose, x, y }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  // All functions belonging to this file
  const fileFns = allFunctions.filter((f) => f.file === file.path);

  // Detect intra-file function calls by scanning each fn's code for other fn names
  const edges: { source: string; target: string }[] = [];
  for (const fn of fileFns) {
    if (!fn.code) continue;
    for (const other of fileFns) {
      if (other.name === fn.name) continue;
      if (fn.code.includes(other.name + '(') || fn.code.includes(other.name + ' (')) {
        edges.push({ source: fn.name, target: other.name });
      }
    }
  }

  useEffect(() => {
    if (!svgRef.current || !fileFns.length) return;

    const W = 380, H = 320;
    const svg = d3.select(svgRef.current).attr('width', W).attr('height', H);
    svg.selectAll('*').remove();

    // Arrow marker
    svg.append('defs').append('marker')
      .attr('id', 'dd-arr')
      .attr('viewBox', '0 -4 10 8')
      .attr('refX', 18)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L10,0L0,4')
      .attr('fill', '#58a6ff');

    const nodes: any[] = fileFns.map((f) => ({ id: f.name, exported: f.isExported }));
    const links: any[] = edges.map((e) => ({ source: e.source, target: e.target }));

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance(80))
      .force('charge', d3.forceManyBody().strength(-120))
      .force('center', d3.forceCenter(W / 2, H / 2));

    const g = svg.append('g');

    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke', '#58a6ff')
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.6)
      .attr('marker-end', 'url(#dd-arr)');

    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .style('cursor', 'pointer');

    node.append('circle')
      .attr('r', 14)
      .attr('fill', (d: any) => d.exported ? '#1a3a1a' : '#1c2128')
      .attr('stroke', (d: any) => d.exported ? '#3fb950' : '#30363d')
      .attr('stroke-width', 1.5);

    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 4)
      .attr('font-size', 8)
      .attr('fill', '#f0f6fc')
      .attr('pointer-events', 'none')
      .text((d: any) => d.id.length > 10 ? d.id.slice(0, 9) + '…' : d.id);

    sim.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);
      node.attr('transform', (d: any) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => {
      sim.stop();
    };
  }, [file.path]);

  // Clamp panel to viewport
  const clampedX = Math.min(x, window.innerWidth - 420);
  const clampedY = Math.min(Math.max(y, 10), window.innerHeight - 380);

  return (
    <div style={{
      position: 'fixed',
      left: clampedX,
      top: clampedY,
      width: 400,
      zIndex: 3000,
      background: 'rgba(22,27,34,0.98)',
      border: '1px solid #30363d',
      borderRadius: 10,
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '10px 14px',
        borderBottom: '1px solid #21262d',
      }}>
        <span style={{
          color: '#f0f6fc',
          fontSize: 13,
          fontWeight: 600,
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {file.name} &mdash; {fileFns.length} function{fileFns.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#8b949e',
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
            padding: '0 4px',
          }}
          aria-label="Close"
        >
          &times;
        </button>
      </div>

      {/* Body */}
      {fileFns.length === 0 ? (
        <div style={{
          padding: 24,
          color: '#484f58',
          fontSize: 13,
          textAlign: 'center',
        }}>
          No functions found in this file
        </div>
      ) : (
        <svg
          ref={svgRef}
          style={{ display: 'block', background: '#0d1117' }}
        />
      )}
    </div>
  );
}
```

- [ ] Verify no TypeScript errors: `cd client && npx tsc --noEmit` (or equivalent). The file uses only types that exist in the project.

- [ ] Commit: `feat: FileDrillDown component with mini function graph`

---

## Task 3: Wire FileDrillDown into WorkspaceArea

**File:** `client/src/pages/WorkspaceArea.tsx`

- [ ] Add import at the top of the file, after existing component imports:
  ```javascript
  import FileDrillDown from '../components/FileDrillDown';
  ```
  (Search for existing `import` lines at the top; add after the last one.)

- [ ] Add `drillDown` state near other graph-related states (alongside where `callFlowMode` was added in Task 1):
  ```javascript
  var _dd=useState(null),drillDown=_dd[0],setDrillDown=_dd[1];
  ```

- [ ] Find the node click handler (line 1295):
  ```javascript
  node.on('click',function(e,d){e.stopPropagation();if(selectFileRef.current)selectFileRef.current(d.id);});
  ```
  Replace with the extended version that also sets drill-down state:
  ```javascript
  node.on('click',function(e,d){
      e.stopPropagation();
      if(selectFileRef.current)selectFileRef.current(d.id);
      // Open drill-down panel near the clicked node
      var rect=svgRef.current?svgRef.current.getBoundingClientRect():{left:0,top:0};
      setDrillDown({file:d,x:rect.left+(d.x||0)+20,y:rect.top+(d.y||0)-100});
  });
  ```

- [ ] Add an Escape key handler to close the drill-down panel. Search for existing `keydown` event listener `useEffect` in the component. If one exists, add to it:
  ```javascript
  if(e.key==='Escape')setDrillDown(null);
  ```
  If no keydown useEffect exists, add a new one near other useEffects:
  ```javascript
  useEffect(function(){
      function onKey(e){if(e.key==='Escape')setDrillDown(null);}
      window.addEventListener('keydown',onKey);
      return function(){window.removeEventListener('keydown',onKey);};
  },[]);
  ```

- [ ] In the return JSX, render `FileDrillDown` when `drillDown` is set. Find the top-level return wrapper div and add the conditional render inside it, at the end (before the closing `</div>`). Since WorkspaceArea uses `React.createElement`, add:
  ```javascript
  drillDown&&React.createElement(FileDrillDown,{
      file:drillDown.file,
      allFunctions:((data as any).functions)||[],
      onClose:function(){setDrillDown(null);},
      x:drillDown.x,
      y:drillDown.y,
  })
  ```
  Place this after the main graph SVG element but inside the outermost container.

- [ ] Manual test: run `npm run dev`, load a repo, click a file node — panel should appear near the click point, showing function names. Escape should close it.

- [ ] Commit: `feat: wire FileDrillDown on graph node click`

---

## Completion Checklist

- [ ] Call Flow toggle button visible in graph controls
- [ ] Toggling Call Flow re-renders edges as individual labeled arrows
- [ ] FileDrillDown.tsx exists and compiles without errors
- [ ] Clicking a file node opens the drill-down panel
- [ ] Panel shows correct function count in header
- [ ] Panel shows "No functions found" for files with no parsed functions
- [ ] Escape key closes the drill-down panel
- [ ] × button in panel header closes the panel
- [ ] Mini D3 simulation is stopped when panel closes (no memory leak)
- [ ] Both features work in all graphConfig.viewMode values (force, radial, hierarchical, grid, metro)
