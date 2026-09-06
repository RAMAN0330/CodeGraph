import { useState } from 'react';
import { KeyRound, Link2 } from 'lucide-react';
import { GG } from '../dbConnectTheme';
import type { SchemaTable } from '../../types';

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return 'Not available';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes, i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i += 1; }
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

type Tab = 'columns' | 'indexes' | 'relations' | 'stats';

interface DetailDrawerProps {
  table: SchemaTable;
  allTables: SchemaTable[];
}

export default function DetailDrawer({ table, allTables }: DetailDrawerProps) {
  const [tab, setTab] = useState<Tab>('columns');
  const referencing = allTables.filter(t => t.name !== table.name && t.foreignKeys.some(fk => fk.referencedTable === table.name));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div style={{ fontFamily: GG.mono, fontSize: 15, fontWeight: 700, color: GG.fg }}>{table.name}</div>
        <div style={{ fontFamily: GG.mono, fontSize: 11, color: GG.fg4 }}>{table.schema ?? 'public'}.{table.name}</div>
      </div>
      <div style={{ display: 'flex', gap: 14, fontFamily: GG.mono, fontSize: 11, color: GG.fg3 }}>
        <span>{table.rowEstimate?.toLocaleString() ?? '—'} rows</span>
        <span>{formatBytes(table.sizeBytes)}</span>
        <span>{table.indexes?.length ?? 0} indexes</span>
        <span>{table.foreignKeys.length + referencing.length} relations</span>
      </div>

      <div style={{ display: 'flex', gap: 3, borderBottom: `1px solid ${GG.line}`, marginTop: 4 }}>
        {(['columns', 'indexes', 'relations', 'stats'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '6px 10px', border: 0, borderBottom: tab === t ? `2px solid ${GG.accent}` : '2px solid transparent',
            background: 'none', color: tab === t ? GG.accent : GG.fg3, fontFamily: GG.mono, fontSize: 11, fontWeight: 700, textTransform: 'capitalize', cursor: 'pointer',
          }}>{t}</button>
        ))}
      </div>

      {tab === 'columns' && (
        <div>
          {table.columns.map(col => (
            <div key={col.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: `1px solid ${GG.line}`, fontFamily: GG.mono, fontSize: 11.5 }}>
              {col.isPrimary ? <KeyRound size={11} color={GG.accent} /> : <span style={{ width: 11 }} />}
              <span style={{ color: GG.fg2, flex: 1 }}>{col.name}</span>
              <span style={{ color: GG.fg4 }}>{col.type}</span>
              {col.nullable && <span style={{ color: GG.fg4, fontSize: 9 }}>NULL</span>}
            </div>
          ))}
        </div>
      )}

      {tab === 'indexes' && (
        (table.indexes ?? []).length === 0 ? <p style={{ color: GG.fg4, fontFamily: GG.mono, fontSize: 11.5 }}>No indexes found.</p> :
        (table.indexes ?? []).map(idx => (
          <div key={idx.name} style={{ padding: '7px 0', borderTop: `1px solid ${GG.line}`, fontFamily: GG.mono, fontSize: 11.5 }}>
            <div style={{ color: GG.fg2, fontWeight: 600 }}>{idx.name}{idx.unique && <span style={{ color: GG.cyan, marginLeft: 6, fontSize: 9 }}>UNIQUE</span>}</div>
            <div style={{ color: GG.fg4, fontSize: 10.5, marginTop: 2 }}>{idx.columns.join(', ')}</div>
          </div>
        ))
      )}

      {tab === 'relations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {table.foreignKeys.map(fk => (
            <div key={`${fk.column}-${fk.referencedTable}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: GG.mono, fontSize: 11.5, color: GG.fg2 }}>
              <Link2 size={11} color={GG.fg4} /> {table.name}.{fk.column} → {fk.referencedTable}.{fk.referencedColumn}
            </div>
          ))}
          {referencing.map(t => (
            <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: GG.mono, fontSize: 11.5, color: GG.fg3 }}>
              <Link2 size={11} color={GG.fg4} /> {t.name} references {table.name}
            </div>
          ))}
          {table.foreignKeys.length === 0 && referencing.length === 0 && <p style={{ color: GG.fg4, fontFamily: GG.mono, fontSize: 11.5 }}>No relationships found.</p>}
        </div>
      )}

      {tab === 'stats' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: GG.mono, fontSize: 11.5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: GG.fg4 }}>Rows</span><strong style={{ color: GG.fg2 }}>{table.rowEstimate?.toLocaleString() ?? 'Not available'}</strong></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: GG.fg4 }}>Total size</span><strong style={{ color: GG.fg2 }}>{formatBytes(table.sizeBytes)}</strong></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: GG.fg4 }}>Columns</span><strong style={{ color: GG.fg2 }}>{table.columns.length}</strong></div>
        </div>
      )}
    </div>
  );
}
