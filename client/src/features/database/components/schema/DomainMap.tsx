import { GG } from '../dbConnectTheme';
import type { SchemaTable } from '../../types';

interface DomainMapProps {
  tablesBySchema: Map<string, SchemaTable[]>;
  onSelectSchema: (name: string) => void;
}

export default function DomainMap({ tablesBySchema, onSelectSchema }: DomainMapProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, padding: 24 }}>
      {Array.from(tablesBySchema.entries()).map(([schemaName, tables]) => {
        const relationCount = tables.reduce((sum, t) => sum + t.foreignKeys.length, 0);
        return (
          <button
            key={schemaName}
            onClick={() => onSelectSchema(schemaName)}
            style={{
              display: 'flex', flexDirection: 'column', gap: 6, padding: 18, textAlign: 'left',
              background: GG.bg1, border: `1px solid ${GG.lineStrong}`, borderRadius: 10, cursor: 'pointer',
              transition: 'border-color .15s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = GG.accent + '55')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = GG.lineStrong)}
          >
            <div style={{ fontFamily: GG.mono, fontSize: 14, fontWeight: 700, color: GG.fg }}>{schemaName}</div>
            <div style={{ fontFamily: GG.mono, fontSize: 11, color: GG.fg3 }}>{tables.length} table{tables.length === 1 ? '' : 's'}</div>
            <div style={{ fontFamily: GG.mono, fontSize: 11, color: GG.fg4 }}>{relationCount} relation{relationCount === 1 ? '' : 's'}</div>
          </button>
        );
      })}
    </div>
  );
}
