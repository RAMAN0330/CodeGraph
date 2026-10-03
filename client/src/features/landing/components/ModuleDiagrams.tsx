import { motion, useReducedMotion, type Variants } from 'framer-motion';
import './ModuleDiagrams.css';

// Every diagram except Security is drawn from Structrace's own repository:
// file counts and import edges from client/src/features, services from
// docker-compose.yml, commits and churn from git log, tables and foreign keys
// from the app's Postgres schema. Security shows an example scan, labeled so.

type DiagramProps = { still?: boolean };

const group: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.035, delayChildren: 0.05 } } };
const pop: Variants = { hidden: { opacity: 0, scale: .85 }, visible: { opacity: 1, scale: 1, transition: { duration: .5, ease: [0.16, 1, 0.3, 1] } } };
const fade: Variants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: .6, ease: 'easeOut' } } };
const draw: Variants = { hidden: { pathLength: 0, opacity: 0 }, visible: { pathLength: 1, opacity: 1, transition: { duration: .7, ease: 'easeOut' } } };

function Frame({ still, label, children }: DiagramProps & { label: string; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const animate = !still && !reduce;
  return (
    <motion.svg
      viewBox="0 0 1000 625" className={`dg${animate ? ' dg-live' : ''}`} role="img" aria-label={label}
      variants={group} initial={animate ? 'hidden' : 'visible'} whileInView="visible" viewport={{ once: true, amount: .3 }}
    >
      {children}
    </motion.svg>
  );
}

const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const mx = (x1 + x2) / 2;
  return `M${x1} ${y1} C${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
};

// ---- Code graph: client features sized by file count, linked by imports ----
const FEATURES = [
  { id: 'workspace', files: 44, x: 470, y: 312 },
  { id: 'database', files: 26, x: 232, y: 452 },
  { id: 'analysis', files: 10, x: 724, y: 178 },
  { id: 'organization', files: 7, x: 160, y: 250 },
  { id: 'git-insights', files: 7, x: 660, y: 520 },
  { id: 'security', files: 4, x: 318, y: 138 },
  { id: 'repository', files: 3, x: 790, y: 388 },
  { id: 'export', files: 3, x: 548, y: 92 },
  { id: 'auth', files: 3, x: 92, y: 120 },
  { id: 'landing', files: 1, x: 70, y: 400 },
  { id: 'shared', files: 0, x: 916, y: 250 },
];
const IMPORTS: Array<[string, string, number]> = [
  ['workspace', 'shared', 19], ['workspace', 'analysis', 13], ['workspace', 'security', 4], ['workspace', 'database', 4],
  ['workspace', 'repository', 3], ['workspace', 'export', 2], ['workspace', 'organization', 2], ['workspace', 'git-insights', 1],
  ['repository', 'analysis', 2], ['git-insights', 'repository', 2], ['database', 'organization', 2], ['analysis', 'repository', 1],
  ['export', 'repository', 1], ['organization', 'database', 1], ['auth', 'organization', 1], ['landing', 'organization', 1],
  ['database', 'repository', 1], ['database', 'shared', 1], ['organization', 'shared', 1], ['repository', 'shared', 1],
];
const radius = (files: number) => files ? 12 + Math.sqrt(files) * 5.4 : 16;

export function CodeGraphDiagram({ still }: DiagramProps) {
  const at = (id: string) => FEATURES.find(f => f.id === id)!;
  return (
    <Frame still={still} label="Import graph of Structrace's client features: workspace is the hub, importing analysis, shared, security and database">
      <g>
        {IMPORTS.map(([a, b, n]) => {
          const s = at(a), t = at(b);
          return <motion.line key={a + b} x1={s.x} y1={s.y} x2={t.x} y2={t.y} className="dg-edge" strokeWidth={1 + Math.sqrt(n) * 1.1} variants={fade} />;
        })}
      </g>
      {FEATURES.map(f => {
        const r = radius(f.files);
        const hub = f.id === 'workspace';
        return (
          <motion.g key={f.id} variants={pop} style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
            {hub && <circle cx={f.x} cy={f.y} r={r + 12} className="dg-halo" />}
            <circle cx={f.x} cy={f.y} r={r} className={hub ? 'dg-node dg-node-hub' : f.id === 'shared' ? 'dg-node dg-node-quiet' : 'dg-node'} />
            {f.files > 0 && <text x={f.x} y={f.y + 5} textAnchor="middle" className={hub ? 'dg-count dg-count-hub' : 'dg-count'}>{f.files}</text>}
            <text x={f.x} y={f.y + r + 20} textAnchor="middle" className="dg-label">{f.id === 'shared' ? 'src/shared/' : `${f.id}/`}</text>
          </motion.g>
        );
      })}
      <text x={28} y={600} className="dg-note">client/src/features · circles sized by file count · lines are imports · dashed: outside features</text>
    </Frame>
  );
}

// ---- Architecture: the services in docker-compose.yml and who calls whom ----
const SERVICES = [
  { id: 'browser', title: 'Browser', sub: 'React + Vite', x: 30, y: 280, tier: 'edge' },
  { id: 'client', title: 'client', sub: 'nginx · :8080', x: 215, y: 280, tier: 'edge' },
  { id: 'gateway', title: 'gateway', sub: 'Go · :5000', x: 400, y: 280, tier: 'api' },
  { id: 'legacy', title: 'legacy-api', sub: 'Node · :5001', x: 590, y: 150, tier: 'api' },
  { id: 'analysis', title: 'analysis', sub: 'FastAPI · :8000', x: 590, y: 410, tier: 'work' },
  { id: 'postgres', title: 'postgres', sub: 'PostgreSQL 16', x: 800, y: 70, tier: 'data' },
  { id: 'redis', title: 'redis', sub: 'Redis 7.4', x: 800, y: 280, tier: 'data' },
  { id: 'worker', title: 'worker', sub: 'Celery', x: 800, y: 490, tier: 'work' },
];
const CALLS: Array<[string, string]> = [
  ['browser', 'client'], ['client', 'gateway'], ['gateway', 'legacy'], ['gateway', 'analysis'],
  ['legacy', 'postgres'], ['legacy', 'redis'], ['legacy', 'analysis'], ['analysis', 'redis'], ['worker', 'redis'],
];
const BOX_W = 168, BOX_H = 66;
const TIERS = [{ id: 'edge', label: 'Edge', x: 18, w: 360 }, { id: 'api', label: 'API', x: 388, w: 392 }, { id: 'data', label: 'Data & jobs', x: 784, w: 200 }];

export function ArchitectureDiagram({ still }: DiagramProps) {
  const markerId = still ? 'dg-arrow-thumb' : 'dg-arrow';
  const at = (id: string) => SERVICES.find(s => s.id === id)!;
  const path = (a: string, b: string) => {
    const s = at(a), t = at(b);
    if (a === 'worker') return `M${t.x + BOX_W / 2} ${s.y} L${t.x + BOX_W / 2} ${t.y + BOX_H}`;
    if (a === 'legacy' && b === 'analysis') return `M${s.x + BOX_W / 2} ${s.y + BOX_H} L${t.x + BOX_W / 2} ${t.y}`;
    return curve(s.x + BOX_W, s.y + BOX_H / 2, t.x, t.y + BOX_H / 2);
  };
  return (
    <Frame still={still} label="Structrace service architecture: browser to nginx to the Go gateway, which calls the Node API and the FastAPI analysis service, backed by Postgres, Redis and a Celery worker">
      <defs>
        <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 1 L9 5 L0 9 Z" className="dg-arrow" />
        </marker>
      </defs>
      {TIERS.map(t => (
        <g key={t.id}>
          <rect x={t.x} y={22} width={t.w} height={566} rx={13} className="dg-tier" />
          <text x={t.x + 16} y={48} className="dg-tier-label">{t.label}</text>
        </g>
      ))}
      {CALLS.map(([a, b]) => (
        <g key={a + b}>
          <motion.path d={path(a, b)} className="dg-edge dg-call" markerEnd={`url(#${markerId})`} variants={draw} />
        </g>
      ))}
      {SERVICES.map(s => (
        <motion.g key={s.id} variants={pop} style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
          <rect x={s.x} y={s.y} width={BOX_W} height={BOX_H} rx={9} className={`dg-box dg-box-${s.tier}`} />
          <text x={s.x + 16} y={s.y + 29} className="dg-box-title">{s.title}</text>
          <text x={s.x + 16} y={s.y + 49} className="dg-box-sub">{s.sub}</text>
        </motion.g>
      ))}
      <text x={28} y={612} className="dg-note">docker-compose.yml · arrows follow requests</text>
    </Frame>
  );
}

