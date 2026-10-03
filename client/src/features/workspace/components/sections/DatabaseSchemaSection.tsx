import React, { useMemo } from 'react';
import { Database } from 'lucide-react';
import { dbSchemaToFlowSchema } from '../../../database/services/dbParser';
import type { TableUse } from '../../../database/services/tableUsage';

const ERDiagramGraph = React.lazy(() => import('../../../database/components/ERDiagramGraph'));

interface Props {
  dbSchema: any;
  filteredDbSchema: any;
  selectedDbTable: string | null;
  // Analysis data: dbTables + tableUsage (server/src/analysis/runAnalysis.ts) and connections.
  data?: any;
  onSelectTable?: (table: string | null) => void;
  onOpenFile?: (path: string) => void;
}

const KIND_LABEL: Record<string, string> = { sql: 'SQL', model: 'ORM', migration: 'migration' };

function endpoint(value: any): string {
  return typeof value === 'object' && value ? value.id : value;
}

// Files that depend, directly or not, on any of `start` (runAnalysis: source
// = defining file, target = calling file).
function dependentsOf(start: string[], connections: any[]): string[] {
  const usedBy = new Map<string, string[]>();
  connections.forEach(c => {
    const definer = endpoint(c.source);
    const caller = endpoint(c.target);
    if (definer === caller) return;
    if (!usedBy.has(definer)) usedBy.set(definer, []);
    usedBy.get(definer)!.push(caller);
  });
  const seen = new Set(start);
  const queue = [...start];
  while (queue.length) for (const next of usedBy.get(queue.shift()!) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next); }
  start.forEach(s => seen.delete(s));
  return [...seen];
}

function TableUsagePanel({ data, selected, onSelectTable, onOpenFile }: { data: any; selected: string | null; onSelectTable?: (t: string | null) => void; onOpenFile?: (p: string) => void }) {
  const usage: Record<string, TableUse[]> = data?.tableUsage ?? {};
  const tables: Array<{ name: string; file: string }> = data?.dbTables ?? [];
  const rows = useMemo(() => tables
    .map(t => ({ ...t, uses: (usage[t.name] ?? []).filter(u => !u.kinds.includes('migration')).length }))
    .sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name)), [tables, usage]);
  const selectedTable = tables.find(t => t.name === selected) ?? null;
  const uses = selectedTable ? usage[selectedTable.name] ?? [] : [];
  const codeUses = uses.filter(u => !u.kinds.includes('migration'));
  const migrations = uses.filter(u => u.kinds.includes('migration'));
  const ripple = useMemo(() => dependentsOf(codeUses.map(u => u.file), data?.connections ?? []), [codeUses, data]);
  const endpoints: Array<{ method: string; path: string; file: string; tables: string[] }> = selectedTable ? (data?.endpoints ?? []).filter((e: any) => e.tables.includes(selectedTable.name)) : [];

  const open = (path: string) => onOpenFile?.(path);
  const fileButton = (path: string) => <button type="button" className="guide-file" onClick={() => open(path)} title={`Open ${path}`}>{path}</button>;

  if (!data?.dbTables) {
    return <aside className="db-usage-panel"><h2>Tables in code</h2><p className="guide-empty">Rescan the repository to link its tables to the code that queries them.</p></aside>;
  }
  return (
    <aside className="db-usage-panel">
      {selectedTable ? (
        <>
          <button type="button" className="db-usage-back" onClick={() => onSelectTable?.(null)}>← All tables</button>
          <h2><code>{selectedTable.name}</code></h2>
          <p className="db-usage-meta">Defined in {fileButton(selectedTable.file)}</p>
          <div className="db-usage-impact">
            <div><strong>{codeUses.length}</strong><span>files query it</span></div>
            <div><strong>{ripple.length}</strong><span>more depend on those</span></div>
          </div>
          <h3>Used by</h3>
          {codeUses.length ? (
            <ul className="ask-list">{codeUses.map(u => <li key={u.file}><div>{fileButton(u.file)}{u.kinds.map(k => <span key={k} className="guide-layer">{KIND_LABEL[k]}</span>)}<small>{u.count}×</small></div></li>)}</ul>
          ) : <p className="guide-empty">No code reads or writes this table through SQL or its ORM model.</p>}
          {endpoints.length > 0 && <>
            <h3>Endpoints that reach it ({endpoints.length})</h3>
            <ul className="ask-list">{endpoints.slice(0, 20).map(e => <li key={`${e.method} ${e.path} ${e.file}`}><div><span className={`endpoint-method m-${e.method.toLowerCase()}`}>{e.method}</span><code>{e.path}</code></div></li>)}</ul>
          </>}
          {migrations.length > 0 && <>
            <h3>Migrations</h3>
            <ul className="ask-list">{migrations.map(u => <li key={u.file}><div>{fileButton(u.file)}</div></li>)}</ul>
          </>}
          {ripple.length > 0 && <>
            <h3>Changing it also reaches</h3>
            <ul className="ask-list">{ripple.slice(0, 20).map(p => <li key={p}><div>{fileButton(p)}</div></li>)}</ul>
            {ripple.length > 20 && <p className="guide-empty">+{ripple.length - 20} more</p>}
          </>}
        </>
      ) : (
        <>
          <h2>Tables in code</h2>
          <p className="db-usage-meta">Pick a table to see which code queries it and what a schema change would reach.</p>
          <ul className="db-usage-tables">
            {rows.map(t => (
              <li key={t.name}><button type="button" onClick={() => onSelectTable?.(t.name)}><code>{t.name}</code><small>{t.uses ? `${t.uses} file${t.uses === 1 ? '' : 's'}` : 'unused'}</small></button></li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}

export default function DatabaseSchemaSection({ dbSchema, filteredDbSchema, selectedDbTable, data, onSelectTable, onOpenFile }: Props) {
  const hasTables = (data?.dbTables?.length ?? 0) > 0;
  return (
    <div className={`db-page${hasTables ? ' db-page-with-usage' : ''}`}>
      {dbSchema ? (
        <ERDiagramGraph schema={dbSchemaToFlowSchema(filteredDbSchema || dbSchema)} selectedTable={selectedDbTable} />
      ) : (
        <div className="floating-empty">
          <Database size={34} strokeWidth={1.6} />
          <h3>No database schema detected yet</h3>
          <p>Analyze a repository with SQL, Django, SQLAlchemy or Prisma models to see the ER diagram here.</p>
        </div>
      )}
      {hasTables && <TableUsagePanel data={data} selected={selectedDbTable} onSelectTable={onSelectTable} onOpenFile={onOpenFile} />}
    </div>
  );
}
