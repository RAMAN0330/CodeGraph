import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import {
  AlertTriangle, ArrowRight, BarChart3, Compass, Database, GitBranch,
  LayoutDashboard, Minus, Network, Plus, PlugZap, ShieldCheck, Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import './LandingPage.css';

function StructraceMark() {
  return (
    <svg viewBox="0 0 28 28" fill="none" width="19" height="19" aria-hidden="true">
      <path d="M9 7v11.2a3.8 3.8 0 1 0 2 3.3V12l7 4.1v2.1a3.8 3.8 0 1 0 2-3.3L11 9.7V7A3.8 3.8 0 1 0 9 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const containerVariants: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.03, delayChildren: 0.05 } } };
const popVariants: Variants = { hidden: { opacity: 0, scale: .82 }, visible: { opacity: 1, scale: 1, transition: { duration: .45, ease: [0.16, 1, 0.3, 1] } } };
const drawVariants: Variants = { hidden: { pathLength: 0, opacity: 0 }, visible: { pathLength: 1, opacity: 1, transition: { duration: .6, ease: 'easeOut' } } };

function Reveal({ children, className, amount = .3 }: { children: React.ReactNode; className?: string; amount?: number }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={containerVariants}
      initial={reduceMotion ? 'visible' : 'hidden'}
      whileInView={reduceMotion ? undefined : 'visible'}
      viewport={{ once: true, amount }}
    >
      {children}
    </motion.div>
  );
}

// ---- Explore: files, indexed (dense grid) ----
const FILE_GRID_LABELS: Record<number, string> = { 3: '.ts', 9: '.tsx', 14: '.go', 20: '.sql', 27: '.py', 33: '.css', 40: '.md', 45: '.json' };
function FilesPanel() {
  const cols = 12, rows = 4;
  const cells = Array.from({ length: cols * rows }, (_, i) => i);
  return (
    <motion.div className="grid-panel" variants={containerVariants} initial="hidden" animate="visible">
      {cells.map(i => (
        <motion.div key={i} className="grid-cell" variants={popVariants}>
          {FILE_GRID_LABELS[i] && <span>{FILE_GRID_LABELS[i]}</span>}
        </motion.div>
      ))}
    </motion.div>
  );
}

// ---- Architecture: dependencies (three clusters, cyan) ----
type DepNode = { id: string; x: number; y: number };
const DEP_NODES: DepNode[] = [
  { id: 'auth/session.ts', x: 120, y: 74 }, { id: 'auth/token.ts', x: 232, y: 130 }, { id: 'auth/guard.ts', x: 120, y: 186 },
  { id: 'api/router.ts', x: 500, y: 54 }, { id: 'api/middleware.ts', x: 596, y: 130 }, { id: 'api/handler.ts', x: 500, y: 206 },
  { id: 'billing/plan.ts', x: 860, y: 74 }, { id: 'billing/invoice.ts', x: 932, y: 150 }, { id: 'billing/webhook.ts', x: 848, y: 224 },
];
function depNode(id: string) { return DEP_NODES.find(n => n.id === id)!; }
const DEP_EDGES: Array<[string, string, boolean?]> = [
  ['auth/session.ts', 'auth/token.ts'], ['auth/token.ts', 'auth/guard.ts'], ['auth/session.ts', 'auth/guard.ts'],
  ['api/router.ts', 'api/middleware.ts'], ['api/middleware.ts', 'api/handler.ts'], ['api/router.ts', 'api/handler.ts'],
  ['billing/plan.ts', 'billing/invoice.ts'], ['billing/invoice.ts', 'billing/webhook.ts'], ['billing/plan.ts', 'billing/webhook.ts'],
  ['auth/token.ts', 'api/router.ts', true], ['api/middleware.ts', 'billing/plan.ts', true],
];
function DependenciesPanel() {
  return (
    <motion.div className="evidence-svg-wrap" variants={containerVariants} initial="hidden" animate="visible">
      <svg viewBox="0 0 1000 280" preserveAspectRatio="none" className="evidence-svg" role="img" aria-label="Dependency graph across three modules">
        <g>
          {DEP_EDGES.map(([a, b, cross]) => {
            const na = depNode(a), nb = depNode(b);
            return <motion.line key={a + b} x1={na.x} y1={na.y} x2={nb.x} y2={nb.y} className={cross ? 'edge-cyan-dashed' : 'edge-cyan'} variants={drawVariants} />;
          })}
        </g>
        <g>
          {DEP_NODES.map(n => (
            <motion.g key={n.id} variants={popVariants} style={{ transformBox: 'fill-box' }}>
              <rect x={n.x - 50} y={n.y - 13} width={100} height={26} rx={5} className="node-file" />
              <text x={n.x} y={n.y + 4} textAnchor="middle" className="node-label">{n.id}</text>
            </motion.g>
          ))}
        </g>
      </svg>
    </motion.div>
  );
}

// ---- Insights: ownership (segmented ring) ----
const OWNERSHIP = [
  { label: 'Platform team', pct: 41, color: '#7c3fa8' },
  { label: 'Auth maintainers', pct: 27, color: '#9b5fc0' },
  { label: 'Billing squad', pct: 19, color: '#b98ad4' },
  { label: 'External contributors', pct: 13, color: '#d4b3e8' },
];
function OwnershipPanel() {
  const r = 92, cx = 150, cy = 150, circumference = 2 * Math.PI * r;
  let cursor = 0;
  return (
    <>
      <motion.div className="ownership-panel" variants={containerVariants} initial="hidden" animate="visible">
        <div className="ownership-ring-wrap">
          <svg viewBox="0 0 300 300" className="ownership-ring" role="img" aria-label="Ownership share across four groups">
            <g transform={`rotate(-90 ${cx} ${cy})`}>
              {OWNERSHIP.map(seg => {
                const len = (seg.pct / 100) * circumference;
                const offset = -cursor;
                cursor += len;
                return (
                  <motion.circle
                    key={seg.label} cx={cx} cy={cy} r={r} fill="none" strokeWidth={26} stroke={seg.color}
                    strokeDasharray={`${len} ${circumference - len}`} strokeDashoffset={offset}
                    variants={popVariants}
                  />
                );
              })}
            </g>
          </svg>
        </div>
        <ul className="ownership-legend">
          {OWNERSHIP.map(seg => (
            <motion.li key={seg.label} variants={popVariants}>
              <span className="ownership-swatch" style={{ background: seg.color }} />
              <span>{seg.label}</span>
              <b>{seg.pct}%</b>
            </motion.li>
          ))}
        </ul>
      </motion.div>
      <div className="proof-strip">
        <span className="proof-strip-caption">From one example analysis</span>
        <div className="proof-strip-stats">
          <div><b>1,842</b><span>files traced</span></div>
          <div><b>6</b><span>ownership signals</span></div>
          <div><b>1</b><span>risk pattern caught</span></div>
        </div>
      </div>
    </>
  );
}

// ---- Database: schema (ER tables) ----
const TABLES = [
  { id: 'users', x: 60, y: 30, cols: ['id', 'email', 'created_at'] },
  { id: 'sessions', x: 400, y: 10, cols: ['id', 'user_id', 'expires_at'] },
  { id: 'plans', x: 700, y: 60, cols: ['id', 'user_id', 'tier'] },
];
function SchemaPanel() {
  const w = 220, rowH = 26, headH = 32;
  return (
    <motion.div className="evidence-svg-wrap" variants={containerVariants} initial="hidden" animate="visible">
      <svg viewBox="0 0 1000 300" preserveAspectRatio="none" className="evidence-svg" role="img" aria-label="Schema relationships across three tables">
        <g>
          <motion.line x1={TABLES[0].x + w} y1={TABLES[0].y + headH + rowH} x2={TABLES[1].x} y2={TABLES[1].y + headH + rowH} className="edge-amber" variants={drawVariants} />
          <motion.line x1={TABLES[0].x + w} y1={TABLES[0].y + headH + rowH * 2} x2={TABLES[2].x} y2={TABLES[2].y + headH + rowH} className="edge-amber" variants={drawVariants} />
        </g>
        {TABLES.map(t => (
          <motion.g key={t.id} variants={popVariants} style={{ transformBox: 'fill-box' }}>
            <rect x={t.x} y={t.y} width={w} height={headH + t.cols.length * rowH} rx={7} className="schema-table" />
            <rect x={t.x} y={t.y} width={w} height={headH} rx={7} className="schema-table-head" />
            <text x={t.x + 14} y={t.y + headH / 2 + 5} className="schema-table-title">{t.id}</text>
            {t.cols.map((c, i) => (
              <text key={c} x={t.x + 14} y={t.y + headH + i * rowH + rowH / 2 + 4} className="schema-col">{c}</text>
            ))}
          </motion.g>
        ))}
      </svg>
    </motion.div>
  );
}

// ---- Security: risk signals (bar list, no track) ----
const SIGNALS = [
  { path: 'api/router.ts', weight: 71, risky: true },
  { path: 'billing/webhook.ts', weight: 41 },
  { path: 'auth/token.ts', weight: 34 },
  { path: 'queue/worker.ts', weight: 22 },
  { path: 'search/index.ts', weight: 58 },
  { path: 'webhooks/stripe.ts', weight: 15 },
];
function SecurityPanel() {
  return (
    <motion.div className="signal-list" variants={containerVariants} initial="hidden" animate="visible">
      {SIGNALS.map(s => (
        <motion.div key={s.path} className="signal-row" variants={popVariants}>
          <span className="signal-path">{s.risky && <AlertTriangle size={13} />}{s.path}</span>
          <span className="signal-bar-track"><span className={s.risky ? 'signal-bar signal-bar-risk' : 'signal-bar'} style={{ width: `${s.weight}%` }} /></span>
        </motion.div>
      ))}
    </motion.div>
  );
}

const METRICS = [
  { value: '6', label: 'files traced in one pass' },
  { value: '5', label: 'signals joined in one graph' },
  { value: '2', label: 'database engines connected' },
];

const COMPARISON = [
  { row: 'Understanding structure', without: 'grep and manual file-hopping', with: 'one navigable dependency graph' },
  { row: 'Ownership and history', without: 'git blame, one file at a time', with: 'attached to every node in the graph' },
  { row: 'Database schema', without: 'a separate client, disconnected from the code', with: 'joined into the same graph as your code' },
  { row: 'Security and quality signals', without: 'a separate scanner, run by hand', with: 'surfaced next to the code that raised them' },
  { row: 'Where it happens', without: 'scattered across tabs and tools', with: 'one workspace' },
];

type ModuleId = 'overview' | 'explore' | 'architecture' | 'insights' | 'database' | 'security';
interface ExplorerModule {
  id: ModuleId;
  icon: typeof LayoutDashboard;
  label: string;
  description: string;
  file: string;
  accent?: 'cyan' | 'purple' | 'amber' | 'red';
}

const MODULES: ExplorerModule[] = [
  { id: 'overview', icon: LayoutDashboard, label: 'Overview', description: 'Repository at a glance', file: 'acme/api' },
  { id: 'explore', icon: Compass, label: 'Explore', description: 'Every file, indexed', file: 'explore/files.ts' },
  { id: 'architecture', icon: Network, label: 'Architecture', description: 'Dependencies, traced', file: 'architecture/graph.ts', accent: 'cyan' },
  { id: 'insights', icon: BarChart3, label: 'Insights', description: 'Ownership, attached', file: 'insights/ownership.ts', accent: 'purple' },
  { id: 'database', icon: Database, label: 'Database', description: 'Schema, connected', file: 'database/schema.sql', accent: 'amber' },
  { id: 'security', icon: ShieldCheck, label: 'Security', description: 'Risk, surfaced', file: 'security/scan.ts', accent: 'red' },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState<ModuleId>('overview');

  const start = () => navigate('/login');
  const activeModule = MODULES.find(m => m.id === active)!;

  return <main className="landing-page">
    <nav className="landing-nav" aria-label="Main navigation">
      <a className="landing-brand" href="#top"><span className="landing-brand-mark"><StructraceMark /></span><span>Structrace</span></a>
      <div className="landing-nav-links"><a href="#explore">How it works</a><a href="#close">Get started</a></div>
      <Button variant="ghost" className="landing-sign-in" onClick={start}>Sign in</Button>
    </nav>

    <section className="landing-explorer" id="explore">
      <div className="explorer-rail" role="tablist" aria-label="Structrace capabilities">
        {MODULES.map(m => {
          const isActive = m.id === active;
          return (
            <div className={`explorer-rail-item${isActive ? ' active' : ''}${m.accent ? ` accent-${m.accent}` : ''}`} key={m.id}>
              <Button
                variant="ghost"
                className="explorer-rail-button"
                role="tab"
                aria-selected={isActive}
                aria-expanded={isActive}
                onClick={() => setActive(m.id)}
              >
                <span className="explorer-rail-icon"><m.icon size={16} strokeWidth={1.8} /></span>
                <span className="explorer-rail-copy"><strong>{m.label}</strong><small>{m.description}</small></span>
                <span className="explorer-rail-chevron">{isActive ? <Minus size={12} strokeWidth={2} /> : <Plus size={12} strokeWidth={2} />}</span>
              </Button>
            </div>
          );
        })}
      </div>

      <div className="explorer-pane">
        <div className="graph-frame-topbar">
          <span className="preview-dot" />
          <span>{activeModule.file}</span>
          {active !== 'overview' && <span className="graph-frame-status">Analyzed</span>}
        </div>
        <div className="explorer-pane-body">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={reduceMotion ? undefined : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: .3, ease: [0.16, 1, 0.3, 1] }}
            >
              {active === 'overview' ? (
                <div className="explorer-overview">
                  <h1>Structrace turns a repository into a <em>graph you can trust.</em></h1>
                  <p className="landing-lede">One analysis surfaces files, dependencies, ownership, schema, and risk together. This is that graph, not a mockup of it.</p>
                  <div className="landing-actions"><Button className="landing-primary" onClick={start}>Get started <ArrowRight size={17} /></Button><a className="landing-secondary" href="#compare">See the evidence</a></div>
                  <div className="explorer-overview-metrics">
                    {METRICS.map(m => (
                      <div key={m.label} className="metric"><b>{m.value}</b><span>{m.label}</span></div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="explorer-module-body">
                  <p className="explorer-module-copy">
                    {active === 'explore' && 'Structrace reads the repository once and keeps every file, function, and import addressable. No more guessing where logic lives.'}
                    {active === 'architecture' && 'The file list becomes a navigable graph that reveals the real paths behind every feature, not the folder structure.'}
                    {active === 'insights' && 'Contributors, churn, and history stay attached to the code they touched, not buried in a separate log.'}
                    {active === 'database' && 'Tables and relationships join the same graph as your code, so a query and the file that issues it live in one view.'}
                    {active === 'security' && 'Security and quality signals surface next to the code that raised them, before they reach review.'}
                  </p>
                  {active === 'explore' && <FilesPanel />}
                  {active === 'architecture' && <DependenciesPanel />}
                  {active === 'insights' && <OwnershipPanel />}
                  {active === 'database' && <SchemaPanel />}
                  {active === 'security' && <SecurityPanel />}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>

    <section className="landing-comparison" id="compare">
      <motion.div
        className="comparison-head"
        initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
        whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        viewport={{ once: true, amount: .6 }}
        transition={{ duration: .4, ease: 'easeOut' }}
      >
        <h2>The context-switching problem.</h2>
        <p>Understanding a repository usually means five tools and no shared memory between them. Structrace keeps it in one graph.</p>
      </motion.div>
      <Reveal className="comparison-table" amount={.15}>
        <div className="comparison-row comparison-row-head">
          <span /><span>Without Structrace</span><span>With Structrace</span>
        </div>
        {COMPARISON.map(row => (
          <motion.div key={row.row} className="comparison-row" variants={popVariants}>
            <span className="comparison-label">{row.row}</span>
            <span className="comparison-without">{row.without}</span>
            <span className="comparison-with">{row.with}</span>
          </motion.div>
        ))}
      </Reveal>
    </section>

    <section className="landing-connect">
      <motion.div
        className="connect-copy"
        initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
        whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        viewport={{ once: true, amount: .6 }}
        transition={{ duration: .4, ease: 'easeOut' }}
      >
        <span className="evidence-panel-icon"><PlugZap size={20} /></span>
        <h2>One field to start.</h2>
        <p>Paste a repository. Structrace signs in with GitHub, indexes it once, and opens the workspace above.</p>
      </motion.div>
      <motion.div
        className="connect-frame"
        initial={reduceMotion ? undefined : { opacity: 0, scale: .96 }}
        whileInView={reduceMotion ? undefined : { opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: .5 }}
        transition={{ duration: .5, ease: 'easeOut' }}
      >
        <div className="graph-frame-topbar"><span className="preview-dot" /><span>connect a repository</span></div>
        <div className="connect-body">
          <div className="connect-input"><GitBranch size={15} /><span>github.com/acme/api</span></div>
          <Button className="landing-primary" onClick={start}>Analyze <ArrowRight size={16} /></Button>
        </div>
      </motion.div>
    </section>

    <section className="landing-trust">
      <Reveal className="trust-strip" amount={.5}>
        <span className="trust-strip-label">Works with</span>
        <motion.span className="trust-item" variants={popVariants}><GitBranch size={16} /> GitHub repositories</motion.span>
        <motion.span className="trust-item" variants={popVariants}><Database size={16} /> PostgreSQL</motion.span>
        <motion.span className="trust-item" variants={popVariants}><Database size={16} /> MySQL</motion.span>
      </Reveal>
    </section>

    <section className="landing-close" id="close">
      <Sparkles size={24} />
      <h2>Bring your codebase into focus.</h2>
      <p className="landing-close-lede"><AlertTriangle size={14} /> One signal found in <code>api/router.ts</code>: the kind of thing Structrace surfaces before it ships.</p>
      <Button className="landing-primary" onClick={start}>Get started <ArrowRight size={17} /></Button>
    </section>

    <footer className="landing-footer">
      <a className="landing-brand" href="#top"><span className="landing-brand-mark"><StructraceMark /></span><span>Structrace</span></a>
      <div className="landing-footer-links"><a href="#explore">How it works</a><Button variant="link" onClick={start}>Sign in</Button></div>
    </footer>
  </main>;
}
