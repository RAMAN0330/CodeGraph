import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const clientRequire = createRequire(resolve('client/package.json'));
const { createServer } = await import(pathToFileURL(clientRequire.resolve('vite')).href);

const inputNodes = [
  { id: 'client/src/App.tsx', name: 'App.tsx', folder: 'client/src' },
  { id: 'client/src/api.ts', name: 'api.ts', folder: 'client/src' },
  { id: 'server/routes.ts', name: 'routes.ts', folder: 'server' },
  { id: 'README.md', name: 'README.md', folder: '' },
  { id: 'LICENSE', name: 'LICENSE', folder: '' },
];
const inputLinks = [
  { source: 'client/src/App.tsx', target: 'client/src/api.ts' },
  { source: 'client/src/api.ts', target: 'server/routes.ts' },
  { source: 'client/src/api.ts', target: 'server/routes.ts' },
  { source: 'README.md', target: 'client/src/App.tsx' },
  { source: 'missing.ts', target: 'server/routes.ts' },
];

test('buildGroupedGraph aggregates valid dependencies deterministically', async () => {
  const vite = await createServer({ root: 'client', server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { buildGroupedGraph } = await vite.ssrLoadModule('/src/features/workspace/services/groupedGraph.ts');
    const model = buildGroupedGraph(inputNodes, inputLinks);

    assert.deepEqual(model.groups.map(group => group.id), ['client/src', 'server', 'root', 'unconnected']);
    assert.equal(model.edges.length, 2);
    assert.equal(model.edges.find(edge => edge.source === 'client/src/api.ts').count, 2);
    assert.ok(model.groups.find(group => group.id === 'server').rank > model.groups.find(group => group.id === 'client/src').rank);
    assert.deepEqual(buildGroupedGraph(inputNodes, inputLinks), buildGroupedGraph(inputNodes, inputLinks));
    assert.equal(model.nodes.find(node => node.id === 'README.md').folderId, 'root');
    assert.equal(model.nodes.find(node => node.id === 'LICENSE').folderId, 'unconnected');
    assert.equal(model.nodes.find(node => node.id === 'client/src/App.tsx').extension, 'tsx');
  } finally {
    await vite.close();
  }
});

test('grouped graph validates IDs and ignores invalid links', async () => {
  const vite = await createServer({ root: 'client', server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { buildGroupedGraph } = await vite.ssrLoadModule('/src/features/workspace/services/groupedGraph.ts');
    assert.throws(() => buildGroupedGraph([{ name: 'untitled' }], []), /empty/i);
    assert.throws(() => buildGroupedGraph([{ id: 'same' }, { path: 'same' }], []), /duplicate/i);

    const model = buildGroupedGraph([{ path: 'a/a.ts' }, { sourceFile: 'b/b.ts' }], [
      { source: { id: 'a/a.ts' }, target: { id: 'b/b.ts' } },
      { source: 'a/a.ts', target: 'a/a.ts' },
      { source: 'missing', target: 'b/b.ts' },
    ]);
    assert.equal(model.edges.length, 1);
  } finally {
    await vite.close();
  }
});

test('focus and search expose a selected neighborhood', async () => {
  const vite = await createServer({ root: 'client', server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { buildGroupedGraph, deriveFocusedGraph, searchGroupedGraph } = await vite.ssrLoadModule('/src/features/workspace/services/groupedGraph.ts');
    const model = buildGroupedGraph(inputNodes, inputLinks);
    const focus = deriveFocusedGraph(model, 'client/src/api.ts');

    assert.deepEqual([...focus.relatedNodeIds].sort(), ['client/src/api.ts', 'server/routes.ts']);
    assert.equal(focus.relatedEdgeIds.size, 1);
    assert.deepEqual(searchGroupedGraph(model, 'ROUTES').map(node => node.id), ['server/routes.ts']);
    assert.deepEqual(searchGroupedGraph(model, 'CLIENT/SRC').map(node => node.id).sort(), ['client/src/App.tsx', 'client/src/api.ts']);
    assert.deepEqual(searchGroupedGraph(model, '   '), []);
  } finally {
    await vite.close();
  }
});

test('folder budgets hide low-priority files until expanded', async () => {
  const vite = await createServer({ root: 'client', server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { buildGroupedGraph } = await vite.ssrLoadModule('/src/features/workspace/services/groupedGraph.ts');
    const nodes = Array.from({ length: 42 }, (_, index) => ({
      id: `dense/file-${String(index).padStart(2, '0')}.ts`, folder: 'dense',
    }));
    const links = nodes.slice(1).map((node, index) => ({ source: node.id, target: nodes[index].id }));
    const collapsed = buildGroupedGraph(nodes, links);
    const expanded = buildGroupedGraph(nodes, links, { expandedFolders: new Set(['dense']) });

    assert.equal(collapsed.groups.find(group => group.id === 'dense').visibleFiles, 40);
    assert.equal(collapsed.visibleNodes.filter(node => node.folderId === 'dense').length, 40);
    assert.equal(collapsed.nodes.filter(node => node.folderId === 'dense' && node.hiddenByBudget).length, 2);
    assert.equal(expanded.groups.find(group => group.id === 'dense').visibleFiles, 42);
    assert.equal(expanded.visibleNodes.filter(node => node.folderId === 'dense').length, 42);
  } finally {
    await vite.close();
  }
});
