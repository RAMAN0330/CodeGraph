const GROUP_GAP_X = 180;
const GROUP_GAP_Y = 90;
const GROUP_PADDING = 32;
const GROUP_HEADER = 38;
const NODE_GAP_X = 150;
const NODE_GAP_Y = 42;
const DEFAULT_VISIBLE_BUDGET = 40;

export interface GroupedFileNode {
  id: string;
  label: string;
  path: string;
  folderId: string;
  extension: string;
  incoming: number;
  outgoing: number;
  degree: number;
  x: number;
  y: number;
  hiddenByBudget: boolean;
  source: unknown;
}

export interface FolderGroup {
  id: string;
  label: string;
  rank: number;
  x: number;
  y: number;
  width: number;
  height: number;
  totalFiles: number;
  visibleFiles: number;
  expanded: boolean;
  unconnected: boolean;
}

export interface GroupedEdge {
  id: string;
  source: string;
  target: string;
  count: number;
  crossFolder: boolean;
  sourceData: unknown;
}

export interface GroupedGraphModel {
  nodes: GroupedFileNode[];
  visibleNodes: GroupedFileNode[];
  groups: FolderGroup[];
  edges: GroupedEdge[];
}

export interface GroupedGraphOptions {
  expandedFolders?: ReadonlySet<string>;
  visibleBudget?: number;
}

export interface FocusedGraphState {
  selectedId: string | null;
  relatedNodeIds: Set<string>;
  relatedEdgeIds: Set<string>;
}

export interface GroupedGraphFocusResolution {
  expandFolderId: string | null;
  focusId: string | null;
}

type RecordLike = Record<string, unknown>;
type PendingNode = GroupedFileNode & { originalFolderId: string };

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function idOf(value: unknown): string {
  if (value && typeof value === 'object') return text((value as RecordLike).id);
  return text(value);
}

function normalFolder(folder: unknown, path: string): string {
  const supplied = text(folder).replace(/^\/+|\/+$/g, '');
  if (supplied) return supplied;
  const slash = path.lastIndexOf('/');
  return slash > 0 ? path.slice(0, slash) : 'root';
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1) || path;
}

