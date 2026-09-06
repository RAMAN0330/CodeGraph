import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Table2 } from 'lucide-react';
import { GG } from '../dbConnectTheme';
import type { SchemaTable } from '../../types';

interface ObjectsPanelProps {
  tablesBySchema: Map<string, SchemaTable[]>;
  selectedTable: string | null;
  onSelectTable: (name: string) => void;
  compact?: boolean;
}

export default function ObjectsPanel({ tablesBySchema, selectedTable, onSelectTable, compact }: ObjectsPanelProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(Array.from(tablesBySchema.keys()).slice(0, 1)));

  // Auto-reveal whichever schema the active table lives in, without
  // collapsing schemas the user already opened themselves.
  useEffect(() => {
    if (!selectedTable) return;
    for (const [schemaName, tables] of tablesBySchema) {
      if (tables.some(t => t.name === selectedTable)) {
        setExpanded(prev => (prev.has(schemaName) ? prev : new Set(prev).add(schemaName)));
        break;
      }
    }
  }, [selectedTable, tablesBySchema]);

  function toggle(schemaName: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(schemaName) ? next.delete(schemaName) : next.add(schemaName);
      return next;
    });
  }

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 10, color: GG.fg4, textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 700, marginBottom: 8, padding: '0 4px' }}>Schema Objects</div>
      {Array.from(tablesBySchema.entries()).map(([schemaName, tables]) => {
        const isOpen = expanded.has(schemaName);
        return (
          <div key={schemaName} style={{ marginBottom: 4, breakInside: 'avoid' }}>
            <button
              onClick={() => toggle(schemaName)}
              className="objp-schema-row"
              style={{
                display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '6px 6px', minWidth: 0,
                background: 'transparent', border: 0, borderRadius: 6, color: GG.fg2,
                fontFamily: 'Montserrat, sans-serif', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >
              {isOpen ? <ChevronDown size={12} style={{ flexShrink: 0, color: GG.fg4 }} /> : <ChevronRight size={12} style={{ flexShrink: 0, color: GG.fg4 }} />}
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{schemaName}</span>
              <span style={{ flexShrink: 0, fontFamily: GG.mono, fontSize: 9.5, fontWeight: 600, color: GG.fg4, background: GG.bg1, borderRadius: 999, padding: '1px 6px' }}>{tables.length}</span>
            </button>
            {isOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginLeft: 9, paddingLeft: 8, borderLeft: `1px solid ${GG.line}` }}>
                {tables.map(table => {
                  const active = selectedTable === table.name;
                  return (
                    <button
                      key={table.name}
                      onClick={() => onSelectTable(table.name)}
                      className={`objp-table-row${active ? ' active' : ''}`}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 7, width: '100%', minWidth: 0,
                        padding: compact ? '5px 8px' : '6px 10px',
                        background: active ? `${GG.accent}18` : 'transparent',
                        border: 0, borderRadius: 6, color: active ? GG.accent : GG.fg2, fontWeight: active ? 600 : 400,
                        fontFamily: GG.mono, fontSize: 11.5, textAlign: 'left', cursor: 'pointer',
                      }}
                    >
                      <Table2 size={12} style={{ flexShrink: 0, opacity: active ? 1 : 0.6 }} />
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{table.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      <style>{`
        .objp-schema-row:hover { background: ${GG.bg1} !important; }
        .objp-table-row:not(.active):hover { background: ${GG.bg1} !important; }
      `}</style>
    </div>
  );
}
