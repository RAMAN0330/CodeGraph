import type { CodeCanvasLink, CodeCanvasNode } from './codeCanvasGraph';

export interface FlowCard extends CodeCanvasNode {
  column: number;
  row: number;
  x: number;
  y: number;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  count: number;
  path: string;
  backwards: boolean;
}

export interface CodeFlowLayout {
  cards: FlowCard[];
  edges: FlowEdge[];
  incoming: Record<string, string[]>;
  outgoing: Record<string, string[]>;
  width: number;
  height: number;
}

export const CARD_WIDTH = 320;
export const CARD_HEIGHT = 36;
const GAP_X = 130;
const GAP_Y = 30;
const PADDING = 60;

// Import graphs are cyclic in practice. A DFS grey-edge scan marks the edges
// that close a cycle; layering ignores them, so depth stays bounded by the real
// dependency chain instead of spiralling once per pass around every loop.
function findBackEdges(ids: string[], links: CodeCanvasLink[]): Set<number> {
  const adjacency = new Map<string, { to: string; index: number }[]>();
  ids.forEach(id => adjacency.set(id, []));
  links.forEach((link, index) => adjacency.get(link.source)?.push({ to: link.target, index }));

  const OPEN = 1;
  const DONE = 2;
  const state = new Map<string, number>();
  const back = new Set<number>();

  for (const start of ids) {
    if (state.get(start)) continue;
    state.set(start, OPEN);
    const stack: { id: string; cursor: number }[] = [{ id: start, cursor: 0 }];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const edges = adjacency.get(frame.id) ?? [];
      if (frame.cursor >= edges.length) { state.set(frame.id, DONE); stack.pop(); continue; }
      const edge = edges[frame.cursor];
      frame.cursor += 1;
      const seen = state.get(edge.to);
      if (seen === OPEN) back.add(edge.index);
      else if (!seen) { state.set(edge.to, OPEN); stack.push({ id: edge.to, cursor: 0 }); }
    }
  }
  return back;
}

function layerNodes(ids: string[], forward: CodeCanvasLink[]): Map<string, number> {
  const depth = new Map(ids.map(id => [id, 0]));
  for (let pass = 0; pass < ids.length; pass += 1) {
    let moved = false;
    for (const link of forward) {
      const from = depth.get(link.source);
      const to = depth.get(link.target);
      if (from === undefined || to === undefined) continue;
      if (from + 1 > to) { depth.set(link.target, from + 1); moved = true; }
    }
    if (!moved) break;
  }
  return depth;
}

// Barycentre ordering: a node sits opposite the average row of what feeds it,
// which is what stops the edges between columns from crossing into a mesh.
function orderColumns(columns: string[][], incoming: Record<string, string[]>) {
  const rowOf = new Map<string, number>();
  columns.forEach(column => column.forEach((id, index) => rowOf.set(id, index)));

  for (let pass = 0; pass < 3; pass += 1) {
    for (let index = 1; index < columns.length; index += 1) {
      const previous = new Map(columns[index].map(id => [id, rowOf.get(id) ?? 0]));
      columns[index].sort((a, b) => {
        const weight = (id: string) => {
          const sources = incoming[id] ?? [];
          const rows = sources.map(source => rowOf.get(source)).filter((row): row is number => row !== undefined);
          return rows.length ? rows.reduce((sum, row) => sum + row, 0) / rows.length : previous.get(id) ?? 0;
        };
        return weight(a) - weight(b);
      });
      columns[index].forEach((id, row) => rowOf.set(id, row));
    }
  }
}

function edgePath(sx: number, sy: number, tx: number, ty: number, backwards: boolean): string {
  if (backwards) {
    // A dependency pointing back up the flow leaves and re-enters on the same
    // side, so it reads as a return path instead of crossing the columns.
    const bow = Math.max(70, (sx - tx) / 3);
    return `M${sx},${sy} C${sx + bow},${sy - 60} ${tx - bow},${ty - 60} ${tx},${ty}`;
  }
  const reach = Math.max(50, (tx - sx) / 2);
  return `M${sx},${sy} C${sx + reach},${sy} ${tx - reach},${ty} ${tx},${ty}`;
}

export function buildCodeFlowLayout(nodes: CodeCanvasNode[], links: CodeCanvasLink[]): CodeFlowLayout {
  const incoming: Record<string, string[]> = {};
  const outgoing: Record<string, string[]> = {};
  nodes.forEach(node => { incoming[node.id] = []; outgoing[node.id] = []; });
  links.forEach(link => {
    if (!incoming[link.target] || !outgoing[link.source]) return;
    outgoing[link.source].push(link.target);
    incoming[link.target].push(link.source);
  });

  const ids = nodes.map(node => node.id);
  const backEdges = findBackEdges(ids, links);
  const depth = layerNodes(ids, links.filter((_, index) => !backEdges.has(index)));

  const columns: string[][] = [];
  const ordered = [...nodes].sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name));
  ordered.forEach(node => {
    const column = depth.get(node.id) ?? 0;
    while (columns.length <= column) columns.push([]);
    columns[column].push(node.id);
  });
  orderColumns(columns, incoming);

  const byId = new Map(nodes.map(node => [node.id, node]));
  const cards: FlowCard[] = [];
  columns.forEach((column, columnIndex) => {
    const columnHeight = column.length * CARD_HEIGHT + Math.max(0, column.length - 1) * GAP_Y;
    column.forEach((id, rowIndex) => {
      const node = byId.get(id);
      if (!node) return;
      cards.push({
        ...node,
        column: columnIndex,
        row: rowIndex,
        x: PADDING + columnIndex * (CARD_WIDTH + GAP_X),
        y: PADDING + rowIndex * (CARD_HEIGHT + GAP_Y) - columnHeight / 2,
      });
    });
  });

  // Re-seat every column against a common baseline so the tallest one starts
  // at the padding line and the rest stay vertically centred against it.
  const minY = cards.reduce((low, card) => Math.min(low, card.y), Infinity);
  const shift = Number.isFinite(minY) ? PADDING - minY : 0;
  cards.forEach(card => { card.y += shift; });

  const position = new Map(cards.map(card => [card.id, card]));
  const edges: FlowEdge[] = links.map((link, index) => {
    const from = position.get(link.source);
    const to = position.get(link.target);
    if (!from || !to) return null;
    const backwards = backEdges.has(index) || to.x <= from.x;
    const sx = backwards ? from.x : from.x + CARD_WIDTH;
    const sy = from.y + CARD_HEIGHT / 2;
    const tx = backwards ? to.x + CARD_WIDTH : to.x;
    const ty = to.y + CARD_HEIGHT / 2;
    return {
      id: `${link.source}->${link.target}-${index}`,
      source: link.source,
      target: link.target,
      count: link.count,
      backwards,
      path: edgePath(sx, sy, tx, ty, backwards),
    };
  }).filter((edge): edge is FlowEdge => edge !== null);

  const width = cards.reduce((max, card) => Math.max(max, card.x + CARD_WIDTH), 0) + PADDING;
  const height = cards.reduce((max, card) => Math.max(max, card.y + CARD_HEIGHT), 0) + PADDING;

  return { cards, edges, incoming, outgoing, width, height };
}
