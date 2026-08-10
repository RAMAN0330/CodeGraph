import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

test('grouped graph uses Sigma with folder overlays and workspace interactions', async () => {
  const source = await readFile(resolve('client/src/features/workspace/components/GroupedSigmaGraph.tsx'), 'utf8');

  assert.match(source, /new Sigma/);
  assert.match(source, /renderLabels/);
  assert.match(source, /folder-group-overlay/);
  assert.match(source, /onOpenFile\?\./);
  assert.match(source, /WebGL is unavailable/);
  assert.match(source, /focusNode/);
  assert.match(source, /onToggleFolder\(group\.id\)/);
  assert.doesNotMatch(source, /new Graph\(/);
});
