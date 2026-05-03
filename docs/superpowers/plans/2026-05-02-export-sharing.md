# Export & Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Export modal to CodeFlow that lets users export the current graph analysis as Mermaid, PlantUML, SVG, or a compressed Share Link.

**Architecture:** A pure-function `exporters.ts` library converts graph data to text/SVG formats; a new `ExportModal.tsx` renders the modal UI; `WorkspaceHeader.tsx` gets a new Export button that calls `onExport` callback; the modal lives in `WorkspaceArea.tsx` which already owns the data.

**Tech Stack:** React, TypeScript, lz-string (new dependency), browser Clipboard API, XMLSerializer (built-in)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `client/src/lib/exporters.ts` | Create | Pure functions: toMermaid, toPlantUML, toSVG, toShareLink |
| `client/src/components/ExportModal.tsx` | Create | Modal UI with 4 tabs, copy/download buttons |
| `client/src/components/WorkspaceHeader.tsx` | Modify | Add Export button + `onExport` prop |
| `client/src/pages/WorkspaceArea.tsx` | Modify | Wire onExport → setShowExport, render ExportModal |
| `client/package.json` | Modify | Add lz-string dependency |

---

## Task 1: Install lz-string

**Files:**
- Modify: `client/package.json`

- [ ] **Step 1: Install the dependency**

```bash
cd "c:\Users\RamanSharma\OneDrive - GNA-Energy\Desktop\codeflow\client"
npm install lz-string
```

Expected output: `added 1 package`

- [ ] **Step 2: Verify it's in package.json**

Open `client/package.json` and confirm `"lz-string"` appears under `"dependencies"`.

- [ ] **Step 3: Commit**

```bash
git add client/package.json client/package-lock.json
git commit -m "chore: add lz-string for share link compression"
```

---

## Task 2: Create `exporters.ts`

**Files:**
- Create: `client/src/lib/exporters.ts`

- [ ] **Step 1: Create the file with all four export functions**

Create `client/src/lib/exporters.ts` with this exact content:

