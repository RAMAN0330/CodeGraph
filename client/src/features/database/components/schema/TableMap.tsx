import { ArrowLeft } from 'lucide-react';
import { GG } from '../dbConnectTheme';
import type { SchemaTable } from '../../types';

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return 'Not available';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes, i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i += 1; }
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

interface TableMapProps {
  schemaName: string;
  tables: SchemaTable[];
  onBack: () => void;
  onSelectTable: (name: string) => void;
}

export default function TableMap({ schemaName, tables, onBack, onSelectTable }: TableMapProps) {
  return (
    <div style={{ padding: 24 }}>
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 0, color: GG.fg3, fontFamily: GG.mono, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', marginBottom: 16, padding: 0 }}>
        <ArrowLeft size={13} /> {schemaName}
      </button>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        {tables.map(table => (
          <button
            key={table.name}
            onClick={() => onSelectTable(table.name)}
            style={{
              display: 'flex', flexDirection: 'column', gap: 5, padding: 14, textAlign: 'left',
              background: GG.bg1, border: `1px solid ${GG.lineStrong}`, borderRadius: 9, cursor: 'pointer',
            }}
          >
            <div style={{ fontFamily: GG.mono, fontSize: 12.5, fontWeight: 700, color: GG.fg }}>{table.name}</div>
            <div style={{ fontFamily: GG.mono, fontSize: 10.5, color: GG.fg4 }}>{table.rowEstimate?.toLocaleString() ?? '—'} rows</div>
            <div style={{ fontFamily: GG.mono, fontSize: 10.5, color: GG.fg4 }}>{formatBytes(table.sizeBytes)}</div>
            <div style={{ fontFamily: GG.mono, fontSize: 10.5, color: GG.fg4 }}>{table.foreignKeys.length} relation{table.foreignKeys.length === 1 ? '' : 's'}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