// ---- Insights: every commit by day, and where the lines changed ----
const COMMITS: Record<string, number> = {
  '2026-04-24': 1, '2026-04-29': 34, '2026-05-01': 22, '2026-05-02': 25, '2026-05-03': 6, '2026-08-11': 21, '2026-08-12': 8,
  '2026-08-20': 1, '2026-08-31': 2, '2026-09-02': 1, '2026-09-06': 2, '2026-09-22': 1, '2026-10-03': 1,
};
const CHURN = [
  { area: 'workspace/', lines: 25172 }, { area: 'server/src/', lines: 6037 }, { area: 'database/', lines: 5787 },
  { area: 'analysis/', lines: 4963 }, { area: 'git-insights/', lines: 2849 }, { area: 'repository/', lines: 2146 },
];
const WEEKS = 24;
const FIRST_MONDAY = Date.UTC(2026, 3, 20); // week of the first commit

export function InsightsDiagram({ still }: DiagramProps) {
  const step = 30, cell = 25, x0 = 112, y0 = 92;
  const days = Array.from({ length: WEEKS * 7 }, (_, i) => {
    const date = new Date(FIRST_MONDAY + i * 86400000).toISOString().slice(0, 10);
    return { i, date, n: COMMITS[date] ?? 0 };
  });
  const level = (n: number) => n === 0 ? 0 : n < 3 ? 1 : n < 10 ? 2 : n < 24 ? 3 : 4;
  const max = CHURN[0].lines;
  return (
    <Frame still={still} label="Structrace commit activity: 125 commits, most in late April, early May and mid August; workspace has the most changed lines">
      <text x={28} y={56} className="dg-heading">125 commits</text>
      <text x={240} y={56} className="dg-sub">April to October 2026</text>
      <text x={756} y={56} className="dg-axis">Less</text>
      {[0, 1, 2, 3, 4].map(l => <rect key={l} x={796 + l * 22} y={41} width={18} height={18} rx={4} className={`dg-heat dg-heat-${l}`} />)}
      <text x={910} y={56} className="dg-axis">More</text>
      {['Mon', 'Wed', 'Fri'].map((d, k) => <text key={d} x={x0 - 14} y={y0 + (k * 2) * step + 18} textAnchor="end" className="dg-axis">{d}</text>)}
      {days.map(d => (
        <motion.rect
          key={d.date} variants={pop} style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          x={x0 + Math.floor(d.i / 7) * step} y={y0 + (d.i % 7) * step}
          width={cell} height={cell} rx={4} className={`dg-heat dg-heat-${level(d.n)}`}
        >
          <title>{`${d.date}: ${d.n} commit${d.n === 1 ? '' : 's'}`}</title>
        </motion.rect>
      ))}
      {['Apr', 'Jun', 'Aug', 'Oct'].map((m, k) => <text key={m} x={x0 + [0, 6, 15, 23][k] * step} y={y0 + 7 * step + 16} className="dg-axis">{m}</text>)}
      <text x={28} y={392} className="dg-heading dg-heading-sm">Lines changed, by area</text>
      {CHURN.map((c, k) => (
        <g key={c.area}>
          <text x={28} y={432 + k * 28} className="dg-bar-label">{c.area}</text>
          <motion.rect x={180} y={419 + k * 28} height={16} rx={4} width={Math.max(6, (c.lines / max) * 640)} className="dg-bar" variants={pop} style={{ transformBox: 'fill-box', transformOrigin: 'left' }} />
          <text x={190 + Math.max(6, (c.lines / max) * 640)} y={432 + k * 28} className="dg-bar-value">{c.lines.toLocaleString('en-US')}</text>
        </g>
      ))}
    </Frame>
  );
}

