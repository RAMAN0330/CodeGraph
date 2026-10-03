// Dependency cycles of any length, and which dependencies to cut to break
// them. A cycle is a strongly connected component of the file graph ("A uses
// B uses C uses A"); the pair check in the analysis only sees A ↔ B.
//
// The cut plan is greedy: repeatedly remove the one dependency that frees the
// most files from the tangle, preferring the cheapest to refactor (fewest
// functions and call sites), until nothing in the component is cyclic.

export interface Dependency { from: string; to: string; functions: string[]; calls: number }
export interface CutStep extends Dependency { freed: number }
export interface Tangle { files: string[]; dependencies: number; plan: CutStep[]; planComplete: boolean }

// Planning recomputes components per candidate edge per step; beyond this the
// tangle is still reported, just without a plan (keeps the browser responsive).
const MAX_EDGES_FOR_PLAN = 800;
const MAX_STEPS = 12;

function endpoint(value: any): string {
  return typeof value === 'object' && value ? value.id : value;
}

const PACKAGE_SCOPED = /\.(?:go|java|kt|kts|scala|cs)$/i;
const dir = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

// In Go/JVM/C# the package (directory) is the unit: its files referencing
// each other is normal, not a cycle.
function samePackage(a: string, b: string): boolean {
  return PACKAGE_SCOPED.test(a) && PACKAGE_SCOPED.test(b) && dir(a) === dir(b);
}

// File-level "from depends on to" edges with the functions behind them.
// runAnalysis records source = file defining the function, target = caller.
export function dependencyEdges(connections: any[]): Dependency[] {
  const map = new Map<string, Dependency>();
  (connections || []).forEach(c => {
    if (c.kind) return; // Markdown links are documentation, not dependencies.
    const to = endpoint(c.source), from = endpoint(c.target);
    if (!from || !to || from === to || samePackage(from, to)) return;
    const key = `${from}\u0000${to}`;
    const edge = map.get(key) ?? { from, to, functions: [], calls: 0 };
    if (c.fn && !edge.functions.includes(c.fn)) edge.functions.push(c.fn);
    edge.calls += c.count || 1;
    map.set(key, edge);
  });
  return [...map.values()];
}

// Tarjan's algorithm, iterative so deep graphs can't overflow the stack.
export function stronglyConnected(nodes: string[], edges: Array<{ from: string; to: string }>): string[][] {
  const adj = new Map<string, string[]>(nodes.map(n => [n, []]));
  edges.forEach(e => { if (adj.has(e.from) && adj.has(e.to)) adj.get(e.from)!.push(e.to); });
  let index = 0;
  const idx = new Map<string, number>(), low = new Map<string, number>(), onStack = new Set<string>();
  const stack: string[] = [];
  const out: string[][] = [];
  for (const root of nodes) {
    if (idx.has(root)) continue;
    const work: Array<{ node: string; i: number }> = [{ node: root, i: 0 }];
    idx.set(root, index); low.set(root, index); index++; stack.push(root); onStack.add(root);
    while (work.length) {
      const frame = work[work.length - 1];
      const next = adj.get(frame.node)!;
      if (frame.i < next.length) {
        const w = next[frame.i++];
        if (!idx.has(w)) {
          idx.set(w, index); low.set(w, index); index++; stack.push(w); onStack.add(w);
          work.push({ node: w, i: 0 });
        } else if (onStack.has(w)) low.set(frame.node, Math.min(low.get(frame.node)!, idx.get(w)!));
        continue;
      }
      work.pop();
      if (work.length) low.set(work[work.length - 1].node, Math.min(low.get(work[work.length - 1].node)!, low.get(frame.node)!));
      if (low.get(frame.node) === idx.get(frame.node)) {
        const component: string[] = [];
        let w: string;
        do { w = stack.pop()!; onStack.delete(w); component.push(w); } while (w !== frame.node);
        out.push(component);
      }
    }
  }
  return out;
}

function cyclicFiles(nodes: string[], edges: Dependency[]): number {
  return stronglyConnected(nodes, edges).filter(c => c.length > 1).reduce((n, c) => n + c.length, 0);
}

export function findTangles(connections: any[]): Tangle[] {
  const edges = dependencyEdges(connections);
  const nodes = [...new Set(edges.flatMap(e => [e.from, e.to]))].sort();
  return stronglyConnected(nodes, edges)
    .filter(component => component.length > 1)
    .map(component => {
      const members = new Set(component);
      let inside = edges.filter(e => members.has(e.from) && members.has(e.to));
      const files = [...component].sort();
      const plan: CutStep[] = [];
      let remaining = files.length;
      if (inside.length <= MAX_EDGES_FOR_PLAN) {
        while (remaining > 0 && plan.length < MAX_STEPS) {
          let best: { edge: Dependency; left: number } | null = null;
          for (const edge of inside) {
            const left = cyclicFiles(files, inside.filter(e => e !== edge));
            const better = !best || left < best.left
              || (left === best.left && (edge.functions.length < best.edge.functions.length
                || (edge.functions.length === best.edge.functions.length && edge.calls < best.edge.calls)));
            if (better) best = { edge, left };
          }
          if (!best) break;
          plan.push({ ...best.edge, freed: remaining - best.left });
          inside = inside.filter(e => e !== best!.edge);
          remaining = best.left;
        }
      }
      return { files, dependencies: edges.filter(e => members.has(e.from) && members.has(e.to)).length, plan, planComplete: remaining === 0 };
    })
    .sort((a, b) => b.files.length - a.files.length || a.files[0].localeCompare(b.files[0]));
}