function extension(path: string): string {
  const name = fileName(path);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function componentRanks(folderIds: string[], folderEdges: Map<string, Set<string>>): Map<string, number> {
  let index = 0;
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const stack: string[] = [];
  const inStack = new Set<string>();
  const components: string[][] = [];
  const visit = (folderId: string) => {
    indices.set(folderId, index);
    lowlinks.set(folderId, index++);
    stack.push(folderId);
    inStack.add(folderId);
    for (const target of [...(folderEdges.get(folderId) || [])].sort(compareText)) {
      if (!indices.has(target)) {
        visit(target);
        lowlinks.set(folderId, Math.min(lowlinks.get(folderId)!, lowlinks.get(target)!));
      } else if (inStack.has(target)) {
        lowlinks.set(folderId, Math.min(lowlinks.get(folderId)!, indices.get(target)!));
      }
    }
    if (lowlinks.get(folderId) === indices.get(folderId)) {
      const component: string[] = [];
      let item = '';
      do {
        item = stack.pop()!;
        inStack.delete(item);
        component.push(item);
      } while (item !== folderId);
      components.push(component.sort());
    }
  };
  folderIds.forEach(visit);

  const componentByFolder = new Map<string, number>();
  components.forEach((component, componentId) => component.forEach(folderId => componentByFolder.set(folderId, componentId)));
  const predecessors = components.map(() => new Set<number>());
  folderEdges.forEach((targets, source) => targets.forEach(target => {
    const sourceComponent = componentByFolder.get(source)!;
    const targetComponent = componentByFolder.get(target)!;
    if (sourceComponent !== targetComponent) predecessors[targetComponent].add(sourceComponent);
  }));
  const ranks = new Map<number, number>();
  const rankFor = (componentId: number): number => {
    if (ranks.has(componentId)) return ranks.get(componentId)!;
    const rank = [...predecessors[componentId]].reduce((maximum, predecessor) => Math.max(maximum, rankFor(predecessor) + 1), 0);
    ranks.set(componentId, rank);
    return rank;
  };
  return new Map(folderIds.map(folderId => [folderId, rankFor(componentByFolder.get(folderId)!)]));
}

export function buildGroupedGraph(rawNodes: unknown[], rawLinks: unknown[], options: GroupedGraphOptions = {}): GroupedGraphModel {
  const pending = new Map<string, PendingNode>();
  for (const source of rawNodes) {
    const record = source && typeof source === 'object' ? source as RecordLike : {};
    const id = text(record.id) || text(record.path) || text(record.sourceFile);
    if (!id) throw new Error('Grouped graph node has an empty ID');
    if (pending.has(id)) throw new Error(`Grouped graph has duplicate node ID: ${id}`);
    const path = text(record.path) || text(record.sourceFile) || id;
    const folderId = normalFolder(record.folder, path);
    pending.set(id, {
      id, label: text(record.name) || fileName(path), path, folderId, originalFolderId: folderId,
      extension: extension(path), incoming: 0, outgoing: 0, degree: 0, x: 0, y: 0, hiddenByBudget: false, source,
    });
  }

  const edgeCounts = new Map<string, { source: string; target: string; count: number; sourceData: unknown }>();
  for (const sourceData of rawLinks) {
    const link = sourceData && typeof sourceData === 'object' ? sourceData as RecordLike : {};
    const source = idOf(link.source);
    const target = idOf(link.target);
    if (!source || !target || source === target || !pending.has(source) || !pending.has(target)) continue;
    const key = JSON.stringify([source, target]);
    const previous = edgeCounts.get(key);
    if (previous) previous.count += 1;
    else edgeCounts.set(key, { source, target, count: 1, sourceData });
  }
  const edges = [...edgeCounts.values()].sort((left, right) => compareText(left.source, right.source) || compareText(left.target, right.target));
  edges.forEach(edge => {
    pending.get(edge.source)!.outgoing += edge.count;
    pending.get(edge.target)!.incoming += edge.count;
  });
  const usedFolderIds = new Set([...pending.values()].map(node => node.folderId));
  let syntheticUnconnectedFolderId = 'unconnected';
  while (usedFolderIds.has(syntheticUnconnectedFolderId)) syntheticUnconnectedFolderId += ' (disconnected)';
  pending.forEach(node => { node.degree = node.incoming + node.outgoing; if (!node.degree) node.folderId = syntheticUnconnectedFolderId; });

  const hasSyntheticUnconnected = [...pending.values()].some(node => node.folderId === syntheticUnconnectedFolderId);
  const folderIds = [...new Set([...pending.values()].map(node => node.folderId).filter(folderId => folderId !== syntheticUnconnectedFolderId))].sort(compareText);
  const folderEdges = new Map(folderIds.map(folderId => [folderId, new Set<string>()]));
  edges.forEach(edge => {
    const sourceFolder = pending.get(edge.source)!.folderId;
    const targetFolder = pending.get(edge.target)!.folderId;
    if (sourceFolder !== syntheticUnconnectedFolderId && targetFolder !== syntheticUnconnectedFolderId && sourceFolder !== targetFolder) folderEdges.get(sourceFolder)!.add(targetFolder);
  });
  const ranks = componentRanks(folderIds, folderEdges);
  const groupIds = [...folderIds.filter(folderId => folderId !== 'root'), ...(folderIds.includes('root') ? ['root'] : []), ...(hasSyntheticUnconnected ? [syntheticUnconnectedFolderId] : [])];
  const budget = Math.max(0, Math.floor(options.visibleBudget ?? DEFAULT_VISIBLE_BUDGET));
  const groupNodes = new Map(groupIds.map(groupId => [groupId, [...pending.values()].filter(node => node.folderId === groupId).sort((left, right) => right.degree - left.degree || compareText(left.path, right.path))]));

  const groups: FolderGroup[] = groupIds.map(groupId => {
    const nodes = groupNodes.get(groupId)!;
    const expanded = options.expandedFolders?.has(groupId) || false;
    const unconnected = groupId === syntheticUnconnectedFolderId;
    const visibleFiles = unconnected || expanded ? nodes.length : Math.min(nodes.length, budget);
    return { id: groupId, label: groupId === 'root' ? 'Root' : unconnected ? 'Unconnected' : groupId,
      rank: unconnected ? Math.max(0, ...[...ranks.values()]) + 1 : ranks.get(groupId) || 0,
      x: 0, y: 0, width: 0, height: 0, totalFiles: nodes.length, visibleFiles, expanded, unconnected };
  });
  const byRank = new Map<number, FolderGroup[]>();
  groups.forEach(group => byRank.set(group.rank, [...(byRank.get(group.rank) || []), group]));
  let x = 0;
  [...byRank.keys()].sort((left, right) => left - right).forEach(rank => {
    let y = 0;
    let columnWidth = 0;
    byRank.get(rank)!.sort((left, right) => compareText(left.id, right.id)).forEach(group => {
      const columns = Math.max(1, Math.ceil(Math.sqrt(group.visibleFiles)));
      const rows = Math.max(1, Math.ceil(group.visibleFiles / columns));
      group.x = x;
      group.y = y;
      group.width = GROUP_PADDING * 2 + columns * NODE_GAP_X;
      group.height = GROUP_HEADER + GROUP_PADDING * 2 + rows * NODE_GAP_Y;
      columnWidth = Math.max(columnWidth, group.width);
      y += group.height + GROUP_GAP_Y;
    });
    x += columnWidth + GROUP_GAP_X;
  });
  const groupsById = new Map(groups.map(group => [group.id, group]));
  const nodes: GroupedFileNode[] = [];
  groupIds.forEach(groupId => groupNodes.get(groupId)!.forEach((node, index) => {
    const group = groupsById.get(groupId)!;
    const columns = Math.max(1, Math.ceil(Math.sqrt(group.visibleFiles)));
    node.hiddenByBudget = index >= group.visibleFiles;
    node.x = group.x + GROUP_PADDING + (index % columns) * NODE_GAP_X;
    node.y = group.y + GROUP_HEADER + GROUP_PADDING + Math.floor(index / columns) * NODE_GAP_Y;
    nodes.push(node);
  }));
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  return {
    nodes: [...nodes],
    visibleNodes: nodes.filter(node => !node.hiddenByBudget),
    groups: [...groups],
    edges: edges.map(edge => ({ id: JSON.stringify([edge.source, edge.target]), source: edge.source, target: edge.target, count: edge.count,
      crossFolder: nodeById.get(edge.source)!.folderId !== nodeById.get(edge.target)!.folderId, sourceData: edge.sourceData })),
  };
}

export function deriveFocusedGraph(model: GroupedGraphModel, selectedId: string | null): FocusedGraphState {
  const relatedNodeIds = new Set<string>();
  const relatedEdgeIds = new Set<string>();
  if (selectedId) relatedNodeIds.add(selectedId);
  for (const edge of model.edges) {
    if (edge.source === selectedId || edge.target === selectedId) {
      relatedNodeIds.add(edge.source);
      relatedNodeIds.add(edge.target);
      relatedEdgeIds.add(edge.id);
    }
  }
  return { selectedId, relatedNodeIds, relatedEdgeIds };
}

export function searchGroupedGraph(model: GroupedGraphModel, query: string): GroupedFileNode[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return model.nodes.filter(node => node.label.toLowerCase().includes(needle) || node.path.toLowerCase().includes(needle)).slice(0, 20);
}

export function selectedGroupedNodeId(model: GroupedGraphModel, path: string | null): string | null {
  if (!path) return null;
  return model.nodes.find(node => node.id === path || node.path === path)?.id ?? null;
}

export function resolveGroupedGraphFocus(
  model: GroupedGraphModel,
  path: string,
  expandedFolders: ReadonlySet<string>,
): GroupedGraphFocusResolution {
  const node = model.nodes.find(candidate => candidate.id === path || candidate.path === path);
  if (!node) return { expandFolderId: null, focusId: null };
  if (node.hiddenByBudget && !expandedFolders.has(node.folderId)) return { expandFolderId: node.folderId, focusId: null };
  return { expandFolderId: null, focusId: node.id };
}

export function advanceGroupedGraphFocus(
  model: GroupedGraphModel,
  pendingPath: string | null,
  expandedFolders: ReadonlySet<string>,
  focusNode: ((id: string) => void) | null,
): { pendingPath: string | null; expandFolderId: string | null } {
  if (!pendingPath) return { pendingPath: null, expandFolderId: null };
  const resolution = resolveGroupedGraphFocus(model, pendingPath, expandedFolders);
  if (resolution.expandFolderId) return { pendingPath, expandFolderId: resolution.expandFolderId };
  if (!resolution.focusId || !focusNode) return { pendingPath, expandFolderId: null };
  focusNode(resolution.focusId);
  return { pendingPath: null, expandFolderId: null };
}