// ---- Database: the app's real tables and foreign keys ----
type Table = { id: string; x: number; y: number; cols: string[] };
const TABLES: Table[] = [
  { id: 'organizations', x: 28, y: 40, cols: ['id', 'name', 'created_at'] },
  { id: 'users', x: 28, y: 250, cols: ['id', 'organization_id', 'username', 'role', 'github_login'] },
  { id: 'workspaces', x: 296, y: 40, cols: ['id', 'user_id', 'name'] },
  { id: 'projects', x: 296, y: 250, cols: ['id', 'workspace_id', 'user_id', 'name', 'project_type', 'repository_full_name'] },
  { id: 'project_members', x: 564, y: 40, cols: ['id', 'project_id', 'email'] },
  { id: 'db_metric_snapshots', x: 564, y: 228, cols: ['id', 'project_id', 'captured_at', 'database_size_bytes'] },
  { id: 'db_alert_rules', x: 564, y: 438, cols: ['id', 'project_id', 'metric', 'threshold'] },
];
const FKS: Array<[string, string, string]> = [
  ['users', 'organization_id', 'organizations'], ['workspaces', 'user_id', 'users'], ['projects', 'workspace_id', 'workspaces'],
  ['projects', 'user_id', 'users'], ['project_members', 'project_id', 'projects'], ['db_metric_snapshots', 'project_id', 'projects'],
  ['db_alert_rules', 'project_id', 'projects'],
];
const CACHES = ['analysis_results', 'repo_tree_cache', 'repo_file_cache', 'repo_file_blob_cache'];
const T_W = 236, HEAD = 34, ROW = 24;

