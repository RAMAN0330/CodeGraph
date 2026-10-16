import { useMemo, useState } from 'react';
import { Maximize2, Search } from 'lucide-react';
import { GG } from '../dbConnectTheme';
import ERDiagramGraph from '../ERDiagramGraph';
import DomainMap from './DomainMap';
import TableMap from './TableMap';
import ObjectsPanel from './ObjectsPanel';
import DetailDrawer from './DetailDrawer';
import type { Schema, SchemaTable } from '../../types';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

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

interface SchemaExplorerProps { schema: Schema; onBrowse?: (table: SchemaTable) => void; onQuery?: (table: SchemaTable) => void; }

export default function SchemaExplorer({ schema, onBrowse, onQuery }: SchemaExplorerProps) {
  const [tab, setTab] = useState<ExplorerTab>('graph');
  const [search, setSearch] = useState('');
  // With a single schema the domain level is one card, so start at its tables.
  const singleSchema = useMemo(() => { const names = new Set(schema.tables.map(t => t.schema ?? 'public')); return names.size === 1 ? [...names][0] : null; }, [schema]);
  const [level, setLevel] = useState<GraphLevel>(singleSchema ? 'tables' : 'domain');
  const [selectedSchema, setSelectedSchema] = useState<string | null>(singleSchema);
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

  const relationCount = schema.tables.reduce((n, t) => n + t.foreignKeys.length, 0);
  const activeTable = schema.tables.find(t => t.name === selectedTable) ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', minHeight: 0 }}>
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={tab} onValueChange={v => setTab(v as ExplorerTab)}>
          <TabsList>
            <TabsTrigger value="graph">Graph</TabsTrigger>
            <TabsTrigger value="objects">Objects</TabsTrigger>
            <TabsTrigger value="dependencies">Relationships</TabsTrigger>
            <TabsTrigger value="indexes">Indexes</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-72">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input className="h-9 pl-8" placeholder="Find a table or column" aria-label="Find a table or column" value={search} onChange={e => setSearch(e.target.value)} />
          {searchResults.length > 0 && (
            <ul className="absolute top-10 right-0 left-0 z-30 overflow-hidden rounded-md border bg-popover py-1 shadow-md">
              {searchResults.map(t => (
                <li key={t.name}>
                  <button type="button" onClick={() => selectTable(t.name)} className="w-full cursor-pointer border-0 bg-transparent px-3 py-1.5 text-left font-mono text-xs hover:bg-accent">{t.name}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{schema.tables.length} table{schema.tables.length === 1 ? '' : 's'} · {relationCount} relationship{relationCount === 1 ? '' : 's'}</span>
        {tab === 'graph' && level === 'graph' && (
          <Tabs value={depth} onValueChange={v => setDepth(v as Depth)} className="ml-auto">
            <TabsList>
              <TabsTrigger value="1hop">Neighbours</TabsTrigger>
              <TabsTrigger value="all">Everything</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>

      {tab === 'graph' && (
        <div style={{ flex: 1, minHeight: 0, overflow: level === 'graph' ? 'hidden' : 'auto' }}>
          {level === 'domain' && <DomainMap tablesBySchema={tablesBySchema} onSelectSchema={s => { setSelectedSchema(s); setLevel('tables'); }} />}
          {level === 'tables' && selectedSchema && (
            <TableMap schemaName={selectedSchema} tables={tablesBySchema.get(selectedSchema) ?? []} onBack={singleSchema ? undefined : () => setLevel('domain')} onSelectTable={selectTable} />
          )}
          {level === 'graph' && (
            <div style={{ display: 'grid', gridTemplateColumns: `230px minmax(0, 1fr) ${activeTable ? '320px' : ''}`, gap: 12, height: '100%', minHeight: 0 }}>
              <div style={{ background: GG.panel, border: `1px solid ${GG.lineStrong}`, borderRadius: 10, padding: 14, overflowY: 'auto', overflowX: 'hidden', minWidth: 0 }}>
                <Button variant="ghost" size="sm" className="mb-2 h-7 px-2 text-xs" onClick={() => setLevel(singleSchema ? 'tables' : 'domain')}>
                  <Maximize2 className="size-3" /> {singleSchema ? 'All tables' : 'Domain map'}
                </Button>
                <ObjectsPanel tablesBySchema={tablesBySchema} selectedTable={selectedTable} onSelectTable={selectTable} compact />
              </div>
              <div style={{ position: 'relative', minHeight: 0, minWidth: 0, background: GG.bg, border: `1px solid ${GG.lineStrong}`, borderRadius: 10, overflow: 'hidden' }}>
                <ERDiagramGraph schema={schema} selectedTable={depth === '1hop' ? selectedTable : null} isRealSchema />
              </div>
              {activeTable && (
                <div style={{ background: GG.panel, border: `1px solid ${GG.lineStrong}`, borderRadius: 10, padding: 16, overflowY: 'auto', overflowX: 'hidden', minWidth: 0 }}>
                  <DetailDrawer table={activeTable} allTables={schema.tables} onBrowse={onBrowse} onQuery={onQuery} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'objects' && (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: GG.panel, border: `1px solid ${GG.lineStrong}`, borderRadius: 12, padding: 18, width: '100%', columnWidth: 280, columnGap: 28 }}>
          <ObjectsPanel tablesBySchema={tablesBySchema} selectedTable={selectedTable} onSelectTable={selectTable} />
        </div>
      )}

      {tab === 'dependencies' && (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: GG.panel, border: `1px solid ${GG.lineStrong}`, borderRadius: 12 }}>
          <Table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: GG.mono, fontSize: 12 }}>
            <TableHeader><TableRow style={{ background: GG.bg2, textAlign: 'left' }}>
              {['From', 'To'].map(h => <TableHead key={h} style={{ padding: '9px 18px', color: GG.fg4, fontWeight: 600, fontSize: 10, textTransform: 'uppercase' }}>{h}</TableHead>)}
            </TableRow></TableHeader>
            <TableBody>
              {schema.tables.flatMap(t => t.foreignKeys.map(fk => (
                <TableRow key={`${t.name}.${fk.column}`} style={{ borderTop: `1px solid ${GG.line}` }}>
                  <TableCell style={{ padding: '9px 18px', color: GG.fg2 }}>{t.name}.{fk.column}</TableCell>
                  <TableCell style={{ padding: '9px 18px', color: GG.fg2 }}>{fk.referencedTable}.{fk.referencedColumn}</TableCell>
                </TableRow>
              )))}
            </TableBody>
          </Table>
        </div>
      )}

      {tab === 'indexes' && (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: GG.panel, border: `1px solid ${GG.lineStrong}`, borderRadius: 12 }}>
          <Table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: GG.mono, fontSize: 12 }}>
            <TableHeader><TableRow style={{ background: GG.bg2, textAlign: 'left' }}>
              {['Table', 'Index', 'Columns', 'Unique'].map(h => <TableHead key={h} style={{ padding: '9px 18px', color: GG.fg4, fontWeight: 600, fontSize: 10, textTransform: 'uppercase' }}>{h}</TableHead>)}
            </TableRow></TableHeader>
            <TableBody>
              {schema.tables.flatMap(t => (t.indexes ?? []).map(idx => (
                <TableRow key={`${t.name}.${idx.name}`} style={{ borderTop: `1px solid ${GG.line}` }}>
                  <TableCell style={{ padding: '9px 18px', color: GG.fg2 }}>{t.name}</TableCell>
                  <TableCell style={{ padding: '9px 18px', color: GG.fg2 }}>{idx.name}</TableCell>
                  <TableCell style={{ padding: '9px 18px', color: GG.fg3 }}>{idx.columns.join(', ')}</TableCell>
                  <TableCell style={{ padding: '9px 18px', color: idx.unique ? GG.cyan : GG.fg4 }}>{idx.unique ? 'Yes' : 'No'}</TableCell>
                </TableRow>
              )))}
              {schema.tables.every(t => !(t.indexes ?? []).length) && (
                <TableRow><TableCell colSpan={4} style={{ padding: 20, textAlign: 'center', color: GG.fg4 }}>No index information available.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