```typescript
import LZString from 'lz-string';

export interface GraphNode {
  id: string;
  name: string;
  layer?: string;
}

export interface GraphEdge {
  source: string | { id: string };
  target: string | { id: string };
  fn?: string;
}

export interface FilterState {
  layerFilter?: string | null;
  searchQuery?: string;
  folderFilter?: string | null;
}

function nodeId(n: GraphNode): string {
  return n.id.replace(/[^a-zA-Z0-9_]/g, '_');
}

function edgeSourceId(e: GraphEdge): string {
  return typeof e.source === 'string' ? e.source : e.source.id;
}

function edgeTargetId(e: GraphEdge): string {
  return typeof e.target === 'string' ? e.target : e.target.id;
}

export function toMermaid(nodes: GraphNode[], edges: GraphEdge[]): string {
  const nodeSet = new Set(nodes.map(n => n.id));
  const lines: string[] = ['graph TD'];

  // Group nodes by layer into subgraphs
  const byLayer = new Map<string, GraphNode[]>();
  for (const n of nodes) {
    const layer = n.layer ?? 'other';
    if (!byLayer.has(layer)) byLayer.set(layer, []);
    byLayer.get(layer)!.push(n);
  }

  for (const [layer, layerNodes] of byLayer) {
    lines.push(`  subgraph ${layer}`);
    for (const n of layerNodes) {
      lines.push(`    ${nodeId(n)}["${n.name}"]`);
    }
    lines.push('  end');
  }

  for (const e of edges) {
    const src = edgeSourceId(e);
    const tgt = edgeTargetId(e);
    if (!nodeSet.has(src) || !nodeSet.has(tgt)) continue;
    const srcNode = nodes.find(n => n.id === src);
    const tgtNode = nodes.find(n => n.id === tgt);
    if (!srcNode || !tgtNode) continue;
    lines.push(`  ${nodeId(srcNode)} --> ${nodeId(tgtNode)}`);
  }

  return lines.join('\n');
}

export function toPlantUML(nodes: GraphNode[], edges: GraphEdge[]): string {
  const nodeSet = new Set(nodes.map(n => n.id));
  const lines: string[] = ['@startuml', 'skinparam componentStyle rectangle', ''];

  const byLayer = new Map<string, GraphNode[]>();
  for (const n of nodes) {
    const layer = n.layer ?? 'other';
    if (!byLayer.has(layer)) byLayer.set(layer, []);
    byLayer.get(layer)!.push(n);
  }

  for (const [layer, layerNodes] of byLayer) {
    lines.push(`package "${layer}" {`);
    for (const n of layerNodes) {
      lines.push(`  [${n.name}] as ${nodeId(n)}`);
    }
    lines.push('}');
    lines.push('');
  }

  for (const e of edges) {
    const src = edgeSourceId(e);
    const tgt = edgeTargetId(e);
    if (!nodeSet.has(src) || !nodeSet.has(tgt)) continue;
    const srcNode = nodes.find(n => n.id === src);
    const tgtNode = nodes.find(n => n.id === tgt);
    if (!srcNode || !tgtNode) continue;
    lines.push(`${nodeId(srcNode)} --> ${nodeId(tgtNode)}`);
  }

  lines.push('');
  lines.push('@enduml');
  return lines.join('\n');
}

export function toSVG(svgElement: SVGElement): string {
  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(svgElement);
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + svgStr;
}

export function toShareLink(repoUrl: string, filterState: FilterState): string {
  const payload = JSON.stringify({ repoUrl, filterState });
  const compressed = LZString.compressToEncodedURIComponent(payload);
  const base = window.location.origin + window.location.pathname;
  return `${base}?share=${compressed}`;
}

export function decodeShareLink(shareParam: string): { repoUrl: string; filterState: FilterState } | null {
  try {
    const decompressed = LZString.decompressFromEncodedURIComponent(shareParam);
    if (!decompressed) return null;
    return JSON.parse(decompressed);
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "c:\Users\RamanSharma\OneDrive - GNA-Energy\Desktop\codeflow\client"
npx tsc --noEmit
```

Expected: no errors related to `exporters.ts`.

- [ ] **Step 3: Commit**

```bash
git add client/src/lib/exporters.ts
git commit -m "feat: add exporters library (Mermaid, PlantUML, SVG, share link)"
```

---

## Task 3: Create `ExportModal.tsx`

**Files:**
- Create: `client/src/components/ExportModal.tsx`

- [ ] **Step 1: Create the component**

Create `client/src/components/ExportModal.tsx`:

```typescript
import React, { useState, useEffect, useRef } from 'react';
import { toMermaid, toPlantUML, toSVG, toShareLink, GraphNode, GraphEdge, FilterState } from '../lib/exporters';

interface ExportModalProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  svgRef: React.RefObject<SVGElement>;
  repoUrl: string;
  filterState: FilterState;
  onClose: () => void;
}

type ExportTab = 'mermaid' | 'plantuml' | 'svg' | 'sharelink';

export default function ExportModal({ nodes, edges, svgRef, repoUrl, filterState, onClose }: ExportModalProps) {
  const [activeTab, setActiveTab] = useState<ExportTab>('mermaid');
  const [copied, setCopied] = useState(false);
  const [svgPreviewUrl, setSvgPreviewUrl] = useState<string>('');

  const mermaidText = toMermaid(nodes, edges);
  const plantumlText = toPlantUML(nodes, edges);
  const shareLink = toShareLink(repoUrl, filterState);

  useEffect(() => {
    if (activeTab === 'svg' && svgRef.current) {
      const svgStr = toSVG(svgRef.current as unknown as SVGElement);
      const blob = new Blob([svgStr], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      setSvgPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [activeTab, svgRef]);

  async function handleCopy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownloadSVG() {
    if (!svgRef.current) return;
    const svgStr = toSVG(svgRef.current as unknown as SVGElement);
    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'codeflow-graph.svg';
    a.click();
    URL.revokeObjectURL(url);
  }

  const tabs: { id: ExportTab; label: string }[] = [
    { id: 'mermaid', label: 'Mermaid' },
    { id: 'plantuml', label: 'PlantUML' },
    { id: 'svg', label: 'SVG' },
    { id: 'sharelink', label: 'Share Link' },
  ];

  const activeContent: Record<ExportTab, string> = {
    mermaid: mermaidText,
    plantuml: plantumlText,
    svg: '',
    sharelink: shareLink,
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: '12px',
          width: '640px',
          maxWidth: '95vw',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #30363d' }}>
          <span style={{ color: '#f0f6fc', fontWeight: 700, fontSize: '1rem' }}>Export / Share</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', padding: '12px 20px 0', borderBottom: '1px solid #30363d' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setCopied(false); }}
              style={{
                background: activeTab === tab.id ? '#21262d' : 'transparent',
                border: activeTab === tab.id ? '1px solid #30363d' : '1px solid transparent',
                borderBottom: 'none',
                color: activeTab === tab.id ? '#f0f6fc' : '#8b949e',
                borderRadius: '6px 6px 0 0',
                padding: '6px 14px',
                fontSize: '0.82rem',
                fontWeight: activeTab === tab.id ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
          {activeTab === 'svg' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {svgPreviewUrl && (
                <img
                  src={svgPreviewUrl}
                  alt="Graph preview"
                  style={{ width: '100%', border: '1px solid #30363d', borderRadius: '8px', background: '#0d1117', maxHeight: '300px', objectFit: 'contain' }}
                />
              )}
              <button
                onClick={handleDownloadSVG}
                style={{ background: '#238636', border: 'none', color: 'white', padding: '8px 18px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start' }}
              >
                Download SVG
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {activeTab === 'sharelink' && (
                <p style={{ color: '#8b949e', fontSize: '0.8rem', margin: 0 }}>
                  Share this link to let others open CodeFlow with the same repository pre-loaded.
                </p>
              )}
              {activeTab === 'mermaid' && (
                <p style={{ color: '#8b949e', fontSize: '0.8rem', margin: 0 }}>
                  Paste into GitHub markdown, Notion, or{' '}
                  <a href="https://mermaid.live" target="_blank" rel="noreferrer" style={{ color: '#58a6ff' }}>mermaid.live</a>.
                </p>
              )}
              {activeTab === 'plantuml' && (
                <p style={{ color: '#8b949e', fontSize: '0.8rem', margin: 0 }}>
                  Paste into Confluence, Jira, or{' '}
                  <a href="https://www.plantuml.com/plantuml/uml/" target="_blank" rel="noreferrer" style={{ color: '#58a6ff' }}>plantuml.com</a>.
                </p>
              )}
              <textarea
                readOnly
                value={activeContent[activeTab]}
                style={{
                  background: '#0d1117',
                  border: '1px solid #30363d',
                  borderRadius: '8px',
                  color: '#c9d1d9',
                  fontFamily: 'monospace',
                  fontSize: '0.78rem',
                  padding: '12px',
                  resize: 'vertical',
                  minHeight: '220px',
                  outline: 'none',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              />
              <button
                onClick={() => handleCopy(activeContent[activeTab])}
                style={{
                  background: copied ? '#1a2b1a' : '#21262d',
                  border: `1px solid ${copied ? '#238636' : '#30363d'}`,
                  color: copied ? '#3fb950' : '#f0f6fc',
                  padding: '7px 16px',
                  borderRadius: '6px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  alignSelf: 'flex-start',
                  transition: 'all 0.15s',
                }}
              >
                {copied ? '✓ Copied!' : 'Copy to clipboard'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "c:\Users\RamanSharma\OneDrive - GNA-Energy\Desktop\codeflow\client"
npx tsc --noEmit
```

Expected: no errors from `ExportModal.tsx`.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ExportModal.tsx
git commit -m "feat: add ExportModal component with Mermaid/PlantUML/SVG/Share tabs"
```

---

## Task 4: Add Export Button to WorkspaceHeader

**Files:**
- Modify: `client/src/components/WorkspaceHeader.tsx`

- [ ] **Step 1: Add `onExport` to the props interface**

In `client/src/components/WorkspaceHeader.tsx`, find the `WorkspaceHeaderProps` interface and add one line:

Find:
```typescript
  onPaletteOpen: () => void;
```
Add after it:
```typescript
  onExport?: () => void;
```

- [ ] **Step 2: Destructure `onExport` in the function signature**

Find:
```typescript
}: WorkspaceHeaderProps) {
```
The destructuring is in the function parameters. Find `onPaletteOpen` in the destructuring and add `onExport` next to it:

Find:
```typescript
  onBookmarkSelect, onPaletteOpen,
}: WorkspaceHeaderProps) {
```
Replace with:
```typescript
  onBookmarkSelect, onPaletteOpen, onExport,
}: WorkspaceHeaderProps) {
```

- [ ] **Step 3: Add the Export button in the action buttons section**

Find the `{hasData && (` block that contains the PR Review and DB Map buttons:
```typescript
      {hasData && (
        <>
          <button onClick={onPRReview} style={{ background: 'transparent', border: '1px solid #30363d', color: '#f0f6fc', padding: '4px 10px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
            PR Review
          </button>
          <button onClick={onDbMap} style={{ background: dbSchemaDetected ? '#1a2b1a' : 'transparent', border: `1px solid ${dbSchemaDetected ? '#238636' : '#30363d'}`, color: dbSchemaDetected ? '#3fb950' : '#f0f6fc', padding: '4px 10px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
            DB Map
          </button>
        </>
      )}
```

Replace with:
```typescript
      {hasData && (
        <>
          <button onClick={onPRReview} style={{ background: 'transparent', border: '1px solid #30363d', color: '#f0f6fc', padding: '4px 10px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
            PR Review
          </button>
          <button onClick={onDbMap} style={{ background: dbSchemaDetected ? '#1a2b1a' : 'transparent', border: `1px solid ${dbSchemaDetected ? '#238636' : '#30363d'}`, color: dbSchemaDetected ? '#3fb950' : '#f0f6fc', padding: '4px 10px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
            DB Map
          </button>
          {onExport && (
            <button onClick={onExport} style={{ background: 'transparent', border: '1px solid #30363d', color: '#f0f6fc', padding: '4px 10px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '5px' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export
            </button>
          )}
        </>
      )}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd "c:\Users\RamanSharma\OneDrive - GNA-Energy\Desktop\codeflow\client"
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/WorkspaceHeader.tsx
git commit -m "feat: add Export button to WorkspaceHeader"
```

---

## Task 5: Wire ExportModal into WorkspaceArea

**Files:**
- Modify: `client/src/pages/WorkspaceArea.tsx`

Note: WorkspaceArea uses a non-standard style with `var _r=useState` patterns and `@ts-nocheck`. Graph data lives in `data.files` (nodes) and `data.connections` (edges). The SVG is referenced via `svgRef`. `showExport` state already exists at line ~`var _r=useState<any>(false),showExport=_r[0],setShowExport=_r[1]`.

- [ ] **Step 1: Import ExportModal at the top of WorkspaceArea.tsx**

Find the last import line in `WorkspaceArea.tsx` (near `import FileDrillDown`):
```typescript
import FileDrillDown from '../components/FileDrillDown';
```
Add after it:
```typescript
import ExportModal from '../components/ExportModal';
```

- [ ] **Step 2: Pass `onExport` to WorkspaceHeader**

Find the `React.createElement(WorkspaceHeader,{` call and locate the `onPaletteOpen` prop line:
```typescript
    onPaletteOpen: function(){ if(data) setShowPalette(true); },
```
Add after it:
```typescript
    onExport: data ? function(){ setShowExport(true); } : undefined,
```

- [ ] **Step 3: Render ExportModal when showExport is true**

Find where other modals are rendered in the return statement. Look for the `showPR &&` or `showPrivacy &&` pattern. Add the ExportModal render nearby:

Find:
```typescript
showPalette&&React.createElement(CommandPalette,{
```
Add before that line:
```typescript
showExport&&data&&React.createElement(ExportModal,{
    nodes:(data.files||[]).map(function(f:any){return{id:f.path,name:f.name,layer:f.layer};}),
    edges:(data.connections||[]).map(function(c:any){return{source:c.source,target:c.target,fn:c.fn};}),
    svgRef:svgRef,
    repoUrl:repoUrl,
    filterState:{layerFilter:folderFilter,searchQuery:''},
    onClose:function(){setShowExport(false);},
}),
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd "c:\Users\RamanSharma\OneDrive - GNA-Energy\Desktop\codeflow\client"
npx tsc --noEmit
```

Expected: no errors. (The file has `@ts-nocheck` so TypeScript issues are suppressed.)

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/WorkspaceArea.tsx
git commit -m "feat: wire ExportModal into WorkspaceArea"
```

---

## Task 6: Handle Share Link on Page Load

**Files:**
- Modify: `client/src/pages/WorkspaceArea.tsx`

- [ ] **Step 1: Import `decodeShareLink` in WorkspaceArea**

Find the ExportModal import added in Task 5:
```typescript
import ExportModal from '../components/ExportModal';
```
Replace with:
```typescript
import ExportModal from '../components/ExportModal';
import { decodeShareLink } from '../lib/exporters';
```

- [ ] **Step 2: Add share link decoding in the startup useEffect**

In WorkspaceArea, find the `useEffect` that runs on mount and checks for auth (looks for `authUser` fetch or the URL param `run=1`). Find where `repoUrl` is set from URL params:

Search for: `searchParams` or `URLSearchParams` or `run=1` in the file. You'll find something like:
```typescript
var params=new URLSearchParams(window.location.search);
var run=params.get('run');
var repoParam=params.get('repo');
```

Add after the `repoParam` line (or wherever URL params are read):
```typescript
var shareParam=params.get('share');
if(shareParam){
    var decoded=decodeShareLink(shareParam);
    if(decoded&&decoded.repoUrl){
        setRepoUrl(decoded.repoUrl);
        setTimeout(function(){analyze();},300);
    }
}
```

If the URL param parsing doesn't exist and repos are set another way, add a separate `useEffect` at the top of the component body:
```typescript
useEffect(function(){
    var params=new URLSearchParams(window.location.search);
    var shareParam=params.get('share');
    if(!shareParam)return;
    var decoded=decodeShareLink(shareParam);
    if(decoded&&decoded.repoUrl){
        setRepoUrl(decoded.repoUrl);
        setTimeout(function(){analyze();},300);
    }
},[]);
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "c:\Users\RamanSharma\OneDrive - GNA-Energy\Desktop\codeflow\client"
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/WorkspaceArea.tsx
git commit -m "feat: decode share link on workspace load"
```

---

## Task 7: End-to-End Verification

- [ ] **Step 1: Start the dev server**

```bash
cd "c:\Users\RamanSharma\OneDrive - GNA-Energy\Desktop\codeflow\client"
npm run dev
```

Open `http://localhost:5173` in a browser.

- [ ] **Step 2: Test Mermaid export**

1. Analyze a public repo (e.g., `https://github.com/expressjs/express`)
2. Once loaded, click the **Export** button in the header
3. Mermaid tab should show `graph TD` followed by subgraph sections and `-->` edges
4. Click "Copy to clipboard"
5. Open [mermaid.live](https://mermaid.live), paste → diagram should render without errors

- [ ] **Step 3: Test PlantUML export**

1. Click PlantUML tab
2. Content should start with `@startuml` and end with `@enduml`
3. Copy and paste into [plantuml.com](https://www.plantuml.com/plantuml/uml/) → should render a component diagram

- [ ] **Step 4: Test SVG export**

1. Click SVG tab
2. A preview image of the graph should appear
3. Click "Download SVG" → file `codeflow-graph.svg` downloads
4. Open the file in a browser → graph renders correctly

- [ ] **Step 5: Test Share Link**

1. Click Share Link tab
2. Copy the URL
3. Open a new browser tab, paste the URL
4. The workspace should load with the same repo URL pre-filled and auto-analyze

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete Export & Sharing feature"
```