export function DatabaseDiagram({ still }: DiagramProps) {
  const table = (id: string) => TABLES.find(t => t.id === id)!;
  const rowY = (t: Table, col: string) => t.y + HEAD + t.cols.indexOf(col) * ROW + ROW / 2 + 2;
  const fkPath = (from: string, col: string, to: string) => {
    const s = table(from), t = table(to);
    const sy = rowY(s, col), ty = rowY(t, 'id');
    if (s.x === t.x) { const x = s.x - 12; return `M${s.x} ${sy} C${x - 20} ${sy}, ${x - 20} ${ty}, ${t.x} ${ty}`; }
    return s.x > t.x ? curve(s.x, sy, t.x + T_W, ty) : curve(s.x + T_W, sy, t.x, ty);
  };
  return (
    <Frame still={still} label="Structrace database schema: organizations, users, workspaces and projects, with members, metric snapshots and alert rules hanging off projects">
      {FKS.map(([from, col, to]) => <motion.path key={from + col} d={fkPath(from, col, to)} className="dg-fk" variants={draw} />)}
      {TABLES.map(t => (
        <motion.g key={t.id} variants={pop} style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
          <rect x={t.x} y={t.y} width={T_W} height={HEAD + t.cols.length * ROW + 8} rx={9} className="dg-table" />
          <path d={`M${t.x} ${t.y + HEAD}V${t.y + 9}a9 9 0 0 1 9 -9H${t.x + T_W - 9}a9 9 0 0 1 9 9V${t.y + HEAD}Z`} className="dg-table-head" />
          <text x={t.x + 14} y={t.y + 22} className="dg-table-title">{t.id}</text>
          {t.cols.map((c, k) => (
            <text key={c} x={t.x + 14} y={t.y + HEAD + k * ROW + ROW / 2 + 6} className={c === 'id' ? 'dg-col dg-col-key' : c.endsWith('_id') ? 'dg-col dg-col-fk' : 'dg-col'}>{c}</text>
          ))}
        </motion.g>
      ))}
      <text x={832} y={56} className="dg-tier-label">Caches</text>
      {CACHES.map((c, k) => (
        <motion.g key={c} variants={pop}>
          <rect x={832} y={72 + k * 44} width={154} height={32} rx={7} className="dg-chip" />
          <text x={844} y={93 + k * 44} className="dg-chip-text">{c}</text>
        </motion.g>
      ))}
      <text x={28} y={612} className="dg-note">public schema · 11 tables · 7 foreign keys</text>
    </Frame>
  );
}

// ---- Security: an example scan, files linked to the rule they broke ----
const FINDINGS = [
  { file: 'api/orders/search.ts', rule: 'cwe89', severity: 'critical' },
  { file: 'config/stripe.ts', rule: 'cwe798', severity: 'critical' },
  { file: 'jobs/export.py', rule: 'cwe78', severity: 'high' },
  { file: 'web/profile/Bio.tsx', rule: 'cwe79', severity: 'high' },
  { file: 'auth/session.ts', rule: 'cwe532', severity: 'medium' },
  { file: 'billing/webhook.ts', rule: 'cwe532', severity: 'medium' },
];
const RULES = [
  { id: 'cwe89', label: 'CWE-89', name: 'SQL Injection' },
  { id: 'cwe798', label: 'CWE-798', name: 'Hard-coded Credentials' },
  { id: 'cwe78', label: 'CWE-78', name: 'OS Command Injection' },
  { id: 'cwe79', label: 'CWE-79', name: 'Cross-site Scripting' },
  { id: 'cwe532', label: 'CWE-532', name: 'Sensitive Info in Log' },
];

