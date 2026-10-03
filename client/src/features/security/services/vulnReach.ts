// Where a vulnerable dependency is actually used: the files importing it
// (from the analysis's packageUsage) and how much code depends on those.
// An advisory for a package no source file imports is usually build tooling
// or a transitive dependency — still worth fixing, rarely first.

export interface Reach { importers: string[]; downstream: number }

// Python import names that differ from their PyPI package names.
const PY_ALIASES: Record<string, string> = {
  yaml: 'pyyaml', bs4: 'beautifulsoup4', pil: 'pillow', sklearn: 'scikit-learn', cv2: 'opencv-python',
  dateutil: 'python-dateutil', jwt: 'pyjwt', dotenv: 'python-dotenv', magic: 'python-magic', crypto: 'pycryptodome',
  openssl: 'pyopenssl', git: 'gitpython', docx: 'python-docx', attr: 'attrs', multipart: 'python-multipart',
  jose: 'python-jose', socketio: 'python-socketio', engineio: 'python-engineio', serial: 'pyserial', zmq: 'pyzmq',
  mysqldb: 'mysqlclient', ldap: 'python-ldap', markdown: 'markdown', jinja2: 'jinja2', google: 'protobuf',
};

const normPy = (name: string) => name.toLowerCase().replace(/[-_.]+/g, '-');
const normRuby = (name: string) => name.toLowerCase().replace(/[-_]/g, '');

export function importersOf(pkg: string, ecosystem: string, packageUsage: Record<string, string[]>): string[] {
  const files = new Set<string>();
  const add = (key: string) => (packageUsage[key] ?? []).forEach(f => files.add(f));
  const keys = Object.keys(packageUsage);
  switch (ecosystem) {
    case 'npm':
      add(`npm:${pkg.toLowerCase()}`);
      break;
    case 'PyPI': {
      const target = normPy(pkg);
      keys.filter(k => k.startsWith('pypi:')).forEach(k => {
        const module = k.slice(5);
        if (normPy(PY_ALIASES[module] ?? module) === target || normPy(module) === target) add(k);
      });
      break;
    }
    case 'Go':
      keys.filter(k => k.startsWith('go:')).forEach(k => { const path = k.slice(3); if (path === pkg || path.startsWith(`${pkg}/`)) add(k); });
      break;
    case 'RubyGems':
      keys.filter(k => k.startsWith('rubygems:') && normRuby(k.slice(9)) === normRuby(pkg)).forEach(add);
      break;
  }
  return [...files].sort();
}

function endpoint(value: any): string {
  return typeof value === 'object' && value ? value.id : value;
}

// Files that depend, directly or not, on any importer (runAnalysis:
// source = defining file, target = calling file).
export function downstreamOf(importers: string[], connections: any[]): number {
  if (!importers.length) return 0;
  const usedBy = new Map<string, string[]>();
  (connections || []).forEach(c => {
    const definer = endpoint(c.source), caller = endpoint(c.target);
    if (definer === caller) return;
    if (!usedBy.has(definer)) usedBy.set(definer, []);
    usedBy.get(definer)!.push(caller);
  });
  const seen = new Set(importers);
  const queue = [...importers];
  while (queue.length) for (const next of usedBy.get(queue.shift()!) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next); }
  return seen.size - importers.length;
}

// Null when the analysis predates package tracking (nothing to say either way).
export function vulnReach(pkg: string, ecosystem: string, data: any): Reach | null {
  if (!data?.packageUsage) return null;
  const importers = importersOf(pkg, ecosystem, data.packageUsage);
  return { importers, downstream: downstreamOf(importers, data.connections ?? []) };
}
