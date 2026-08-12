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
    assert.equal(model.edges.length, 3);
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

    assert.deepEqual([...focus.relatedNodeIds].sort(), ['client/src/App.tsx', 'client/src/api.ts', 'server/routes.ts']);
    assert.equal(focus.relatedEdgeIds.size, 2);
    assert.deepEqual(searchGroupedGraph(model, 'ROUTES').map(node => node.id), ['server/routes.ts']);
    assert.deepEqual(searchGroupedGraph(model, 'CLIENT/SRC').map(node => node.id).sort(), ['client/src/App.tsx', 'client/src/api.ts']);
    assert.deepEqual(searchGroupedGraph(model, '   '), []);
  } finally {
    await vite.close();
  }
});

test('grouped graph keeps same-folder dependencies, distinct delimiter IDs, and lexical ordering', async () => {
  const vite = await createServer({ root: 'client', server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { buildGroupedGraph, deriveFocusedGraph } = await vite.ssrLoadModule('/src/features/workspace/services/groupedGraph.ts');
    const localeCompare = String.prototype.localeCompare;
    String.prototype.localeCompare = () => { throw new Error('locale ordering is not deterministic'); };
    try {
      const model = buildGroupedGraph([
        { id: 'a→b', folder: 'Z' }, { id: 'c', folder: 'Z' },
        { id: 'a', folder: 'a' }, { id: 'b→c', folder: 'a' },
      ], [
        { source: 'a→b', target: 'c' },
        { source: 'a', target: 'b→c' },
      ]);
      assert.equal(model.edges.length, 2);
      assert.equal(new Set(model.edges.map(edge => edge.id)).size, 2);
      assert.equal(deriveFocusedGraph(model, 'a→b').relatedEdgeIds.size, 1);
    } finally {
      String.prototype.localeCompare = localeCompare;
    }
  } finally {
    await vite.close();
  }
});

test('a real unconnected folder remains a normal budgeted folder', async () => {
  const vite = await createServer({ root: 'client', server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { buildGroupedGraph } = await vite.ssrLoadModule('/src/features/workspace/services/groupedGraph.ts');
    const nodes = Array.from({ length: 41 }, (_, index) => ({ id: `unconnected/file-${index}.ts`, folder: 'unconnected' }));
    const model = buildGroupedGraph(nodes, nodes.slice(1).map((node, index) => ({ source: node.id, target: nodes[index].id })));
    const group = model.groups.find(candidate => candidate.id === 'unconnected');
    assert.equal(group.unconnected, false);
    assert.equal(group.visibleFiles, 40);
  } finally {
    await vite.close();
  }
});

test('a budget-hidden file remains reachable through its internal dependency edge', async () => {
  const vite = await createServer({ root: 'client', server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { buildGroupedGraph, deriveFocusedGraph } = await vite.ssrLoadModule('/src/features/workspace/services/groupedGraph.ts');
    const nodes = Array.from({ length: 41 }, (_, index) => ({ id: `dense/file-${String(index).padStart(2, '0')}.ts`, folder: 'dense' }));
    const hiddenId = 'dense/file-40.ts';
    const neighborId = 'dense/file-39.ts';
    const model = buildGroupedGraph(nodes, nodes.slice(1).map((node, index) => ({ source: node.id, target: nodes[index].id })));
    const focus = deriveFocusedGraph(model, hiddenId);

    assert.equal(model.nodes.find(node => node.id === hiddenId).hiddenByBudget, true);
    assert.ok(model.edges.some(edge => edge.source === hiddenId && edge.target === neighborId));
    assert.deepEqual([...focus.relatedNodeIds].sort(), [hiddenId, neighborId].sort());
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

test('pending focus expands a budget-hidden file before focusing it', async () => {
  const vite = await createServer({ root: 'client', server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { buildGroupedGraph, resolveGroupedGraphFocus } = await vite.ssrLoadModule('/src/features/workspace/services/groupedGraph.ts');
    const nodes = Array.from({ length: 41 }, (_, index) => ({ id: `dense/file-${String(index).padStart(2, '0')}.ts`, folder: 'dense' }));
    const links = nodes.slice(1).map((node, index) => ({ source: node.id, target: nodes[index].id }));
    const hiddenPath = 'dense/file-40.ts';

    const collapsed = resolveGroupedGraphFocus(buildGroupedGraph(nodes, links), hiddenPath, new Set());
    assert.deepEqual(collapsed, { expandFolderId: 'dense', focusId: null });

    const expandedFolders = new Set([collapsed.expandFolderId]);
    const expanded = resolveGroupedGraphFocus(buildGroupedGraph(nodes, links, { expandedFolders }), hiddenPath, expandedFolders);
    assert.deepEqual(expanded, { expandFolderId: null, focusId: hiddenPath });
  } finally {
    await vite.close();
  }
});

test('selected node ID is cleared when the active folder filter excludes it', async () => {
  const vite = await createServer({ root: 'client', server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { buildGroupedGraph, selectedGroupedNodeId } = await vite.ssrLoadModule('/src/features/workspace/services/groupedGraph.ts');
    const model = buildGroupedGraph(inputNodes.filter(node => node.folder === 'server'), inputLinks);
    assert.equal(selectedGroupedNodeId(model, 'client/src/App.tsx'), null);
    assert.equal(selectedGroupedNodeId(model, 'server/routes.ts'), 'server/routes.ts');
  } finally {
    await vite.close();
  }
});
