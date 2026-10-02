import type { ArchitectureEdge, ArchitectureGraph, ArchitectureKind, ArchitectureNode } from './architectureGraph';

// Deterministic swimlane layout for the System Architecture view.
//
// Groups stack top to bottom as lanes; inside a lane, a component's column is
// its dependency depth (longest path from a source), so the request path reads
// left to right while stepping down through the lanes. Columns are separated by
// empty vertical gutters and rows by empty horizontal channels, and every edge
// is routed only through those, so a connector never passes under a card.

export const NODE_W = 212;
export const NODE_H = 64;
const COL_GAP = 76;
const ROW_GAP = 40;
const LANE_PAD_TOP = 58;
const LANE_PAD_BOTTOM = 22;
const LANE_PAD_X = 22;
const LANE_GAP = 26;
const PAD_X = 72;
const PAD_TOP = 28;
const LEGEND_H = 76;
const PORT_MARGIN = 14;
const MAX_TRACK_SPACING = 7;
const MAX_COLUMNS = 7;

export interface PlacedNode {
  node: ArchitectureNode;
  col: number;
  row: number; // global row index across all lanes
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedLane {
  id: string;
  index: number;
  label: string;
  kind: ArchitectureKind | null;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RoutedEdge {
  edge: ArchitectureEdge;
  points: Array<[number, number]>;
  dashed: boolean;
  labelAt: [number, number];
}

export interface ArchitectureLayout {
  width: number;
  height: number;
  legendY: number;
  lanes: PlacedLane[];
  nodes: PlacedNode[];
  edges: RoutedEdge[];
}

/**
 * Longest-path depth over the graph with DFS back edges ignored, so cycles still
 * rank. The walk starts at true sources and otherwise follows lane order, so a
 * cycle is broken on the edge that points back up the lanes.
 */
function computeRanks(graph: ArchitectureGraph): Map<string, number> {
  const laneIndex = new Map(graph.groups.map((group, i) => [group.id, i]));
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  const lane = (id: string) => laneIndex.get(byId.get(id)?.groupId ?? '') ?? 0;
  const hasIncoming = new Set(graph.edges.map(edge => edge.target));
  const nodes = [...graph.nodes].sort((a, b) => Number(hasIncoming.has(a.id)) - Number(hasIncoming.has(b.id)) || lane(a.id) - lane(b.id));
  const outgoing = new Map<string, string[]>(nodes.map(node => [node.id, []]));
  for (const edge of graph.edges) outgoing.get(edge.source)?.push(edge.target);
  for (const targets of outgoing.values()) targets.sort((a, b) => lane(a) - lane(b));

  const state = new Map<string, 1 | 2>();
  const order: string[] = [];
  const forward = new Map<string, string[]>(nodes.map(node => [node.id, []]));
  const visit = (id: string) => {
    state.set(id, 1);
    for (const next of outgoing.get(id) ?? []) {
      const seen = state.get(next);
      if (seen === 1) continue; // back edge: drop it for ranking only
      forward.get(id)!.push(next);
      if (!seen) visit(next);
    }
    state.set(id, 2);
    order.push(id);
  };
  for (const node of nodes) if (!state.has(node.id)) visit(node.id);

  const rank = new Map<string, number>(nodes.map(node => [node.id, 0]));
  for (const id of order.reverse()) {
    for (const next of forward.get(id) ?? []) rank.set(next, Math.max(rank.get(next)!, rank.get(id)! + 1));
  }
  return rank;
}

function spread(count: number, center: number, span: number): number[] {
  if (count <= 1) return [center];
  const step = Math.min(MAX_TRACK_SPACING, span / (count - 1));
  return Array.from({ length: count }, (_, i) => center + (i - (count - 1) / 2) * step);
}

function portOffsets(count: number): number[] {
  if (count <= 1) return [NODE_H / 2];
  const span = NODE_H - PORT_MARGIN * 2;
  return Array.from({ length: count }, (_, i) => PORT_MARGIN + (span * i) / (count - 1));
}

export function layoutArchitecture(graph: ArchitectureGraph): ArchitectureLayout {
  const ranks = computeRanks(graph);
  const maxRank = Math.max(0, ...ranks.values());
  const laneMembers = graph.groups.map(group => graph.nodes.filter(node => node.groupId === group.id));
  const largestLane = Math.max(1, ...laneMembers.map(members => members.length));
  const columns = Math.max(maxRank + 1, Math.min(MAX_COLUMNS, Math.max(3, Math.ceil(largestLane / 2))));

  const colX = (col: number) => PAD_X + col * (NODE_W + COL_GAP);
  const contentRight = colX(columns - 1) + NODE_W;

  // Pack each lane: a component wants its rank column, and takes the nearest
  // free column (then a new sub-row) when that cell is already taken.
  const placed: PlacedNode[] = [];
  const lanes: PlacedLane[] = [];
  const rowTops: number[] = [];
  const rowFirstOfLane: boolean[] = [];
  let y = PAD_TOP;
  graph.groups.forEach((group, laneIndex) => {
    const members = [...laneMembers[laneIndex]].sort((a, b) => ranks.get(a.id)! - ranks.get(b.id)! || a.label.localeCompare(b.label));
    const grid: boolean[][] = [];
    const cells: Array<{ node: ArchitectureNode; col: number; sub: number }> = [];
    for (const node of members) {
      const want = Math.min(ranks.get(node.id)!, columns - 1);
      const candidates = [want];
      for (let d = 1; d < columns; d++) candidates.push(want + d, want - d);
      let done = false;
      for (let sub = 0; !done; sub++) {
        grid[sub] ??= [];
        for (const col of candidates) {
          if (col < 0 || col >= columns || grid[sub][col]) continue;
          grid[sub][col] = true;
          cells.push({ node, col, sub });
          done = true;
          break;
        }
      }
    }
    const subRows = Math.max(1, grid.length);
    const laneTop = y;
    const firstRow = rowTops.length;
    for (let sub = 0; sub < subRows; sub++) {
      rowTops.push(laneTop + LANE_PAD_TOP + sub * (NODE_H + ROW_GAP));
      rowFirstOfLane.push(sub === 0);
    }
    for (const cell of cells) {
      const row = firstRow + cell.sub;
      placed.push({ node: cell.node, col: cell.col, row, x: colX(cell.col), y: rowTops[row], w: NODE_W, h: NODE_H });
    }
    const laneHeight = LANE_PAD_TOP + subRows * NODE_H + (subRows - 1) * ROW_GAP + LANE_PAD_BOTTOM;
    const kinds = new Set(members.map(member => member.kind));
    lanes.push({
      id: group.id,
      index: laneIndex,
      label: group.label,
      kind: kinds.size === 1 ? members[0].kind : null,
      x: PAD_X - LANE_PAD_X,
      y: laneTop,
      w: contentRight - PAD_X + LANE_PAD_X * 2,
      h: laneHeight,
    });
    y = laneTop + laneHeight + LANE_GAP;
  });

  const byId = new Map(placed.map(item => [item.node.id, item]));
  const occupied = new Set(placed.map(item => `${item.row}:${item.col}`));

  // Gutter g sits left of column g (g = columns is right of the last column);
  // channel r is the node-free band directly above row r.
  const gutterX = (g: number) => colX(g) - COL_GAP / 2;
  const channelY = (row: number) => (rowFirstOfLane[row] ? rowTops[row] - 18 : rowTops[row] - ROW_GAP / 2);
  const channelSpan = (row: number) => (rowFirstOfLane[row] ? 18 : ROW_GAP - 14);

  type Plan = {
    edge: ArchitectureEdge;
    source: PlacedNode;
    target: PlacedNode;
    kind: 'direct' | 'detour';
    outGutter: number;
    inGutter: number;
    outPort?: number;
    inPort?: number;
    outTrack?: number;
    inTrack?: number;
    channelTrack?: number;
  };

  const plans: Plan[] = [];
  for (const edge of graph.edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) continue;
    // Direct: one vertical jog in the gutter just left of the target, reached
    // by a straight run along the source row. Valid when the target is the
    // next column, or further right on the same row with nothing in between.
    let clearRun = target.col === source.col + 1;
    if (!clearRun && target.row === source.row && target.col > source.col) {
      clearRun = true;
      for (let col = source.col + 1; col < target.col; col++) if (occupied.has(`${source.row}:${col}`)) clearRun = false;
    }
    plans.push({ edge, source, target, kind: clearRun ? 'direct' : 'detour', outGutter: source.col + 1, inGutter: target.col });
  }

  // Ports: fan a node's connectors across its side, ordered by where each one heads.
  const outBy = new Map<string, Plan[]>();
  const inBy = new Map<string, Plan[]>();
  for (const plan of plans) {
    (outBy.get(plan.source.node.id) ?? outBy.set(plan.source.node.id, []).get(plan.source.node.id)!).push(plan);
    (inBy.get(plan.target.node.id) ?? inBy.set(plan.target.node.id, []).get(plan.target.node.id)!).push(plan);
  }
  const headingY = (plan: Plan) => (plan.kind === 'direct' ? plan.target.y : channelY(plan.target.row));
  const comingY = (plan: Plan) => (plan.kind === 'direct' ? plan.source.y : channelY(plan.target.row));
  for (const list of outBy.values()) {
    const offsets = portOffsets(list.length);
    [...list].sort((a, b) => headingY(a) - headingY(b) || a.target.x - b.target.x).forEach((plan, i) => { plan.outPort = plan.source.y + offsets[i]; });
  }
  for (const list of inBy.values()) {
    const offsets = portOffsets(list.length);
    [...list].sort((a, b) => comingY(a) - comingY(b) || a.source.x - b.source.x).forEach((plan, i) => { plan.inPort = plan.target.y + offsets[i]; });
  }

  // Tracks: every vertical run shares its gutter, every horizontal detour run
  // shares its channel; give each its own lane so parallel connectors stay apart.
  const gutterUse = new Map<number, Array<{ plan: Plan; slot: 'out' | 'in'; key: number }>>();
  const channelUse = new Map<number, Array<{ plan: Plan; key: number }>>();
  for (const plan of plans) {
    if (plan.kind === 'direct') {
      const list = gutterUse.get(plan.inGutter) ?? gutterUse.set(plan.inGutter, []).get(plan.inGutter)!;
      list.push({ plan, slot: 'in', key: (plan.outPort! + plan.inPort!) / 2 });
    } else {
      const outList = gutterUse.get(plan.outGutter) ?? gutterUse.set(plan.outGutter, []).get(plan.outGutter)!;
      outList.push({ plan, slot: 'out', key: plan.outPort! });
      const inList = gutterUse.get(plan.inGutter) ?? gutterUse.set(plan.inGutter, []).get(plan.inGutter)!;
      inList.push({ plan, slot: 'in', key: plan.inPort! });
      const channel = channelUse.get(plan.target.row) ?? channelUse.set(plan.target.row, []).get(plan.target.row)!;
      channel.push({ plan, key: (plan.source.x + plan.target.x) / 2 });
    }
  }
  for (const [gutter, list] of gutterUse) {
    const tracks = spread(list.length, gutterX(gutter), COL_GAP - 20);
    list.sort((a, b) => a.key - b.key).forEach((use, i) => {
      if (use.slot === 'out') use.plan.outTrack = tracks[i];
      else use.plan.inTrack = tracks[i];
    });
  }
  for (const [row, list] of channelUse) {
    const tracks = spread(list.length, channelY(row), channelSpan(row));
    list.sort((a, b) => a.key - b.key).forEach((use, i) => { use.plan.channelTrack = tracks[i]; });
  }

  const testIds = new Set(graph.nodes.filter(node => node.kind === 'test').map(node => node.id));
  const edges: RoutedEdge[] = plans.map(plan => {
    const start: [number, number] = [plan.source.x + plan.source.w, plan.outPort!];
    const end: [number, number] = [plan.target.x, plan.inPort!];
    const points: Array<[number, number]> = plan.kind === 'direct'
      ? [start, [plan.inTrack!, start[1]], [plan.inTrack!, end[1]], end]
      : [start, [plan.outTrack!, start[1]], [plan.outTrack!, plan.channelTrack!], [plan.inTrack!, plan.channelTrack!], [plan.inTrack!, end[1]], end];
    const route = points.filter((point, i) => i === 0 || point[0] !== points[i - 1][0] || point[1] !== points[i - 1][1]);
    return { edge: plan.edge, points: route, dashed: testIds.has(plan.edge.target), labelAt: labelAnchor(route, edgeLabelWidth(plan.edge.label)) };
  });

  const legendY = y - LANE_GAP + 28;
  return { width: contentRight + PAD_X, height: legendY + LEGEND_H, legendY, lanes, nodes: placed, edges };
}

export const EDGE_LABEL_MAX_CHARS = 24;
/** Rendered width of an edge label chip: 10px monospace plus padding. */
export function edgeLabelWidth(label: string): number {
  return Math.min(label.length, EDGE_LABEL_MAX_CHARS) * 6 + 12;
}

/**
 * Midpoint of the longest horizontal run that can hold the label; otherwise the
 * middle of the longest vertical run, which sits in a gutter rather than over
 * the short stubs that leave and enter cards.
 */
function labelAnchor(points: Array<[number, number]>, width: number): [number, number] {
  let best: [number, number] | null = null;
  for (const horizontal of [true, false]) {
    let bestLength = horizontal ? width + 16 : -1;
    for (let i = 1; i < points.length; i++) {
      const [x1, y1] = points[i - 1];
      const [x2, y2] = points[i];
      if ((y1 === y2) !== horizontal) continue;
      const length = Math.abs(x2 - x1) + Math.abs(y2 - y1);
      if (length >= bestLength) { bestLength = length; best = [(x1 + x2) / 2, (y1 + y2) / 2]; }
    }
    if (best) return best;
  }
  return points[0];
}

/** SVG path through orthogonal points with softly rounded bends. */
export function roundedPath(points: Array<[number, number]>, radius = 7): string {
  if (points.length < 2) return '';
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1];
    const [cx, cy] = points[i];
    const [nx, ny] = points[i + 1];
    const r = Math.min(radius, Math.hypot(cx - px, cy - py) / 2, Math.hypot(nx - cx, ny - cy) / 2);
    const ax = cx - Math.sign(cx - px) * r;
    const ay = cy - Math.sign(cy - py) * r;
    const bx = cx + Math.sign(nx - cx) * r;
    const by = cy + Math.sign(ny - cy) * r;
    d += ` L${ax},${ay} Q${cx},${cy} ${bx},${by}`;
  }
  const last = points[points.length - 1];
  return `${d} L${last[0]},${last[1]}`;
}

/** Nodes reachable from `id` following edges in the given direction (excluding `id`). */
export function reachable(graph: ArchitectureGraph, id: string, direction: 'downstream' | 'upstream'): Set<string> {
  const next = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const [from, to] = direction === 'downstream' ? [edge.source, edge.target] : [edge.target, edge.source];
    (next.get(from) ?? next.set(from, []).get(from)!).push(to);
  }
  const seen = new Set<string>();
  const queue = [id];
  while (queue.length) {
    for (const to of next.get(queue.shift()!) ?? []) {
      if (to !== id && !seen.has(to)) { seen.add(to); queue.push(to); }
    }
  }
  return seen;
}
