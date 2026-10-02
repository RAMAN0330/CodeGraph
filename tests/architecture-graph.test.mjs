import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const clientRequire = createRequire(resolve('client/package.json'));
const { pathToFileURL } = await import('node:url');
const { createServer } = await import(pathToFileURL(clientRequire.resolve('vite')).href);
let vite;
before(async () => { vite = await createServer({ root: resolve('client'), server: { middlewareMode: true }, appType: 'custom' }); });
after(async () => vite?.close());

const files = [
  { path: 'src/ui/App.tsx', name: 'App.tsx', layer: 'components' },
  { path: 'src/ui/Login.tsx', name: 'Login.tsx', layer: 'components' },
  { path: 'src/api/routes.ts', name: 'routes.ts', layer: 'routes' },
  { path: 'src/services/auth.ts', name: 'auth.ts', layer: 'services' },
  { path: 'src/db/models.ts', name: 'models.ts', layer: 'models' },
];

test('builds a bounded architecture graph with validated paths and evidence', async () => {
  const { buildArchitectureGraph } = await vite.ssrLoadModule('/src/features/workspace/services/architectureGraph.ts');
  const graph = buildArchitectureGraph(files, [
    { source: 'src/ui/App.tsx', target: 'src/api/routes.ts', relationship: 'calls' },
    { from: 'src/api/routes.ts', to: 'src/services/auth.ts', label: 'uses' },
    { from: 'src/services/auth.ts', to: 'src/db/models.ts' },
    { from: 'missing.ts', to: 'src/db/models.ts' },
  ]);

  assert.equal(graph.version, 1);
  assert.ok(graph.groups.length <= 10);
  assert.ok(graph.nodes.length <= 60);
  assert.ok(graph.edges.length <= 120);
  const validPaths = new Set(files.map(file => file.path));
  for (const node of graph.nodes) for (const path of node.paths) assert.ok(validPaths.has(path));
  for (const edge of graph.edges) {
    assert.ok(graph.nodes.some(node => node.id === edge.source));
    assert.ok(graph.nodes.some(node => node.id === edge.target));
    assert.ok(edge.evidencePaths.length <= 8);
    edge.evidencePaths.forEach(path => assert.ok(validPaths.has(path)));
  }
  assert.equal(graph.edges.length, 3);
});

test('caps generated groups, components, edges, and evidence', async () => {
  const { buildArchitectureGraph } = await vite.ssrLoadModule('/src/features/workspace/services/architectureGraph.ts');
  const manyFiles = Array.from({ length: 90 }, (_, i) => ({
    path: `packages/package-${i}/feature-${i}/index.ts`, name: 'index.ts', layer: i % 2 ? 'services' : 'components',
  }));
  const manyConnections = Array.from({ length: 180 }, (_, i) => ({
    source: manyFiles[i % 89].path, target: manyFiles[(i + 1) % 90].path,
  }));
  const graph = buildArchitectureGraph(manyFiles, manyConnections);
  assert.ok(graph.groups.length <= 10);
  assert.ok(graph.nodes.length <= 60);
  assert.ok(graph.edges.length <= 120);
  graph.edges.forEach(edge => assert.ok(edge.evidencePaths.length <= 8));
});

test('applies text enrichment without allowing topology changes', async () => {
  const { buildArchitectureGraph, applyArchitectureEnrichment } = await vite.ssrLoadModule('/src/features/workspace/services/architectureGraph.ts');
  const graph = buildArchitectureGraph(files, [{ from: 'src/ui/App.tsx', to: 'src/api/routes.ts' }]);
  const firstNode = graph.nodes[0];
  const enriched = applyArchitectureEnrichment(graph, {
    summary: 'A concise system summary.',
    groups: [{ id: graph.groups[0].id, label: 'Presentation', description: 'User-facing entry points.' }],
    nodes: [
      { id: firstNode.id, label: 'Application shell', description: 'Starts the client.' },
      { id: 'invented-node', label: 'Unsafe', description: 'Must be ignored.' },
    ],
    edges: [{ source: 'invented-node', target: firstNode.id }],
  });

  assert.equal(enriched.summary, 'A concise system summary.');
  assert.equal(enriched.nodes.find(node => node.id === firstNode.id).label, 'Application shell');
  assert.deepEqual(enriched.nodes.map(node => node.id), graph.nodes.map(node => node.id));
  assert.deepEqual(enriched.edges, graph.edges);
});

test('compiles safe Mermaid rather than raw labels', async () => {
  const { buildArchitectureGraph, applyArchitectureEnrichment, compileArchitectureMermaid } = await vite.ssrLoadModule('/src/features/workspace/services/architectureGraph.ts');
  const graph = buildArchitectureGraph(files, []);
  const hostile = applyArchitectureEnrichment(graph, {
    nodes: [{ id: graph.nodes[0].id, label: '<script>alert(1)</script> [App] "shell"', description: '' }],
  });
  const mermaid = compileArchitectureMermaid(hostile);
  assert.match(mermaid, /flowchart LR/);
  assert.doesNotMatch(mermaid, /<script>/i);
  assert.doesNotMatch(mermaid, /alert\(1\)/i);
  assert.match(mermaid, /App/);
});

