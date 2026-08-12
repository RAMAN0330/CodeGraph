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

test('mounted controller carries hidden focus through view switch, renderer readiness, and interactions', async () => {
  const vite = await createServer({ root: 'client', server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { default: GroupedGraphFocusController } = await vite.ssrLoadModule('/src/features/workspace/components/GroupedGraphFocusController.tsx');
    const { buildGroupedGraph } = await vite.ssrLoadModule('/src/features/workspace/services/groupedGraph.ts');
    const nodes = Array.from({ length: 41 }, (_, index) => ({ id: `dense/file-${String(index).padStart(2, '0')}.ts`, folder: 'dense' }));
    const links = nodes.slice(1).map((node, index) => ({ source: node.id, target: nodes[index].id }));
    const path = 'dense/file-40.ts';
    const focused = [];
    const selected = [];
    let stageClears = 0;

    const FakeRenderer = React.forwardRef(function FakeRenderer(props, ref) {
      React.useImperativeHandle(ref, () => ({ focusNode(id) { focused.push(id); } }), []);
      React.useEffect(() => { props.onReady(); }, [props.onReady]);
      return React.createElement(React.Fragment, null,
        React.createElement('button', { id: 'node', onClick: () => props.onSelectNode(path) }),
        React.createElement('button', { id: 'stage', onClick: props.onStageClick }),
      );
    });

    function Harness() {
      const [view, setView] = React.useState('tree');
      const [pending, setPending] = React.useState(path);
      const [expanded, setExpanded] = React.useState(new Set());
      const graphRef = React.useRef(null);
      const model = React.useMemo(() => buildGroupedGraph(nodes, links, { expandedFolders: expanded }), [expanded]);
      return React.createElement(React.Fragment, null,
        React.createElement('button', { id: 'switch', onClick: () => setView('graph') }),
        React.createElement(GroupedGraphFocusController, {
          model, pendingPath: pending, expandedFolders: expanded, graphRef,
          onExpandFolder(id) { setExpanded(current => new Set(current).add(id)); },
          onPendingPathChange: setPending,
        }, onReady => view === 'graph' ? React.createElement(FakeRenderer, {
          ref: graphRef, onReady,
          onSelectNode(id) { selected.push(id); },
          onStageClick() { stageClears += 1; },
        }) : null),
      );
    }

    let renderer;
    await act(async () => { renderer = create(React.createElement(Harness)); });
    assert.deepEqual(focused, []);
    await act(async () => { renderer.root.findByProps({ id: 'switch' }).props.onClick(); });
    assert.deepEqual(focused, [path]);
    await act(async () => { renderer.root.findByProps({ id: 'node' }).props.onClick(); });
    await act(async () => { renderer.root.findByProps({ id: 'stage' }).props.onClick(); });
    assert.deepEqual(selected, [path]);
    assert.equal(stageClears, 1);
    await act(async () => { renderer.unmount(); });
  } finally {
    await vite.close();
  }
});
