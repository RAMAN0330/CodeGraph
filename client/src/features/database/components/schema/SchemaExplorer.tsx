import { useMemo, useState } from 'react';
import { Maximize2, Search } from 'lucide-react';
import { GG, ggInput } from '../dbConnectTheme';
import ERDiagramGraph from '../ERDiagramGraph';
import DomainMap from './DomainMap';
import TableMap from './TableMap';
import ObjectsPanel from './ObjectsPanel';
import DetailDrawer from './DetailDrawer';
import type { Schema } from '../../types';

type ExplorerTab = 'graph' | 'objects' | 'dependencies' | 'indexes';
type GraphLevel = 'domain' | 'tables' | 'graph';
type Depth = '1hop' | 'all';

function groupBySchema(tables: Schema['tables']): Map<string, Schema['tables']> {
  const map = new Map<string, Schema['tables']>();
  for (const table of tables) {
    const key = table.schema ?? 'public';
    const list = map.get(key) ?? [];
    list.push(table);
    map.set(key, list);
  }
  return map;
}

interface SchemaExplorerProps { schema: Schema; }

export default function SchemaExplorer({ schema }: SchemaExplorerProps) {
  const [tab, setTab] = useState<ExplorerTab>('graph');
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState<GraphLevel>('domain');
  const [selectedSchema, setSelectedSchema] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [depth, setDepth] = useState<Depth>('1hop');

  const tablesBySchema = useMemo(() => groupBySchema(schema.tables), [schema]);
  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return schema.tables.filter(t => t.name.toLowerCase().includes(q) || t.columns.some(c => c.name.toLowerCase().includes(q))).slice(0, 8);
  }, [schema, search]);

  function selectTable(name: string) {
    setSelectedTable(name);
    setLevel('graph');
    setTab('graph');
    setSearch('');
  }

  const activeTable = schema.tables.find(t => t.name === selectedTable) ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['graph', 'objects', 'dependencies', 'indexes'] as ExplorerTab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '6px 12px', borderRadius: 7, border: `1px solid ${tab === t ? GG.accent + '55' : GG.lineStrong}`,
              background: tab === t ? `${GG.accent}18` : 'transparent', color: tab === t ? GG.accent : GG.fg3,
              fontFamily: GG.mono, fontSize: 11, fontWeight: 700, textTransform: 'capitalize', cursor: 'pointer',
            }}>{t}</button>
          ))}
        </div>
        <div style={{ position: 'relative', flex: '0 1 280px', minWidth: 200 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: GG.fg4 }} />
          <input style={{ ...ggInput, paddingLeft: 30 }} placeholder="Search tables, columns…" value={search} onChange={e => setSearch(e.target.value)} />
          {searchResults.length > 0 && (
            <div style={{ position: 'absolute', top: 40, left: 0, right: 0, zIndex: 30, background: GG.bg1, border: `1px solid ${GG.lineStrong}`, borderRadius: 8, overflow: 'hidden' }}>
              {searchResults.map(t => (
                <button key={t.name} onClick={() => selectTable(t.name)} style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'none', border: 0, borderTop: `1px solid ${GG.line}`, color: GG.fg2, fontFamily: GG.mono, fontSize: 12, textAlign: 'left', cursor: 'pointer' }}>{t.name}</button>
              ))}
            </div>
          )}
        </div>
        {tab === 'graph' && level === 'graph' && (
          <div style={{ display: 'flex', gap: 2, padding: 3, border: `1px solid ${GG.lineStrong}`, borderRadius: 8, marginLeft: 'auto' }}>
            <button onClick={() => setDepth('1hop')} style={{ padding: '5px 10px', border: 0, borderRadius: 5, background: depth === '1hop' ? GG.bg2 : 'transparent', color: depth === '1hop' ? GG.accent : GG.fg3, fontFamily: GG.mono, fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>1 hop</button>
            <button onClick={() => setDepth('all')} style={{ padding: '5px 10px', border: 0, borderRadius: 5, background: depth === 'all' ? GG.bg2 : 'transparent', color: depth === 'all' ? GG.accent : GG.fg3, fontFamily: GG.mono, fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>All</button>
          </div>
        )}
      </div>

      {tab === 'graph' && (
        <div style={{ flex: 1, minHeight: 500 }}>
          {level === 'domain' && <DomainMap tablesBySchema={tablesBySchema} onSelectSchema={s => { setSelectedSchema(s); setLevel('tables'); }} />}
          {level === 'tables' && selectedSchema && (
            <TableMap schemaName={selectedSchema} tables={tablesBySchema.get(selectedSchema) ?? []} onBack={() => setLevel('domain')} onSelectTable={selectTable} />
          )}
          {level === 'graph' && (
            <div style={{ display: 'grid', gridTemplateColumns: `230px minmax(0, 1fr) ${activeTable ? '320px' : ''}`, gap: 14, height: '100%', minHeight: 560 }}>
              <div style={{ background: GG.panel, border: `1px solid ${GG.lineStrong}`, borderRadius: 10, padding: 14, overflowY: 'auto', overflowX: 'hidden', minWidth: 0 }}>
                <button onClick={() => setLevel('domain')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 0, color: GG.fg4, fontFamily: 'Montserrat, sans-serif', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginBottom: 12, padding: 0 }}>
                  <Maximize2 size={11} /> Domain map
                </button>
                <ObjectsPanel tablesBySchema={tablesBySchema} selectedTable={selectedTable} onSelectTable={selectTable} compact />
              </div>
              <div style={{ position: 'relative', minHeight: 0, minWidth: 0, background: GG.bg, border: `1px solid ${GG.lineStrong}`, borderRadius: 10, overflow: 'hidden' }}>
                <ERDiagramGraph schema={schema} selectedTable={depth === '1hop' ? selectedTable : null} isRealSchema />
              </div>
              {activeTable && (
                <div style={{ background: GG.panel, border: `1px solid ${GG.lineStrong}`, borderRadius: 10, padding: 16, overflowY: 'auto', overflowX: 'hidden', minWidth: 0 }}>
                  <DetailDrawer table={activeTable} allTables={schema.tables} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'objects' && (
        <div style={{ background: GG.panel, border: `1px solid ${GG.lineStrong}`, borderRadius: 12, padding: 18, width: '100%', columnWidth: 280, columnGap: 28 }}>
          <ObjectsPanel tablesBySchema={tablesBySchema} selectedTable={selectedTable} onSelectTable={selectTable} />
        </div>
      )}

      {tab === 'dependencies' && (
        <div style={{ background: GG.panel, border: `1px solid ${GG.lineStrong}`, borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: GG.mono, fontSize: 12 }}>
            <thead><tr style={{ background: GG.bg2, textAlign: 'left' }}>
              {['From', 'To'].map(h => <th key={h} style={{ padding: '9px 18px', color: GG.fg4, fontWeight: 600, fontSize: 10, textTransform: 'uppercase' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {schema.tables.flatMap(t => t.foreignKeys.map(fk => (
                <tr key={`${t.name}.${fk.column}`} style={{ borderTop: `1px solid ${GG.line}` }}>
                  <td style={{ padding: '9px 18px', color: GG.fg2 }}>{t.name}.{fk.column}</td>
                  <td style={{ padding: '9px 18px', color: GG.fg2 }}>{fk.referencedTable}.{fk.referencedColumn}</td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'indexes' && (
        <div style={{ background: GG.panel, border: `1px solid ${GG.lineStrong}`, borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: GG.mono, fontSize: 12 }}>
            <thead><tr style={{ background: GG.bg2, textAlign: 'left' }}>
              {['Table', 'Index', 'Columns', 'Unique'].map(h => <th key={h} style={{ padding: '9px 18px', color: GG.fg4, fontWeight: 600, fontSize: 10, textTransform: 'uppercase' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {schema.tables.flatMap(t => (t.indexes ?? []).map(idx => (
                <tr key={`${t.name}.${idx.name}`} style={{ borderTop: `1px solid ${GG.line}` }}>
                  <td style={{ padding: '9px 18px', color: GG.fg2 }}>{t.name}</td>
                  <td style={{ padding: '9px 18px', color: GG.fg2 }}>{idx.name}</td>
                  <td style={{ padding: '9px 18px', color: GG.fg3 }}>{idx.columns.join(', ')}</td>
                  <td style={{ padding: '9px 18px', color: idx.unique ? GG.cyan : GG.fg4 }}>{idx.unique ? 'Yes' : 'No'}</td>
                </tr>
              )))}
              {schema.tables.every(t => !(t.indexes ?? []).length) && (
                <tr><td colSpan={4} style={{ padding: 20, textAlign: 'center', color: GG.fg4 }}>No index information available.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