// An axis-aligned segment crosses a card when it overlaps the card's interior.
function segmentHitsCard([x1, y1], [x2, y2], card) {
  const inset = 1;
  const left = card.x + inset, right = card.x + card.w - inset, top = card.y + inset, bottom = card.y + card.h - inset;
  return Math.max(x1, x2) > left && Math.min(x1, x2) < right && Math.max(y1, y2) > top && Math.min(y1, y2) < bottom;
}

function assertCleanLayout(graph, layout) {
  assert.equal(layout.nodes.length, graph.nodes.length);
  assert.equal(new Set(layout.nodes.map(item => item.node.id)).size, graph.nodes.length);
  for (const [i, a] of layout.nodes.entries()) {
    for (const b of layout.nodes.slice(i + 1)) {
      const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
      assert.ok(apart, `${a.node.id} overlaps ${b.node.id}`);
    }
    const lane = layout.lanes.find(item => item.id === a.node.groupId);
    assert.ok(a.x >= lane.x && a.x + a.w <= lane.x + lane.w && a.y >= lane.y && a.y + a.h <= lane.y + lane.h, `${a.node.id} sits outside its lane`);
  }
  assert.equal(layout.edges.length, graph.edges.length);
  const byId = new Map(layout.nodes.map(item => [item.node.id, item]));
  for (const route of layout.edges) {
    const { points } = route;
    const source = byId.get(route.edge.source);
    const target = byId.get(route.edge.target);
    assert.equal(points[0][0], source.x + source.w, 'leaves from the source card');
    assert.equal(points.at(-1)[0], target.x, 'arrives at the target card');
    for (let i = 1; i < points.length; i++) {
      const [a, b] = [points[i - 1], points[i]];
      assert.ok(a[0] === b[0] || a[1] === b[1], `${route.edge.id} has a diagonal segment`);
      for (const card of layout.nodes) assert.ok(!segmentHitsCard(a, b, card), `${route.edge.id} passes under ${card.node.id}`);
    }
  }
}

test('lays out lanes and routes every connector around the cards', async () => {
  const { buildArchitectureGraph } = await vite.ssrLoadModule('/src/features/workspace/services/architectureGraph.ts');
  const { layoutArchitecture } = await vite.ssrLoadModule('/src/features/workspace/services/architectureLayout.ts');
  const graph = buildArchitectureGraph(files, [
    { source: 'src/ui/App.tsx', target: 'src/api/routes.ts' },
    { from: 'src/api/routes.ts', to: 'src/services/auth.ts' },
    { from: 'src/services/auth.ts', to: 'src/db/models.ts' },
    { from: 'src/db/models.ts', to: 'src/ui/App.tsx' },
  ]);
  const layout = layoutArchitecture(graph);
  assertCleanLayout(graph, layout);
  assert.deepEqual(layout.lanes.map(lane => lane.id), graph.groups.map(group => group.id));
  const col = id => layout.nodes.find(item => item.node.id === id).col;
  for (const edge of graph.edges.slice(0, 3)) assert.ok(col(edge.target) > col(edge.source), 'the request path reads left to right');
  assert.deepEqual(layoutArchitecture(graph), layout, 'layout is deterministic');
});

test('keeps a dense, cyclic graph readable at the component bounds', async () => {
  const { buildArchitectureGraph } = await vite.ssrLoadModule('/src/features/workspace/services/architectureGraph.ts');
  const { layoutArchitecture } = await vite.ssrLoadModule('/src/features/workspace/services/architectureLayout.ts');
  const layers = ['components', 'routes', 'services', 'models', 'config', 'tests'];
  const manyFiles = Array.from({ length: 90 }, (_, i) => ({ path: `src/feature${i}/index.ts`, name: 'index.ts', layer: layers[i % layers.length] }));
  const manyConnections = manyFiles.flatMap((file, i) => [1, 3, 11, 29, 47].map(step => ({ source: file.path, target: manyFiles[(i + step) % 90].path })));
  const graph = buildArchitectureGraph(manyFiles, manyConnections);
  assert.equal(graph.nodes.length, 60);
  assert.equal(graph.edges.length, 120);
  assertCleanLayout(graph, layoutArchitecture(graph));
});

test('traces downstream and upstream reach through cycles', async () => {
  const { reachable } = await vite.ssrLoadModule('/src/features/workspace/services/architectureLayout.ts');
  const graph = { edges: [
    { source: 'a', target: 'b' }, { source: 'b', target: 'c' }, { source: 'c', target: 'a' }, { source: 'd', target: 'b' },
  ] };
  assert.deepEqual([...reachable(graph, 'b', 'downstream')].sort(), ['a', 'c']);
  assert.deepEqual([...reachable(graph, 'b', 'upstream')].sort(), ['a', 'c', 'd']);
});
