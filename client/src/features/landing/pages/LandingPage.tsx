import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MotionConfig, motion } from 'framer-motion';
import { ArrowRight, BarChart3, Database, Eye, GitBranch, KeyRound, MessageSquareText, Network, PencilLine, Share2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { parseRepositoryInput, savePendingRepository } from '../../organization/services/pendingRepository';
import { ArchitectureDiagram, CodeGraphDiagram, DatabaseDiagram, InsightsDiagram, NetworkDiagram, SecurityDiagram, TeamDiagram } from '../components/ModuleDiagrams';
import './LandingPage.css';

function StructraceMark() {
  return (
    <svg viewBox="0 0 28 28" fill="none" width="19" height="19" aria-hidden="true">
      <path d="M9 7v11.2a3.8 3.8 0 1 0 2 3.3V12l7 4.1v2.1a3.8 3.8 0 1 0 2-3.3L11 9.7V7A3.8 3.8 0 1 0 9 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type ModuleId = 'graph' | 'architecture' | 'insights' | 'database' | 'security';
interface Module {
  id: ModuleId;
  label: string;
  caption: string;
  path: string;
  tone: 'indigo' | 'cyan' | 'purple' | 'amber' | 'red';
  icon: typeof Network;
  Diagram: (props: { still?: boolean }) => React.ReactElement;
}

// `path` is the literal source each diagram was drawn from, shown in the
// frame's topbar the way the workspace shows the open file.
const MODULES: Module[] = [
  { id: 'graph', label: 'Code graph', tone: 'indigo', icon: Share2, Diagram: CodeGraphDiagram, path: 'RAMAN0330/CodeGraph · client/src/features', caption: 'Every folder and import as one graph. The hub is obvious at a glance.' },
  { id: 'architecture', label: 'Architecture', tone: 'cyan', icon: Network, Diagram: ArchitectureDiagram, path: 'RAMAN0330/CodeGraph · docker-compose.yml', caption: 'Services, layers and the calls between them.' },
  { id: 'insights', label: 'Insights', tone: 'purple', icon: BarChart3, Diagram: InsightsDiagram, path: 'RAMAN0330/CodeGraph · git history', caption: 'Commits, churn and ownership, attached to the code they touched.' },
  { id: 'database', label: 'Database', tone: 'amber', icon: Database, Diagram: DatabaseDiagram, path: 'postgres · public schema', caption: 'Tables and foreign keys from a live Postgres or MySQL connection.' },
  { id: 'security', label: 'Security', tone: 'red', icon: ShieldCheck, Diagram: SecurityDiagram, path: 'example · sample repository', caption: 'Findings linked to the files that raised them, by CWE rule.' },
];

const QUESTIONS: Array<{ ask: string; before: string; after: string; module: ModuleId }> = [
  { ask: 'What depends on this file?', before: 'grep, then open every match', after: 'Follow its edges in the code graph', module: 'graph' },
  { ask: 'How do the services talk?', before: 'Read compose files and guess', after: 'One diagram of services and calls', module: 'architecture' },
  { ask: 'Who knows this part of the code?', before: 'git blame, one file at a time', after: 'Ownership and churn per module', module: 'insights' },
  { ask: 'What does the database look like?', before: 'A separate client, unlinked from the code', after: 'Tables and keys in the same project', module: 'database' },
  { ask: 'Is anything here risky?', before: 'A scanner run by hand, read somewhere else', after: 'Findings in the workspace, by file', module: 'security' },
];

function ContactSheet() {
  const [active, setActive] = useState<ModuleId>('graph');
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = MODULES.find(m => m.id === active)!;
  // On phones the stage pans sideways; open each diagram centred on its middle,
  // where every diagram keeps its main subject (the code graph's hub).
  const centerPan = (element: HTMLDivElement | null) => {
    if (element && element.scrollWidth > element.clientWidth) element.scrollLeft = (element.scrollWidth - element.clientWidth) / 2;
  };

  // Roving focus for the module tabs (WAI-ARIA tabs pattern).
  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const last = MODULES.length - 1;
    const next = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : event.key === 'Home' ? 0 : event.key === 'End' ? last : -1;
    if (next < 0) return;
    event.preventDefault();
    setActive(MODULES[next].id);
    tabs.current[next]?.focus();
  };

  return (
    <>
      <section className="sheet" id="product" aria-label="What Structrace shows for a repository">
        <figure className={`sheet-stage tone-${current.tone}`} role="tabpanel" id="sheet-panel" aria-labelledby={`sheet-tab-${active}`}>
          <div className="sheet-topbar">
            <span className={`sheet-dot${current.id === 'security' ? ' is-example' : ''}`} aria-hidden="true" />
            <span className="sheet-path">{current.path}</span>
            <span className={`sheet-status${current.id === 'security' ? ' is-example' : ''}`}>{current.id === 'security' ? 'Example' : 'Analyzed'}</span>
          </div>
          <motion.div
            key={current.id} className="sheet-stage-body" ref={centerPan}
            initial={{ opacity: 0, scale: .97, filter: 'blur(6px)' }} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            transition={{ duration: .45, ease: [0.16, 1, 0.3, 1] }}
          >
            <current.Diagram />
          </motion.div>
          <figcaption className="sheet-caption">
            <span className="sheet-icon" aria-hidden="true"><current.icon size={16} strokeWidth={2} /></span>
            <strong>{current.label}</strong>
            <span>{current.caption}</span>
            <span className="sheet-pan-hint">Swipe the diagram to see all of it.</span>
          </figcaption>
        </figure>

        <div className="sheet-rail" role="tablist" aria-label="Workspace modules" aria-orientation="vertical">
          {MODULES.map((m, index) => {
            const isActive = m.id === active;
            return (
              <Button
                key={m.id}
                ref={element => { tabs.current[index] = element; }}
                variant="ghost"
                className={`sheet-tab tone-${m.tone}${isActive ? ' is-active' : ''}`}
                role="tab"
                id={`sheet-tab-${m.id}`}
                aria-selected={isActive}
                aria-controls="sheet-panel"
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActive(m.id)}
                onKeyDown={event => onKeyDown(event, index)}
              >
                <span className="sheet-thumb" aria-hidden="true"><m.Diagram still /></span>
                <span className="sheet-tab-label">
                  <span className="sheet-icon" aria-hidden="true"><m.icon size={14} strokeWidth={2} /></span>
                  {m.label}
                  {isActive && <small>In view</small>}
                </span>
              </Button>
            );
          })}
        </div>
      </section>
      <p className="sheet-note">Drawn from Structrace’s own code, Git history, services and schema. The security scan is an example.</p>
    </>
  );
}

// Every outbound call the code makes, and exactly what it carries. Keep this in
// step with server/src, server/app and client/src when an integration changes.
const EGRESS = [
  { to: 'GitHub', sends: 'Requests for the repositories you connect: tree, files, clone', when: 'Every analysis' },
  { to: 'OSV.dev', sends: 'Dependency names, versions and ecosystems. No source code', when: 'When the security scan checks dependencies' },
  { to: 'OpenAI', sends: 'Module names, file paths and dependency edges of the architecture graph. No file contents', when: 'Only if OPENAI_API_KEY is set' },
  { to: 'Slack or Discord', sends: 'Database alert messages', when: 'Only if a project has an alert webhook' },
];

// Every rule listed here is enforced server-side (db/projectStore.ts,
// db/organization.ts); keep the copy in step with them.
const TEAM_RULES = [
  { icon: KeyRound, title: 'Invite by link', body: 'Admins create single-use invite links that expire. Joining adds the person to your organization.' },
  { icon: Eye, title: 'Everyone sees the work', body: 'Workspaces are shared across the organization. Anyone in it can open and analyze every project.' },
  { icon: PencilLine, title: 'Changes stay with the owners', body: 'A project’s creator, its members and admins change its connection, alerts and members, or delete it.' },
  { icon: MessageSquareText, title: 'Notes the whole team reads', body: 'Notes left on files and folders are shared with everyone in the organization.' },
];

function Teams() {
  return (
    <section className="teams tone-indigo" id="teams" aria-labelledby="teams-title">
      <div className="selfhost-intro">
        <div className="selfhost-copy">
          <h2 id="teams-title">One organization, shared by the team.</h2>
          <ul className="team-rules">
            {TEAM_RULES.map(rule => (
              <li key={rule.title}>
                <span className="sheet-icon" aria-hidden="true"><rule.icon size={15} strokeWidth={2} /></span>
                <span><strong>{rule.title}</strong>{rule.body}</span>
              </li>
            ))}
          </ul>
        </div>
        <figure className="selfhost-frame">
          <div className="sheet-topbar">
            <span className="sheet-dot is-example" aria-hidden="true" />
            <span className="sheet-path">example · organization</span>
          </div>
          <div className="selfhost-diagram"><TeamDiagram /></div>
        </figure>
      </div>
    </section>
  );
}

function SelfHost() {
  return (
    <section className="selfhost tone-indigo" id="self-host" aria-labelledby="selfhost-title">
      <div className="selfhost-intro">
        <div className="selfhost-copy">
          <h2 id="selfhost-title">Runs inside your network.</h2>
          <p>Structrace ships as a Docker Compose stack. Repositories are analyzed and cached on your servers, in your own Postgres, with GitHub tokens and database credentials encrypted at rest.</p>
          <figure className="selfhost-terminal">
            <figcaption>Deploy</figcaption>
            <pre><code>{'cp server/.env.example server/.env\n# set POSTGRES_PASSWORD, SESSION_SECRET,\n# DB_CREDENTIALS_SECRET\nnpm run docker:up'}</code></pre>
          </figure>
        </div>
        <figure className="selfhost-frame">
          <div className="sheet-topbar">
            <span className="sheet-dot" aria-hidden="true" />
            <span className="sheet-path">docker-compose.production.yml · network boundary</span>
          </div>
          <div className="selfhost-diagram"><NetworkDiagram /></div>
        </figure>
      </div>

      <h3 className="selfhost-ledger-title">Everything that leaves your network</h3>
      <div className="ledger" role="table" aria-label="Outbound connections">
        <div className="ledger-row ledger-head" role="row">
          <span role="columnheader">Destination</span><span role="columnheader">What is sent</span><span role="columnheader">When</span>
        </div>
        {EGRESS.map(row => (
          <div className="ledger-row" role="row" key={row.to}>
            <span className="ledger-to" role="cell">{row.to}</span>
            <span className="ledger-sends" role="cell">{row.sends}</span>
            <span className="ledger-when" role="cell">{row.when}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function StartForm({ onSubmit }: { onSubmit: (repository: string) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!value.trim()) { onSubmit(''); return; }
    const repository = parseRepositoryInput(value);
    if (!repository) { setError('That isn’t a repository. Use owner/repository or a github.com link.'); return; }
    onSubmit(repository);
  };
  return (
    <form className="start-form" onSubmit={submit} noValidate>
      <label className="start-field">
        <span className="start-prefix" aria-hidden="true">github.com/</span>
        <span className="sr-only">GitHub repository</span>
        <input
          value={value}
          onChange={event => { setValue(event.target.value); setError(''); }}
          placeholder="owner/repository"
          autoComplete="off" spellCheck={false} inputMode="url"
          aria-invalid={!!error} aria-describedby={error ? 'start-error' : 'start-hint'}
        />
      </label>
      <Button type="submit" className="landing-primary start-submit">Analyze <ArrowRight size={17} aria-hidden="true" /></Button>
      {error
        ? <p id="start-error" className="start-error" role="alert">{error}</p>
        : <p id="start-hint" className="start-hint">Public or private. You sign in first, then it opens in your first project.</p>}
    </form>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const start = () => navigate('/login');
  const startWithRepository = (repository: string) => {
    if (repository) savePendingRepository(repository);
    navigate('/login');
  };
  const moduleFor = (id: ModuleId) => MODULES.find(m => m.id === id)!;

  return (
    <MotionConfig reducedMotion="user">
      <main className="landing-page" id="top">
        <div className="landing-band">
          <nav className="landing-nav" aria-label="Main navigation">
            <a className="landing-brand" href="#top"><span className="landing-brand-mark"><StructraceMark /></span><span>Structrace</span></a>
            <div className="landing-nav-links"><a href="#product">Product</a><a href="#questions">Why</a><a href="#teams">Teams</a><a href="#self-host">Self-host</a><a href="#start">Start</a></div>
            <Button variant="ghost" className="landing-sign-in" onClick={start}>Sign in</Button>
          </nav>

          <header className="landing-hero">
            <h1>Read a repository as one graph.</h1>
            <div className="landing-hero-side">
              <p>Structrace analyzes a GitHub repository and opens it as a workspace: the code graph, architecture, Git history, database and security findings, side by side.</p>
              <div className="landing-actions">
                <Button className="landing-primary landing-primary-inverse" onClick={start}>Get started <ArrowRight size={17} aria-hidden="true" /></Button>
                <a className="landing-secondary" href="#start">Paste a repository</a>
              </div>
            </div>
          </header>

          <ContactSheet />
        </div>

        <section className="questions" id="questions" aria-labelledby="questions-title">
          <h2 id="questions-title">The questions you open five tools for.</h2>
          <div className="questions-list" role="table" aria-label="Usual tools compared with Structrace">
            <div className="questions-row questions-head" role="row">
              <span role="columnheader">Question</span><span role="columnheader">Usually</span><span role="columnheader">In Structrace</span>
            </div>
            {QUESTIONS.map(row => {
              const m = moduleFor(row.module);
              return (
                <div className={`questions-row tone-${m.tone}`} role="row" key={row.ask}>
                  <span className="questions-ask" role="cell"><span className="sheet-icon" aria-hidden="true"><m.icon size={15} strokeWidth={2} /></span>{row.ask}</span>
                  <span className="questions-before" role="cell">{row.before}</span>
                  <span className="questions-after" role="cell">{row.after}</span>
                </div>
              );
            })}
          </div>
        </section>

        <Teams />

        <SelfHost />

        <section className="start" id="start" aria-labelledby="start-title">
          <div className="start-copy">
            <h2 id="start-title">Start with one repository.</h2>
            <p className="start-works"><GitBranch size={15} aria-hidden="true" /> GitHub repositories <span aria-hidden="true">·</span> <Database size={15} aria-hidden="true" /> PostgreSQL and MySQL</p>
          </div>
          <StartForm onSubmit={startWithRepository} />
        </section>

        <footer className="landing-footer">
          <a className="landing-brand" href="#top"><span className="landing-brand-mark"><StructraceMark /></span><span>Structrace</span></a>
          <div className="landing-footer-links"><a href="#product">Product</a><a href="#start">Start</a><Button variant="link" onClick={start}>Sign in</Button></div>
        </footer>
      </main>
    </MotionConfig>
  );
}
