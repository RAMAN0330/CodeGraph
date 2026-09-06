export interface CodeCanvasNode {
  id: string; // file path
  name: string;
  folder: string;
  layer?: string;
  lines: number;
  fnCount: number;
}

export interface CodeCanvasLink {
  source: string;
  target: string;
  count: number;
}

interface CodeCanvasFile {
  path: string;
  name: string;
  folder?: string;
  layer?: string;
  lines?: number;
  functions?: unknown[];
}

interface CodeCanvasConnection {
  source: string | { id: string };
  target: string | { id: string };
  count?: number;
}

// Force-directed layouts get noticeably slower and harder to read past a
// few hundred nodes, so the busiest files (by line count) win the cap.
export const CODE_CANVAS_MAX_NODES = 240;

export function buildCodeCanvasNodes(files: CodeCanvasFile[]): CodeCanvasNode[] {
  const sorted = [...files].sort((a, b) => (b.lines || 0) - (a.lines || 0));
  const capped = sorted.length > CODE_CANVAS_MAX_NODES ? sorted.slice(0, CODE_CANVAS_MAX_NODES) : sorted;
  return capped.map(f => ({
    id: f.path,
    name: f.name,
    folder: f.folder || 'root',
    layer: f.layer,
    lines: f.lines || 0,
    fnCount: f.functions ? f.functions.length : 0,
  }));
}

export function buildCodeCanvasLinks(connections: CodeCanvasConnection[], nodeIds: Set<string>): CodeCanvasLink[] {
  const links: CodeCanvasLink[] = [];
  (connections || []).forEach(c => {
    const src = typeof c.source === 'object' ? c.source.id : c.source;
    const tgt = typeof c.target === 'object' ? c.target.id : c.target;
    if (src && tgt && src !== tgt && nodeIds.has(src) && nodeIds.has(tgt)) {
      links.push({ source: src, target: tgt, count: c.count || 1 });
    }
  });
  return links;
}
