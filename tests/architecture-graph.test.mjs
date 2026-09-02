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