export function SecurityDiagram({ still }: DiagramProps) {
  const fy = (k: number) => 116 + k * 76, ry = (k: number) => 100 + k * 92;
  const counts = { critical: 2, high: 2, medium: 2 };
  return (
    <Frame still={still} label="Example security scan: six files linked to the CWE rules they triggered, two critical, two high and two medium">
      <text x={28} y={56} className="dg-heading">6 findings</text>
      {(['critical', 'high', 'medium'] as const).map((s, k) => (
        <g key={s}>
          <rect x={186 + k * 132} y={36} width={120} height={28} rx={7} className={`dg-sev dg-sev-${s}`} />
          <text x={200 + k * 132} y={55} className={`dg-sev-text dg-sev-text-${s}`}>{counts[s]} {s}</text>
        </g>
      ))}
      {FINDINGS.map((f, k) => {
        const r = RULES.findIndex(rule => rule.id === f.rule);
        return <motion.path key={f.file} d={curve(392, fy(k), 600, ry(r) + 22)} className={`dg-risk dg-risk-${f.severity}`} variants={draw} />;
      })}
      {FINDINGS.map((f, k) => (
        <motion.g key={f.file} variants={pop}>
          <rect x={28} y={fy(k) - 24} width={364} height={48} rx={9} className="dg-file" />
          <circle cx={52} cy={fy(k)} r={6} className={`dg-dot dg-dot-${f.severity}`} />
          <text x={70} y={fy(k) + 6} className="dg-file-text">{f.file}</text>
        </motion.g>
      ))}
      {RULES.map((r, k) => (
        <motion.g key={r.id} variants={pop}>
          <rect x={600} y={ry(k)} width={372} height={44} rx={9} className="dg-rule" />
          <text x={618} y={ry(k) + 28} className="dg-rule-id">{r.label}</text>
          <text x={712} y={ry(k) + 28} className="dg-rule-name">{r.name}</text>
        </motion.g>
      ))}
      <text x={28} y={612} className="dg-note">example scan of a sample repository · rules from Structrace's CWE set</text>
    </Frame>
  );
}

// ---- Self-hosting: what runs inside the customer's network, and every
// outbound call the code makes (server/src, server/app, client/src) ----
const INSIDE = [
  { title: 'client', sub: 'nginx', x: 52, y: 92, w: 168 },
  { title: 'gateway', sub: 'Go', x: 236, y: 92, w: 168 },
  { title: 'legacy-api', sub: 'Node', x: 420, y: 92, w: 168 },
  { title: 'analysis', sub: 'FastAPI', x: 52, y: 182, w: 168 },
  { title: 'worker', sub: 'Celery', x: 236, y: 182, w: 168 },
  { title: 'redis', sub: 'job queue', x: 420, y: 182, w: 168 },
  { title: 'postgres', sub: 'repo cache · analysis results · encrypted tokens', x: 52, y: 300, w: 536 },
  { title: 'Your Postgres / MySQL', sub: 'read-only introspection', x: 52, y: 420, w: 536 },
];
const OUTSIDE = [
  { title: 'GitHub', sub: 'repository files', y: 92, optional: false },
  { title: 'OSV.dev', sub: 'package names + versions', y: 210, optional: false },
  { title: 'OpenAI', sub: 'module graph · if key set', y: 328, optional: true },
  { title: 'Slack / Discord', sub: 'alerts · if webhook set', y: 446, optional: true },
];

export function NetworkDiagram() {
  const BOX_H = 64, OUT_X = 716, OUT_W = 262;
  return (
    <Frame label="Self-hosted deployment: all Structrace services and the Postgres cache run inside your network; only GitHub and OSV.dev are always called, OpenAI and Slack or Discord only when configured">
      <rect x={24} y={24} width={600} height={560} rx={16} className="dg-boundary" />
      <text x={48} y={60} className="dg-tier-label">Your network</text>
      {INSIDE.map(box => (
        <motion.g key={box.title} variants={pop} style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
          <rect x={box.x} y={box.y} width={box.w} height={BOX_H} rx={9} className={box.y >= 300 ? 'dg-box dg-box-data' : 'dg-box dg-box-api'} />
          <text x={box.x + 16} y={box.y + 28} className="dg-box-title">{box.title}</text>
          <text x={box.x + 16} y={box.y + 48} className="dg-box-sub">{box.sub}</text>
        </motion.g>
      ))}
      {OUTSIDE.map(out => (
        <g key={out.title}>
          <motion.path d={curve(624, 312, OUT_X, out.y + BOX_H / 2)} className={out.optional ? 'dg-egress dg-egress-optional' : 'dg-egress'} markerEnd="url(#dg-egress-arrow)" variants={draw} />
          <motion.g variants={pop}>
            <rect x={OUT_X} y={out.y} width={OUT_W} height={BOX_H} rx={9} className={out.optional ? 'dg-box dg-box-optional' : 'dg-box'} />
            <text x={OUT_X + 16} y={out.y + 28} className="dg-box-title">{out.title}</text>
            <text x={OUT_X + 16} y={out.y + 48} className="dg-box-sub">{out.sub}</text>
          </motion.g>
        </g>
      ))}
      <defs>
        <marker id="dg-egress-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 1 L9 5 L0 9 Z" className="dg-arrow" />
        </marker>
      </defs>
      <text x={716} y={60} className="dg-tier-label">Outside</text>
      <text x={28} y={612} className="dg-note">solid: always called · dashed: only when you configure it</text>
    </Frame>
  );
}

