import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const clientRequire = createRequire(resolve('client/package.json'));
const { pathToFileURL } = await import('node:url');
const { createServer } = await import(pathToFileURL(clientRequire.resolve('vite')).href);
globalThis.WebGLRenderingContext = class WebGLRenderingContext {};
globalThis.WebGL2RenderingContext = class WebGL2RenderingContext {};
let vite;
let rendererModule;
let renderingModule;
let source;

before(async () => {
  vite = await createServer({ root: resolve('client'), server: { middlewareMode: true }, appType: 'custom' });
  rendererModule = await vite.ssrLoadModule('/src/features/workspace/components/GroupedSigmaGraph.tsx');
  renderingModule = await vite.ssrLoadModule('/src/features/workspace/components/groupedSigmaRendering.ts');
  source = await readFile(resolve('client/src/features/workspace/components/GroupedSigmaGraph.tsx'), 'utf8');
});
after(async () => vite?.close());

const node = {
  id: 'src/App.tsx', label: 'App.tsx', path: 'src/App.tsx', folderId: 'src', extension: 'tsx',
  incoming: 0, outgoing: 1, degree: 1, x: 32, y: 70, hiddenByBudget: false, source: {},
};
const model = {
  nodes: [node], visibleNodes: [node], edges: [],
  groups: [{ id: 'src', label: 'src', rank: 0, x: 0, y: 0, width: 214, height: 144, totalFiles: 41, visibleFiles: 1, expanded: false, unconnected: false }],
};

function tagWithClass(html, className) {
  return html.match(new RegExp(`<[^>]+class="[^"]*${className}[^"]*"[^>]*>`))?.[0] || '';
}

test('grouped graph uses Sigma with folder overlays and workspace interactions', () => {
  assert.match(source, /new Sigma/);
  assert.match(source, /renderLabels/);
  assert.match(source, /folder-group-overlay/);
  assert.match(source, /onOpenFile\?\./);
  assert.match(source, /WebGL is unavailable/);
  assert.match(source, /focusNode/);
  assert.match(source, /onToggleFolder\(group\.id\)/);
  assert.doesNotMatch(source, /new Graph\(/);
});

test('folder controls render above the interactive stage while boundaries remain behind it', () => {
  const React = clientRequire('react');
  const { renderToStaticMarkup } = clientRequire('react-dom/server');
  const html = renderToStaticMarkup(React.createElement(rendererModule.default, {
    model, selectedId: null, focusMode: 'all', onSelectNode() {}, onStageClick() {}, onToggleFolder() {},
  }));
  const boundary = tagWithClass(html, 'folder-group-overlay');
  const controls = tagWithClass(html, 'folder-group-controls');
  const stage = tagWithClass(html, 'grouped-sigma-stage');
  const button = html.match(/<button[^>]*>/)?.[0] || '';

  assert.match(boundary, /z-index:1/);
  assert.match(boundary, /pointer-events:none/);
  assert.match(boundary, /border:1px solid #3e4652/);
  assert.match(boundary, /background:rgba\(33,37,43,(?:0)?\.54\)/);
  assert.match(stage, /z-index:2/);
  assert.match(controls, /z-index:3/);
  assert.match(controls, /pointer-events:none/);
  assert.match(button, /pointer-events:auto/);
});

test('node labels draw a solid dark backplate and readable foreground text', () => {
  const operations = [];
  let fillStyle = '';
  const context = {
    set font(_value) {},
    set textBaseline(_value) {},
    set fillStyle(value) { fillStyle = value; },
    measureText() { return { width: 48 }; },
    fillRect() { operations.push(['backplate', fillStyle]); },
    fillText() { operations.push(['label', fillStyle]); },
  };

  renderingModule.drawGroupedNodeLabel(context, { x: 10, y: 20, size: 6, label: 'App.tsx' }, {
    labelSize: 12, labelFont: 'sans-serif', labelWeight: 'normal',
  });

  assert.deepEqual(operations, [
    ['backplate', '#21252b'],
    ['label', '#d8dee9'],
  ]);
  assert.match(source, /defaultDrawNodeLabel:\s*drawGroupedNodeLabel/);
  assert.match(source, /labelColor:\s*\{\s*color:\s*LABEL_COLOR/);
});

test('hovered and selected labels use the high-contrast dark backplate renderer', () => {
  assert.match(source, /defaultDrawNodeHover:\s*drawGroupedNodeLabel/);
  assert.match(source, /highlighted:\s*node === activeId \|\| hovered/);
  assert.notEqual('#21252b', '#d8dee9');
});

test('WebGL probe release loses its temporary context', () => {
  const calls = [];
  renderingModule.releaseWebglContext({
    getExtension(name) {
      calls.push(name);
      return { loseContext() { calls.push('lost'); } };
    },
  });
  assert.deepEqual(calls, ['WEBGL_lose_context', 'lost']);
  assert.match(source, /releaseWebglContext\(probeContext\)/);
});

test('hover tooltip is cleared on leave and renderer cleanup', () => {
  const leaveHandler = source.slice(source.indexOf("renderer.on('leaveNode'"), source.indexOf("renderer.on('clickStage'"));
  const cleanup = source.slice(source.indexOf('return () => {'));
  assert.match(leaveHandler, /onTooltip\?\.\(null\)/);
  assert.match(cleanup, /onTooltip\?\.\(null\)/);
});

test('hover tooltip includes viewport pointer coordinates', () => {
  assert.deepEqual(rendererModule.positionGroupedTooltip(
    { title: 'App.tsx', content: 'src/App.tsx' },
    { original: { clientX: 120, clientY: 75 } },
  ), { title: 'App.tsx', content: 'src/App.tsx', x: 130, y: 85 });
  assert.match(source, /positionGroupedTooltip\(tooltipFor\(node\),\s*event\)/);
});
