// Packages in a (mono)repository and the dependencies between them. Zero
// imports: the server's analysis job parses manifests with this (see
// server/src/analysis/sharedRules.ts); the workspace builds the graph.

export interface PackageInfo {
  root: string;            // folder, '' for the repository root
  manifest: string;        // path of the manifest file
  ecosystem: 'npm' | 'go' | 'python' | 'cargo' | 'maven' | 'gradle' | 'composer';
  name: string | null;     // what other packages declare it as
  declares: string[];      // dependency names in its manifest
}
export interface PackageNode { root: string; name: string | null; label: string; ecosystem: string; files: number }
export interface PackageEdge { from: string; to: string; dependencies: number; sample: Array<{ from: string; to: string }>; undeclared: boolean }

const MANIFESTS: Array<[RegExp, PackageInfo['ecosystem']]> = [
  [/(^|\/)package\.json$/, 'npm'], [/(^|\/)go\.mod$/, 'go'], [/(^|\/)pyproject\.toml$/, 'python'],
  [/(^|\/)Cargo\.toml$/, 'cargo'], [/(^|\/)pom\.xml$/, 'maven'], [/(^|\/)build\.gradle(?:\.kts)?$/, 'gradle'],
  [/(^|\/)composer\.json$/, 'composer'],
];
const VENDORED = /(^|\/)(node_modules|vendor|dist|build|\.venv|venv|target|examples?|fixtures|test-fixtures|__fixtures__)\//;

export function manifestEcosystem(path: string): PackageInfo['ecosystem'] | null {
  if (VENDORED.test(path)) return null;
  return MANIFESTS.find(([re]) => re.test(path))?.[1] ?? null;
}

function tomlSection(text: string, header: string): string {
  const m = text.match(new RegExp(`^\\[${header.replace(/[.[\]]/g, '\\$&')}\\][^\\n]*\\n([\\s\\S]*?)(?=^\\[|$(?![\\s\\S]))`, 'm'));
  return m ? m[1] : '';
}