// ---- Teams: how an organization shares workspaces and who may change what.
// Names are an example; the rules are the ones server/src/db/projectStore.ts
// enforces. ----
const TEAM_PROJECTS = [
  { id: 'api', title: 'api', sub: 'acme/api', x: 150, editors: ['ada', 'ben'] },
  { id: 'web', title: 'web', sub: 'acme/web', x: 330, editors: ['ada'] },
  { id: 'warehouse', title: 'warehouse', sub: 'Postgres', x: 560, editors: ['ada', 'dee'] },
];
const PEOPLE = [
  { name: 'ada', role: 'admin', x: 110 },
  { name: 'ben', role: 'member', x: 380 },
  { name: 'dee', role: 'member', x: 650 },
];

export function TeamDiagram() {
  const P_W = 170, P_H = 64, P_Y = 300, PEOPLE_Y = 470;
  return (
    <Frame label="Example organization: two shared workspaces with three projects; everyone views every project, and each project lists who can change it">
      <motion.g variants={pop}>
        <rect x={350} y={30} width={300} height={64} rx={10} className="dg-box dg-box-api" />
        <text x={370} y={58} className="dg-box-title">Acme</text>
        <text x={370} y={80} className="dg-box-sub">organization · 3 people</text>
      </motion.g>
      {[{ name: 'Platform', x: 130, w: 390 }, { name: 'Data', x: 540, w: 300 }].map(ws => (
        <g key={ws.name}>
          <motion.path d={curve(500, 94, ws.x + ws.w / 2, 160)} className="dg-edge" variants={draw} />
          <motion.g variants={pop}>
            <rect x={ws.x} y={160} width={ws.w} height={230} rx={13} className="dg-tier" />
            <text x={ws.x + 16} y={188} className="dg-tier-label">{`${ws.name} workspace`}</text>
          </motion.g>
        </g>
      ))}
      {TEAM_PROJECTS.map(p => (
        <motion.g key={p.id} variants={pop}>
          <rect x={p.x} y={P_Y - 92} width={P_W} height={P_H} rx={9} className="dg-box" />
          <text x={p.x + 16} y={P_Y - 64} className="dg-box-title">{p.title}</text>
          <text x={p.x + 16} y={P_Y - 44} className="dg-box-sub">{p.sub}</text>
          <text x={p.x + 16} y={P_Y + 6} className="dg-box-sub">can change:</text>
          <text x={p.x + 16} y={P_Y + 28} className="dg-edit-list">{p.editors.join(', ')}</text>
        </motion.g>
      ))}
      {PEOPLE.map(person => (
        <motion.g key={person.name} variants={pop}>
          <rect x={person.x} y={PEOPLE_Y} width={250} height={56} rx={28} className={person.role === 'admin' ? 'dg-person dg-person-admin' : 'dg-person'} />
          <circle cx={person.x + 28} cy={PEOPLE_Y + 28} r={16} className="dg-avatar" />
          <text x={person.x + 28} y={PEOPLE_Y + 33} textAnchor="middle" className="dg-avatar-text">{person.name[0].toUpperCase()}</text>
          <text x={person.x + 56} y={PEOPLE_Y + 25} className="dg-box-title">{person.name}</text>
          <text x={person.x + 56} y={PEOPLE_Y + 44} className="dg-box-sub">{person.role === 'admin' ? 'admin · changes everything' : 'member · views every project'}</text>
        </motion.g>
      ))}
      <text x={28} y={612} className="dg-note">example organization · everyone views and analyzes every project · creators, members and admins change it</text>
    </Frame>
  );
}
