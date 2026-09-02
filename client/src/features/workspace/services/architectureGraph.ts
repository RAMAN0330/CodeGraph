export type ArchitectureKind = 'ui' | 'api' | 'service' | 'data' | 'infrastructure' | 'test' | 'external';

export interface ArchitectureGroup {
  id: string;
  label: string;
  description: string;
  order: number;
}

export interface ArchitectureNode {
  id: string;
  groupId: string;
  label: string;
  description: string;
  kind: ArchitectureKind;
  paths: string[];
}

export interface ArchitectureEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  evidencePaths: string[];
}

export interface ArchitectureGraph {
  version: 1;
  summary: string;
  groups: ArchitectureGroup[];
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
}

type FileLike = { path?: string; sourceFile?: string; id?: string; name?: string; layer?: string };
type ConnectionLike = { from?: string; to?: string; source?: string | { id?: string }; target?: string | { id?: string }; label?: string; relationship?: string; fn?: string };

export interface ArchitectureEnrichment {
  summary?: unknown;
  groups?: Array<{ id?: unknown; label?: unknown; description?: unknown }>;
  nodes?: Array<{ id?: unknown; label?: unknown; description?: unknown }>;
}

const GROUPS: Record<ArchitectureKind, Omit<ArchitectureGroup, 'id'>> = {
  ui: { label: 'Interface', description: 'User-facing pages and components.', order: 0 },
  api: { label: 'API', description: 'Routes, controllers, and request handlers.', order: 1 },
  service: { label: 'Services', description: 'Application and domain logic.', order: 2 },
  data: { label: 'Data', description: 'Models, persistence, and migrations.', order: 3 },
  infrastructure: { label: 'Infrastructure', description: 'Runtime, deployment, and configuration.', order: 4 },
  external: { label: 'External systems', description: 'Third-party services and dependencies.', order: 5 },
  test: { label: 'Tests', description: 'Automated verification and fixtures.', order: 6 },
};

const MAX_GROUPS = 10;
const MAX_NODES = 60;
const MAX_EDGES = 120;
const MAX_EVIDENCE = 8;

function filePath(file: FileLike): string {
  return String(file.path || file.sourceFile || file.id || '').replace(/^\.\//, '').trim();
}

function classify(file: FileLike, path: string): ArchitectureKind {
  const value = `${file.layer || ''}/${path}`.toLowerCase();
  if (/(^|[/_.-])(test|tests|spec|specs|fixture|fixtures)([/_.-]|$)/.test(value)) return 'test';
  if (/(docker|k8s|kubernetes|terraform|\.github|deploy|infra|config|scripts?)/.test(value)) return 'infrastructure';
  if (/(database|(^|\/)db\/|models?|migrations?|repositories|storage|schema)/.test(value)) return 'data';
  if (/(routes?|controllers?|handlers?|(^|\/)api\/|views)/.test(value)) return 'api';
  if (/(components?|pages?|screens?|frontend|client|(^|\/)ui\/)/.test(value)) return 'ui';
  return 'service';
}

function componentName(path: string): string {
  const parts = path.split('/').filter(Boolean);
  const srcIndex = parts.findIndex(part => /^(src|app|lib)$/i.test(part));
  const preferred = parts[srcIndex + 1] || parts[1] || parts[0] || 'root';
  // Only strip a trailing extension when something precedes the dot, so dotfiles
  // like `.env`/`.gitignore` keep their name instead of collapsing to ''.
  const withoutExt = preferred.replace(/^(.+)\.[^.]+$/, '$1');
  const base = (withoutExt || preferred).replace(/[-_]+/g, ' ').trim();
  return base || 'root';
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'component';
}

function endpoint(value: ConnectionLike['source']): string {
  return typeof value === 'string' ? value : String(value?.id || '');
}

function cleanText(value: unknown, fallback = '', max = 240): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f]/g, ' ').trim();
  return cleaned ? cleaned.slice(0, max) : fallback;
}

