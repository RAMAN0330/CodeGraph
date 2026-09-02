import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const clientRequire = createRequire(resolve('client/package.json'));
const { createServer } = await import(pathToFileURL(clientRequire.resolve('vite')).href);

test('flattenTree handles a deeply nested expanded repository without overflowing the stack', async () => {
  const vite = await createServer({ root: 'client', server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { flattenTree } = await vite.ssrLoadModule('/src/features/repository/services/treeUtils.ts');
    const root = { name: 'root', path: '', children: {}, files: [] };
    const expanded = new Set(['']);
    let current = root;
    for (let index = 0; index < 12_000; index += 1) {
      const path = `folder-${index}`;
      const child = { name: path, path, children: {}, files: [] };
      current.children[path] = child;
      current = child;
      expanded.add(path);
    }
    current.files.push({ name: 'file.ts', path: 'folder-11999/file.ts' });

    const flattened = flattenTree(root, expanded);

    assert.equal(flattened.length, 12_001);
    assert.equal(flattened[0].count, 1);
    assert.equal(flattened.at(-1).path, 'folder-11999/file.ts');
  } finally {
    await vite.close();
  }
});
