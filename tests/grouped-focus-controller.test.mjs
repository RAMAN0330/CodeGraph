import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const clientRequire = createRequire(resolve('client/package.json'));
const React = clientRequire('react');
const { act, create } = clientRequire('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createServer } = await import(pathToFileURL(clientRequire.resolve('vite')).href);

test('mounted controller focuses only after a delayed renderer signals readiness', async () => {
  const vite = await createServer({ root: 'client', server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { default: GroupedGraphFocusController } = await vite.ssrLoadModule('/src/features/workspace/components/GroupedGraphFocusController.tsx');
    const { buildGroupedGraph } = await vite.ssrLoadModule('/src/features/workspace/services/groupedGraph.ts');
    const nodes = Array.from({ length: 41 }, (_, index) => ({ id: `dense/file-${String(index).padStart(2, '0')}.ts`, folder: 'dense' }));
    const links = nodes.slice(1).map((node, index) => ({ source: node.id, target: nodes[index].id }));
    const path = 'dense/file-40.ts';
    const focused = [];
    let snapshot;

    const FakeRenderer = React.forwardRef(function FakeRenderer(props, ref) {
      React.useImperativeHandle(ref, () => ({ focusNode(id) { focused.push(id); } }), []);
      React.useEffect(() => { if (props.ready) props.onReady(); }, [props.onReady, props.ready]);
      return null;
    });

    function Harness() {
      const [rendererMounted, setRendererMounted] = React.useState(false);
      const [rendererReady, setRendererReady] = React.useState(false);
      const [pending, setPending] = React.useState(path);
      const [expanded, setExpanded] = React.useState(new Set());
      const graphRef = React.useRef(null);
      const model = React.useMemo(() => buildGroupedGraph(nodes, links, { expandedFolders: expanded }), [expanded]);
      const onExpandFolder = React.useCallback(id => {
        setExpanded(current => current.has(id) ? current : new Set(current).add(id));
      }, []);
      snapshot = {
        expanded: expanded.has('dense'),
        pending,
        targetVisible: model.visibleNodes.some(node => node.id === path),
        rendererReady: graphRef.current !== null,
      };
      return React.createElement(React.Fragment, null,
        React.createElement('button', { id: 'mount', onClick: () => setRendererMounted(true) }),
        React.createElement('button', { id: 'ready', onClick: () => setRendererReady(true) }),
        React.createElement(GroupedGraphFocusController, {
          model, pendingPath: pending, expandedFolders: expanded, graphRef,
          onExpandFolder,
          onPendingPathChange: setPending,
        }, onReady => rendererMounted ? React.createElement(FakeRenderer, {
          ref: graphRef, onReady, ready: rendererReady,
        }) : null),
      );
    }

    let renderer;
    await act(async () => { renderer = create(React.createElement(Harness)); });
    assert.deepEqual(snapshot, {
      expanded: true,
      pending: path,
      targetVisible: true,
      rendererReady: false,
    });
    assert.deepEqual(focused, []);
    await act(async () => { renderer.root.findByProps({ id: 'mount' }).props.onClick(); });
    assert.deepEqual(focused, [], 'installing the imperative ref must not focus without readiness');
    await act(async () => { renderer.root.findByProps({ id: 'ready' }).props.onClick(); });
    assert.deepEqual(focused, [path], 'onReady must be the sole trigger after the ref is installed');
    assert.equal(snapshot.pending, null);
    await act(async () => { renderer.unmount(); });
  } finally {
    await vite.close();
  }
});
