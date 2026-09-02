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

test('maps Graphify records into canvas nodes and links and prunes dangling links', async () => {
  const { adaptGraphifyGraph } = await vite.ssrLoadModule('/src/features/analysis/services/graphifyAdapter.ts');
  const graph = adaptGraphifyGraph({
    nodes: [
      { id: 'service', label: 'Service', source_file: 'src/service.ts', source_location: 'L12', file_type: 'code', community: 3, community_name: 'Core' },
      { id: 'handler', label: 'handler()', source_file: 'src/service.ts', source_location: 'L30', file_type: 'function', community: 3 },
    ],
    links: [
      { source: 'service', target: 'handler', relation: 'contains', confidence: 'EXTRACTED', weight: 0.9 },
      { source: 'service', target: 'missing', relation: 'calls' },
    ],
  });

  assert.equal(graph.nodes.length, 2);
  assert.deepEqual(graph.nodes[0], {
    id: 'service', name: 'Service', folder: 'Core', fnCount: 1, layer: 'code', churn: 0,
    sourceFile: 'src/service.ts', sourceLocation: 'L12', line: 12, fileType: 'code',
    community: 3, communityName: 'Core', degree: 1, incoming: 0, outgoing: 1,
  });
  assert.deepEqual(graph.links, [{
    source: 'service', target: 'handler', count: 1, fn: 'contains',
    relationship: 'contains', confidence: 'EXTRACTED', confidenceScore: 0.9,
    sourceFile: '', sourceLocation: '',
  }]);
});
