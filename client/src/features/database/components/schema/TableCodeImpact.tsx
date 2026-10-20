import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { appConfig } from '../../../../app/config';
import { usePersistentState } from '../../../../shared/hooks/usePersistentState';
import { organizationStore, projectPath, type Project } from '../../../organization/services/organizationStore';
import { GG } from '../dbConnectTheme';
import type { SchemaTable } from '../../types';

// The code side of a table, from the analysis of a codebase project in the
// same organization: files that query it, endpoints that reach it, and the
// migrations that define it. The link is saved per database project.

interface Analysis { tableUsage?: Record<string, Array<{ file: string; count: number; kinds: string[] }>>; endpoints?: Array<{ method: string; path: string; file: string; tables: string[] }> }
type State = { status: 'idle' } | { status: 'loading' } | { status: 'pending' } | { status: 'error'; message: string } | { status: 'ready'; data: Analysis };

const cache = new Map<string, Analysis>();
const KIND: Record<string, string> = { sql: 'SQL', model: 'ORM', migration: 'migration' };

export default function TableCodeImpact({ projectId, table }: { projectId: number; table: SchemaTable }) {
  const [repo, setRepo] = usePersistentState<string>(`cg.db.${projectId}.linkedRepo`, '');
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [state, setState] = useState<State>({ status: 'idle' });

  useEffect(() => { organizationStore.load().then(s => setProjects(s.projects.filter(p => p.projectType === 'codebase' && p.repositoryFullName))).catch(() => setProjects([])); }, []);

  useEffect(() => {
    if (!repo) { setState({ status: 'idle' }); return; }
    const hit = cache.get(repo);
    if (hit) { setState({ status: 'ready', data: hit }); return; }
    let cancelled = false;
    setState({ status: 'loading' });
    fetch(`${appConfig.apiUrl}/api/analysis/${repo}`, { credentials: 'include' })
      .then(async res => ({ res, body: await res.json().catch(() => null) }))
      .then(({ res, body }) => {
        if (cancelled) return;
        if (res.status === 202) return setState({ status: 'pending' });
        if (!res.ok || !body?.data) throw new Error(body?.error ?? 'Could not load the analysis.');
        cache.set(repo, body.data);
        setState({ status: 'ready', data: body.data });
      })
      .catch(e => { if (!cancelled) setState({ status: 'error', message: e.message }); });
    return () => { cancelled = true; };
  }, [repo]);

  const linked = projects?.find(p => p.repositoryFullName === repo);
  const name = table.name.toLowerCase();
  const data = state.status === 'ready' ? state.data : null;
  const usage = Object.entries(data?.tableUsage ?? {}).find(([t]) => t.toLowerCase() === name)?.[1] ?? [];
  const code = usage.filter(u => !u.kinds.includes('migration'));
  const migrations = usage.filter(u => u.kinds.includes('migration'));
  const endpoints = (data?.endpoints ?? []).filter(e => e.tables.some(t => t.toLowerCase() === name));
  const mono = { fontFamily: GG.mono, fontSize: 11.5 } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={{ ...mono, color: GG.fg4 }}>
        Codebase project
        <select value={repo} onChange={e => setRepo(e.target.value)} className="mt-1 h-8 w-full rounded-md border bg-card px-2 text-xs text-foreground">
          <option value="">Not linked</option>
          {(projects ?? []).map(p => <option key={p.id} value={p.repositoryFullName!}>{p.name} · {p.repositoryFullName}</option>)}
        </select>
      </label>
      {state.status === 'idle' && <p style={{ ...mono, color: GG.fg4 }}>Link the repository that uses this database to see which code reads and writes <b>{table.name}</b> and what a schema change would reach.</p>}
      {state.status === 'loading' && <p style={{ ...mono, color: GG.fg4 }}>Reading the analysis…</p>}
      {state.status === 'pending' && <p style={{ ...mono, color: GG.fg4 }}>The repository is being analyzed. Check again in a minute.</p>}
      {state.status === 'error' && <p style={{ ...mono, color: 'var(--color-danger)' }}>{state.message}</p>}
      {data && !data.tableUsage && <p style={{ ...mono, color: GG.fg4 }}>This analysis predates table linking. Rescan the repository.</p>}
      {data?.tableUsage && (
        <>
          <div style={{ display: 'flex', gap: 14, ...mono, color: GG.fg3 }}>
            <span><b style={{ color: GG.fg }}>{code.length}</b> files</span>
            <span><b style={{ color: GG.fg }}>{endpoints.length}</b> endpoints</span>
            <span><b style={{ color: GG.fg }}>{migrations.length}</b> migrations</span>
          </div>
          {!code.length && !endpoints.length && <p style={{ ...mono, color: GG.fg4 }}>No code in this repository reads or writes {table.name}. It may be unused, or accessed outside this repository.</p>}
          {code.length > 0 && <Section title="Queried by">{code.map(u => <li key={u.file} title={u.file}><code>{u.file}</code> <small>{u.kinds.map(k => KIND[k] ?? k).join(', ')} · {u.count}×</small></li>)}</Section>}
          {endpoints.length > 0 && <Section title="Endpoints that reach it">{endpoints.slice(0, 20).map(e => <li key={`${e.method}${e.path}${e.file}`}><b>{e.method}</b> <code>{e.path}</code></li>)}</Section>}
          {migrations.length > 0 && <Section title="Defined in">{migrations.map(u => <li key={u.file}><code>{u.file}</code></li>)}</Section>}
          {linked && <a href={projectPath(linked)} style={{ ...mono, color: GG.accent, display: 'inline-flex', alignItems: 'center', gap: 4 }}>Open in codebase workspace <ArrowUpRight size={12} /></a>}
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontFamily: GG.mono, fontSize: 9, color: GG.fg4, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>{title}</div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontFamily: GG.mono, fontSize: 11.5, color: GG.fg2, display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</ul>
    </div>
  );
}
