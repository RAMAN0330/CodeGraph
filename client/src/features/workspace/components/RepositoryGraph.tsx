import { useCallback } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap, 
  useNodesState, 
  useEdgesState, 
  addEdge
} from 'reactflow';
import type { Connection, Edge } from 'reactflow';
import 'reactflow/dist/style.css';

const initialNodes = [
  { id: 'root', type: 'input', data: { label: 'graphkeep-repo' }, position: { x: 250, y: 5 }, style: { background: 'var(--bg-secondary)', color: 'white', border: '1px solid var(--accent-blue)', borderRadius: '8px' } },
  { id: 'client', data: { label: 'client/' }, position: { x: 100, y: 100 }, style: { background: 'var(--bg-secondary)', color: 'white', border: '1px solid var(--border-glass)', borderRadius: '8px' } },
  { id: 'server', data: { label: 'server/' }, position: { x: 400, y: 100 }, style: { background: 'var(--bg-secondary)', color: 'white', border: '1px solid var(--border-glass)', borderRadius: '8px' } },
  { id: 'src', data: { label: 'src/' }, position: { x: 100, y: 200 }, style: { background: 'var(--bg-secondary)', color: 'white', border: '1px solid var(--border-glass)', borderRadius: '8px' } },
  { id: 'index.js', data: { label: 'index.js' }, position: { x: 400, y: 200 }, style: { background: 'var(--bg-secondary)', color: 'white', border: '1px solid var(--border-glass)', borderRadius: '8px' } },
];

const initialEdges = [
  { id: 'e-root-client', source: 'root', target: 'client', style: { stroke: 'var(--text-secondary)' } },
  { id: 'e-root-server', source: 'root', target: 'server', style: { stroke: 'var(--text-secondary)' } },
  { id: 'e-client-src', source: 'client', target: 'src', style: { stroke: 'var(--text-secondary)' } },
  { id: 'e-server-index', source: 'server', target: 'index.js', style: { stroke: 'var(--text-secondary)' } },
];

export default function RepositoryGraph() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback((params: Edge | Connection) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        // Performance optimization for large repositories
        onlyRenderVisibleElements={true} 
      >
        <MiniMap 
          nodeColor={() => 'var(--accent-blue)'} 
          style={{ background: 'var(--bg-secondary)' }}
          maskColor="rgba(0,0,0,0.5)"
        />
        <Controls style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', border: '1px solid var(--border-glass)', fill: 'white' }} />
        <Background color="#aaa" gap={16} />
      </ReactFlow>
    </div>
  );
}