export function parseManifest(path: string, text: string): PackageInfo | null {
  const ecosystem = manifestEcosystem(path);
  if (!ecosystem) return null;
  const root = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  let name: string | null = null;
  let declares: string[] = [];
  try {
    if (ecosystem === 'npm' || ecosystem === 'composer') {
      const json = JSON.parse(text);
      name = typeof json.name === 'string' ? json.name : null;
      const groups = ecosystem === 'npm' ? ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] : ['require', 'require-dev'];
      declares = groups.flatMap(g => Object.keys(json[g] ?? {}));
    } else if (ecosystem === 'go') {
      name = text.match(/^module\s+(\S+)/m)?.[1] ?? null;
      const block = text.match(/^require\s*\(([\s\S]*?)\)/m)?.[1] ?? '';
      declares = [...block.matchAll(/^\s*(\S+)\s+v/gm), ...text.matchAll(/^require\s+(\S+)\s+v/gm)].map(m => m[1]);
    } else if (ecosystem === 'python') {
      name = (tomlSection(text, 'project').match(/^name\s*=\s*["']([^"']+)/m) ?? tomlSection(text, 'tool.poetry').match(/^name\s*=\s*["']([^"']+)/m))?.[1] ?? null;
      const list = tomlSection(text, 'project').match(/^dependencies\s*=\s*\[([\s\S]*?)\]/m)?.[1] ?? '';
      declares = [...list.matchAll(/["']\s*([A-Za-z0-9_.-]+)/g), ...tomlSection(text, 'tool.poetry.dependencies').matchAll(/^([A-Za-z0-9_.-]+)\s*=/gm)].map(m => m[1]).filter(n => n !== 'python');
    } else if (ecosystem === 'cargo') {
      name = tomlSection(text, 'package').match(/^name\s*=\s*"([^"]+)"/m)?.[1] ?? null;
      declares = ['dependencies', 'dev-dependencies'].flatMap(s => [...tomlSection(text, s).matchAll(/^([A-Za-z0-9_-]+)\s*=/gm)].map(m => m[1]));
    } else if (ecosystem === 'maven') {
      const withoutParent = text.replace(/<parent>[\s\S]*?<\/parent>/, '').replace(/<dependencies>[\s\S]*<\/dependencies>/, '');
      name = withoutParent.match(/<artifactId>\s*([^<\s]+)\s*<\/artifactId>/)?.[1] ?? null;
      declares = [...(text.match(/<dependencies>([\s\S]*)<\/dependencies>/)?.[1] ?? '').matchAll(/<artifactId>\s*([^<\s]+)\s*<\/artifactId>/g)].map(m => m[1]);
    } else if (ecosystem === 'gradle') {
      name = root ? root.split('/').pop()! : null;
      declares = [...text.matchAll(/project\(\s*['"]:?([^'"]+)['"]\s*\)/g)].map(m => m[1].split(':').pop()!);
    }
  } catch {
    // Unparseable manifest: still a package boundary, just without names.
  }
  return { root, manifest: path, ecosystem, name, declares: [...new Set(declares)] };
}

function endpoint(value: any): string {
  return typeof value === 'object' && value ? value.id : value;
}

// The innermost package containing `path`.
export function packageOf(path: string, roots: string[]): string | null {
  let best: string | null = null;
  for (const root of roots) {
    if (root === '' || path.startsWith(`${root}/`)) if (best === null || root.length > best.length) best = root;
  }
  return best;
}

export function packageGraph(data: any): { nodes: PackageNode[]; edges: PackageEdge[] } {
  const packages: PackageInfo[] = data?.packages ?? [];
  // Several manifests in one folder (package.json + pyproject.toml) are one package.
  const byRoot = new Map<string, PackageInfo>();
  packages.forEach(p => { if (!byRoot.has(p.root)) byRoot.set(p.root, p); });
  const roots = [...byRoot.keys()];
  const counts = new Map<string, number>();
  (data?.files ?? []).forEach((f: any) => {
    const root = packageOf(f.path, roots);
    if (root !== null) counts.set(root, (counts.get(root) ?? 0) + 1);
  });
  const nodes = roots.map(root => {
    const p = byRoot.get(root)!;
    return { root, name: p.name, label: p.name ?? (root || '(root)'), ecosystem: p.ecosystem, files: counts.get(root) ?? 0 };
  }).sort((a, b) => b.files - a.files || a.label.localeCompare(b.label));

  const edges = new Map<string, PackageEdge>();
  (data?.connections ?? []).forEach((c: any) => {
    if (c.kind) return; // Markdown links are documentation, not dependencies.
    const toFile = endpoint(c.source), fromFile = endpoint(c.target);
    const from = packageOf(fromFile, roots), to = packageOf(toFile, roots);
    if (from === null || to === null || from === to) return;
    // A package nested inside another reaching up into its parent is still a
    // dependency; the parent containing the child is not.
    const key = `${from}\u0000${to}`;
    const edge = edges.get(key) ?? { from, to, dependencies: 0, sample: [], undeclared: false };
    edge.dependencies++;
    if (edge.sample.length < 5 && !edge.sample.some(s => s.from === fromFile && s.to === toFile)) edge.sample.push({ from: fromFile, to: toFile });
    edges.set(key, edge);
  });
  for (const edge of edges.values()) {
    const from = byRoot.get(edge.from)!, to = byRoot.get(edge.to)!;
    // Only meaningful when both sides have names in the same ecosystem. The
    // repository-root package is the workspace itself: its scripts using
    // workspace packages, or packages using it, isn't a missing declaration.
    edge.undeclared = Boolean(to.name && edge.to !== '' && edge.from !== '' && from.ecosystem === to.ecosystem && !from.declares.includes(to.name));
  }
  return { nodes, edges: [...edges.values()].sort((a, b) => Number(b.undeclared) - Number(a.undeclared) || b.dependencies - a.dependencies) };
}
