import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const clientRequire = createRequire(resolve('client/package.json'));
const { pathToFileURL } = await import('node:url');
const { createServer } = await import(pathToFileURL(clientRequire.resolve('vite')).href);
let vite;

before(async () => {
  vite = await createServer({ root: resolve('client'), server: { middlewareMode: true }, appType: 'custom' });
});
after(async () => vite?.close());

function textOf(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  return textOf(node.props?.children);
}

function elements(node, found = []) {
  if (!node || typeof node !== 'object') return found;
  if (node.type) found.push(node);
  const children = node.props?.children;
  (Array.isArray(children) ? children : [children]).forEach(child => elements(child, found));
  return found;
}

const data = {
  stats: { files: 2, functions: 3, connections: 1, loc: 20, dead: 1, languages: [] },
  deadFunctions: [{ name: 'unused', file: 'src/a.ts', codeLines: 2 }],
  securityIssues: [],
  layerViolations: [],
};

test('Summary shows repository name without removed overview copy', async () => {
  const { default: WorkspaceOverview } = await vite.ssrLoadModule('/src/features/workspace/components/WorkspaceOverview.tsx');
  const tree = WorkspaceOverview({
    repoInfo: { owner: 'Graphify-Labs', repo: 'graphify' }, data,
    health: { score: 90, grade: 'A' }, loading: false,
    onOpen() {}, onOpenUnused() {},
  });
  const text = textOf(tree);
  assert.match(text, /Graphify-Labs\/graphify/);
  assert.doesNotMatch(text, /Repository overview/i);
  assert.doesNotMatch(text, /A focused snapshot/i);
});

test('Summary unused-code button opens the unused panel without section navigation', async () => {
  const { default: WorkspaceOverview } = await vite.ssrLoadModule('/src/features/workspace/components/WorkspaceOverview.tsx');
  const opened = [];
  const sections = [];
  const tree = WorkspaceOverview({
    repoInfo: { owner: 'Graphify-Labs', repo: 'graphify' }, data,
    health: { score: 90, grade: 'A' }, loading: false,
    onOpen: section => sections.push(section), onOpenUnused: () => opened.push(true),
  });
  const button = elements(tree).find(node => node.type === 'button' && /Unused code/.test(textOf(node)));
  assert.ok(button);
  button.props.onClick();
  assert.deepEqual(opened, [true]);
  assert.deepEqual(sections, []);
});