export function buildArchitectureGraph(files: FileLike[], connections: ConnectionLike[]): ArchitectureGraph {
  const validFiles = files.map(file => ({ file, path: filePath(file) })).filter(item => item.path);
  const validPaths = new Set(validFiles.map(item => item.path));
  const candidates = new Map<string, ArchitectureNode>();
  const pathToKey = new Map<string, string>();

  for (const { file, path } of validFiles) {
    const kind = classify(file, path);
    const label = componentName(path);
    const key = `${kind}:${label.toLowerCase()}`;
    pathToKey.set(path, key);
    const existing = candidates.get(key);
    if (existing) {
      if (existing.paths.length < 30) existing.paths.push(path);
    } else {
      candidates.set(key, {
        id: `arch_${slug(`${kind}_${label}`)}`,
        groupId: `group_${kind}`,
        label: label.replace(/\b\w/g, character => character.toUpperCase()),
        description: `${GROUPS[kind].label} component backed by repository files.`,
        kind,
        paths: [path],
      });
    }
  }

  const nodes = [...candidates.values()].sort((a, b) => a.groupId.localeCompare(b.groupId) || a.label.localeCompare(b.label)).slice(0, MAX_NODES);
  const retainedKeys = new Map(nodes.map(node => [`${node.kind}:${node.label.toLowerCase()}`, node.id]));
  const usedKinds = new Set(nodes.map(node => node.kind));
  const groups = ([...usedKinds] as ArchitectureKind[])
    .map(kind => ({ id: `group_${kind}`, ...GROUPS[kind] }))
    .sort((a, b) => a.order - b.order)
    .slice(0, MAX_GROUPS);
  const retainedGroupIds = new Set(groups.map(group => group.id));
  const retainedNodes = nodes.filter(node => retainedGroupIds.has(node.groupId));
  const nodeIds = new Set(retainedNodes.map(node => node.id));

  const edgesByPair = new Map<string, ArchitectureEdge>();
  for (const connection of connections) {
    const sourcePath = endpoint(connection.source) || String(connection.from || '');
    const targetPath = endpoint(connection.target) || String(connection.to || '');
    if (!validPaths.has(sourcePath) || !validPaths.has(targetPath)) continue;
    const source = retainedKeys.get(pathToKey.get(sourcePath) || '');
    const target = retainedKeys.get(pathToKey.get(targetPath) || '');
    if (!source || !target || source === target || !nodeIds.has(source) || !nodeIds.has(target)) continue;
    const key = `${source}->${target}`;
    const evidence = [sourcePath, targetPath];
    const existing = edgesByPair.get(key);
    if (existing) {
      existing.evidencePaths = [...new Set([...existing.evidencePaths, ...evidence])].slice(0, MAX_EVIDENCE);
      continue;
    }
    if (edgesByPair.size >= MAX_EDGES) break;
    edgesByPair.set(key, {
      id: `edge_${slug(key)}`,
      source,
      target,
      label: cleanText(connection.label || connection.relationship || connection.fn, 'depends on', 80),
      evidencePaths: evidence.slice(0, MAX_EVIDENCE),
    });
  }

  return {
    version: 1,
    summary: retainedNodes.length
      ? `${retainedNodes.length} system components across ${groups.length} architectural areas, derived from ${validPaths.size} repository files.`
      : 'No architecture components could be derived from this repository.',
    groups,
    nodes: retainedNodes,
    edges: [...edgesByPair.values()],
  };
}

export function applyArchitectureEnrichment(graph: ArchitectureGraph, enrichment: ArchitectureEnrichment): ArchitectureGraph {
  const groupUpdates = new Map((Array.isArray(enrichment.groups) ? enrichment.groups : []).map(item => [String(item.id), item]));
  const nodeUpdates = new Map((Array.isArray(enrichment.nodes) ? enrichment.nodes : []).map(item => [String(item.id), item]));
  return {
    ...graph,
    summary: cleanText(enrichment.summary, graph.summary, 600),
    groups: graph.groups.map(group => {
      const update = groupUpdates.get(group.id);
      return update ? { ...group, label: cleanText(update.label, group.label, 80), description: cleanText(update.description, group.description, 300) } : group;
    }),
    nodes: graph.nodes.map(node => {
      const update = nodeUpdates.get(node.id);
      return update ? { ...node, label: cleanText(update.label, node.label, 100), description: cleanText(update.description, node.description, 400) } : node;
    }),
  };
}

function mermaidText(value: string, fallback = 'Unnamed'): string {
  const cleaned = cleanText(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/[\[\]{}()]/g, ' ').trim();
  return cleaned || fallback;
}

export function compileArchitectureMermaid(graph: ArchitectureGraph): string {
  const lines = ['flowchart LR'];
  for (const group of graph.groups) {
    lines.push(`  subgraph ${group.id}["${mermaidText(group.label, 'Group')}"]`);
    for (const node of graph.nodes.filter(item => item.groupId === group.id)) lines.push(`    ${node.id}["${mermaidText(node.label, 'Component')}"]`);
    lines.push('  end');
  }
  for (const edge of graph.edges) lines.push(`  ${edge.source} -->|"${mermaidText(edge.label, 'depends on')}"| ${edge.target}`);
  for (const node of graph.nodes) lines.push(`  class ${node.id} kind_${node.kind}`);
  lines.push('  classDef kind_ui fill:#11333a,stroke:#55c4d4,color:#e8fbff');
  lines.push('  classDef kind_api fill:#173121,stroke:#4ac26b,color:#effff3');
  lines.push('  classDef kind_service fill:#2d2340,stroke:#a985e8,color:#faf5ff');
  lines.push('  classDef kind_data fill:#3a2e16,stroke:#daa520,color:#fff8e8');
  lines.push('  classDef kind_infrastructure fill:#2e2730,stroke:#d18fc2,color:#fff5fc');
  lines.push('  classDef kind_test fill:#3a2020,stroke:#e36d6d,color:#fff2f2');
  lines.push('  classDef kind_external fill:#202b38,stroke:#6da7e3,color:#f2f8ff');
  return lines.join('\n');
}
